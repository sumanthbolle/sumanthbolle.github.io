// scripts/fetch-blog-discoveries.js
// =============================================================================
// DAILY BLOG DISCOVERIES
// =============================================================================
// One sourced article per blog category per day, researched with Perplexity
// Sonar over the past week. Each category has its own beat:
//
//   servicenow    what the ServiceNow community and developer blogs found
//   ai            practical AI engineering: models, agents, evals, tooling
//   architecture  software development: tech debt, postmortems, performance
//   career        ice-breakers: surprising engineering stories worth sharing
//
// The model returns structured JSON; this script renders the HTML itself, so
// nothing the model writes reaches the page unescaped.
//
// VALIDATION GATE — an article is written only when it clears all of:
//   - title, excerpt and at least 3 sections, 450–1800 words
//   - at least 2 sources on 2 distinct hosts, every one of them returned by
//     Perplexity's own search (no invented links)
//   - no source the last 60 daily posts already led with
//   - no citation markers, no HTML, no filler phrases from FILLER
// A failed article is retried once with the reasons, then skipped.
// Exit 0 when at least one article was written, 2 when none were.
//
// Daily posts carry `daily: true`. Only those are pruned (KEEP_PER_CATEGORY
// newest per category); hand-written posts are never touched.
//
// Usage:
//   node scripts/fetch-blog-discoveries.js --dry-run
//   PERPLEXITY_API_KEY=... node scripts/fetch-blog-discoveries.js
//   PERPLEXITY_API_KEY=... node scripts/fetch-blog-discoveries.js --category ai
// =============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
const MODEL = 'sonar-pro';
const REQUEST_TIMEOUT_MS = 120000;
const KEEP_PER_CATEGORY = 14;
const MIN_WORDS = 450;
const MAX_WORDS = 1800;

const ROOT = path.resolve(__dirname, '..');
const POST_FILES = [path.join(ROOT, 'data', 'posts.json'), path.join(ROOT, 'posts.json')];

const CATEGORIES = {
  servicenow: {
    beat: 'the ServiceNow community',
    brief:
      'Find one interesting discovery from the ServiceNow community in the past week: a clever solution or ' +
      'workaround shared on the ServiceNow Community forums or Developer blog, a newly documented platform ' +
      'behaviour, a release feature (Now Assist, Workflow Data Fabric, AI Agents, Now SDK, Flow Designer, CMDB, ' +
      'scripting), a known-error fix, or a performance or upgrade lesson. Explain the technical detail a ' +
      'ServiceNow developer or admin needs to use it, with a short code or configuration example when one helps.',
    persona: ['Developers', 'Admins', 'Architects'],
  },
  ai: {
    beat: 'AI engineering',
    brief:
      'Find one interesting AI engineering discovery from the past week that a working software engineer can use: ' +
      'a new model or capability with concrete numbers, an agent or retrieval pattern, an evaluation result, ' +
      'a prompt or context technique, a cost or latency finding, or a notable open-source tool. Explain how it ' +
      'works and where it breaks, with a short code example when one helps.',
    persona: ['Developers', 'Architects', 'Tech leads'],
  },
  architecture: {
    beat: 'software development',
    brief:
      'Find one interesting software development story from the past week: a public postmortem, a tech-debt ' +
      'paydown or migration with real numbers, a performance win, a language or runtime change, a database or ' +
      'infrastructure lesson, or a security incident with an engineering lesson. Explain what happened, the ' +
      'technical root cause or design choice, and what other teams can copy.',
    persona: ['Developers', 'Architects', 'Engineering managers'],
  },
  career: {
    beat: 'engineering ice-breakers',
    brief:
      'Find one surprising, true story from the tech industry in the past week that engineers would enjoy ' +
      'bringing up with colleagues: an unexpected bug, an odd piece of computing history resurfacing, a ' +
      'striking survey or hiring number, a clever hack, or a shift in how engineering teams work. Tell the ' +
      'story, explain the technical bit underneath it, and end with what it means for an engineer\'s work or career.',
    persona: ['Developers', 'Engineering managers', 'Students'],
  },
};

// Phrases that mark generic AI prose. Any hit fails the article.
const FILLER = [
  'delve', 'game-changer', 'game changer', 'in today\'s fast-paced', 'ever-evolving', 'rapidly evolving landscape',
  'unlock the power', 'revolutionize', 'revolutionise', 'seamlessly', 'harness the power', 'in conclusion',
  'it\'s worth noting', 'tapestry', 'paradigm shift', 'buckle up', 'let\'s dive', 'dive into',
];

