// scripts/fetch-interview-questions.js
// =============================================================================
// DAILY INTERVIEW QUESTIONS
// =============================================================================
// Adds new ServiceNow interview questions every day, researched with Perplexity
// Sonar. Each run takes the next categories in a fixed rotation over the 18
// categories the interviews page shows, so every section grows in turn, and
// asks for a question at the day's level (Foundation, Senior or Expert).
//
// The model returns structured JSON; this script renders the HTML itself in the
// site's answer format, so nothing the model writes reaches the page unescaped.
//
// VALIDATION GATE — a question is written only when it clears all of:
//   - a concrete scenario question and every answer section, 450–1300 words
//   - at least 2 edge cases, 2 common mistakes and 2 follow-ups
//   - at least 2 sources on 2 distinct hosts, one of them a servicenow.com
//     host, every one returned by Perplexity's own search (no invented links)
//   - every ServiceNow class and method in its code exists in the API
//     reference index (data/sn-api-index.json)
//   - not a repeat: its topic and question differ from every existing one
//   - no citation markers, no HTML, no filler phrases
// A failed question is retried once with the reasons, then skipped.
// Exit 0 when at least one question was written, 2 when none were.
//
// Generated questions carry `daily: true` and `sources`. Nothing else in the
// data files is touched.
//
// Usage:
//   node scripts/fetch-interview-questions.js --dry-run
//   PERPLEXITY_API_KEY=... node scripts/fetch-interview-questions.js
//   PERPLEXITY_API_KEY=... node scripts/fetch-interview-questions.js --category "ITSM" --count 1
// =============================================================================

const https = require('https');
const C = require('./lib/interview-content');
const apiCheck = require('./lib/sn-api-check');

const API_KEY = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
const MODEL = 'sonar-pro';
const REQUEST_TIMEOUT_MS = 150000;
const PER_DAY = 2;
const MIN_WORDS = 450;
const MAX_WORDS = 1300;
const MAX_QUESTION_SIMILARITY = 0.3;
const MAX_TOPIC_OVERLAP = 0.5;
const DAY_LEVELS = ['Senior', 'Foundation', 'Expert', 'Senior'];

// What each category's questions should be about. Keys must match the page's category list.
const BRIEFS = {
  'Core Concepts': 'platform fundamentals: tables and inheritance, dictionary, data model, instance basics, update sets, scoped vs global',
  'Scripting': 'server and client scripting: business rules, script includes, GlideRecord/GlideQuery/GlideAggregate, client scripts, GlideAjax',
  'Architecture': 'solution and platform architecture: scoped app design, instance strategy, data model choices, multi-team delivery',
  'App Engine & Flow': 'Workflow Studio flows, subflows and actions, decision tables, App Engine Studio, UI Builder, Now SDK / Fluent',
  'ITSM': 'incident, major incident, problem, change and request management, SLAs, knowledge, on-call',
  'Service Catalog & Portal': 'catalog items, variables, record producers, catalog client scripts, fulfilment flows, Service Portal and Employee Center',
  'CMDB & CSDM': 'CMDB classes, Identification and Reconciliation Engine, CMDB health and data manager, CSDM service modelling',
  'ITOM': 'Discovery, MID Server, Service Mapping, Event Management and AIOps, Service Graph Connectors',
  'HR Service Delivery': 'HR cases, centers of excellence, lifecycle events, HR criteria and data security, Employee Center',
  'Customer Service': 'CSM accounts and contacts, cases, entitlements, Proactive Customer Service Operations, Field Service',
  'Security Operations': 'Security Incident Response, Vulnerability Response, scanner integrations, remediation',
  'Risk & Compliance': 'IRM / GRC: policies, controls, risk assessments, audits, third-party risk',
  'Strategic Portfolio': 'SPM: demands, projects, portfolios, resource management, agile',
  'Security': 'platform security: ACLs and query ACLs, roles, domain separation, encryption, SSO/MFA, data privacy',
  'Integration': 'IntegrationHub and spokes, REST/SOAP outbound, Scripted REST, MID Server, OAuth, import sets, REST APIs',
  'Performance': 'slow transactions and queries, indexes, scheduled job load, client performance, Performance Analytics collection',
  'Platform Governance': 'upgrades and skipped records, clones, CI/CD and source control, ATF, Instance Scan, technical debt',
  'AI Implementation': 'Now Assist and AI Skill Kit, AI agents and AI Agent Studio, Predictive Intelligence, AI Search, AI governance',
};

