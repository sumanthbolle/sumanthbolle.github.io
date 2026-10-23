// scripts/validate-interviews.js
// =============================================================================
// INTERVIEW CONTENT VALIDATION
// =============================================================================
// Checks every interview question the site serves and writes a Markdown report.
// Runs daily after the question generator, and weekly with --links.
//
// ERRORS (exit 1) — things that break the page or the data:
//   - the two data files differ, invalid JSON, missing fields, duplicate ids
//   - unknown difficulty, or a category the sidebar does not list
//   - unbalanced HTML tags, <h1>-<h3>, inline styles, scripts or event handlers
//   - a developer.servicenow.com reference link that is not a real page
// WARNINGS — content to review:
//   - ServiceNow classes or methods not in the API reference index
//   - filler phrases, leftover markdown, citation markers
//   - near-duplicate questions
//   - with --links: external links that return 404/410 or do not resolve
//
// Usage:
//   node scripts/validate-interviews.js [--report report.md] [--links] [--only-new N]
// =============================================================================

const fs = require('fs');
const path = require('path');
const C = require('./lib/interview-content');
const apiCheck = require('./lib/sn-api-check');

const REQUIRED = ['id', 'question', 'answer', 'difficulty', 'company', 'category', 'date'];
const DUPLICATE_SIMILARITY = 0.3;
const LINK_TIMEOUT_MS = 12000;
const LINK_CONCURRENCY = 8;

function parseArgs(argv) {
  const opts = { report: null, links: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report') opts.report = argv[++i];
    else if (argv[i] === '--links') opts.links = true;
  }
  return opts;
}

function hrefs(html) {
  const out = [];
  String(html).replace(/href="([^"]+)"/g, (m, u) => { out.push(u.replace(/&amp;/g, '&')); return m; });
  return out;
}

// Pure checks on the data; no network.
function checkItems(items, categories, index) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const pages = new Set(index.raw.pages || []);

  items.forEach((q) => {
    const where = `#${q.id}`;
    REQUIRED.forEach((f) => { if (q[f] === undefined || q[f] === '') errors.push(`${where}: missing field "${f}"`); });
    if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);
    if (!C.LEVELS.includes(q.difficulty)) errors.push(`${where}: unknown difficulty "${q.difficulty}"`);
    if (!categories.includes(q.category)) errors.push(`${where}: category "${q.category}" is not in the sidebar list`);

    [['question', q.question], ['answer', q.answer]].forEach(([field, html]) => {
      const bad = C.unbalancedTags(html);
      if (bad.length) errors.push(`${where} ${field}: unbalanced <${bad.join('>, <')}>`);
      if (/<h[1-3][\s>]/i.test(html)) errors.push(`${where} ${field}: uses <h1>-<h3>`);
      if (/\sstyle=/i.test(html)) errors.push(`${where} ${field}: inline style`);
      if (/<script|\son[a-z]+=/i.test(html)) errors.push(`${where} ${field}: script or event handler`);
    });

    hrefs(q.answer).forEach((u) => {
      if (/developer\.servicenow\.com\/dev\.do#!\/reference\/api\//.test(u) && pages.size && !pages.has(u)) {
        errors.push(`${where}: reference link is not a known API page: ${u}`);
      }
    });

    // Link text is a source's own title, so it is left out of the prose checks.
    const text = C.plainText((q.question + ' ' + q.answer).replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, ' '));
    const filler = C.fillerHits(text);
    if (filler.length) warnings.push(`${where}: filler phrases: ${filler.join(', ')}`);
    if (/```|\*\*[^*]+\*\*|^\s*#{1,6}\s/m.test(text)) warnings.push(`${where}: leftover markdown`);
    if (/\[\d+\](?!\s*[=;)])/.test(text)) warnings.push(`${where}: citation marker like [1]`);
    apiCheck.check(q.answer + ' ' + q.question).forEach((p) => warnings.push(`${where}: ${p.message}`));
  });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = C.similarity(items[i].question, items[j].question);
      if (s >= DUPLICATE_SIMILARITY) warnings.push(`#${items[i].id} and #${items[j].id}: near-duplicate questions (${s.toFixed(2)})`);
    }
  }
  return { errors, warnings };
}

async function checkLink(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
  const headers = { 'User-Agent': 'Mozilla/5.0 (link check; sumanthbolle.github.io)' };
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    return res.status;
  } catch (e) {
    return e.name === 'AbortError' ? 'timeout' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

// Only definite breakage is reported: 404/410 and hosts that do not resolve.
async function checkLinks(items) {
  const byUrl = new Map();
  items.forEach((q) => hrefs(q.answer).forEach((u) => {
    if (!/^https?:\/\//.test(u) || /developer\.servicenow\.com\/dev\.do/.test(u)) return;
    if (!byUrl.has(u)) byUrl.set(u, []);
    byUrl.get(u).push(q.id);
  }));
  const urls = Array.from(byUrl.keys());
  const broken = [];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      const status = await checkLink(url);
      if (status === 404 || status === 410 || status === 'unreachable') broken.push({ url, status, ids: byUrl.get(url) });
    }
  }
  await Promise.all(Array.from({ length: LINK_CONCURRENCY }, worker));
  return { checked: urls.length, broken };
}

function markdown(items, result, links) {
  const lines = [`# Interview content check — ${new Date().toISOString().slice(0, 10)}`, ''];
  lines.push(`${items.length} questions · ${result.errors.length} errors · ${result.warnings.length} warnings` +
    (links ? ` · ${links.checked} external links checked, ${links.broken.length} broken` : ''), '');
  if (result.errors.length) lines.push('## Errors', '', ...result.errors.map((e) => '- ' + e), '');
  if (links && links.broken.length) {
    lines.push('## Broken links', '', ...links.broken.map((b) => `- ${b.status} ${b.url} (questions ${b.ids.join(', ')})`), '');
  }
  if (result.warnings.length) lines.push('## Warnings', '', ...result.warnings.map((w) => '- ' + w), '');
  if (!result.errors.length && !result.warnings.length && !(links && links.broken.length)) lines.push('All checks passed.');
  return lines.join('\n') + '\n';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const errors = [];
  let items = [];
  try {
    const raw = C.DATA_FILES.map((f) => fs.readFileSync(f, 'utf8'));
    if (raw[0] !== raw[1]) errors.push(`${path.relative(C.ROOT, C.DATA_FILES[0])} and ${path.relative(C.ROOT, C.DATA_FILES[1])} differ`);
    items = JSON.parse(raw[0]);
  } catch (e) {
    errors.push('cannot read interview data: ' + e.message);
  }
  const result = items.length ? checkItems(items, C.loadCategories(), apiCheck.loadIndex()) : { errors: [], warnings: [] };
  result.errors = errors.concat(result.errors);
  const links = opts.links ? await checkLinks(items) : null;

  const report = markdown(items, result, links);
  if (opts.report) fs.writeFileSync(opts.report, report);
  console.log(report);
  process.exit(result.errors.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('✖', error.message);
    process.exit(1);
  });
}

module.exports = { checkItems, hrefs };
