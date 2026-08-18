'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = path.join(__dirname, '..', 'assets', 'js', 'upsc', 'content.js');

const FIXTURE_INDEX = Object.freeze({
  generatedAt: '2026-08-18T05:00:00Z',
  records: [
    {
      id: 'src_pib', title: 'Cabinet policy', publisherId: 'pib',
      publisherName: 'Press Information Bureau',
      publishedAt: '2026-08-18T04:00:00Z',
      sourceUrl: 'https://pib.gov.in/release/1',
      officialSummary: 'Cabinet approved fiscal policy.', sourceType: 'release',
      jurisdiction: 'IN', sourceVerified: true, editorialState: 'source-backed',
      codes: ['GS2.2'], priority: 78,
    },
    {
      id: 'src_un', title: 'UN climate update', publisherId: 'un-news',
      publisherName: 'UN News', publishedAt: '2026-08-17T04:00:00Z',
      sourceUrl: 'https://news.un.org/story/1',
      officialSummary: 'Climate cooperation update.', sourceType: 'report',
      jurisdiction: 'INT', sourceVerified: true, editorialState: 'source-only',
      codes: [], priority: 0,
    },
    {
      id: 'src_who', title: 'WHO guidance', publisherId: 'who',
      publisherName: 'World Health Organization',
      publishedAt: '2026-08-16T04:00:00Z',
      sourceUrl: 'https://who.int/news/1', officialSummary: 'Health guidance.',
      sourceType: 'guidance', jurisdiction: 'INT', sourceVerified: true,
      editorialState: 'source-only', codes: [], priority: 0,
    },
  ],
});

function loadContent() {
  const context = { URL, window: {} };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });
  return context.window.AnchorContent;
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('keeps every source record when no filters are active', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  assert.equal(Content.filterSources(records, {
    query: '', publishers: [], papers: [], sourceTypes: [],
    jurisdiction: 'all', date: '',
  }).length, 3);
});

test('filters source records without mutating the source index', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  const filtered = Content.filterSources(records, {
    query: 'climate', publishers: ['un-news'], papers: [], sourceTypes: ['report'],
    jurisdiction: 'international', date: '',
  });
  assert.deepEqual(Array.from(filtered, row => row.id), ['src_un']);
  assert.equal(records.length, 3);
});

test('filters mapped source records by GS paper', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  assert.deepEqual(Array.from(Content.filterSources(records, {
    query: '', publishers: [], papers: ['GS2'], sourceTypes: [],
    jurisdiction: 'all', date: '',
  }), row => row.id), ['src_pib']);
});

test('rejects malformed and unsafe source records', function () {
  const Content = loadContent();
  const payload = { generatedAt: '2026-08-18T05:00:00Z', records: [
    { id: 'bad', title: 'Bad', sourceUrl: 'javascript:alert(1)' },
  ] };
  assert.equal(Content.normalizeSourceIndex(payload).records.length, 0);
});

test('groups publishers with stable counts', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  assert.deepEqual(
    JSON.parse(JSON.stringify(Content.groupPublishers(records))),
    [
      { id: 'pib', name: 'Press Information Bureau', count: 1 },
      { id: 'un-news', name: 'UN News', count: 1 },
      { id: 'who', name: 'World Health Organization', count: 1 },
    ]
  );
});
