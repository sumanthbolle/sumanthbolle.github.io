// scripts/fetch-upsc-triggers.js
// =============================================================================
// UPSC TRIGGER LAYER REFRESH
// =============================================================================
// A question is a static anchor × a current trigger × a directive verb. The
// anchors are standing data (data/upsc-patterns.json). The triggers rotate every
// year, so they have to be retrieved — and persisted, or the Pattern Atlas has
// only half of each question.
//
// This job refreshes ONE anchor per run and writes data/upsc-triggers.json.
// It deliberately does not generate articles: the same daily budget buys a
// trigger layer that makes an existing revision surface dynamic, which is worth
// more than another page of auto-written prose nobody revises from.
//
// Rotation is weighted by recurrence band and by how long an anchor has gone
// without a refresh, with a cooldown so the file does not circle ten anchors.
// The seed is the date, so re-running on the same day picks the same anchor and
// the job is idempotent.
//
// VALIDATION GATE — nothing is written unless the payload clears all of:
//   - at least 2 usable items
//   - at least 2 distinct sourced hosts, every URL http(s)
//   - every item has a title, a why line, a use line and a source
//   - no citation markers ([1]) and no HTML in any text field
//   - the model does not self-report low confidence in its own sourcing
// A rejection exits 2, which the workflow treats as a normal outcome. This
// matters more here than on the ServiceNow stream: a wrong committee name in a
// tutorial wastes an afternoon, and a wrong committee name here gets written
// into someone's Mains answer and costs marks they will never trace back.
//
// Usage:
//   node scripts/fetch-upsc-triggers.js --dry-run
//   PERPLEXITY_API_KEY=... node scripts/fetch-upsc-triggers.js
//   PERPLEXITY_API_KEY=... node scripts/fetch-upsc-triggers.js --anchor fiscal-federalism
// =============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

/* The verification gate lives with the Worker so there is one allowlist for the
 * whole project rather than a copy that drifts. */
const { isPrimarySource } = require('../api/upsc.js');

const PATTERNS_FILE = path.join(process.cwd(), 'data', 'upsc-patterns.json');
const TRIGGERS_FILE = path.join(process.cwd(), 'data', 'upsc-triggers.json');

const API_KEY = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
const MODEL = 'sonar';

const COOLDOWN_DAYS = 21;      // do not refresh an anchor twice inside three weeks
const MAX_ANCHORS_HELD = 60;   // cap the file; oldest refresh is evicted first
const MAX_AGE_DAYS = 150;      // a trigger layer older than this is stale, not useful
const MIN_ITEMS = 2;
const MAX_ITEMS = 5;
const REQUEST_TIMEOUT_MS = 60000;

const BAND_WEIGHT = { perennial: 4, high: 3, medium: 2, emerging: 3 };

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
};

const DRY_RUN = flag('--dry-run');
const FORCED_ANCHOR = value('--anchor');
const OUT_FILE = value('--out') || TRIGGERS_FILE;

/* ─────────────────────────────── helpers ─────────────────────────────── */

const today = () => new Date().toISOString().slice(0, 10);

function daysSince(iso) {
  if (!iso) return Infinity;
  const then = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.parse(today() + 'T00:00:00Z') - then) / 86400000);
}

/* Deterministic per-day PRNG so a re-run on the same date is a no-op rather
 * than a second anchor. */
function seededRandom(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash ^= hash << 13; hash >>>= 0;
    hash ^= hash >> 17;
    hash ^= hash << 5; hash >>>= 0;
    return (hash >>> 0) / 4294967296;
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.toString();
  } catch (e) {
    return '';
  }
}

function clip(text, max) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/* ─────────────────────────────── rotation ─────────────────────────────── */

function chooseAnchor(anchors, held) {
  if (FORCED_ANCHOR) {
    const forced = anchors.find((a) => a.id === FORCED_ANCHOR);
    if (!forced) {
      console.error(`✖ No anchor with id "${FORCED_ANCHOR}"`);
      process.exit(1);
    }
    return forced;
  }

  const scored = anchors.map((anchor) => {
    const age = daysSince(held[anchor.id] && held[anchor.id].refreshedAt);
    const band = BAND_WEIGHT[anchor.band] || 2;
    /* Never refreshed outranks everything; after that, weight by band and by
     * how long it has been waiting. */
    const ageFactor = age === Infinity ? 8 : Math.min(6, age / 30);
    return { anchor, age, weight: band * (1 + ageFactor) };
  });

  const eligible = scored.filter((row) => row.age >= COOLDOWN_DAYS);
  const pool = eligible.length ? eligible : scored;

  const total = pool.reduce((sum, row) => sum + row.weight, 0);
  const random = seededRandom(today())();
  let cursor = random * total;
  for (const row of pool) {
    cursor -= row.weight;
    if (cursor <= 0) return row.anchor;
  }
  return pool[pool.length - 1].anchor;
}

/* ─────────────────────────────── the prompt ─────────────────────────────── */

