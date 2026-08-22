'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const studyPages = [
  'upsc.html',
  'upsc-patterns.html',
  'revision.html',
  'mains.html',
  'upsc-quiz.html',
  'needs-review.html',
];
const forbidden = [
  /fully local/i,
  /stored session/i,
  /stays in this browser/i,
  /Recall record stays/,
  /Study priority, not a prediction/,
  /Recurrence is an editorial estimate/,
  /How the numbers work/,
  /Reconstruct the trigger/,
  /Reconstruct the anchor/,
  /A weak anchor is/,
  /Question grammar/,
  /This atlas holds/,
  /Merged week, not seven/,
  /Current affairs reduced/,
  /practice prompts, not predictions/,
  /publisher does not invent/,
  /CSA bank/,
  /Verify every figure/,
  /Pruning is maintenance/,
  /It stays in the desk/,
  /editorial decision, not a gap/,
  /Source Desk never deletes/,
  /LOCK mode is the official/,
  /help-panel\.js/,
  /SBHelpGuide\.init/,
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('How to use page exists and covers the desk, packets, priority, atlas, and revision', function () {
  const html = read('upsc-guide.html');
  assert.match(html, /<h1>How to use<\/h1>/);
  assert.match(html, /The study desk/);
  assert.match(html, /Topic Packets/);
  assert.match(html, /Study priority/);
  assert.match(html, /Pattern Atlas/);
  assert.match(html, /Revision/);
  assert.match(html, /Notes live in this browser only/);
  assert.doesNotMatch(html, /help-panel\.js/);
  assert.doesNotMatch(html, /SBHelpGuide\.init/);
  assert.doesNotMatch(html, /assets\/js\/upsc\/coach\.js/);
});

test('UPSC study pages link to How to use and drop on-page instruction copy', function () {
  for (const file of studyPages) {
    const html = read(file);
    assert.match(html, /href="upsc-guide\.html"/, file + ' should link to How to use');
    assert.match(html, />How to use</, file + ' should label the guide link');
    for (const pattern of forbidden) {
      assert.doesNotMatch(html, pattern, file + ' still contains ' + pattern);
    }
  }
});

test('Pattern Atlas no longer hosts a methodology block or flyout guide', function () {
  const html = read('upsc-patterns.html');
  assert.doesNotMatch(html, /class="an-how"/);
  assert.doesNotMatch(html, /id="how"/);
  assert.doesNotMatch(html, /id="method"/);
  assert.doesNotMatch(html, /id="methodIntro"/);
  assert.doesNotMatch(html, /class="an-revise__legend"/);
  assert.doesNotMatch(html, /class="an-railnote"/);
});

console.log('UPSC guide tests passed');
