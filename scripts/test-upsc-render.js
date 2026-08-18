'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RENDER_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'upsc', 'render.js'),
  'utf8'
);

function loadRender() {
  const context = {
    AnchorStore: { intervals: [1, 3, 7, 21, 60] },
    URL,
    window: {},
  };

  vm.runInNewContext(RENDER_SOURCE, context, { filename: 'render.js' });
  return context.window.AnchorRender;
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

test('does not render unsupported source URL protocols from stored notes', function () {
  const Render = loadRender();
  const html = Render.noteEntry({
    id: 'n1',
    title: 'Fiscal federalism update',
    anchor: 'Fiscal federalism',
    codes: ['GS2.2'],
    stage: 0,
    verified: false,
    sourceUrl: 'javascript:alert(document.domain)',
    sourceName: 'Tampered source',
  }, 'Due tomorrow', false);

  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('Open source'), false);
});

test('does not render unsupported source URL protocols from lookup content', function () {
  const Render = loadRender();
  const html = Render.lookupNote({
    topic: 'Fiscal federalism',
    anchor: 'Fiscal federalism',
    codes: ['GS2.2'],
    verified: false,
    oneLiner: '',
    points: ['Centre-state fiscal relations shape service delivery.'],
    valueAdds: [],
    debateFor: [],
    debateAgainst: [],
    prelimsFacts: [],
    questionStems: [],
    trap: '',
    sources: [{
      title: 'Tampered source',
      url: 'data:text/html,<script>alert(document.domain)</script>',
      source: 'Untrusted',
      primary: false,
    }],
    scoring: { note: 'For revision triage only.' },
  });

  assert.equal(html.includes('data:text/html'), false);
  assert.equal(html.includes('Tampered source'), false);
});

test('renders a safe official Source Desk row', function () {
  const Render = loadRender();
  const html = Render.sourceEntry({
    id: 'src_1', title: '<Cabinet policy>', publisherName: 'PIB & Government',
    publishedAt: '2026-08-18T04:00:00Z',
    sourceUrl: 'https://pib.gov.in/release/1',
    officialSummary: '<b>Official</b> summary', sourceType: 'release',
    jurisdiction: 'IN', sourceVerified: true, editorialState: 'source-only',
    codes: [], priority: 0,
  });
  assert.equal(html.includes('&lt;Cabinet policy&gt;'), true);
  assert.equal(html.includes('PIB &amp; Government'), true);
  assert.equal(html.includes('&lt;b&gt;Official&lt;/b&gt; summary'), true);
  assert.equal(html.includes('href="https://pib.gov.in/release/1"'), true);
  assert.equal(html.includes('rel="noopener noreferrer"'), true);
});

test('does not render unsafe Source Desk links', function () {
  const Render = loadRender();
  const html = Render.sourceEntry({
    id: 'src_bad', title: 'Bad', publisherName: 'Bad',
    publishedAt: '2026-08-18T04:00:00Z', sourceUrl: 'data:text/html,bad',
    officialSummary: 'Bad', sourceType: 'release', jurisdiction: 'IN',
    sourceVerified: false, editorialState: 'source-only', codes: [], priority: 0,
  });
  assert.equal(html.includes('data:text/html'), false);
  assert.equal(html.includes('Open official record'), false);
});

const EXAM_NOTE = {
  sourceId: 'src_pib', title: 'Cabinet <policy>', publisherName: 'PIB',
  publishedAt: '2026-08-18T04:00:00Z', sourceUrl: 'https://pib.gov.in/release/1',
  anchor: 'fiscal federalism', codes: ['GS2.2', 'GS3.2'],
  whyInNews: 'Cabinet approval created a current trigger.',
  staticDefinition: 'Fiscal federalism divides public financial powers.',
  background: ['Constitutional division of fiscal powers.'],
  reusableAnchors: [{ kind: 'constitutional', label: 'Finance Commission' }],
  officialFacts: [{ text: 'Cabinet approved the <fiscal> policy.',
    evidenceUrl: 'https://pib.gov.in/release/1', evidenceLocator: 'officialSummary',
    verification: 'source-backed' }],
  argumentsFor: ['Improves coordination.'],
  argumentsAgainst: ['May reduce state flexibility.'],
  indiaImplications: ['Changes fiscal implementation.'],
  wayForward: ['Use transparent intergovernmental review.'],
  prelimsTraps: [{ statement: 'The policy is constitutional text.', correct: false,
    explanation: 'It is an executive policy.' }],
  mainsPractice: [{ directive: 'examine', marks: 10, wordBudget: 150,
    timeMinutes: 7, stem: 'Examine fiscal federalism.',
    introChoices: ['Define fiscal federalism.'],
    bodyDimensions: ['Context', 'Benefits', 'Limits'],
    counterPosition: 'Account for state flexibility.',
    diagramSuggestion: 'Centre-state fiscal flow diagram.',
    conclusionPrompt: 'End with transparent review.' }],
  use: 'Use as a current example of fiscal coordination.',
  recallCard: 'Link executive coordination to fiscal federalism.',
  priority: 78, priorityProvisional: true,
  editorialStatus: 'source-backed', canMemorize: true,
};