const SYSTEM_PROMPT =
  'You are a senior engineer writing a short, accurate blog post for other engineers. ' +
  'Write plainly: short sentences, concrete facts, real names, versions, dates and numbers from your sources. ' +
  'No hype, no marketing language, no filler intros or summaries. Do not use the words: ' + FILLER.join(', ') + '. ' +
  'Every claim must come from the search results. Do not put citation markers like [1] in the text. ' +
  'Use plain text only, no HTML or markdown headings. You may use **bold** and `code` inline. ' +
  'Return only JSON that matches the schema.';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    excerpt: { type: 'string' },
    difficulty: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          bullets: { type: 'array', items: { type: 'string' } },
          code: { type: 'string' },
          codeLanguage: { type: 'string' },
        },
        required: ['heading', 'paragraphs'],
      },
    },
    takeaways: { type: 'array', items: { type: 'string' } },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, url: { type: 'string' } },
        required: ['title', 'url'],
      },
    },
  },
  required: ['title', 'excerpt', 'difficulty', 'sections', 'takeaways', 'sources'],
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(category, recentTitles, feedback) {
  const c = CATEGORIES[category];
  const lines = [
    c.brief,
    '',
    'Pick something specific and recent, not a general overview. Prefer primary sources (official docs, ' +
      'release notes, engineering blogs, the original forum thread or repository) over news rewrites.',
    '',
    'Shape:',
    '- title: specific and factual, under 90 characters, no clickbait.',
    '- excerpt: one or two sentences saying what was found and why it matters.',
    '- sections: 3 to 5 sections. Suggested: what happened, how it works, the catch, how to use it.',
    '- each section: 1 to 3 paragraphs; bullets or a short code snippet only when they help.',
    '- takeaways: 2 to 4 one-line actions a reader can take.',
    '- sources: 2 to 5 of the search results you used, with their exact URLs.',
    '- about 600 to 1000 words in total.',
  ];
  if (recentTitles.length) {
    lines.push('', 'Already covered recently, pick something else:', ...recentTitles.map((t) => '- ' + t));
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
    u.hash = '';
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search).toLowerCase();
  } catch (e) {
    return String(url || '').toLowerCase();
  }
}

function allText(a) {
  const parts = [a.title, a.excerpt];
  (a.sections || []).forEach((s) => {
    parts.push(s.heading);
    (s.paragraphs || []).forEach((p) => parts.push(p));
    (s.bullets || []).forEach((b) => parts.push(b));
  });
  (a.takeaways || []).forEach((t) => parts.push(t));
  return parts.filter(Boolean).join('\n');
}

function wordCount(text) {
  return (String(text).match(/\S+/g) || []).length;
}

