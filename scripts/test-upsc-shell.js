'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'upsc.html'), 'utf8');

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('opens on the reading-first Today view and keeps technical sources last', function () {
  for (const view of ['brief', 'syllabus', 'memory', 'source']) {
    assert.match(html, new RegExp('id="tab-' + view + '"'));
    assert.match(html, new RegExp('id="view-' + view + '"'));
  }
  assert.match(html, /id="tab-brief"[^>]*aria-selected="true"[^>]*>Today</);
  assert.doesNotMatch(html, /id="view-brief"[^>]*hidden/);
  assert.match(html, /id="tab-syllabus"[^>]*>Subjects</);
  assert.match(html, /id="tab-memory"[^>]*>Revision/);
  assert.match(html, /id="tab-source"[^>]*>Official sources</);
  assert.ok(html.indexOf('id="tab-brief"') < html.indexOf('id="tab-source"'));
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
  assert.match(html, /id="memoryCloze"/);
  assert.match(html, /id="memoryPrelims"/);
  assert.match(html, /id="memorySkeleton"/);
  assert.match(html, /id="memoryDrillBody"/);
  assert.match(html, /id="notesList"/);
  assert.match(html, /id="reviseBody"/);
});

test('provides Topic of the Day, daily edition, subject library, and practice targets', function () {
  for (const id of [
    'topicOfDay', 'dailyEdition', 'dailyEditionMeta', 'subjectJump',
    'briefEntries', 'briefState', 'syllabusList', 'syllabusState',
    'answerPracticeList', 'answerPracticeState', 'lookupResult',
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /Topic of the Day/);
  assert.match(html, /Today’s current affairs/);
  assert.match(html, /Search a subject or topic/);
});

test('loads the public content contract before render and app', function () {
  const content = html.indexOf('assets/js/upsc/content.js');
  const memory = html.indexOf('assets/js/upsc/memory.js');
  const render = html.indexOf('assets/js/upsc/render.js');
  const app = html.indexOf('assets/js/upsc/app.js');
  assert.ok(content > 0 && content < memory && memory < render && render < app);
});

test('links the crawlable archive and keeps every HTML id unique', function () {
  assert.match(html, /href="upsc-study\/"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
