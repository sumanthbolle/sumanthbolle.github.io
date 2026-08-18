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

function loadStore(initial) {
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    localStorage: new MemoryStorage(initial),
    window: {},
  };

  vm.runInNewContext(STORE_SOURCE, context, { filename: 'store.js' });
  return context.window.AnchorStore;
}

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
