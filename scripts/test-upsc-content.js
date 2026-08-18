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

const EXAM_NOTE = Object.freeze({
  sourceId: 'src_pib', title: 'Cabinet approves policy',
  sourceContentHash: 'sha256_fixture_content',
  sourceUrl: 'https://pib.gov.in/release/1',
  publishedAt: '2026-08-18T04:00:00Z', anchor: 'fiscal federalism',
  codes: ['GS2.2', 'GS3.2'], papers: ['GS2', 'GS3'],
  whyInNews: 'Cabinet approval created a current policy trigger.',
  background: ['Constitutional division of fiscal powers.'],
  staticDefinition: 'Fiscal federalism divides public financial powers across levels of government.',
  reusableAnchors: [{ kind: 'constitutional', label: 'Seventh Schedule and Finance Commission' }],
  officialFacts: [{
    text: 'Cabinet approved the fiscal policy.',
    evidenceUrl: 'https://pib.gov.in/release/1',
    evidenceLocator: 'officialSummary', verification: 'source-backed',
    cloze: { prompt: 'Cabinet approved the ____ policy.', answer: 'fiscal' },
  }],
  argumentsFor: ['Improves coordination.'],
  argumentsAgainst: ['May reduce state flexibility.'],
  indiaImplications: ['Changes fiscal implementation.'],
  wayForward: ['Use transparent intergovernmental review.'],
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
  recallCard: 'Policy links executive coordination to fiscal federalism.',
  priority: 78, priorityProvisional: true, editorialStatus: 'source-backed',
});
const DRAFT_NOTE = Object.freeze(Object.assign({}, EXAM_NOTE, {
  sourceId: 'src_draft', editorialStatus: 'draft',
  officialFacts: [{ text: 'Unsupported number.', evidenceUrl: '',
    evidenceLocator: '', verification: 'needs-review' }],
}));

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

test('classifies official updates into aspirant-facing subjects', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex({ generatedAt: FIXTURE_INDEX.generatedAt, records: [
    Object.assign({}, FIXTURE_INDEX.records[0], {
      id: 'src_rbi', title: 'RBI monetary policy decision', publisherId: 'rbi',
      publisherName: 'Reserve Bank of India', sourceUrl: 'https://rbi.org.in/release/1',
    }),
    Object.assign({}, FIXTURE_INDEX.records[1], {
      id: 'src_mea', title: 'India and ASEAN strategic partnership', publisherId: 'mea',
      publisherName: 'Ministry of External Affairs', sourceUrl: 'https://mea.gov.in/release/1',
    }),
    Object.assign({}, FIXTURE_INDEX.records[2], {
      id: 'src_bio', title: 'Wetland and biodiversity restoration programme',
      publisherId: 'pib', publisherName: 'Press Information Bureau',
      sourceUrl: 'https://pib.gov.in/release/2',
    }),
    Object.assign({}, FIXTURE_INDEX.records[2], {
      id: 'src_seed', title: 'Economic empowerment of de-notified and nomadic communities under SEED',
      publisherId: 'pib', publisherName: 'Press Information Bureau',
      sourceUrl: 'https://pib.gov.in/release/3',
    }),
  ] }).records;

  assert.deepEqual(Array.from(records, row => Content.inferSubject(row).id), [
    'economy', 'international-relations', 'environment', 'society-social-justice',
  ]);
});

