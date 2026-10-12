'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'upsc', 'answer-render.js'), 'utf8');
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'upsc-edition-sample.json'), 'utf8'));
const R = require('../assets/js/upsc/answer-render.js');

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

const XSS = '<img src=x onerror=alert(1)>"\'';

function assertNoRawHtml(html, label) {
  assert.doesNotMatch(html, /<img/i, label + ': raw img tag');
  assert.doesNotMatch(html, /<script/i, label + ': raw script tag');
  assert.doesNotMatch(html, /javascript:/i, label + ': javascript URL');
  // Attribute values are escaped, so strip them and look for handler names inside tags.
  const tagsOnly = html.replace(/="[^"]*"/g, '=""');
  assert.doesNotMatch(tagsOnly, /<[^>]*\son\w+=/i, label + ': inline handler attribute');
}

test('loads as a browser global', function () {
  const context = { window: {} };
  vm.runInNewContext(SOURCE, context, { filename: 'answer-render.js' });
  assert.equal(typeof context.window.UpscAnswerRender.renderNote, 'function');
});

test('esc and safeUrl', function () {
  assert.equal(R.esc('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(R.safeUrl('https://pib.gov.in/a?b=1'), 'https://pib.gov.in/a?b=1');
  assert.equal(R.safeUrl(' HTTP://x.org '), 'HTTP://x.org');
  assert.equal(R.safeUrl('javascript:alert(1)'), '');
  assert.equal(R.safeUrl('data:text/html,hi'), '');
  assert.equal(R.safeUrl('//evil.com'), '');
  assert.equal(R.safeUrl(null), '');
});

test('source chips carry an Official or Secondary badge and a safe link', function () {
  const official = R.sourceChip({ n: 2, title: 'Cabinet note', publisher: 'PIB', url: 'https://pib.gov.in/x', kind: 'official' });
  assert.match(official, /class="ue-chip ue-chip--official"/);
  assert.match(official, />Official</);
  assert.match(official, /href="https:\/\/pib\.gov\.in\/x"/);
  assert.match(official, /rel="noopener noreferrer"/);
  assert.match(official, /aria-label="Source 2: PIB, Official/);
  const secondary = R.sourceChip({ n: 3, title: 'Editorial', publisher: 'The Hindu', url: 'https://thehindu.com/', kind: 'discovery' });
  assert.match(secondary, /ue-chip--secondary/);
  assert.match(secondary, />Secondary</);
  // No kind: government hosts count as official.
  assert.match(R.sourceChip({ url: 'https://www.rbi.org.in/x', title: 'RBI' }), /ue-chip--official/);
  assert.match(R.sourceChip({ url: 'https://example.com/x', title: 'Blog' }), /ue-chip--secondary/);
  const bad = R.sourceChip({ n: 1, title: XSS, publisher: XSS, url: 'javascript:alert(1)', kind: 'official' });
  assert.match(bad, /^<span class="ue-chip/);
  assertNoRawHtml(bad, 'bad chip');
});

test('renderBlocks renders the coach JSON contract with components', function () {
  const html = R.renderBlocks({
    oneLine: 'Fiscal devolution is set by the Finance Commission.',
    sections: [{ heading: 'How is the share decided?', points: [
      { label: 'Vertical share', text: 'States get 41% of the divisible pool.', cite: [1] },
      { text: 'Population and area weigh in.', cite: [2, 9] },
    ] }],
    table: { headers: ['Criterion', 'Weight'], rows: [['Income distance', '45%'], ['Area', '15%', 'extra'], ['Population']] },
    misconception: 'The GST Council does not decide devolution.',
    examAngle: { prelims: 'Article 280 sets up the Commission.', mains: 'Link to cooperative federalism.' },
    sources: [
      { n: 1, title: 'Finance Commission report', publisher: 'MoF', url: 'https://fincomindia.nic.in/', kind: 'official' },
      { n: 2, title: 'Explainer', publisher: 'PRS', url: 'https://prsindia.org/', kind: 'secondary' },
    ],
    retrieval: [{ url: 'https://fincomindia.nic.in/', status: 'read' }],
    followUps: ['What is the divisible pool?'],
  });
  assert.match(html, /class="ue-oneline"/);
  assert.match(html, /<h3 class="ue-q">How is the share decided\?<\/h3>/);
  assert.match(html, /<strong>Vertical share\.<\/strong>/);
  assert.match(html, /ue-chip--official/);
  assert.match(html, /ue-chip--secondary/);
  assert.doesNotMatch(html, /\[9\]/, 'unknown citations are dropped');
  assert.match(html, /<table class="ue-table">/);
  assert.match(html, /data-label="Weight"/);
  assert.equal((html.match(/<tr>/g) || []).length, 4, 'header row and three body rows');
  assert.match(html, /class="ue-misconception"/);
  assert.match(html, /class="ue-exam"/);
  assert.match(html, /data-followup="What is the divisible pool\?"/);
  assert.match(html, /Text retrieved/);
});

test('renderBlocks escapes every field and omits empty optional blocks', function () {
  const html = R.renderBlocks({
    oneLine: XSS,
    sections: [{ heading: XSS, points: [{ label: XSS, text: XSS, cite: [1] }] }],
    table: { headers: [XSS], rows: [[XSS]] },
    misconception: XSS,
    examAngle: { prelims: XSS, mains: XSS },
    sources: [{ n: 1, title: XSS, publisher: XSS, url: 'javascript:alert(1)', date: XSS, kind: XSS }],
    retrieval: [{ url: 'javascript:alert(1)', status: XSS }],
    followUps: [XSS],
  });
  assertNoRawHtml(html, 'blocks');
  const minimal = R.renderBlocks({ oneLine: 'Only this.' });
  assert.match(minimal, /Only this\./);
  for (const cls of ['ue-table', 'ue-misconception', 'ue-exam', 'ue-sources', 'ue-followups', 'ue-section']) {
    assert.doesNotMatch(minimal, new RegExp('class="' + cls + '"'), cls + ' omitted');
  }
  assert.equal(R.renderBlocks(null), '');
  assert.equal(R.isAnswerContract({ oneLine: 'x', sections: [] }), true);
  assert.equal(R.isAnswerContract({ questions: [] }), false);
});

test('renderMarkdown supports the safe subset and maps [n] to chips', function () {
  const md = [
    '## Why it matters',
    'The **Finance Commission** decides the share [1]. See [the report](https://fincomindia.nic.in/report) and [bad](javascript:alert(1)).',
    '',
    '### Points',
    '- **Vertical:** 41% to states [2]',
    '- Horizontal formula',
    '1. First',
    '2. Second',
    '',
    '| Criterion | Weight |',
    '|---|---:|',
    '| Income | 45% |',
    '| Area |',
    '',
    '<script>alert(1)</script> [7]',
  ].join('\n');
  const html = R.renderMarkdown(md, [
    { index: 1, title: 'Report', url: 'https://fincomindia.nic.in/', source: 'fincomindia.nic.in' },
    { index: 2, title: 'PRS', url: 'https://prsindia.org/x' },
  ]);
  assert.match(html, /<h3 class="ue-q">Why it matters<\/h3>/);
  assert.match(html, /<h4>Points<\/h4>/);
  assert.match(html, /<strong>Finance Commission<\/strong>/);
  assert.match(html, /<a href="https:\/\/fincomindia\.nic\.in\/report" target="_blank" rel="noopener noreferrer">the report<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /<ul class="ue-points">/);
  assert.match(html, /<ol class="ue-points">/);
  assert.match(html, /ue-chip--official/, '[1] maps to an official chip');
  assert.match(html, /ue-chip--secondary/, '[2] maps to a secondary chip');
  assert.match(html, /<table class="ue-table">/);
  assert.match(html, /data-label="Weight"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /\[7\]/, 'unknown citation stays as text');
  assertNoRawHtml(html, 'markdown');
  assert.equal(R.renderMarkdown('', []), '');
  const plain = R.renderMarkdown('First paragraph.\n\nSecond paragraph.\nSame paragraph.', null);
  assert.equal((plain.match(/<p>/g) || []).length, 2);
  assert.match(plain, /Second paragraph\.<br>Same paragraph\./);
  assert.match(R.renderMarkdown('**In one line:** Short answer.', []), /class="ue-oneline"/);
});

test('renderNote renders the full reading note from edition data', function () {
  const note = sample.notes['rbi-policy-oct-2026'];
  const html = R.renderNote(note);
  assert.match(html, /class="ue-breadcrumb"/);
  assert.match(html, /UPSC Today<\/a><span class="ue-crumb-sep" aria-hidden="true"> › <\/span><span>GS3<\/span>/);
  assert.match(html, /class="ue-meta-row"/);
  assert.match(html, /13 Oct 2026/);
  assert.match(html, /Source: RBI/);
  assert.match(html, /GS3\.1/);
  assert.match(html, /class="ue-oneline"/);
  assert.match(html, /Why in news/);
  assert.match(html, /<h3 class="ue-q" id="ue-q-1">What did the MPC decide, and how\?<\/h3>/);
  assert.match(html, /<strong>Repo rate unchanged\.<\/strong>/);
  assert.match(html, /ue-chip--official/);
  assert.match(html, /<table class="ue-table">/);
  assert.match(html, /data-label="Figure"/);
  assert.match(html, /id="ue-keynumbers-end"/);
  assert.match(html, /Back to basics/);
  assert.match(html, /Way forward/);
  assert.match(html, /class="ue-misconception"><p class="ue-box__label">Common misreading/);
  assert.match(html, /class="ue-basics"><p class="ue-box__label">Back to basics/);
  assert.match(html, /class="ue-oneline"><p class="ue-box__label">In one line/);
  assert.match(html, /<details class="ue-practice ue-practice--mcq">/);
  assert.match(html, /<details class="ue-practice ue-practice--mains">/);
  assert.match(html, /<details class="ue-practice ue-practice--pyq">/);
  assert.match(html, /<details class="ue-practice ue-practice--faq">/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/, 'practice is closed by default');
  assert.match(html, /data-answer="1"/);
  assert.match(html, /class="ue-sourcelist"/);
  // One-line box comes before the first section so it is visible early.
  assert.ok(html.indexOf('ue-oneline') < html.indexOf('ue-section'));
});

test('renderNote escapes hostile notes and omits missing blocks', function () {
  const hostile = {
    id: 'x', title: XSS, deck: XSS, oneLine: XSS, subject: XSS, codes: [XSS], kind: XSS, readTime: XSS,
    whyInNews: { text: XSS, sources: [1] },
    sections: [{ heading: XSS, body: [{ label: XSS, text: XSS }, { text: XSS }], sources: [1, { n: 5, url: 'javascript:x', title: XSS }] }],
    keyNumbers: [{ figure: XSS, meaning: XSS, source: 1 }],
    back2basics: { concept: XSS, text: XSS },
    wayForward: [{ label: XSS, text: XSS, source: 1 }],
    misconception: { myth: XSS, fact: XSS },
    practice: {
      mcq: { stem: XSS, options: [XSS, XSS, XSS, XSS], answer: '1" onclick="x', trap: XSS },
      mains: { question: XSS, directive: XSS, marks: XSS, demand: XSS, structure: { intro: XSS, body: [XSS], conclusion: XSS } },
      pyq: { year: XSS, paper: XSS, marks: XSS, question: XSS, why: XSS },
      faq: [{ q: XSS, a: XSS }],
    },
    sources: [{ n: 1, title: XSS, publisher: XSS, url: 'javascript:alert(1)', date: XSS, kind: 'official' }],
    updates: [{ at: XSS, text: XSS, source: 1 }],
  };
  const html = R.renderNote(hostile);
  assertNoRawHtml(html, 'note');
  assert.doesNotMatch(html, /data-answer="1" onclick/);
  const bare = R.renderNote({ id: 'b', title: 'Bare note', oneLine: 'Line.' });
  for (const cls of ['ue-table', 'ue-basics', 'ue-misconception', 'ue-practice', 'ue-sourcelist', 'ue-updates']) {
    assert.doesNotMatch(bare, new RegExp('class="' + cls + '[ "]'), cls + ' omitted');
  }
  assert.doesNotMatch(bare, /Way forward/);
  assert.equal(R.renderNote(null), '');
});

test('renderTable handles ragged rows and labels each cell', function () {
  const html = R.renderTable(['A', 'B'], [['1', '2', '3'], ['only']], { caption: 'Cap' });
  assert.match(html, /<caption>Cap<\/caption>/);
  assert.match(html, /class="ue-table-wrap"/);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 3);
  assert.equal((html.match(/<td /g) || []).length, 6);
  assert.equal(R.renderTable([], []), '');
});

test('read time accepts integer minutes or the older "N min" string', function () {
  const base = { id: 'n', title: 'T', oneLine: 'L', codes: ['GS3.1'], sources: [] };
  assert.match(R.renderNote(Object.assign({}, base, { readTime: 3 })), /3 min read/);
  assert.match(R.renderNote(Object.assign({}, base, { readTime: '4 min' })), /4 min read/);
  assert.doesNotMatch(R.renderNote(Object.assign({}, base, { readTime: 'soon' })), /min read/);
  assert.equal(R.readMinutes(' 7 min '), 7);
  assert.equal(R.readMinutes(0), 0);
});

console.log('UPSC answer renderer tests passed');
