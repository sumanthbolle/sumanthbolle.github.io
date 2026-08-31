'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const SOURCE = path.join(__dirname, '..', 'assets', 'js', 'upsc', 'packet.js');

const ATLAS = Object.freeze({
  id: 'fiscal-federalism',
  anchor: 'Fiscal federalism',
  aliases: ['finance commission', 'tax devolution', 'centre-state financial relations'],
  papers: ['GS2', 'GS3'],
  codes: ['GS2.2', 'GS3.2'],
  band: 'perennial',
  frequency_est: 90,
  trigger_types: ['REPORT'],
  static_core: [
    'Article 280 constitutes the Finance Commission.',
    'Cesses sit outside the divisible pool.',
  ],
  prelims_angle: 'Finance Commission composition and the divisible pool.',
  traps: ['Writing about GST rates when the question asks about allocation of power.'],
  skeleton: [
    'Open on the constitutional allocation.',
    'Design intent, actual functioning, the gap.',
    'Close with an institutional recommendation.',
  ],
  stems: [{
    stem: 'Examine the growth of cesses and surcharges.',
    verb: 'examine', paper: 'GS2', marks: 15,
  }],
  verify: ['Current Commission vertical devolution share.'],
});

const SOURCE_RECORD = Object.freeze({
  id: 'src_pib',
  title: 'Finance Commission submits report on tax devolution',
  publisherId: 'pib',
  publisherName: 'Press Information Bureau',
  publishedAt: '2026-08-22T04:00:00Z',
  sourceUrl: 'https://pib.gov.in/release/1',
  officialSummary: 'The Finance Commission recommended a revised vertical devolution share for states.',
  sourceType: 'report',
  jurisdiction: 'IN',
  sourceVerified: true,
  editorialState: 'source-backed',
  codes: ['GS2.2'],
  priority: 78,
  subject: {
    id: 'polity-governance',
    label: 'Polity & Governance',
    paper: 'GS2',
    lens: 'Connect the institution to federal design.',
    coreTopics: ['Federalism', 'Finance Commission'],
  },
});

const AUCTION = Object.freeze(Object.assign({}, SOURCE_RECORD, {
  id: 'src_auction',
  title: 'Auction of State Government Securities',
  officialSummary: 'Auction of state government securities as on 22 August.',
  sourceType: 'release',
  codes: [],
  subject: { id: 'economy', label: 'Economy', paper: 'GS3', lens: '', coreTopics: [] },
}));

const EXAM_NOTE = Object.freeze({
  sourceId: 'src_pib',
  title: 'Finance Commission submits report on tax devolution',
  sourceUrl: 'https://pib.gov.in/release/1',
  publisherName: 'Press Information Bureau',
  publishedAt: '2026-08-22T04:00:00Z',
  anchor: 'fiscal federalism',
  codes: ['GS2.2', 'GS3.2'],
  papers: ['GS2', 'GS3'],
  whyInNews: 'The Commission recommended a revised devolution share.',
  staticDefinition: 'Fiscal federalism divides public financial powers across levels of government.',
  background: ['Article 280 constitutes the Finance Commission.'],
  reusableAnchors: [{ kind: 'constitutional', label: 'Article 280' }],
  officialFacts: [{
    text: 'The Commission recommended a revised vertical devolution share.',
    evidenceUrl: 'https://pib.gov.in/release/1',
    evidenceLocator: 'officialSummary',
    verification: 'source-backed',
  }],
  argumentsFor: ['Improves predictability of state receipts.'],
  argumentsAgainst: ['Cesses still sit outside the pool.'],
  indiaImplications: ['Changes the Centre-state fiscal bargain.'],
  wayForward: ['Publish the cess share beside the devolution headline.'],
  prelimsTraps: [{
    statement: 'Cesses form part of the divisible pool.',
    correct: false,
    explanation: 'Cesses and surcharges sit outside the divisible pool.',
  }],
  mainsPractice: [{
    directive: 'examine',
    marks: 10,
    stem: 'Examine whether cesses have altered tax devolution.',
    bodyDimensions: ['Constitutional design', 'Actual transfers'],
    skeleton: ['Define the pool.', 'Show the cess gap.', 'Recommend disclosure.'],
  }],
  use: 'Use as the current Finance Commission example of vertical devolution.',
  editorialStatus: 'source-backed',
  canMemorize: true,
  priority: 86,
});