test('builds a bounded current-affairs edition with subject diversity', function () {
  const Content = loadContent();
  const subjects = [
    ['rbi', 'Reserve Bank of India', 'Monetary policy and inflation outlook'],
    ['mea', 'Ministry of External Affairs', 'India ASEAN strategic partnership'],
    ['pib', 'Press Information Bureau', 'National biodiversity restoration mission'],
    ['who', 'World Health Organization', 'Universal health coverage guidance'],
    ['sebi', 'Securities and Exchange Board of India', 'Capital market investor protection'],
  ];
  const rows = Array.from({ length: 18 }, function (_, index) {
    const seed = subjects[index % subjects.length];
    return {
      id: 'src_daily_' + index, title: seed[2] + ' ' + index,
      publisherId: seed[0], publisherName: seed[1],
      publishedAt: index < 14 ? '2026-08-18T0' + (index % 9) + ':00:00Z' : '2026-08-10T04:00:00Z',
      sourceUrl: 'https://example.gov/' + index,
      officialSummary: 'An official update with enough context for a concise UPSC reading note.',
      sourceType: 'release', jurisdiction: seed[0] === 'mea' || seed[0] === 'who' ? 'INT' : 'IN',
      sourceVerified: true, editorialState: 'source-only', codes: [], priority: 0,
    };
  });
  const records = Content.normalizeSourceIndex({ generatedAt: '2026-08-18T10:00:00Z', records: rows }).records;
  const edition = Content.buildDailyEdition(records, { limit: 10 });

  assert.equal(edition.editionDate, '2026-08-18');
  assert.equal(edition.items.length, 10);
  assert.ok(edition.groups.length >= 4);
  assert.equal(edition.items.some(row => row.publishedAt.startsWith('2026-08-10')), false);
});

test('prefers an evidence-ready exam note for Topic of the Day', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  const notes = Content.normalizeExamIndex({
    generatedAt: FIXTURE_INDEX.generatedAt, notes: [EXAM_NOTE],
  }).notes;
  const topic = Content.selectTopicOfDay(records, notes);

  assert.equal(topic.kind, 'note');
  assert.equal(topic.id, 'src_pib');
  assert.equal(topic.subject.id, 'economy');
});

test('falls back to a useful official record for Topic of the Day', function () {
  const Content = loadContent();
  const rows = FIXTURE_INDEX.records.map(row => Object.assign({}, row, {
    priority: 0, editorialState: 'source-only',
  })).concat([{
    id: 'src_policy', title: 'National biodiversity restoration policy', publisherId: 'pib',
    publisherName: 'Press Information Bureau', publishedAt: '2026-08-18T05:00:00Z',
    sourceUrl: 'https://pib.gov.in/release/2',
    officialSummary: 'The policy links wetland restoration, biodiversity and climate resilience.',
    sourceType: 'release', jurisdiction: 'IN', sourceVerified: true,
    editorialState: 'source-only', codes: [], priority: 0,
  }]);
  const records = Content.normalizeSourceIndex({ generatedAt: FIXTURE_INDEX.generatedAt, records: rows }).records;
  const topic = Content.selectTopicOfDay(records, []);

  assert.equal(topic.kind, 'source');
  assert.equal(topic.id, 'src_policy');
  assert.equal(topic.subject.id, 'environment');
  assert.ok(topic.studyLens.length >= 4);
});

test('selects a durable multi-dimensional topic over a routine portal launch', function () {
  const Content = loadContent();
  const rows = [{
    id: 'src_portal', title: 'Central Information Commission launches upgraded appeals portal',
    publisherId: 'pib', publisherName: 'Press Information Bureau',
    publishedAt: '2026-08-18T05:00:00Z', sourceUrl: 'https://pib.gov.in/portal',
    officialSummary: 'The Commission launched an upgraded portal.', sourceType: 'release',
    jurisdiction: 'IN', sourceVerified: true, editorialState: 'source-only', codes: [], priority: 0,
  }, {
    id: 'src_grasslands', title: 'India launches first guide to grasslands at UNCCD COP17',
    publisherId: 'pib', publisherName: 'Press Information Bureau',
    publishedAt: '2026-08-18T04:00:00Z', sourceUrl: 'https://pib.gov.in/grasslands',
    officialSummary: 'India launches its first guide to grasslands at UNCCD COP17.',
    sourceType: 'release', jurisdiction: 'IN', sourceVerified: true,
    editorialState: 'source-only', codes: [], priority: 0,
  }];
  const records = Content.normalizeSourceIndex({ generatedAt: FIXTURE_INDEX.generatedAt, records: rows }).records;

  assert.equal(Content.selectTopicOfDay(records, []).id, 'src_grasslands');
});

