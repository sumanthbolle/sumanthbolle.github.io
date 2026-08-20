'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const coach = require('../assets/js/upsc/coach.js');

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('exposes the four exam prompts the widget offers', function () {
  assert.equal(coach.PROMPTS.prelims.label, 'Prelims angle');
  assert.match(coach.PROMPTS.prelims.query, /Prelims/);
  assert.match(coach.PROMPTS.mains.query, /Mains point of view/);
  assert.match(coach.PROMPTS.answer.query, /How should my answer look/);
  assert.match(coach.PROMPTS.quiz.query, /Ask exactly ONE question/);
  assert.match(coach.PROMPTS.quiz.query, /Never say we are done/);
});

test('keeps chat queries inside the public Worker limit', function () {
  const request = coach.buildRequest({
    query: 'x'.repeat(5000),
    pageContext: 'y'.repeat(4000),
    history: [{ role: 'user', content: 'prior' }, { role: 'assistant', content: 'ok' }],
  });
  assert.ok(request.query.length <= coach.QUERY_MAX);
  assert.equal(request.context.length <= 10, true);
  assert.equal(request.context[0].role, 'user');
  assert.match(request.context[0].content, /^Study context/);
});

test('flags the UPSC domain and search mode so the Worker applies the exam pack', function () {
  const searched = coach.buildRequest({ query: 'Mains POV on federalism', pageContext: 'Fiscal federalism' });
  assert.equal(searched.domain, 'upsc');
  assert.equal(searched.liveSearch, true);
  const skeleton = coach.buildRequest({ query: 'Model answer', liveSearch: false });
  assert.equal(skeleton.liveSearch, false);
  // The model-answer prompt opts out of live search; researched prompts keep it.
  assert.equal(coach.PROMPTS.answer.search, false);
  assert.equal(coach.PROMPTS.mains.search, true);
  assert.equal(coach.PROMPTS.prelims.search, true);
});

test('renders live Perplexity citations and caps auto-continue/retry loops', function () {
  const html = coach.sourcesHtml([
    { index: 1, title: 'Cabinet decision', url: 'https://pib.gov.in/x', source: 'pib.gov.in' },
    { index: 2, title: '', url: 'javascript:alert(1)' },
    { title: 'no url dropped' }
  ]);
  assert.match(html, /Sources/);
  assert.match(html, /https:\/\/pib\.gov\.in\/x/);
  assert.doesNotMatch(html, /alert\(1\)/); // non-http(s) citation dropped, never linked
  assert.equal(coach.sourcesHtml([]), '');
  assert.equal(coach.sourcesHtml([{ title: 'no url' }]), '');
  const related = coach.relatedQuestions(['How does Article 246 divide powers?', 'ok', 42, null]);
  assert.equal(related.length, 1);
  assert.match(related[0], /Article 246/);
  assert.equal(coach.MAX_RETRIES >= 1, true);
  assert.equal(coach.MAX_TRUNCATE_CONTINUES, 1);
});

test('grounds on an expanded Pattern Atlas anchor when one is open', function () {
  const openDetail = {
    parentNode: { querySelector: function () { return { textContent: 'Fiscal federalism' }; } },
    textContent: 'Pattern Static core: Article 280, Finance Commission. Verify: current devolution %.'
  };
  const fakeDoc = {
    querySelector: function (sel) {
      if (sel.indexOf('an-entry__expand[open]') !== -1) return openDetail;
      return null;
    },
    getSelection: function () { return ''; }
  };
  const ctx = coach.pageContextFromDom(fakeDoc);
  assert.match(ctx, /Anchor: Fiscal federalism/);
  assert.match(ctx, /Finance Commission/);
});

test('never-stop helpers keep a live quiz moving', function () {
  assert.equal(coach.nextQuizMove('Great work. That is all for today.', true), 'continue-quiz');
  assert.equal(coach.nextQuizMove('Which of the following is correct?', true), 'wait');
  assert.equal(coach.nextQuizMove('The Finance Commission', true), 'continue-truncated');
  assert.equal(coach.nextQuizMove('', true), 'continue-quiz');
  assert.equal(coach.shouldKeepTrying(false), true);
  assert.equal(coach.shouldKeepTrying(true), false);
  assert.equal(coach.backoffMs(0), 800);
  assert.equal(coach.backoffMs(8), 20000);
});

test('escapes model HTML and plays a three-note sweet tone spec', function () {
  const html = coach.formatReply('Use **Article 263**.\n<script>alert(1)</script>');
  assert.match(html, /<strong>Article 263<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(coach.TONE.length, 3);
  assert.ok(coach.TONE[0].f < coach.TONE[1].f);
  assert.ok(coach.TONE[1].f < coach.TONE[2].f);
});

test('reads the page topic and the public chat endpoint', function () {
  const fakeDoc = {
    querySelector: function (sel) {
      if (sel === '#topicOfDay h2') return { textContent: 'Cabinet approves fiscal policy' };
      return null;
    }
  };
  assert.match(coach.pageContextFromDom(fakeDoc), /Cabinet approves fiscal policy/);
  assert.equal(
    coach.endpointFromWindow({ SB_UPSC_ENDPOINT: 'https://example.workers.dev/' }),
    'https://example.workers.dev'
  );
});

test('mute preference persists without throwing', function () {
  const store = {
    data: {},
    getItem: function (key) { return this.data[key] || null; },
    setItem: function (key, value) { this.data[key] = String(value); }
  };
  coach.writeMuted(true, store);
  assert.equal(coach.readMuted(store), true);
  coach.writeMuted(false, store);
  assert.equal(coach.readMuted(store), false);
});

test('UPSC study pages load the coach widget after the endpoint is set', function () {
  const pages = ['upsc.html', 'upsc-patterns.html', 'mains.html', 'upsc-quiz.html', 'revision.html'];
  pages.forEach(function (name) {
    const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert.match(html, /assets\/css\/upsc-coach\.css/);
    assert.match(html, /assets\/js\/upsc\/coach\.js/);
    assert.ok(
      html.indexOf('SB_UPSC_ENDPOINT') < html.indexOf('assets/js/upsc/coach.js'),
      name + ' must set the Worker URL before coach.js'
    );
  });
});

console.log('UPSC Summaverick coach tests passed');
