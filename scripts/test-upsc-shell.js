'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'upsc.html'), 'utf8');

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('exposes the five approved workspace views with Source Desk selected', function () {
  for (const view of ['source', 'brief', 'syllabus', 'answer', 'memory']) {
    assert.match(html, new RegExp('id="tab-' + view + '"'));
    assert.match(html, new RegExp('id="view-' + view + '"'));
  }
  assert.match(html, /id="tab-source"[^>]*aria-selected="true"/);
  assert.doesNotMatch(html, /id="view-source"[^>]*hidden/);
});

test('provides complete Source Desk filters and status targets', function () {
  for (const id of [
    'sourceQuery', 'sourcePublisher', 'sourceDate', 'sourceJurisdiction',
    'sourceType', 'sourcePaper', 'sourceEntries', 'sourceState', 'sourceCoverage',
  ]) assert.match(html, new RegExp('id="' + id + '"'));
});

test('keeps Notes and Due modes inside Memory Drill', function () {
  assert.match(html, /id="memoryNotes"/);
  assert.match(html, /id="memoryDue"/);
  assert.match(html, /id="notesList"/);
  assert.match(html, /id="reviseBody"/);
});

test('loads the public content contract before render and app', function () {
  const content = html.indexOf('assets/js/upsc/content.js');
  const render = html.indexOf('assets/js/upsc/render.js');
  const app = html.indexOf('assets/js/upsc/app.js');
  assert.ok(content > 0 && content < render && render < app);
});
