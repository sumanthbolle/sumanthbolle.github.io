'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'upsc', 'edition-progress.js'), 'utf8');
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'upsc-edition-sample.json'), 'utf8'));

function loadInBrowserShape() {
  const context = { window: {} };
  vm.runInNewContext(SOURCE, context, { filename: 'edition-progress.js' });
  return context.window.UpscEditionProgress;
}

const Progress = require('../assets/js/upsc/edition-progress.js');

function memoryStorage(seed) {
  const data = Object.assign({}, seed || {});
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

const TODAY = '2026-10-13';
const notes = sample.notes;

test('loads as a browser global and a CommonJS module', function () {
  const global = loadInBrowserShape();
  assert.equal(typeof global.create, 'function');
  assert.deepEqual(Array.from(global.INTERVALS), [1, 3, 7, 21, 60]);
  assert.equal(Progress.STORAGE_KEY, 'upscEdition.v1');
});

test('counter counts prelims, mains, facts and due revision', function () {
  const p = Progress.create(memoryStorage(), TODAY);
  let c = p.counter([sample]);
  assert.deepEqual(c.prelims, [0, 2]);
  assert.deepEqual(c.mains, [0, 1]);
  assert.deepEqual(c.facts, [0, 3]);
  assert.equal(c.revise, 0);
  assert.equal(c.percent, 0);
  assert.equal(c.complete, false);

  p.markDone(notes['rbi-policy-oct-2026'], true);
  p.tickFact('qf-gst-council-56');
  c = p.counter([sample]);
  assert.deepEqual(c.prelims, [1, 2]);
  assert.deepEqual(c.facts, [1, 3]);
  assert.equal(c.percent, 33);
  assert.equal(p.isDone('rbi-policy-oct-2026'), true);
  assert.equal(p.isFactTicked('qf-gst-council-56'), true);
  assert.equal(p.isFactTicked('qf-who-tb-report'), false);
});

test('complete needs every note done, every fact ticked and nothing due', function () {
  const storage = memoryStorage();
  const p = Progress.create(storage, TODAY);
  Object.keys(notes).forEach((id) => p.markDone(notes[id], null));
  sample.quickFacts.forEach((fact) => p.tickFact(fact.id));
  let c = p.counter([sample]);
  assert.equal(c.complete, true);
  assert.equal(c.percent, 100);
  // Tomorrow the cards from today's notes fall due, so it is no longer complete.
  const tomorrow = Progress.create(storage, '2026-10-14');
  c = tomorrow.counter([sample]);
  assert.ok(c.revise > 0);
  assert.equal(c.complete, false);
  assert.ok(c.percent < 100);
  // An edition with nothing in it is never "complete".
  assert.equal(Progress.create(memoryStorage(), TODAY).counter([]).complete, false);
});

test('marking a note done creates at most three cards due tomorrow', function () {
  const storage = memoryStorage();
  const p = Progress.create(storage, TODAY);
  p.markDone(notes['rbi-policy-oct-2026'], false);
  p.markDone(notes['rbi-policy-oct-2026'], true); // repeat does not duplicate
  assert.equal(p.dueCards(TODAY).length, 0);
  const due = p.dueCards('2026-10-14');
  assert.equal(due.length, 3);
  due.forEach((card) => {
    assert.equal(card.noteId, 'rbi-policy-oct-2026');
    assert.equal(card.stage, 0);
    assert.equal(card.due, '2026-10-14');
    assert.ok(card.front && card.back);
  });
  assert.ok(due.some((card) => /5\.5%/.test(card.back)), 'key number card');
  assert.ok(due.some((card) => /Section 45ZA/.test(card.back)), 'MCQ trap card');
  // A note without key numbers or MCQ still yields the one-line card only.
  p.markDone({ id: 'bare', title: 'Bare', oneLine: 'Only a line.' }, null);
  assert.equal(p.dueCards('2026-10-14').filter((c) => c.noteId === 'bare').length, 1);
  // Malformed note never throws and never creates cards.
  p.markDone(null, null);
  p.markDone({ title: 'no id' }, null);
});

test('remembered advances through 1/3/7/21/60; forgot resets to tomorrow', function () {
  const p = Progress.create(memoryStorage(), TODAY);
  p.markDone({ id: 'n', title: 'N', oneLine: 'L' }, null);
  let card = p.dueCards('2026-10-14')[0];
  const day = (iso) => Progress.create(p._storage, iso);
  let q = day('2026-10-14');
  q.gradeCard(card.id, true);
  card = q.allCards()[0];
  assert.equal(card.stage, 1);
  assert.equal(card.due, '2026-10-17');
  q = day('2026-10-17'); q.gradeCard(card.id, true);
  assert.equal(q.allCards()[0].due, '2026-10-24');
  q = day('2026-10-24'); q.gradeCard(card.id, true);
  assert.equal(q.allCards()[0].due, '2026-11-14');
  q = day('2026-11-14'); q.gradeCard(card.id, true);
  assert.equal(q.allCards()[0].stage, 4);
  assert.equal(q.allCards()[0].due, '2027-01-13');
  q = day('2027-01-13'); q.gradeCard(card.id, true);
  assert.equal(q.allCards()[0].stage, 4, 'stays on the last interval');
  q = day('2027-03-14'); q.gradeCard(card.id, false);
  assert.equal(q.allCards()[0].stage, 0);
  assert.equal(q.allCards()[0].due, '2027-03-15');
  assert.equal(q.gradeCard('missing', true), false);
});

test('overdue cards stay due and are never dropped', function () {
  const p = Progress.create(memoryStorage(), TODAY);
  p.markDone({ id: 'n', title: 'N', oneLine: 'L' }, null);
  const later = Progress.create(p._storage, '2026-12-01');
  assert.equal(later.dueCards('2026-12-01').length, 1);
  assert.equal(later.counter([]).revise, 1);
});

test('missed lists unfinished editions from the last 7 days, oldest first', function () {
  const p = Progress.create(memoryStorage(), TODAY);
  const make = (id, date, slot, prelims, mains) => ({ id, date, slot, prelims, mains, quickFacts: [] });
  const editions = [
    make('2026-10-12-pm', '2026-10-12', 'pm', ['a', 'b'], ['c']),
    make('2026-10-12-am', '2026-10-12', 'am', ['d'], []),
    make('2026-10-10-am', '2026-10-10', 'am', ['e'], ['e']),
    make('2026-10-05-am', '2026-10-05', 'am', ['old'], []), // outside 7 days
    make('2026-10-13-am', '2026-10-13', 'am', ['today'], []), // today is not missed
  ];
  p.markDone({ id: 'd', title: 'D', oneLine: 'x' }, null);
  p.markDone({ id: 'a', title: 'A', oneLine: 'x' }, null);
  const missed = p.missed(editions);
  assert.deepEqual(missed, [
    { editionId: '2026-10-10-am', date: '2026-10-10', slot: 'am', left: 1 },
    { editionId: '2026-10-12-pm', date: '2026-10-12', slot: 'pm', left: 2 },
  ]);
  // Also accepts an object keyed by date.
  assert.equal(p.missed({ '2026-10-12': [editions[0], editions[1]] }).length, 1);
});

test('export and import round trip; bad input is rejected', function () {
  const p = Progress.create(memoryStorage(), TODAY);
  p.markDone(notes['pm-e-drive-extension'], true);
  p.tickFact('qf-sebi-sme-ipo');
  const text = p.exportJSON();
  const q = Progress.create(memoryStorage(), TODAY);
  assert.equal(q.importJSON(text), true);
  assert.equal(q.isDone('pm-e-drive-extension'), true);
  assert.equal(q.isFactTicked('qf-sebi-sme-ipo'), true);
  assert.equal(q.dueCards('2026-10-14').length, 3);
  assert.equal(q.importJSON('not json'), false);
  assert.equal(q.importJSON('{"v":2}'), false);
  assert.equal(q.importJSON('[1,2]'), false);
  assert.equal(q.isDone('pm-e-drive-extension'), true, 'failed import keeps existing data');
});

test('corrupted or unavailable storage is tolerated', function () {
  const corrupt = memoryStorage({ 'upscEdition.v1': '{oops' });
  const p = Progress.create(corrupt, TODAY);
  assert.equal(p.isDone('x'), false);
  p.markDone({ id: 'x', title: 'X', oneLine: 'y' }, null);
  assert.equal(p.isDone('x'), true);
  const wrongShape = memoryStorage({ 'upscEdition.v1': JSON.stringify({ v: 1, done: 'nope', facts: [1], cards: {} }) });
  const w = Progress.create(wrongShape, TODAY);
  assert.deepEqual(w.counter([sample]).prelims, [0, 2]);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const t = Progress.create(throwing, TODAY);
  t.markDone({ id: 'z', title: 'Z', oneLine: 'q' }, null);
  assert.equal(t.isDone('z'), true, 'keeps working in memory');
  const none = Progress.create(null, TODAY);
  none.tickFact('f');
  assert.equal(none.isFactTicked('f'), true);
});

test('IST date helper rolls over at 18:30 UTC', function () {
  assert.equal(Progress.istDate(new Date('2026-10-13T18:29:00Z')), '2026-10-13');
  assert.equal(Progress.istDate(new Date('2026-10-13T18:31:00Z')), '2026-10-14');
  assert.equal(Progress.addDays('2026-12-31', 1), '2027-01-01');
});

console.log('UPSC edition progress tests passed');