const PYQ_INDEX = Object.freeze({
  'fiscal-federalism': [{
    id: 'mains-2018-gs2-federalism-gst',
    year: 2018,
    exam: 'mains',
    paper: 'GS2',
    question: 'How is the Finance Commission of India constituted?',
    source: 'UPSC CSE Mains 2018, GS2',
    tags: ['Fiscal federalism'],
  }],
});

// Recency is 10% of study priority. Fixtures are dated 22 Aug 2026; freeze
// "now" so a calendar crossing the 7-day recency cliff cannot fail CI.
const NOW = '2026-08-22T12:00:00Z';

function withNow(extra) {
  return Object.assign({ now: NOW }, extra || {});
}

function loadPacket() {
  const context = { URL, window: {} };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });
  return context.window.AnchorPacket;
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('converts component scores into an explained study-priority band', function () {
  const Packet = loadPacket();
  const high = Packet.scorePriority({
    syllabus_fit: 90, primary_source_weight: 90, pyq_proximity: 80,
    anchor_recurrence: 90, conceptual_depth: 80, recency: 90,
  });
  assert.equal(high.band, 'must_know');
  assert.ok(high.score >= 80);
  const low = Packet.scorePriority({
    syllabus_fit: 10, primary_source_weight: 20, pyq_proximity: 0,
    anchor_recurrence: 10, conceptual_depth: 10, recency: 20,
  });
  assert.equal(low.band, 'skip');
});

test('scores recency against a frozen clock so the 7-day cliff is deterministic', function () {
  const Packet = loadPacket();
  assert.equal(Packet.recencyScore(SOURCE_RECORD.publishedAt, '2026-08-22T12:00:00Z'), 100);
  assert.equal(Packet.recencyScore(SOURCE_RECORD.publishedAt, '2026-08-29T06:00:00Z'), 70);
  assert.equal(Packet.recencyScore(SOURCE_RECORD.publishedAt, '2026-08-30T12:00:00Z'), 50);
  const weekOld = Packet.packetFromSource(SOURCE_RECORD, withNow({
    atlas: ATLAS,
    pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX),
    now: '2026-08-30T12:00:00Z',
  }));
  assert.equal(weekOld.priority_components.recency, 50);
  assert.equal(weekOld.priority, 'useful');
});

test('matches a Finance Commission trigger to the fiscal-federalism atlas anchor', function () {
  const Packet = loadPacket();
  const matched = Packet.matchAtlas(SOURCE_RECORD, [ATLAS]);
  assert.equal(matched.id, 'fiscal-federalism');
});

test('does not invent an atlas match for a routine auction', function () {
  const Packet = loadPacket();
  assert.equal(Packet.matchAtlas(AUCTION, [ATLAS]), null);
});

test('builds a source packet with layers, vault, kit, PYQ bridge and source strip', function () {
  const Packet = loadPacket();
  const packet = Packet.packetFromSource(SOURCE_RECORD, withNow({
    atlas: ATLAS,
    pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX),
  }));
  assert.equal(packet.id, 'src_pib');
  assert.equal(packet.priority, 'must_know');
  assert.match(packet.priority_note, /not a prediction/);
  assert.equal(packet.anchors[0].id, 'fiscal-federalism');
  assert.ok(packet.layers.brief.what_happened.indexOf('devolution') !== -1);
  assert.ok(packet.prelims.facts.length >= 1);
  assert.ok(packet.mains.skeleton.length >= 3);
  assert.equal(packet.pyq_links[0].year, 2018);
  assert.equal(packet.pyq_links[0].why_linked.indexOf('same Pattern Atlas') !== -1, true);
  assert.equal(packet.sources[0].tier, 1);
  assert.equal(packet.hasExamNote, false);
});

