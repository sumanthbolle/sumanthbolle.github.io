/**
 * Offline tests for the daily interview generator, the content validator and
 * the ServiceNow API name check. No API calls.
 * Run: node scripts/test-interview-automation.js
 */
'use strict';

var assert = require('assert');
var G = require('./fetch-interview-questions');
var V = require('./validate-interviews');
var C = require('./lib/interview-content');
var apiCheck = require('./lib/sn-api-check');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

var para = 'The transform runs once per staging row, and the coalesce field decides whether the row updates an existing ' +
  'record or inserts a new one, so a coalesce on a field the source leaves empty inserts duplicates on every run. ';

function question(overrides) {
  return Object.assign({
    question: 'A logistics company imports 40,000 vendor contracts every night through an import set. After a vendor ' +
      'changed its export, the target table gained 12,000 duplicate rows in a week and nobody changed the transform map. ' +
      'Walk me through how you find the cause and what you change so the import is safe to rerun?',
    topic: 'import set coalesce empty source values',
    difficulty: 'Senior',
    whatTheyWant: ['You should show that you read the transform history before touching the map, and that you know how coalesce behaves when the source value is empty.'],
    answer: [
      { heading: 'Find the cause', paragraphs: [para.repeat(5)] },
      {
        heading: 'Fix the map',
        paragraphs: [para.repeat(3)],
        bullets: ['Coalesce on a field the source always sends', 'Reject rows with an empty key in an `onBefore` script'],
        code: "var gr = new GlideRecord('core_company');\ngr.addQuery('u_vendor_id', source.u_vendor_id);\ngr.setLimit(1);\ngr.query();\nif (!gr.next() && !source.u_vendor_id) { ignore = true; }",
      },
    ],
    edgeCases: ['An empty coalesce value matches nothing, so every row inserts.', 'Two coalesce fields must both match.'],
    commonMistakes: ['Deleting duplicates without fixing the map.', 'Coalescing on sys_id from another instance.'],
    scorePoints: 'Mention the transform history and a dry run on a clone.',
    followUps: ['How would you clean up the duplicates safely?', 'How do you test the fix before production?'],
    tags: ['import-set', 'transform-map', 'coalesce'],
    sources: [
      { title: 'Coalesce', url: 'https://www.servicenow.com/docs/r/integrate/import-sets/coalesce.html' },
      { title: 'Community thread', url: 'https://www.servicenow.com/community/developer-forum/coalesce-empty/td-p/123' },
      { title: 'Blog', url: 'https://www.example.org/servicenow-import-tips' },
    ],
  }, overrides || {});
}

var searched = [
  'https://www.servicenow.com/docs/r/integrate/import-sets/coalesce.html',
  'https://www.servicenow.com/community/developer-forum/coalesce-empty/td-p/123',
  'https://example.org/servicenow-import-tips/',
];

var existing = [{ id: 1, question: 'What is a business rule?', category: 'Scripting', tags: ['business-rule'], apis: [] }];

test('every sidebar category has a brief', function () {
  var cats = C.loadCategories();
  assert.strictEqual(cats.length, 18);
  cats.forEach(function (c) { assert.ok(G.BRIEFS[c], 'no brief for ' + c); });
  Object.keys(G.BRIEFS).forEach(function (c) { assert.ok(cats.indexOf(c) !== -1, 'brief for unknown category ' + c); });
});

test('the rotation reaches every category within nine days', function () {
  var cats = C.loadCategories();
  var seen = {};
  for (var d = 0; d < 9; d++) {
    G.todaysPlan(cats, new Date(Date.UTC(2026, 9, 23 + d))).categories.forEach(function (c) { seen[c] = true; });
  }
  assert.strictEqual(Object.keys(seen).length, cats.length);
});

test('a good question clears the gate and renders balanced HTML', function () {
  var r = G.validate(question(), searched, existing);
  assert.deepStrictEqual(r.failures, undefined);
  assert.deepStrictEqual(C.unbalancedTags(r.html), []);
  assert.ok(r.html.indexOf('<h4>Edge Cases and Gotchas</h4>') !== -1);
  assert.ok(r.html.indexOf('&lt;') === -1 || r.html.indexOf('<pre>') !== -1);
  var item = G.toItem('Integration', r.question, r.html, 999, new Date('2026-10-23T03:00:00Z'));
  assert.strictEqual(item.daily, true);
  assert.strictEqual(item.date, 'Oct 23, 2026');
});