test('renders the topper dossier in approved reading order with fact and analysis labels', function () {
  const Render = loadRender();
  const html = Render.examNote(EXAM_NOTE, { revealed: false });
  const labels = [
    'Why in news', 'Static anchor', 'Background', 'Reusable anchors',
    'Official facts', 'Arguments', 'India implications', 'Way forward',
    'Prelims traps', 'Mains practice', 'Use in an answer', 'Recall card',
  ];
  let previous = -1;
  labels.forEach(function (label) {
    const index = html.indexOf(label);
    assert.ok(index > previous, label + ' should follow the previous section');
    previous = index;
  });
  assert.equal(html.includes('Official fact'), true);
  assert.equal(html.includes('Analysis'), true);
  assert.equal(html.includes('Cabinet &lt;policy&gt;'), true);
  assert.equal(html.includes('Cabinet approved the &lt;fiscal&gt; policy.'), true);
  assert.equal(html.includes('aria-expanded="false"'), true);
  assert.equal(html.includes('data-act="save-exam"'), true);
  assert.equal(html.includes('disabled'), false);
});

test('blocks draft hard facts from the save-for-recall action', function () {
  const Render = loadRender();
  const draft = Object.assign({}, EXAM_NOTE, {
    sourceId: 'src_draft', editorialStatus: 'draft', canMemorize: false,
    officialFacts: [{ text: 'Unsupported number.', evidenceUrl: '',
      evidenceLocator: '', verification: 'needs-review' }],
  });
  const html = Render.examNote(draft, {});
  assert.match(html, /data-act="save-exam"[^>]*disabled/);
  assert.equal(html.includes('Needs review'), true);
  assert.equal(html.includes('href=""'), false);
});

test('renders directive-aware answer scaffolds without prediction claims', function () {
  const Render = loadRender();
  const html = Render.answerOutline(EXAM_NOTE.mainsPractice[0]);
  assert.equal(html.includes('examine'), true);
  assert.equal(html.includes('10 marks'), true);
  assert.equal(html.includes('150 words'), true);
  assert.equal(html.includes('7 minutes'), true);
  assert.equal(html.includes('Context'), true);
  assert.equal(html.includes('Practice prioritisation, not prediction'), true);
});

test('renders a safe expandable published-note summary', function () {
  const Render = loadRender();
  const html = Render.examSummary(EXAM_NOTE, { loading: false });
  assert.equal(html.includes('Cabinet &lt;policy&gt;'), true);
  assert.equal(html.includes('data-act="open-exam"'), true);
  assert.equal(html.includes('Priority 78'), true);
  assert.equal(html.includes('Exam note ready'), true);
});

test('keeps drill answers hidden until reveal and links safe evidence', function () {
  const Render = loadRender();
  const html = Render.memoryDrill({
    type: 'cloze', prompt: 'Cabinet approved the ____ policy.', answer: 'fiscal',
    fact: 'Cabinet approved the fiscal policy.',
    evidenceUrl: 'https://pib.gov.in/release/1', evidenceLocator: 'officialSummary',
  }, { id: 'n1', title: 'Cabinet policy' }, 0, 1);
  assert.equal(html.includes('Cabinet approved the ____ policy.'), true);
  assert.match(html, /data-drill-answer[^>]*hidden/);
  assert.equal(html.includes('aria-expanded="false"'), true);
  assert.equal(html.includes('href="https://pib.gov.in/release/1"'), true);
  assert.match(html, /data-act="drill-pass"[^>]*hidden/);
  assert.match(html, /data-act="drill-fail"[^>]*hidden/);
});

test('does not render unsafe drill evidence links', function () {
  const Render = loadRender();
  const html = Render.memoryDrill({
    type: 'cloze', prompt: 'A ____ prompt.', answer: 'safe',
    evidenceUrl: 'javascript:alert(1)', evidenceLocator: 'officialSummary',
  }, { id: 'n1', title: 'Unsafe evidence' }, 0, 1);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('Open evidence'), false);
});