const SYSTEM_PROMPT = `You retrieve the current trigger layer for a single UPSC Civil Services syllabus anchor. You return strict JSON only — no markdown, no prose outside the JSON, no citation markers such as [1].

Hard rules:
1. Never invent. No invented committee names, report titles, article or section numbers, scheme launch years, rankings or statistics. If you cannot source a figure, leave it out. A fluent wrong number ends up inside a Mains answer and costs marks silently.
2. Every item needs a real, working source URL that you actually found. Prefer the primary document — pib.gov.in, prsindia.org, the ministry site, the judgment text, RBI/MoSPI/NITI, UN/World Bank/IMF — over news coverage of it.
3. Only include developments that genuinely attach to the anchor given. A development that is merely newsworthy, or that belongs to a different anchor, must be left out. Returning two well-attached items is better than five loose ones.
4. "why" explains what the development changes about the anchor structurally. Not why it is in the news.
5. "use" is the exact data point, precedent, example or argument an aspirant would deploy inside an answer on this anchor. Never a summary of the news.
6. Report your confidence honestly. If you are not sure the URLs support the claims beside them, say medium or low. An honest low is more useful than a confident guess.`;

function buildPrompt(anchor) {
  return `Today is ${today()}.

Anchor: "${anchor.anchor}"
Syllabus codes: ${(anchor.codes || []).join(', ')}
Papers: ${(anchor.papers || []).join(', ')}
Directive verbs this anchor usually attracts: ${(anchor.verbs || []).join(', ')}

The static core of this anchor is already known — do not restate it:
${(anchor.static_core || []).map((point) => `- ${point}`).join('\n')}

Find the developments of the LAST 18 MONTHS that make this specific anchor examinable now. Return ${MIN_ITEMS}–${MAX_ITEMS} items, most significant first.

Per item:
- title: at most 12 words, factual, no adjectives
- date: publication or event date, ISO where known
- why: one line, at most 28 words — what this changes about the anchor structurally
- use: one line, at most 28 words — the data point, precedent, example or argument to deploy in an answer on this anchor
- verb: which of the anchor's directive verbs this development would most likely be attached to
- source_url and source_name: the source you actually used, primary document preferred

Also return:
- confidence: "high", "medium" or "low" — your honest confidence that every URL exists and supports the claim beside it
- omitted: one line naming anything significant you deliberately left out because you could not source it, or an empty string`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          why: { type: 'string' },
          use: { type: 'string' },
          verb: { type: 'string' },
          source_url: { type: 'string' },
          source_name: { type: 'string' },
        },
        required: ['title', 'why', 'use', 'source_url'],
      },
    },
    confidence: { type: 'string' },
    omitted: { type: 'string' },
  },
  required: ['items', 'confidence'],
};

/* ─────────────────────────────── the API call ─────────────────────────────── */

function buildSonarError(statusCode, raw) {
  let providerCode = '';
  try {
    const parsed = JSON.parse(raw);
    providerCode = String(
      parsed && parsed.error && (parsed.error.type || parsed.error.code) || '',
    );
  } catch (error) {
    // The bounded response excerpt below remains useful for non-JSON errors.
  }
  const requestError = new Error(`Sonar ${statusCode}: ${raw.slice(0, 200)}`);
  requestError.statusCode = statusCode;
  requestError.providerCode = providerCode;
  return requestError;
}

