'use strict';

// Checks the notebook index builder, the Markdown renderer used on
// upsc.html?view=notebook, and the page wiring. Also validates every real
// post under data/upsc/notebook/posts so a malformed entry fails CI instead
// of disappearing from the page.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const indexer = require('./upsc/notebook-index.js');

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

const GOOD_POST = [
  '---',
  'title: Evening check-in, Thursday 15 October',
  'date: 2026-10-15',
  'time: "21:21"',
  'category: nightly-checkin',
  'summary: Day 11 was not logged. Four of the five weekdays of the re-cut Week 2 are gone.',
  'week: 2',
  'phase: BUILD',
  'days_to_go: 220',
  'tags: [polity, logging]',
  '---',
  '',
  'No log came in for today. That makes eleven days in a row with no hours recorded,',
  'and four of the five weekdays of the re-cut Week 2 are gone.',
  '',
  '## Carry forward',
  '',
  '- Laxmikanth chapters 1 to 2',
  '- 10 Polity PYQs',
  '',
  '| Week | Planned | Done |',
  '|---|---|---|',
  '| 1 | 20 h | 0 h |',
  '',
].join('\n');

test('frontmatter parses scalars, quoted strings, numbers and lists', function () {
  const { meta, body } = indexer.parseFrontmatter(GOOD_POST);
  assert.equal(meta.title, 'Evening check-in, Thursday 15 October');
  assert.equal(meta.time, '21:21');
  assert.equal(meta.week, 2);
  assert.equal(meta.days_to_go, 220);
  assert.deepEqual(meta.tags, ['polity', 'logging']);
  assert.match(body, /^\s*No log came in/);
});

test('validatePost accepts a well-formed post and rejects broken ones', function () {
  const good = indexer.validatePost('2026-10-15-nightly-checkin.md', GOOD_POST);
  assert.deepEqual(good.errors, []);
  assert.equal(good.post.id, '2026-10-15-nightly-checkin');
  assert.equal(good.post.category, 'nightly-checkin');
  assert.equal(good.post.daysToGo, 220);
  assert.ok(good.post.words > 20);

  const wrongDate = indexer.validatePost('2026-10-14-nightly-checkin.md', GOOD_POST);
  assert.ok(wrongDate.errors.some((e) => /match the file name date/.test(e)));

  const badCategory = indexer.validatePost('2026-10-15-x.md', GOOD_POST.replace('nightly-checkin', 'diary'));
  assert.ok(badCategory.errors.some((e) => /category must be one of/.test(e)));

  const noFrontmatter = indexer.validatePost('2026-10-15-x.md', 'Just a paragraph.');
  assert.deepEqual(noFrontmatter.errors, ['missing frontmatter block']);

  const tooShort = indexer.validatePost('2026-10-15-x.md', GOOD_POST.split('\n').slice(0, 12).join('\n') + '\nShort.\n');
  assert.ok(tooShort.errors.some((e) => /too short/.test(e)));
});

test('buildIndex sorts newest first, counts categories and skips bad files', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-'));
  fs.writeFileSync(path.join(dir, '2026-10-15-nightly-checkin.md'), GOOD_POST);
  fs.writeFileSync(path.join(dir, '2026-10-16-morning-brief.md'), GOOD_POST
    .replace('date: 2026-10-15', 'date: 2026-10-16').replace('nightly-checkin', 'morning-brief').replace('"21:21"', '"06:24"'));
  fs.writeFileSync(path.join(dir, '2026-10-16-nightly-checkin.md'), GOOD_POST
    .replace('date: 2026-10-15', 'date: 2026-10-16'));
  fs.writeFileSync(path.join(dir, 'notes.md'), 'no frontmatter here');
  const { index, problems } = indexer.buildIndex(dir);
  assert.equal(problems.length, 1);
  assert.deepEqual(index.posts.map((p) => p.id), ['2026-10-16-nightly-checkin', '2026-10-16-morning-brief', '2026-10-15-nightly-checkin']);
  const byId = Object.fromEntries(index.categories.map((c) => [c.id, c.count]));
  assert.equal(byId['nightly-checkin'], 2);
  assert.equal(byId['morning-brief'], 1);
  assert.equal(byId['plan'], 0);
  assert.equal(index.categories[0].id, 'morning-brief');
});