test('prefers a substantive official briefing over a headline-only tie', function () {
  const Content = loadContent();
  const rows = [{
    id: 'src_headline', title: 'India launches a grasslands guide at UNCCD COP17',
    publisherId: 'pib', publisherName: 'Press Information Bureau',
    publishedAt: '2026-08-18T05:00:00Z', sourceUrl: 'https://pib.gov.in/headline',
    officialSummary: 'India launches a grasslands guide at UNCCD COP17', sourceType: 'release',
    jurisdiction: 'IN', sourceVerified: true, editorialState: 'source-only', codes: [], priority: 0,
  }, {
    id: 'src_briefing', title: 'Why grasslands matter for desertification and climate resilience',
    publisherId: 'un-news', publisherName: 'United Nations News',
    publishedAt: '2026-08-18T04:00:00Z', sourceUrl: 'https://news.un.org/grasslands',
    officialSummary: 'Grasslands support biodiversity, livelihoods and carbon storage. Their degradation accelerates desertification, while restoration requires local participation, land governance and long-term finance.',
    sourceType: 'release', jurisdiction: 'INT', sourceVerified: true,
    editorialState: 'source-only', codes: [], priority: 0,
  }];
  const records = Content.normalizeSourceIndex({ generatedAt: FIXTURE_INDEX.generatedAt, records: rows }).records;

  assert.equal(Content.selectTopicOfDay(records, []).id, 'src_briefing');
});

test('builds complete subject shelves with current-affairs counts', function () {
  const Content = loadContent();
  const records = Content.normalizeSourceIndex(FIXTURE_INDEX).records;
  const subjects = Content.subjectLibrary(records);

  assert.equal(subjects.length, 9);
  assert.deepEqual(Array.from(subjects.slice(0, 4), subject => subject.label), [
    'Polity & Governance', 'Economy', 'Environment', 'International Relations',
  ]);
  assert.ok(subjects.every(subject => subject.coreTopics.length === 4));
  assert.equal(subjects.find(subject => subject.id === 'environment').currentCount, 1);
});

test('groups a multi-paper note under each code without duplicating its identity', function () {
  const Content = loadContent();
  const groups = Content.groupBySyllabus([EXAM_NOTE]);
  assert.deepEqual(Object.keys(groups), ['GS2.2', 'GS3.2']);
  assert.equal(groups['GS2.2'][0].sourceId, 'src_pib');
  assert.equal(groups['GS3.2'][0].sourceId, 'src_pib');
});

test('draft hard facts are not marked ready to memorise', function () {
  const Content = loadContent();
  const notes = Content.normalizeExamIndex({
    generatedAt: '2026-08-18T05:00:00Z', notes: [DRAFT_NOTE],
  }).notes;
  assert.equal(notes[0].canMemorize, false);
});

test('source-backed facts with safe evidence are eligible for recall', function () {
  const Content = loadContent();
  const notes = Content.normalizeExamIndex({
    generatedAt: '2026-08-18T05:00:00Z', notes: [EXAM_NOTE],
  }).notes;
  assert.equal(notes[0].canMemorize, true);
  assert.equal(notes[0].officialFacts[0].evidenceUrl, 'https://pib.gov.in/release/1');
});

test('normalizes syllabus index anchors in canonical code order', function () {
  const Content = loadContent();
  const index = Content.normalizeSyllabusIndex({
    generatedAt: '2026-08-18T05:00:00Z',
    codes: {
      'GS3.2': { anchors: { 'fiscal-federalism': {
        anchor: 'fiscal federalism', staticDefinition: 'Fiscal relations.',
        noteIds: ['src_pib'], reusableAnchors: [], monthlySyntheses: [],
      } } },
      'GS2.2': { anchors: { 'fiscal-federalism': {
        anchor: 'fiscal federalism', staticDefinition: 'Fiscal relations.',
        noteIds: ['src_pib'], reusableAnchors: [], monthlySyntheses: [],
      } } },
    },
  });
  assert.deepEqual(Array.from(index.groups, row => row.code), ['GS2.2', 'GS3.2']);
  assert.equal(index.groups[0].noteIds[0], 'src_pib');
});
