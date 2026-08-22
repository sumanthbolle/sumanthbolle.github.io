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
  for (const view of ['brief', 'catchup', 'syllabus', 'memory', 'source']) {
    assert.match(html, new RegExp('id="tab-' + view + '"'));
    assert.match(html, new RegExp('id="view-' + view + '"'));
  }
  assert.match(html, /id="tab-brief"[^>]*aria-selected="true"[^>]*>Today</);
  assert.doesNotMatch(html, /id="view-brief"[^>]*hidden/);
  assert.match(html, /id="tab-catchup"[^>]*>Catch up</);
  assert.match(html, /id="tab-syllabus"[^>]*>Topics</);
  assert.match(html, /id="tab-memory"[^>]*>Revision/);
  assert.match(html, /id="tab-source"[^>]*>Sources</);
  assert.ok(html.indexOf('id="tab-brief"') < html.indexOf('id="tab-catchup"'));
  assert.ok(html.indexOf('id="tab-catchup"') < html.indexOf('id="tab-source"'));
  assert.match(tagWithId('tab-catchup'), /href="\?view=catchup"/);
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

test('provides the flagship desk, official stream, topic archive, and revision targets', function () {
  for (const id of [
    'todayHero', 'priorityMust', 'packetDesk', 'catchupDesk',
    'topicOfDay', 'dailyEdition', 'dailyEditionMeta', 'subjectJump',
    'briefEntries', 'briefState', 'syllabusList', 'syllabusState',
    'answerPracticeList', 'answerPracticeState',
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /class="an-editorial-masthead"/);
  assert.match(html, /Worth your time today/);
  assert.match(html, /Search anchors, triggers and PYQ themes/);
  assert.match(html, /Current affairs reduced to what the exam can actually use/);
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
  const packet = html.indexOf('assets/js/upsc/packet.js');
  const memory = html.indexOf('assets/js/upsc/memory.js');
  const render = html.indexOf('assets/js/upsc/render.js');
  const app = html.indexOf('assets/js/upsc/app.js');
  const coach = html.indexOf('assets/js/upsc/coach.js');
  assert.ok(content > 0 && content < packet && packet < memory && memory < render && render < app);
  assert.ok(coach > app);
});

test('links the crawlable archive and practice pages and keeps every HTML id unique', function () {
  assert.match(html, /href="upsc-study\/"/);
  assert.match(html, /href="revision\.html"/);
  assert.match(html, /href="mains\.html"/);
  assert.match(html, /href="upsc-quiz\.html"/);
  assert.match(html, /href="needs-review\.html"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