const SYSTEM_PROMPT =
  'You are a ServiceNow architect writing one interview question and model answer for experienced practitioners. ' +
  'Write like an experienced architect talking to a colleague: plain words, short and varied sentences, concrete facts. ' +
  'Address the reader as "you". Do not use these words or phrases: ' + C.FILLER.join(', ') + '. ' +
  'Every platform fact, API name, table, role, property and behaviour must come from the search results, preferably ' +
  'docs.servicenow.com / servicenow.com/docs, developer.servicenow.com or the ServiceNow Community. Never invent an API, ' +
  'method, table, plugin or property; if you are unsure a name exists, leave it out. Code must be valid ServiceNow ' +
  'JavaScript (ES5 for global scope). Do not put citation markers like [1] in the text. Plain text only: no HTML, ' +
  'no markdown headings. You may use **bold** and `code` inline. Return only JSON that matches the schema.';

const SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    topic: { type: 'string' },
    difficulty: { type: 'string', enum: ['Foundation', 'Senior', 'Expert'] },
    whatTheyWant: { type: 'array', items: { type: 'string' } },
    answer: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          bullets: { type: 'array', items: { type: 'string' } },
          code: { type: 'string' },
        },
        required: ['paragraphs'],
      },
    },
    edgeCases: { type: 'array', items: { type: 'string' } },
    commonMistakes: { type: 'array', items: { type: 'string' } },
    scorePoints: { type: 'string' },
    followUps: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, url: { type: 'string' } },
        required: ['title', 'url'],
      },
    },
  },
  required: ['question', 'topic', 'difficulty', 'whatTheyWant', 'answer', 'edgeCases', 'commonMistakes',
    'scorePoints', 'followUps', 'tags', 'sources'],
};

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function dayNumber(now) {
  return Math.floor(now.getTime() / 86400000);
}

// The categories and level for a given day: PER_DAY consecutive categories, cycling through all of them.
function todaysPlan(categories, now, count) {
  const day = dayNumber(now);
  const n = count || PER_DAY;
  const start = (day * n) % categories.length;
  const picks = [];
  for (let i = 0; i < n; i++) picks.push(categories[(start + i) % categories.length]);
  return { categories: picks, level: DAY_LEVELS[day % DAY_LEVELS.length] };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(category, level, existing, feedback) {
  const lines = [
    `Write one ${level}-level ServiceNow interview question in the "${category}" area: ${BRIEFS[category]}.`,
    '',
    'Make it a real customer scenario: open with a concrete situation (industry, size, numbers, a constraint, a ' +
      'symptom or a code review) and end with the explicit ask. Test edge cases, trade-offs and the exact platform ' +
      'behaviour, not definitions. Base it on what the current ServiceNow documentation and API reference say.',
    '',
    'Shape:',
    '- question: 2 to 6 sentences, the scenario then the ask.',
    '- topic: 3 to 8 words naming the specific concept tested, e.g. "GlideAggregate ACLs and getRowCount".',
    '- whatTheyWant: 1 or 2 short paragraphs on what a strong answer shows, in full sentences addressed to "you".',
    '- answer: 2 to 4 sections (heading optional), each with paragraphs and optional bullets or one code example.',
    '- edgeCases: 3 to 5 precise gotchas, each one sentence or two.',
    '- commonMistakes: 2 to 4.',
    '- scorePoints: one or two sentences on what earns extra credit.',
    '- followUps: 2 or 3 follow-up questions an interviewer would ask.',
    '- tags: 3 to 6 short lowercase tags.',
    '- sources: 2 to 5 of the search results you used, with their exact URLs, at least one on servicenow.com.',
    '- 650 to 1000 words in total.',
  ];
  if (existing.length) {
    lines.push('', `These "${category}" questions already exist. Pick a different concept:`,
      ...existing.map((q) => '- ' + q));
  }
  if (feedback && feedback.length) {
    lines.push('', 'Your previous answer was rejected for:', ...feedback.map((f) => '- ' + f), 'Fix these.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function host(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const hash = u.hash.startsWith('#!') ? u.hash : '';
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search + hash).toLowerCase();
  } catch (e) {
    return String(url || '').toLowerCase();
  }
}

function list(v) {
  return (Array.isArray(v) ? v : []).map((s) => String(s || '').trim()).filter(Boolean);
}

function allText(q) {
  const parts = [q.question].concat(list(q.whatTheyWant));
  (q.answer || []).forEach((s) => {
    parts.push(s.heading || '');
    list(s.paragraphs).forEach((p) => parts.push(p));
    list(s.bullets).forEach((b) => parts.push(b));
  });
  return parts.concat(list(q.edgeCases), list(q.commonMistakes), [q.scorePoints || ''], list(q.followUps))
    .filter(Boolean).join('\n');
}

function topicTerms(text) {
  return new Set(String(text || '').toLowerCase().replace(/[^a-z0-9_.]+/g, ' ').split(' ').filter((w) => w.length > 2));
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared++; });
  return shared / (a.size + b.size - shared);
}