function callSonar(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      {
        hostname: 'api.perplexity.ai',
        path: '/v1/sonar',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${API_KEY}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(buildSonarError(response.statusCode, raw));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error('Sonar returned unparseable JSON'));
          }
        });
      }
    );
    request.on('timeout', () => request.destroy(new Error('Sonar request timed out')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function isQuotaUnavailable(error) {
  return Number(error && error.statusCode) === 401
    && String(error && error.providerCode) === 'insufficient_quota';
}

function extractJson(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  let text = String(content).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

/* ─────────────────────────── the validation gate ─────────────────────────── */

const CITATION_MARKER = /\[\d{1,2}\]/;
const HTML_TAG = /<\/?[a-z][^>]*>/i;

function validate(parsed, anchor) {
  const failures = [];
  if (!parsed || !Array.isArray(parsed.items)) {
    return { ok: false, failures: ['no items array returned'] };
  }

  const confidence = String(parsed.confidence || '').toLowerCase();
  if (confidence === 'low') failures.push('model reports low confidence in its own sourcing');

  const verbs = new Set(anchor.verbs || []);
  const items = [];

  parsed.items.forEach((raw, index) => {
    const title = clip(raw && raw.title, 140);
    const why = clip(raw && raw.why, 240);
    const use = clip(raw && raw.use, 240);
    const url = safeUrl(raw && raw.source_url);
    const verb = clip(raw && raw.verb, 30).toLowerCase();

    if (!title || !why || !use || !url) {
      failures.push(`item ${index + 1} is missing a title, why, use or source`);
      return;
    }

    const text = [title, why, use].join(' ');
    if (CITATION_MARKER.test(text)) {
      failures.push(`item ${index + 1} contains a citation marker`);
      return;
    }
    if (HTML_TAG.test(text)) {
      failures.push(`item ${index + 1} contains HTML`);
      return;
    }

    items.push({
      title,
      date: clip(raw && raw.date, 40),
      why,
      use,
      verb: verbs.has(verb) ? verb : '',
      url,
      source: clip(raw && raw.source_name, 80) || hostOf(url),
      primary: isPrimarySource(url),
    });
  });

  if (items.length < MIN_ITEMS) {
    failures.push(`only ${items.length} usable item(s); at least ${MIN_ITEMS} required`);
  }

  const hosts = new Set(items.map((item) => hostOf(item.url)).filter(Boolean));
  if (hosts.size < 2) {
    failures.push(`items resolve to ${hosts.size} distinct host(s); at least 2 required`);
  }

  return {
    ok: failures.length === 0,
    failures,
    entry: {
      refreshedAt: new Date().toISOString(),
      anchor: anchor.anchor,
      codes: anchor.codes,
      papers: anchor.papers,
      confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium',
      primarySources: items.filter((item) => item.primary).length,
      omitted: clip(parsed.omitted, 240),
      items: items.slice(0, MAX_ITEMS),
    },
  };
}

/* ─────────────────────────────── persistence ─────────────────────────────── */

function prune(anchors) {
  const entries = Object.entries(anchors)
    .filter(([, entry]) => daysSince(entry && entry.refreshedAt) <= MAX_AGE_DAYS)
    .sort((a, b) => String(b[1].refreshedAt).localeCompare(String(a[1].refreshedAt)))
    .slice(0, MAX_ANCHORS_HELD);
  return Object.fromEntries(entries);
}

function write(anchorId, entry, existing, patterns) {
  const anchors = prune(Object.assign({}, existing.anchors || {}, { [anchorId]: entry }));
  const payload = {
    generated: new Date().toISOString(),
    provisional: true,
    note: 'The current trigger layer for anchors in data/upsc-patterns.json, refreshed one anchor per day. Every item carries the source it came from; items not from a primary document must be confirmed against one before they enter permanent notes.',
    patternsVersion: patterns.version,
    anchorsHeld: Object.keys(anchors).length,
    anchors,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

/* ─────────────────────────────── main ─────────────────────────────── */

async function main() {
  const patterns = readJson(PATTERNS_FILE, null);
  if (!patterns || !Array.isArray(patterns.anchors)) {
    console.error(`✖ Could not read ${path.relative(process.cwd(), PATTERNS_FILE)}`);
    process.exit(1);
  }

  const existing = readJson(OUT_FILE, { anchors: {} });
  const held = existing.anchors || {};
  const anchor = chooseAnchor(patterns.anchors, held);
  const age = daysSince(held[anchor.id] && held[anchor.id].refreshedAt);

  console.log(`Anchor:    ${anchor.anchor} (${anchor.id})`);
  console.log(`Band:      ${anchor.band} · papers ${(anchor.papers || []).join(', ')}`);
  console.log(`Last seen: ${age === Infinity ? 'never' : age + ' days ago'}`);
  console.log(`Held:      ${Object.keys(held).length} anchors in ${path.relative(process.cwd(), OUT_FILE)}`);

  if (DRY_RUN) {
    console.log('\n--- prompt ---\n');
    console.log(buildPrompt(anchor));
    console.log('\n(dry run — no API call, nothing written)');
    return;
  }

  if (!API_KEY) {
    console.error('✖ PERPLEXITY_API_KEY is not set');
    process.exit(1);
  }

  const data = await callSonar({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(anchor) },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    search_recency_filter: 'month',
    web_search_options: { search_context_size: 'high', user_location: { country: 'IN' } },
    response_format: { type: 'json_schema', json_schema: { schema: SCHEMA } },
  });

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  const parsed = extractJson(content);
  const result = validate(parsed, anchor);

  if (!result.ok) {
    console.error('\n✖ Rejected by the validation gate — nothing written:');
    result.failures.forEach((failure) => console.error(`  - ${failure}`));
    console.error('\nThis is a normal outcome. Retrieval quality varies by anchor and by day.');
    process.exit(2);
  }

  const payload = write(anchor.id, result.entry, existing, patterns);

  console.log(`\n✅ ${result.entry.items.length} items · ${result.entry.primarySources} from primary sources · confidence ${result.entry.confidence}`);
  result.entry.items.forEach((item) => {
    console.log(`   - ${item.title}  [${item.primary ? 'primary' : item.source}]`);
  });
  if (result.entry.omitted) console.log(`   omitted: ${result.entry.omitted}`);
  console.log(`💾 ${path.relative(process.cwd(), OUT_FILE)} now holds ${payload.anchorsHeld} anchors`);
}

if (require.main === module) {
  main().catch((error) => {
    if (isQuotaUnavailable(error)) {
      console.error('No trigger refresh: Perplexity quota is unavailable; nothing was written.');
      process.exit(2);
    }
    console.error(`✖ ${error.message}`);
    process.exit(1);
  });
}

/* Exported so the gate and the rotation can be tested without spending an API
 * call. Nothing else should import this file. */
module.exports = {
  validate,
  chooseAnchor,
  extractJson,
  prune,
  daysSince,
  buildSonarError,
  isQuotaUnavailable,
};
