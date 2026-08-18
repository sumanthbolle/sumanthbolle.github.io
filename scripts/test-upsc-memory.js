'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var vm = require('node:vm');

var EXAM_NOTE = Object.freeze({
  sourceId: 'src_pib', title: 'Cabinet approves policy',
  sourceContentHash: 'sha256_fixture_content',
  sourceUrl: 'https://pib.gov.in/release/1',
  anchor: 'fiscal federalism', codes: ['GS2.2', 'GS3.2'],
  whyInNews: 'Cabinet approval created a current policy trigger.',
  officialFacts: [{ text: 'Cabinet approved the fiscal policy.',
    evidenceUrl: 'https://pib.gov.in/release/1',
    evidenceLocator: 'officialSummary', verification: 'source-backed',
    cloze: { prompt: 'Cabinet approved the ____ policy.', answer: 'fiscal' } }],
  argumentsFor: ['Improves coordination.'],
  argumentsAgainst: ['May reduce state flexibility.'],
  prelimsTraps: [{ statement: 'The policy is constitutional text.',
    correct: false, explanation: 'It is an executive policy.' }],
  mainsPractice: [{ directive: 'examine', marks: 10,
    wordBudget: 150, timeMinutes: 7,
    stem: 'Examine the policy in the context of fiscal federalism.',
    introChoices: ['Define fiscal federalism.'],
    bodyDimensions: ['Context', 'Benefits', 'Limits'],
    counterPosition: 'Account for state flexibility.',
    diagramSuggestion: 'Centre-state fiscal flow diagram.',
    conclusionPrompt: 'End with transparent intergovernmental review.',
    skeleton: ['Define fiscal federalism.', 'Context', 'Benefits', 'Limits',
      'Account for state flexibility.',
      'End with transparent intergovernmental review.'] }],
  use: 'Use as a current example of fiscal coordination.',
  editorialStatus: 'source-backed',
  recallPayload: {
    officialFacts: [{ text: 'Cabinet approved the fiscal policy.',
      evidenceUrl: 'https://pib.gov.in/release/1',
      evidenceLocator: 'officialSummary', verification: 'source-backed',
      cloze: { prompt: 'Cabinet approved the ____ policy.', answer: 'fiscal' } }],
    argumentsFor: ['Improves coordination.'],
    argumentsAgainst: ['May reduce state flexibility.'],
    prelimsTraps: [{ statement: 'The policy is constitutional text.',
      correct: false, explanation: 'It is an executive policy.' }],
    mainsPractice: [{ directive: 'examine', marks: 10,
      wordBudget: 150, timeMinutes: 7,
      stem: 'Examine the policy in the context of fiscal federalism.',
      skeleton: ['Define fiscal federalism.', 'Context', 'Benefits', 'Limits',
        'Account for state flexibility.',
        'End with transparent intergovernmental review.'] }],
    use: 'Use as a current example of fiscal coordination.',
  },
});
var DRAFT_NOTE = Object.freeze(Object.assign({}, EXAM_NOTE, {
  editorialStatus: 'draft',
}));

function loadMemory() {
  var context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync('assets/js/upsc/memory.js', 'utf8'), context,
    { filename: 'assets/js/upsc/memory.js' }
  );
  return context.window.AnchorMemory;
}

function test(name, run) {
  try { run(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('recall prompt asks for anchor structure debate and use without revealing answers', function () {
  var Memory = loadMemory();
  var prompt = Memory.createRecallPrompt(EXAM_NOTE);
  assert.deepEqual(Array.from(prompt.questions), [
    'What is the static anchor?',
    'Why does this matter structurally?',
    'What are the two positions?',
    'What exact line would you use in an answer?',
  ]);
  assert.equal(JSON.stringify(prompt.questions).includes(EXAM_NOTE.anchor), false);
});

test('cloze drill hides exactly one source-backed fact token', function () {
  var Memory = loadMemory();
  var drills = Memory.createClozeDrills(EXAM_NOTE);
  assert.equal(drills.length, 1);
  assert.equal(drills[0].prompt, 'Cabinet approved the ____ policy.');
  assert.equal(drills[0].answer, 'fiscal');
  assert.equal(drills[0].evidenceUrl, EXAM_NOTE.sourceUrl);
});

test('draft facts do not generate cloze drills', function () {
  var Memory = loadMemory();
  assert.deepEqual(Array.from(Memory.createClozeDrills(DRAFT_NOTE)), []);
});

test('prelims drill preserves the statement verdict and explanation', function () {
  var Memory = loadMemory();
  assert.deepEqual(JSON.parse(JSON.stringify(Memory.createPrelimsDrills(EXAM_NOTE))), [{
    type: 'prelims-trap', prompt: 'The policy is constitutional text.',
    answer: false, explanation: 'It is an executive policy.',
  }]);
});

test('skeleton drill preserves directive marks and literal outline', function () {
  var Memory = loadMemory();
  assert.deepEqual(JSON.parse(JSON.stringify(Memory.createSkeletonDrill(EXAM_NOTE))), {
    type: 'skeleton',
    prompt: EXAM_NOTE.mainsPractice[0].stem,
    directive: 'examine', marks: 10,
    answer: ['Define fiscal federalism.', 'Context', 'Benefits', 'Limits',
      'Account for state flexibility.',
      'End with transparent intergovernmental review.'],
  });
});

test('session interleaves due notes by primary paper deterministically', function () {
  var Memory = loadMemory();
  var due = [
    { id: 'a', codes: ['GS2.2'], dueAt: '2026-08-18T01:00:00Z' },
    { id: 'b', codes: ['GS2.3'], dueAt: '2026-08-18T02:00:00Z' },
    { id: 'c', codes: ['GS3.5'], dueAt: '2026-08-18T03:00:00Z' },
  ];
  assert.deepEqual(
    Array.from(Memory.buildSession(due), function (row) { return row.id; }),
    ['a', 'c', 'b']
  );
});
