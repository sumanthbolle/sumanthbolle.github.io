/**
 * Offline tests for the daily blog discoveries generator. No API calls.
 * Run: node scripts/test-blog-discoveries.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var D = require('./fetch-blog-discoveries');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

var para = 'The team measured cold-start latency before and after the change and published the raw numbers, ' +
  'including the cases where the new path was slower because of cache misses on first deploy. ';

function article(overrides) {
  return Object.assign({
    title: 'GlideQuery now replaces most GlideRecord loops in scoped apps',
    excerpt: 'A community thread showed how GlideQuery cuts boilerplate and catches field typos before the query runs.',
    difficulty: 'Intermediate',
    sections: [
      { heading: 'What happened', paragraphs: [para.repeat(4)] },
      { heading: 'How it works', paragraphs: [para.repeat(4)], code: 'new GlideQuery("incident")\n  .where("active", true)\n  .select("number")', codeLanguage: 'javascript' },
      { heading: 'The catch', paragraphs: [para.repeat(5)], bullets: ['Use `GlideQuery` for reads', 'Keep **GlideRecord** for List<String> results'] },
    ],
    takeaways: ['Try it on one script include first.'],
    sources: [
      { title: 'Community thread', url: 'https://www.servicenow.com/community/developer-blog/glidequery/ba-p/1' },
      { title: 'Docs', url: 'https://developer.servicenow.com/dev.do#!/reference/api/glidequery' },
    ],
  }, overrides || {});
}

var searched = [
  'https://servicenow.com/community/developer-blog/glidequery/ba-p/1/',
  'https://developer.servicenow.com/dev.do#!/reference/api/glidequery',
];

test('every blog filter has a category beat', function () {
  var blog = fs.readFileSync(path.join(__dirname, '..', 'blog.html'), 'utf8');
  var filters = (blog.match(/data-filter="([a-z]+)"/g) || []).map(function (m) { return m.slice(13, -1); })
    .filter(function (f) { return f !== 'all'; });
  assert.ok(filters.length >= 4);
  filters.forEach(function (f) { assert.ok(D.CATEGORIES[f], 'no beat for filter ' + f); });
});

test('a good article clears the gate', function () {
  var r = D.validate(article(), searched, new Set());
  assert.deepStrictEqual(r.failures, undefined);
  assert.strictEqual(r.ok, true);
});

test('invented links, single host and repeats are rejected', function () {
  var r = D.validate(article({ sources: [{ title: 'Made up', url: 'https://example.com/a' }] }), searched, new Set());
  assert.ok(r.failures.some(function (f) { return /not in the search results/.test(f); }));
  assert.ok(r.failures.some(function (f) { return /2 sources/.test(f); }));

  var used = new Set([D.normalizeUrl(article().sources[0].url)]);
  r = D.validate(article(), searched, used);
  assert.ok(r.failures.some(function (f) { return /already covered/.test(f); }));
});

test('citation markers, HTML, filler and thin articles are rejected', function () {
  var bad = article({ excerpt: 'We delve into it [1] with <b>bold</b> claims.', sections: article().sections.slice(0, 2) });
  var r = D.validate(bad, searched, new Set());
  var all = r.failures.join(' | ');
  assert.match(all, /citation markers/);
  assert.match(all, /HTML/);
  assert.match(all, /filler phrases: delve/);
  assert.match(all, /at least 3 sections/);
  assert.match(D.validate(article({ sections: [{ heading: 'a', paragraphs: ['x'] }] }), searched, new Set()).failures.join(), /too short/);
});

test('rendered HTML escapes model text and links sources', function () {
  var html = D.renderContent(D.validate(article(), searched, new Set()).article);
  assert.ok(html.indexOf('List<String>') === -1);
  assert.ok(html.indexOf('List&lt;String&gt;') !== -1);
  assert.ok(html.indexOf('<code>GlideQuery</code>') !== -1);
  assert.ok(html.indexOf('<strong>GlideRecord</strong>') !== -1);
  assert.ok(html.indexOf('<pre><code class="language-javascript">new GlideQuery(&quot;incident&quot;)') !== -1);
  assert.ok(/<h2>Sources<\/h2>[\s\S]*href="https:\/\/www\.servicenow\.com\/community/.test(html));
});

test('posts are shaped like hand-written ones and pruning keeps manual posts', function () {
  var post = D.toPost('servicenow', D.validate(article(), searched, new Set()).article, 200, new Date('2026-10-14T02:30:00Z'));
  assert.strictEqual(post.date, 'Oct 14, 2026');
  assert.strictEqual(post.daily, true);
  assert.match(post.readTime, /^\d+ min read$/);
  ['id', 'title', 'excerpt', 'readTime', 'category', 'learningPath', 'difficulty', 'forPersona', 'uniqueId', 'date', 'dateISO', 'content']
    .forEach(function (k) { assert.ok(post[k] != null, 'missing ' + k); });

  var old = [];
  for (var i = 0; i < 5; i++) old.push({ id: i, category: 'ai', daily: true });
  old.push({ id: 99, category: 'ai' });
  var merged = D.merge(old, [{ id: 100, category: 'ai', daily: true }], 3);
  assert.deepStrictEqual(merged.map(function (p) { return p.id; }), [100, 0, 1, 99]);
});

test('dry-run prompt lists recent titles and rejection reasons', function () {
  var p = D.buildPrompt('ai', ['Old title'], ['too short']);
  assert.match(p, /- Old title/);
  assert.match(p, /- too short/);
});
