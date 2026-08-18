'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STORE_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'upsc', 'store.js'),
  'utf8'
);

class MemoryStorage {
  constructor(initial) {
    this.values = new Map(Object.entries(initial || {}));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function loadStore(initial, nowISO) {
  const RealDate = Date;
  const fixed = nowISO || '2026-08-18T12:00:00Z';
  class FixedDate extends RealDate {
    constructor(value) { super(value === undefined ? fixed : value); }
    static now() { return new RealDate(fixed).getTime(); }
    static parse(value) { return RealDate.parse(value); }
  }
  const context = {
    console,
    Date: FixedDate,
    JSON,
    Math,
    URL,
    localStorage: new MemoryStorage(initial),
    window: {},
  };

  vm.runInNewContext(STORE_SOURCE, context, { filename: 'store.js' });
  return context.window.AnchorStore;
}

const EXAM_NOTE = Object.freeze({
  sourceId: 'src_pib', title: 'Cabinet approves policy',
  sourceUrl: 'https://pib.gov.in/release/1', anchor: 'fiscal federalism',
  codes: ['GS2.2', 'GS3.2'], verified: true,
  whyInNews: 'Cabinet approval created a current policy trigger.',
  recallPayload: {
    officialFacts: [{ text: 'Cabinet approved the fiscal policy.',
      evidenceUrl: 'https://pib.gov.in/release/1', evidenceLocator: 'officialSummary',
      verification: 'source-backed',
      cloze: { prompt: 'Cabinet approved the ____ policy.', answer: 'fiscal' } }],
    argumentsFor: ['Improves coordination.'],
    argumentsAgainst: ['May reduce state flexibility.'],
    prelimsTraps: [{ statement: 'The policy is constitutional text.', correct: false,
      explanation: 'It is an executive policy.' }],
    mainsPractice: [{ directive: 'examine', marks: 10,
      stem: 'Examine fiscal federalism.', skeleton: ['Definition', 'Benefits', 'Limits'] }],
    use: 'Use as a fiscal coordination example.',
  },
});

function test(name, body) {
  try {
    body();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

test('drops unsafe source URLs and their verification claim', function () {
  const Store = loadStore();

  assert.equal(Store.add({
    title: 'Fiscal federalism update',
    anchor: 'Fiscal federalism',
    sourceUrl: 'javascript:alert(document.domain)',
    sourceName: 'Unsafe source',
    verified: true,
  }), 'added');

  const note = Store.list()[0];
  assert.equal(note.sourceUrl, '');
  assert.equal(note.sourceName, '');
  assert.equal(note.verified, false);
});

test('keeps distinct notes written in non-Latin scripts', function () {
  const Store = loadStore();

  assert.equal(Store.add({
    title: 'संघवाद के वित्तीय पहलू',
    anchor: 'वित्तीय संघवाद',
  }), 'added');

  assert.equal(Store.add({
    title: 'नगरीय शासन की चुनौतियाँ',
    anchor: 'शहरी शासन',
  }), 'added');

  assert.equal(Store.list().length, 2);
});

test('normalizes note text at the storage boundary', function () {
  const Store = loadStore();

  assert.equal(Store.add({
    title: '  Finance\n  Commission   update  ',
    anchor: '  fiscal   federalism ',
    what: '  A   new\tmemorandum  ',
    sourceUrl: ' https://example.com/report ',
    sourceName: '  Example   Ministry ',
  }), 'added');

  const note = Store.list()[0];
  assert.equal(note.title, 'Finance Commission update');
  assert.equal(note.anchor, 'fiscal federalism');
  assert.equal(note.what, 'A new memorandum');
  assert.equal(note.sourceUrl, 'https://example.com/report');
  assert.equal(note.sourceName, 'Example Ministry');
});

test('stores a compact public-note snapshot without trusting draft facts', function () {
  const Store = loadStore();
  assert.equal(Store.add(EXAM_NOTE), 'added');
  const saved = Store.list()[0];
  assert.equal(saved.sourceId, EXAM_NOTE.sourceId);
  assert.equal(saved.whyInNews, EXAM_NOTE.whyInNews);
  assert.equal(saved.recallPayload.officialFacts.length, 1);
  assert.equal(saved.recallPayload.mainsPractice[0].marks, 10);
});

test('unverified snapshots lose hard facts but keep interpretive recall fields', function () {
  const Store = loadStore();
  assert.equal(Store.add(Object.assign({}, EXAM_NOTE, { verified: false })), 'added');
  const saved = Store.list()[0];
  assert.deepEqual(saved.recallPayload.officialFacts, []);
  assert.deepEqual(saved.recallPayload.argumentsFor, ['Improves coordination.']);
  assert.equal(saved.recallPayload.prelimsTraps.length, 1);
});

test('walks day 1 3 7 21 60, graduates after two late passes, and resets on miss', function () {
  const Store = loadStore();
  Store.add(EXAM_NOTE);
  const id = Store.list()[0].id;
  assert.equal(Store.list()[0].dueOn, '2026-08-19');
  Store.review(id, 'pass');
  assert.equal(Store.list()[0].dueOn, '2026-08-21');
  Store.review(id, 'pass');
  assert.equal(Store.list()[0].dueOn, '2026-08-25');
  Store.review(id, 'pass');
  assert.equal(Store.list()[0].dueOn, '2026-09-08');
  Store.review(id, 'pass');
  assert.equal(Store.list()[0].dueOn, '2026-10-17');
  assert.equal(Store.list()[0].graduated, false);
  Store.review(id, 'pass');
  assert.equal(Store.list()[0].graduated, true);
  assert.equal(Store.list()[0].dueOn, '2026-09-17');
  Store.review(id, 'fail');
  assert.equal(Store.list()[0].stage, 0);
  assert.equal(Store.list()[0].graduated, false);
  assert.equal(Store.list()[0].dueOn, '2026-08-19');
});