test('model text is escaped, never rendered as HTML', function () {
  var q = question();
  q.edgeCases = ['Use <b>x</b> & `y`', q.edgeCases[1]];
  var html = G.render(q);
  assert.ok(html.indexOf('Use &lt;b&gt;x&lt;/b&gt; &amp; <code>y</code>') !== -1);
});

test('an invented API is rejected', function () {
  var q = question();
  q.answer[1].code = "var gr = new GlideRecord('core_company');\ngr.fetchAllFast();";
  var r = G.validate(q, searched, existing);
  assert.strictEqual(r.ok, false);
  assert.ok(r.failures.some(function (f) { return /fetchAllFast/.test(f); }));
});

test('sources must be searched, on two sites, one of them servicenow.com', function () {
  var r1 = G.validate(question(), searched.slice(0, 2), existing);
  assert.ok(r1.failures.some(function (f) { return /not in the search results/.test(f); }));
  var q = question({ sources: [question().sources[2], { title: 'x', url: 'https://other.example.net/a' }] });
  var r2 = G.validate(q, searched.concat(['https://other.example.net/a']), existing);
  assert.ok(r2.failures.some(function (f) { return /servicenow\.com source/.test(f); }));
});

test('filler, citation markers and third-person framing are rejected', function () {
  var q = question();
  q.whatTheyWant = ['The candidate should leverage a robust approach [1].'];
  var r = G.validate(q, searched, existing);
  assert.ok(r.failures.some(function (f) { return /filler/.test(f); }));
  assert.ok(r.failures.some(function (f) { return /citation/.test(f); }));
});

test('a repeated topic is rejected', function () {
  var seen = existing.concat([{ id: 7, question: 'Something else entirely about tables', category: 'Integration',
    tags: ['import', 'set', 'coalesce', 'empty'], apis: [], topic: 'import set coalesce empty source values' }]);
  var r = G.validate(question(), searched, seen);
  assert.ok(r.failures.some(function (f) { return /topic repeats existing question 7/.test(f); }));
});

test('the API check catches invented classes and methods but not real ones', function () {
  var bad = apiCheck.check('<pre>var x = new GlideMegaRecord(); gs.magicLog("a"); g_form.hideEverything();</pre>');
  assert.deepStrictEqual(bad.map(function (p) { return p.name; }).sort(),
    ['GlideForm.hideEverything', 'GlideMegaRecord', 'GlideSystem.magicLog']);
  var good = apiCheck.check('<pre>var ga = new GlideAjax("x"); ga.addParam("sysparm_name","y"); ga.getXMLAnswer(cb);\n' +
    'var gr = new GlideRecord("incident"); gr.addEncodedQuery("active=true"); gr.setLimit(1); gr.query();\n' +
    'gs.info("ok"); current.state.changes(); g_form.setValue("a", 1);</pre>');
  assert.deepStrictEqual(good, []);
});

test('the current interview data has no validation errors', function () {
  var items = C.loadQuestions();
  var r = V.checkItems(items, C.loadCategories(), apiCheck.loadIndex());
  assert.deepStrictEqual(r.errors, []);
});

test('the validator flags broken structure', function () {
  var items = [
    { id: 1, question: 'Q', answer: '<p>open', difficulty: 'Hard', company: 'ServiceNow', category: 'Nope', date: 'x' },
    { id: 1, question: 'Q2', answer: '<h2>x</h2><a href="https://developer.servicenow.com/dev.do#!/reference/api/brazil/server/fake">x</a>',
      difficulty: 'Senior', company: 'ServiceNow', category: 'ITSM', date: 'x' },
  ];
  var r = V.checkItems(items, C.loadCategories(), apiCheck.loadIndex());
  var all = r.errors.join('\n');
  ['unbalanced <p>', 'unknown difficulty', 'not in the sidebar', 'duplicate id', '<h1>-<h3>', 'not a known API page']
    .forEach(function (s) { assert.ok(all.indexOf(s) !== -1, 'missing error: ' + s); });
});

console.log('\nAll interview automation tests passed.');