// What an existing question is about: its topic, tags and API names.
function existingTopic(item) {
  return topicTerms([item.topic || '', (item.tags || []).join(' '), (item.apis || []).join(' ')].join(' '));
}

// searched: URLs Perplexity retrieved. existing: current questions.
function validate(q, searched, existing) {
  const failures = [];
  if (!q || typeof q !== 'object') return { ok: false, failures: ['response was not JSON'] };

  const question = String(q.question || '').trim();
  if (question.length < 150 || question.length > 1200) failures.push('question must be 150-1200 characters');
  if (!/\?\s*$|explain|walk me through|design|how (do|would)|what (do|would)/i.test(question)) failures.push('question must end with an explicit ask');
  if (!['Foundation', 'Senior', 'Expert'].includes(q.difficulty)) failures.push('difficulty must be Foundation, Senior or Expert');
  if (!list(q.whatTheyWant).length) failures.push('whatTheyWant is empty');
  const sections = (q.answer || []).filter((s) => s && list(s.paragraphs).length);
  if (sections.length < 2) failures.push('answer needs at least 2 sections with text');
  if (list(q.edgeCases).length < 2) failures.push('needs at least 2 edge cases');
  if (list(q.commonMistakes).length < 2) failures.push('needs at least 2 common mistakes');
  const followUps = list(q.followUps);
  if (followUps.length < 2 || followUps.length > 3) failures.push('needs 2 or 3 follow-ups');
  if (String(q.topic || '').trim().split(/\s+/).length < 3) failures.push('topic must name the concept in 3-8 words');

  const text = allText(q);
  const words = C.wordCount(text);
  if (words < MIN_WORDS) failures.push(`too short (${words} words, need ${MIN_WORDS})`);
  if (words > MAX_WORDS) failures.push(`too long (${words} words, max ${MAX_WORDS})`);
  if (/\[\d+\]/.test(text)) failures.push('contains citation markers like [1]');
  if (/<\/?(p|div|span|a|b|i|em|strong|br|h[1-6]|ul|ol|li|img|script|iframe|table|pre|code)\b[^>]*>/i.test(text)) failures.push('contains HTML');
  const filler = C.fillerHits(text);
  if (filler.length) failures.push('filler phrases: ' + filler.join(', '));

  const searchedSet = new Set(searched.map(normalizeUrl));
  const sources = (q.sources || []).filter((s) => s && host(s.url));
  const verified = sources.filter((s) => searchedSet.has(normalizeUrl(s.url)));
  if (verified.length < sources.length) failures.push('cited a source that was not in the search results');
  if (new Set(verified.map((s) => host(s.url))).size < 2) failures.push('needs at least 2 sources on different sites');
  if (!verified.some((s) => /(^|\.)servicenow\.com$/.test(host(s.url)))) failures.push('needs at least one servicenow.com source');

  const html = render(Object.assign({}, q, { answer: sections, sources: verified }));
  const apiProblems = apiCheck.check(html);
  apiProblems.forEach((p) => failures.push('unknown API: ' + p.message));

  const topic = topicTerms(q.topic);
  const dupTopic = existing.find((e) => overlap(topic, existingTopic(e)) >= MAX_TOPIC_OVERLAP);
  if (dupTopic) failures.push(`topic repeats existing question ${dupTopic.id}`);
  const dupQuestion = existing.find((e) => C.similarity(question, e.question) >= MAX_QUESTION_SIMILARITY);
  if (dupQuestion) failures.push(`question too close to existing question ${dupQuestion.id}`);

  if (failures.length) return { ok: false, failures };
  return { ok: true, question: Object.assign({}, q, { answer: sections, sources: verified.slice(0, 5) }), html };
}