test('every real notebook post is valid and the committed index is current', function () {
  const postsDir = path.join(ROOT, 'data', 'upsc', 'notebook', 'posts');
  const { index, problems } = indexer.buildIndex(postsDir);
  assert.deepEqual(problems, [], 'malformed posts: ' + JSON.stringify(problems));
  assert.ok(index.posts.length > 0, 'the notebook should ship with at least one entry');
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'upsc', 'notebook', 'index.json'), 'utf8'));
  assert.deepEqual(committed.posts.map((p) => p.id), index.posts.map((p) => p.id), 'run node scripts/upsc/notebook-index.js');
  const ids = new Set();
  for (const post of index.posts) {
    assert.ok(!ids.has(post.id), 'duplicate id ' + post.id);
    ids.add(post.id);
  }
});

function loadNotebookModule() {
  const source = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'upsc', 'notebook.js'), 'utf8');
  const sandbox = {
    window: { addEventListener() {}, location: { href: 'https://sumanthbolle.com/upsc.html' } },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    URL,
    fetch() { return Promise.reject(new Error('no network in tests')); },
    Date,
    Math,
    console,
  };
  sandbox.window.URL = URL;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.UPSCNotebook;
}

test('the Markdown renderer escapes HTML and renders the subset the coordinator uses', function () {
  const nb = loadNotebookModule();
  assert.ok(nb && typeof nb.markdown === 'function');
  const html = nb.markdown([
    '## Carry forward',
    '',
    'Read **chapters 1 to 2** and do *10 PYQs*. See [PIB](https://pib.gov.in/x?a=1&b=2).',
    '<script>alert(1)</script> and `getValue()`',
    '',
    '- one',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '| Week | Done |',
    '|---|---|',
    '| 1 | 0 h |',
    '',
    '> a quoted line',
  ].join('\n'));
  assert.match(html, /<h3>Carry forward<\/h3>/);
  assert.match(html, /<strong>chapters 1 to 2<\/strong>/);
  assert.match(html, /<em>10 PYQs<\/em>/);
  assert.match(html, /<a href="https:\/\/pib\.gov\.in\/x\?a=1&amp;b=2" rel="noopener noreferrer" target="_blank">PIB<\/a>/);
  assert.ok(html.indexOf('<script>') === -1, 'raw HTML must be escaped');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<code>getValue\(\)<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<table><thead><tr><th scope="col">Week<\/th><th scope="col">Done<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>0 h<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<blockquote><p>a quoted line<\/p><\/blockquote>/);
  assert.equal(nb.markdown('[x](javascript:alert%281%29)'), '<p><a href="#">x</a></p>');
  assert.equal(nb.stripFrontmatter(GOOD_POST).indexOf('title:'), -1);
  assert.equal(nb.longDate('2026-10-16'), 'Friday 16 October 2026');
});

test('upsc.html carries the Notebook tab, panel and script in the right places', function () {
  const html = fs.readFileSync(path.join(ROOT, 'upsc.html'), 'utf8');
  assert.match(html, /id="tab-notebook"[^>]*href="\?view=notebook"|href="\?view=notebook"[^>]*id="tab-notebook"/);
  assert.match(html, /id="view-notebook"[^>]*hidden/);
  for (const id of ['notebookMeta', 'notebookIntro', 'notebookFilter', 'notebookList', 'notebookReader']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.ok(html.indexOf('id="tab-memory"') < html.indexOf('id="tab-notebook"'));
  assert.ok(html.indexOf('id="tab-notebook"') < html.indexOf('id="tab-source"'));
  assert.ok(html.indexOf('assets/js/upsc/app.js') < html.indexOf('assets/js/upsc/notebook.js'));
  assert.match(html, /assets\/css\/upsc-notebook\.css/);
  assert.match(html, /href="upsc-notebook\.html"/);
  const app = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'upsc', 'app.js'), 'utf8');
  assert.match(app, /var VIEWS = \[[^\]]*'notebook'[^\]]*\]/);
  assert.match(app, /searchParams\.delete\('post'\)/);
  assert.ok(fs.existsSync(path.join(ROOT, 'upsc-notebook.html')));
  assert.ok(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'upsc-notebook.yml')));
});