test('marks low-value market operations as Skip', function () {
  const Packet = loadPacket();
  const packet = Packet.packetFromSource(AUCTION, withNow({ anchors: [ATLAS] }));
  assert.equal(packet.priority, 'skip');
  assert.equal(packet.anchors.length, 0);
});

test('upgrades a source packet when a source-backed exam note exists', function () {
  const Packet = loadPacket();
  const packet = Packet.packetFromExamNote(EXAM_NOTE, withNow({
    atlas: ATLAS,
    pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX),
    subject: SOURCE_RECORD.subject,
  }));
  assert.equal(packet.hasExamNote, true);
  assert.equal(packet.revision.eligible, true);
  assert.equal(packet.layers.understand.debate[0].right.indexOf('Cesses') !== -1, true);
  assert.equal(packet.prelims.traps[0].correct, false);
  assert.equal(packet.mains.questions[0].marks, 10);
  assert.equal(packet.claims[0].status, 'verified');
});

test('Today stack keeps at most three Must Know items and explains the session budget', function () {
  const Packet = loadPacket();
  const packets = [1, 2, 3, 4].map(function (index) {
    return Packet.packetFromSource(Object.assign({}, SOURCE_RECORD, {
      id: 'src_' + index,
      title: SOURCE_RECORD.title + ' ' + index,
    }), withNow({ atlas: ATLAS, pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX) }));
  }).concat([Packet.packetFromSource(AUCTION, withNow({ anchors: [ATLAS] }))]);
  const stack = Packet.buildTodayStack(packets, { editionDate: '2026-08-22' });
  assert.ok(stack.must_know.length <= 3);
  assert.equal(stack.skip.length, 1);
  assert.ok(stack.read_minutes >= 6);
  assert.ok(stack.essential_count <= 6);
});

test('seven-day catch-up merges repeated anchors and discards Skip items', function () {
  const Packet = loadPacket();
  const packets = [
    Packet.packetFromSource(SOURCE_RECORD, withNow({ atlas: ATLAS, pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX) })),
    Packet.packetFromSource(Object.assign({}, SOURCE_RECORD, {
      id: 'src_pib_2',
      publishedAt: '2026-08-20T04:00:00Z',
      title: 'GST Council reviews tax devolution',
    }), withNow({ atlas: ATLAS, pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX) })),
    Packet.packetFromSource(Object.assign({}, AUCTION, { publishedAt: '2026-08-21T04:00:00Z' }), withNow({ anchors: [ATLAS] })),
  ];
  const catchup = Packet.buildCatchUp(packets, { days: 7, editionDate: '2026-08-22' });
  assert.equal(catchup.discarded.length, 1);
  assert.ok(catchup.merged.some(function (cluster) {
    return cluster.id === 'fiscal-federalism' && cluster.count === 2;
  }));
  assert.ok(catchup.prelims_facts.length >= 1);
  assert.ok(catchup.test.mcqs >= 3);
});

test('packet-to-note mapping keeps the static anchor for local revision', function () {
  const Packet = loadPacket();
  const packet = Packet.packetFromExamNote(EXAM_NOTE, withNow({ atlas: ATLAS, subject: SOURCE_RECORD.subject }));
  const note = Packet.packetToNote(packet);
  assert.equal(note.anchor, 'Fiscal federalism');
  assert.equal(note.origin, 'topic-packet');
  assert.equal(note.sourceId, 'src_pib');
  assert.ok(note.codes.indexOf('GS2.2') !== -1);
});

test('search understands UPSC intent across anchors, PYQ themes and codes', function () {
  const Packet = loadPacket();
  const packets = [
    Packet.packetFromSource(SOURCE_RECORD, withNow({ atlas: ATLAS, pyqs: Packet.linkPyqs('fiscal-federalism', PYQ_INDEX) })),
    Packet.packetFromSource(AUCTION, withNow({ anchors: [ATLAS] })),
  ];
  assert.equal(Packet.searchPackets(packets, 'federalism').length, 1);
  assert.equal(Packet.searchPackets(packets, 'GS2.2')[0].id, 'src_pib');
});
