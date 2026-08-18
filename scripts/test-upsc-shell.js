'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'upsc.html'), 'utf8');

function tagWithId(id) {
  const match = html.match(new RegExp('<[^>]+id="' + id + '"[^>]*>'));
  return match ? match[0] : '';
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('opens on the editorial Today view and keeps archive routes secondary', function () {
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
  assert.match(tagWithId('tab-syllabus'), /href="\?view=syllabus"/);
  assert.match(tagWithId('tab-memory'), /href="\?view=memory"/);
  assert.match(tagWithId('tab-source'), /href="\?view=source"/);
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

test('provides the lead article, edition stream, subject archive, and revision targets', function () {
  for (const id of [
    'topicOfDay', 'dailyEdition', 'dailyEditionMeta', 'subjectJump',
    'briefEntries', 'briefState', 'syllabusList', 'syllabusState',
    'answerPracticeList', 'answerPracticeState',
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /class="an-editorial-masthead"/);
  assert.match(html, /Latest articles/);
  assert.match(html, /Search articles/);
});

test('removes tutorials and live-generated copy from the reading surface', function () {
  for (const pattern of [
    /class="an-how"/, /class="an-rail"/, /id="lookupBtn"/,
    /id="lookupResult"/, /help-panel\.js/, /SBHelpGuide\.init/,
    /Personalise revision plan/, /Your 45-minute plan/, /How to use this/,
    /What this tool will not do/, /Build full topic note/,
  ]) assert.doesNotMatch(html, pattern);
});

test('keeps exam settings within Revision instead of interrupting articles', function () {
  const revisionStart = html.indexOf('id="view-memory"');
  const revisionEnd = html.indexOf('</section>', revisionStart);
  assert.ok(revisionStart > 0);
  assert.ok(html.indexOf('id="stage"') > revisionStart);
  assert.ok(html.indexOf('id="examDate"') > revisionStart);
  assert.ok(revisionEnd > revisionStart);
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