// Searched: the URLs Perplexity actually retrieved. usedUrls: primary sources of recent daily posts.
function validate(article, searched, usedUrls) {
  const failures = [];
  if (!article || typeof article !== 'object') return { ok: false, failures: ['response was not JSON'] };

  const title = String(article.title || '').trim();
  if (title.length < 15 || title.length > 120) failures.push('title must be 15-120 characters');
  if (String(article.excerpt || '').trim().length < 40) failures.push('excerpt is too short');

  const sections = (article.sections || []).filter((s) => s && s.heading && (s.paragraphs || []).some(Boolean));
  if (sections.length < 3) failures.push('needs at least 3 sections with text');

  const text = allText(article);
  const words = wordCount(text);
  if (words < MIN_WORDS) failures.push(`too short (${words} words, need ${MIN_WORDS})`);
  if (words > MAX_WORDS) failures.push(`too long (${words} words, max ${MAX_WORDS})`);

  if (/\[\d+\]/.test(text)) failures.push('contains citation markers like [1]');
  if (/<\/?(p|div|span|a|b|i|em|strong|br|h[1-6]|ul|ol|li|img|script|iframe|table|tr|td)\b[^>]*>/i.test(text)) failures.push('contains HTML');
  const lower = text.toLowerCase();
  const filler = FILLER.filter((f) => lower.includes(f));
  if (filler.length) failures.push('filler phrases: ' + filler.join(', '));

  const searchedSet = new Set(searched.map(normalizeUrl));
  const sources = (article.sources || []).filter((s) => s && host(s.url));
  const verified = sources.filter((s) => searchedSet.has(normalizeUrl(s.url)));
  if (verified.length < sources.length) failures.push('cited a source that was not in the search results');
  if (new Set(verified.map((s) => host(s.url))).size < 2) failures.push('needs at least 2 sources on different sites');
  if (verified[0] && usedUrls.has(normalizeUrl(verified[0].url))) failures.push('main source was already covered recently');

  if (failures.length) return { ok: false, failures };
  return { ok: true, article: { ...article, sections, sources: verified.slice(0, 5) } };
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

function renderContent(a) {
  const out = [];
  a.sections.forEach((s) => {
    out.push('<h2>' + plain(s.heading) + '</h2>');
    (s.paragraphs || []).filter(Boolean).forEach((p) => out.push('<p>' + inline(p) + '</p>'));
    const bullets = (s.bullets || []).filter(Boolean);
    if (bullets.length) out.push('<ul>\n' + bullets.map((b) => '<li>' + inline(b) + '</li>').join('\n') + '\n</ul>');
    if (s.code && s.code.trim()) {
      const lang = String(s.codeLanguage || '').replace(/[^a-z0-9+#-]/gi, '').toLowerCase();
      out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + esc(s.code.replace(/\s+$/, '')) + '</code></pre>');
    }
  });
  const takeaways = (a.takeaways || []).filter(Boolean);
  if (takeaways.length) {
    out.push('<h2>Takeaways</h2>');
    out.push('<ul>\n' + takeaways.map((t) => '<li>' + inline(t) + '</li>').join('\n') + '\n</ul>');
  }
  out.push('<h2>Sources</h2>');
  out.push('<ul>\n' + a.sources.map((s) =>
    '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + plain(s.title || host(s.url)) + '</a> — ' + esc(host(s.url)) + '</li>'
  ).join('\n') + '\n</ul>');
  return out.join('\n');
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function toPost(category, a, id, now) {
  const words = wordCount(allText(a));
  return {
    id,
    title: plain(a.title),
    excerpt: plain(a.excerpt),
    readTime: Math.max(2, Math.round(words / 220)) + ' min read',
    category,
    learningPath: category,
    difficulty: ['Beginner', 'Intermediate', 'Advanced'].includes(a.difficulty) ? a.difficulty : 'Intermediate',
    forPersona: CATEGORIES[category].persona,
    uniqueId: 'daily-' + category + '-' + slug(a.title) + '-' + now.getTime(),
    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    dateISO: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    daily: true,
    sources: a.sources.map((s) => ({ title: String(s.title || ''), url: s.url })),
    content: renderContent(a),
  };
}

// ---------------------------------------------------------------------------
// Posts file
// ---------------------------------------------------------------------------

// New posts go first (the blog lists in file order). Only daily posts are pruned.
function merge(posts, fresh, keep) {
  const all = fresh.concat(posts);
  const seen = {};
  return all.filter((p) => {
    if (!p.daily) return true;
    seen[p.category] = (seen[p.category] || 0) + 1;
    return seen[p.category] <= keep;
  });
}

function recentDaily(posts, category) {
  return posts.filter((p) => p.daily && (!category || p.category === category));
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

async function research(category, recentTitles, usedUrls) {
  let feedback = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const data = await callSonar({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(category, recentTitles, feedback) },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      search_recency_filter: 'week',
      web_search_options: { search_context_size: 'high' },
      response_format: { type: 'json_schema', json_schema: { schema: SCHEMA } },
    });
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    const result = validate(extractJson(content), searchedUrls(data), usedUrls);
    if (result.ok) return result.article;
    feedback = result.failures;
    console.log(`  attempt ${attempt} rejected: ${feedback.join('; ')}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { dryRun: false, categories: Object.keys(CATEGORIES) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--category') {
      const c = argv[++i];
      if (!CATEGORIES[c]) throw new Error(`unknown category "${c}" (use ${Object.keys(CATEGORIES).join(', ')})`);
      opts.categories = [c];
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const posts = JSON.parse(fs.readFileSync(POST_FILES[0], 'utf8'));
  const usedUrls = new Set(recentDaily(posts).slice(0, 60)
    .map((p) => p.sources && p.sources[0] && normalizeUrl(p.sources[0].url)).filter(Boolean));

  if (opts.dryRun) {
    opts.categories.forEach((c) => {
      console.log(`\n=== ${c} ===\n` + buildPrompt(c, recentDaily(posts, c).slice(0, 20).map((p) => p.title)));
    });
    console.log('\n(dry run — no API call, nothing written)');
    return;
  }
  if (!API_KEY) {
    console.error('✖ PERPLEXITY_API_KEY is not set');
    process.exit(1);
  }

  let nextId = posts.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
  const fresh = [];
  for (const category of opts.categories) {
    console.log(`\n${category}: researching ${CATEGORIES[category].beat}`);
    try {
      const recentTitles = recentDaily(posts, category).slice(0, 20).map((p) => p.title);
      const article = await research(category, recentTitles, usedUrls);
      if (!article) {
        console.log(`  skipped: no article cleared the gate`);
        continue;
      }
      const post = toPost(category, article, nextId++, new Date());
      fresh.push(post);
      usedUrls.add(normalizeUrl(post.sources[0].url));
      console.log(`  ✅ #${post.id} ${post.title} (${post.readTime}, ${post.sources.length} sources)`);
    } catch (error) {
      console.log(`  skipped: ${error.message}`);
    }
  }

  if (!fresh.length) {
    console.error('\nNo article was written today.');
    process.exit(2);
  }
  const merged = merge(posts, fresh, KEEP_PER_CATEGORY);
  // Matches the file's existing ASCII-escaped style, so a run's diff is only the new posts.
  const json = JSON.stringify(merged, null, 2)
    .replace(/[\u0080-\uffff]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
  POST_FILES.forEach((file) => fs.writeFileSync(file, json));
  console.log(`\n💾 ${fresh.length} new, ${posts.length + fresh.length - merged.length} pruned, ${merged.length} posts total`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('✖', error.message);
    process.exit(1);
  });
}

module.exports = { CATEGORIES, buildPrompt, validate, renderContent, toPost, merge, normalizeUrl };