// ---------------------------------------------------------------------------
// Rendering — every model string is escaped before it becomes HTML
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function plain(s) {
  return esc(String(s || '').replace(/\*\*|`/g, '').trim());
}

function ul(items) {
  return '<ul>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ul>';
}

// Matches the hand-written answers: h4 sections, tip-box for score points, Sources last.
function render(q) {
  const out = ['<h4>What the Interviewer Wants to Hear</h4>'];
  list(q.whatTheyWant).forEach((p) => out.push('<p>' + inline(p) + '</p>'));
  out.push('<h4>The Answer</h4>');
  (q.answer || []).forEach((s) => {
    if (s.heading && s.heading.trim()) out.push('<p><strong>' + plain(s.heading) + '</strong></p>');
    list(s.paragraphs).forEach((p) => out.push('<p>' + inline(p) + '</p>'));
    const bullets = list(s.bullets);
    if (bullets.length) out.push(ul(bullets));
    if (s.code && s.code.trim()) out.push('<pre>' + esc(s.code.replace(/\s+$/, '')) + '</pre>');
  });
  out.push('<h4>Edge Cases and Gotchas</h4>', ul(list(q.edgeCases)));
  out.push('<h4>Common Mistakes</h4>', ul(list(q.commonMistakes)));
  if (q.scorePoints && String(q.scorePoints).trim()) {
    out.push('<div class="tip-box"><strong>Score points:</strong> ' + inline(q.scorePoints) + '</div>');
  }
  out.push('<h4>Likely Follow-ups</h4>', ul(list(q.followUps)));
  out.push('<h4>Sources</h4><ul>' + (q.sources || []).map((s) =>
    '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + plain(s.title || host(s.url)) + '</a></li>'
  ).join('') + '</ul>');
  return out.join('');
}

function toItem(category, q, html, id, now) {
  return {
    id,
    question: inline(q.question),
    answer: html,
    difficulty: q.difficulty,
    company: 'ServiceNow',
    category,
    scenario: true,
    daily: true,
    topic: String(q.topic).trim(),
    tags: list(q.tags).map((t) => t.toLowerCase()).slice(0, 6),
    sources: q.sources.map((s) => ({ title: String(s.title || ''), url: s.url })),
    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    dateISO: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Perplexity
// ---------------------------------------------------------------------------

function callSonar(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      {
        hostname: 'api.perplexity.ai',
        path: '/chat/completions',
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
            reject(new Error(`Sonar ${response.statusCode}: ${raw.slice(0, 200)}`));
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

function searchedUrls(data) {
  const urls = [];
  (data.search_results || []).forEach((r) => { if (r && r.url) urls.push(r.url); });
  (data.citations || []).forEach((u) => { if (typeof u === 'string') urls.push(u); });
  return urls;
}

async function research(category, level, items) {
  const inCategory = items.filter((q) => q.category === category);
  const existingLines = inCategory.slice(0, 40).map((q) => C.plainText(q.question).slice(0, 140));
  let feedback = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const data = await callSonar({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(category, level, existingLines, feedback) },
      ],
      temperature: 0.2,
      max_tokens: 5000,
      web_search_options: { search_context_size: 'high' },
      response_format: { type: 'json_schema', json_schema: { schema: SCHEMA } },
    });
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    const result = validate(extractJson(content), searchedUrls(data), items);
    if (result.ok) return result;
    feedback = result.failures;
    console.log(`  attempt ${attempt} rejected: ${feedback.join('; ')}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv, categories) {
  const opts = { dryRun: false, category: null, count: PER_DAY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--count') opts.count = Math.max(1, parseInt(argv[++i], 10) || PER_DAY);
    else if (argv[i] === '--category') {
      const c = argv[++i];
      if (!categories.includes(c)) throw new Error(`unknown category "${c}" (use one of: ${categories.join(', ')})`);
      opts.category = c;
    }
  }
  return opts;
}

async function main() {
  const categories = C.loadCategories();
  const missing = categories.filter((c) => !BRIEFS[c]);
  if (missing.length) throw new Error('no brief for categories: ' + missing.join(', '));
  const opts = parseArgs(process.argv.slice(2), categories);
  const now = new Date();
  const plan = todaysPlan(categories, now, opts.count);
  if (opts.category) plan.categories = Array(opts.count).fill(opts.category);
  const items = C.loadQuestions();

  if (opts.dryRun) {
    plan.categories.forEach((c) => {
      const existing = items.filter((q) => q.category === c).slice(0, 40).map((q) => C.plainText(q.question).slice(0, 140));
      console.log(`\n=== ${c} (${plan.level}) ===\n` + buildPrompt(c, plan.level, existing));
    });
    console.log('\n(dry run — no API call, nothing written)');
    return;
  }
  if (!API_KEY) {
    console.error('✖ PERPLEXITY_API_KEY is not set');
    process.exit(1);
  }

  let nextId = items.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0) + 1;
  const fresh = [];
  for (const category of plan.categories) {
    console.log(`\n${category}: researching a ${plan.level} question`);
    try {
      const result = await research(category, plan.level, fresh.concat(items));
      if (!result) {
        console.log('  skipped: no question cleared the gate');
        continue;
      }
      const item = toItem(category, result.question, result.html, nextId++, now);
      fresh.push(item);
      console.log(`  ✅ #${item.id} [${item.difficulty}] ${item.topic} (${item.sources.length} sources)`);
    } catch (error) {
      console.log(`  skipped: ${error.message}`);
    }
  }

  if (!fresh.length) {
    console.error('\nNo question was written today.');
    process.exit(2);
  }
  C.saveQuestions(fresh.concat(items));
  console.log(`\n💾 ${fresh.length} new, ${fresh.length + items.length} questions total`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('✖', error.message);
    process.exit(1);
  });
}

module.exports = { BRIEFS, SCHEMA, todaysPlan, buildPrompt, validate, render, toItem, normalizeUrl };
