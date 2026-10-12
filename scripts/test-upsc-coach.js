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

test('flags the UPSC domain, chip, mode, marks and meta on the request body', function () {
  const searched = coach.buildRequest({ query: 'follow-up on federalism', pageContext: 'Fiscal federalism' });
  assert.equal(searched.domain, 'upsc');
  assert.equal(searched.liveSearch, true);
  const skeleton = coach.buildRequest({
    query: 'Model answer', liveSearch: false, chip: 'answer', format: 'text', mode: 'exam', marks: 15,
    meta: { gs_paper: 'GS2', static_topic: 'Fiscal federalism' }
  });
  assert.equal(skeleton.liveSearch, false);
  assert.equal(skeleton.chip, 'answer');
  assert.equal(skeleton.format, 'text');
  assert.equal(skeleton.mode, 'exam');
  assert.equal(skeleton.marks, 15);
  assert.equal(skeleton.meta.gs_paper, 'GS2');
  // Structured chips carry a kind + format so the Worker returns exam artefacts.
  assert.equal(coach.PROMPTS.prelims.kind, 'prelims');
  assert.equal(coach.PROMPTS.prelims.format, 'json');
  assert.equal(coach.PROMPTS.answer.format, 'text');
});

test('parses structured chip payloads: JSON, IBC, word count, rubric, value-adds', function () {
  // extractJson survives prose/fences around the object.
  assert.deepEqual(coach.extractJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(coach.extractJson('no json here'), null);
  // Model-answer helpers.
  const ibc = coach.parseIBC('Introduction:\nContext line.\nBody:\nOne. Two.\nConclusion:\nWay forward.');
  assert.match(ibc.intro, /Context line/);
  assert.match(ibc.body, /One\. Two/);
  assert.match(ibc.conclusion, /Way forward/);
  assert.equal(coach.marksToWords(15), 250);
  assert.equal(coach.marksToWords(10), 150);
  assert.equal(coach.mainsMinutes(15), 13);
  assert.ok(coach.wordCount('one two three four') === 4);
  // Value-add highlighting for examiner anchors.
  const va = coach.valueAddHtml('Under Article 280 the Finance Commission set 41%');
  assert.match(va, /<mark class="sv-va">Article 280<\/mark>/);
  assert.match(va, /<mark class="sv-va">Finance Commission<\/mark>/);
  // Rubric parsing → labelled badges.
  const rubric = coach.parseRubric({ structure: true, relevance: false, data_examples: true, committees_schemes: false, way_forward: true });
  assert.equal(rubric.length, 5);
  assert.equal(rubric[0].ok, true);
  assert.equal(rubric[1].ok, false);
});

test('derives page metadata and a header line from the DOM', function () {
  const openDetail = {
    parentNode: {
      querySelector: function (sel) {
        if (sel.indexOf('an-entry__title') !== -1) return { textContent: 'Fiscal federalism' };
        if (sel.indexOf('an-code') !== -1) return { textContent: 'GS2.2' };
        return null;
      }
    },
    textContent: 'Pattern Static core: Article 280.'
  };
  const fakeDoc = {
    querySelector: function (sel) {
      if (sel.indexOf('an-entry__expand[open]') !== -1) return openDetail;
      return null;
    }
  };
  const meta = coach.pageMetaFromDom(fakeDoc, {});
  assert.equal(meta.gs_paper, 'GS2');
  assert.equal(meta.static_topic, 'Fiscal federalism');
  const header = coach.metaHeaderText(meta);
  assert.match(header, /GS2/);
  assert.match(header, /Fiscal federalism/);
  // window.UPSC_CONTEXT overrides derived fields.
  const overridden = coach.pageMetaFromDom({ querySelector: function () { return null; } }, { UPSC_CONTEXT: { gs_paper: 'GS3', static_topic: 'Renewables' } });
  assert.equal(overridden.gs_paper, 'GS3');
  assert.equal(overridden.static_topic, 'Renewables');
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
  const pages = ['upsc-patterns.html', 'mains.html', 'upsc-quiz.html', 'revision.html'];
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

test('the article reading page loads source research without a floating interruption', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'upsc.html'), 'utf8');
  assert.match(html, /assets\/js\/upsc\/coach\.js/);
  assert.match(html, /assets\/css\/upsc-coach\.css/);
  assert.ok(html.indexOf('SB_UPSC_ENDPOINT') < html.indexOf('assets/js/upsc/coach.js'));
  assert.equal(coach.PROMPTS.sources.search, true);
  assert.equal(coach.PROMPTS.understanding.search, true);
});


const Render = require('../assets/js/upsc/answer-render.js');
const Progress = require('../assets/js/upsc/edition-progress.js');
const domain = require('../api/upsc-domain.js');

test('offers the four reading actions, reusing existing prompt kinds where possible', function () {
  assert.equal(coach.PROMPTS.explain.label, 'Explain this step');
  assert.equal(coach.PROMPTS.check.label, 'Check this claim');
  assert.equal(coach.PROMPTS.test.label, 'Test me');
  assert.equal(coach.PROMPTS.test.kind, 'understanding');
  assert.equal(coach.PROMPTS.outline.label, 'Make it a Mains answer');
  assert.equal(coach.PROMPTS.outline.kind, 'answer');
  assert.deepEqual(coach.chipsFor(true), ['sources', 'explain', 'check', 'test', 'outline']);
  assert.ok(coach.chipsFor(false).indexOf('prelims') !== -1);
  assert.ok(coach.chipsFor(false).indexOf('explain') !== -1);
  assert.equal(coach.PROMPTS.explain.format, 'brief');
  assert.equal(coach.PROMPTS.check.format, 'brief');
});

test('explain and check focus on the selection, else the current section', function () {
  const section = { textContent: 'What did the MPC decide? The repo rate stays at 5.5%.', getBoundingClientRect: () => ({ top: 40, bottom: 400 }) };
  const docWithSelection = {
    getSelection: () => 'The Governor has a casting vote in a tie.',
    querySelectorAll: () => [section],
  };
  assert.equal(coach.focusText(docWithSelection, { innerHeight: 800 }), 'The Governor has a casting vote in a tie.');
  const docNoSelection = { getSelection: () => '', querySelectorAll: () => [section] };
  assert.match(coach.focusText(docNoSelection, { innerHeight: 800 }), /repo rate stays at 5\.5%/);
  const ask = coach.focusedAsk(coach.PROMPTS.explain, 'The repo rate stays at 5.5%.');
  assert.match(ask.visible, /^Explain this step: “The repo rate stays at 5\.5%\.”/);
  assert.match(ask.query, /Explain/);
  assert.equal(coach.focusedAsk(coach.PROMPTS.check, '').visible, 'Check this claim');
});

test('markdown answer with [1] renders a source chip through the shared renderer', function () {
  const html = coach.renderAnswerHtml('## Why\nThe repo rate is **5.5%** [1].\n- **Stance:** neutral', {
    sources: [{ index: 1, title: 'RBI resolution', url: 'https://www.rbi.org.in/x' }],
  }, Render);
  assert.match(html, /class="ue-answer"/);
  assert.match(html, /ue-chip--official/);
  assert.match(html, /<strong>5\.5%<\/strong>/);
  assert.match(html, /<ul class="ue-points">/);
});

test('JSON contract answer renders the one-line box and sections', function () {
  const answer = JSON.stringify({
    oneLine: 'The MPC sets the repo rate; the Centre sets the target.',
    sections: [{ heading: 'Who decides what?', points: [{ label: 'Target', text: 'Notified by the Centre.', cite: [1] }] }],
    sources: [{ n: 1, title: 'RBI Act', publisher: 'RBI', url: 'https://rbi.org.in/', kind: 'official' }],
    followUps: ['What is the tolerance band?'],
  });
  const html = coach.renderAnswerHtml('```json\n' + answer + '\n```', { sources: [] }, Render);
  assert.match(html, /class="ue-oneline"/);
  assert.match(html, /<h3 class="ue-q">Who decides what\?<\/h3>/);
  assert.match(html, /data-followup=/);
  assert.equal(coach.answerContract('{"oneLine":"x","sections":[]}').oneLine, 'x');
  assert.equal(coach.answerContract('no json'), null);
});

test('legacy plain answers still render escaped paragraphs, with or without the renderer', function () {
  const plain = 'First point about **Article 280**.\n\nSecond <b>point</b>.';
  const rendered = coach.renderAnswerHtml(plain, {}, Render);
  assert.equal((rendered.match(/<p>/g) || []).length, 2);
  assert.match(rendered, /&lt;b&gt;/);
  const legacy = coach.renderAnswerHtml(plain, {}, null);
  assert.equal(legacy, coach.formatReply(plain));
});

test('Save to revision creates a card due tomorrow', function () {
  const data = {};
  const storage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  const progress = Progress.create(storage, '2026-10-13');
  const card = coach.revisionCard('Explain this step: “repo rate”', '{"oneLine":"Repo is the overnight lending rate.","sections":[]}', 'rbi-policy-oct-2026');
  assert.equal(card.front, 'Explain this step: “repo rate”');
  assert.equal(card.back, 'Repo is the overnight lending rate.');
  const id = progress.addCard(card);
  assert.ok(id);
  assert.equal(progress.addCard(card), id, 'saving twice does not duplicate');
  const due = Progress.create(storage, '2026-10-14').dueCards();
  assert.equal(due.length, 1);
  assert.equal(due[0].noteId, 'rbi-policy-oct-2026');
  const markdownCard = coach.revisionCard('Q', '## Heading\n**Bold** answer text [1] here.', '');
  assert.match(markdownCard.back, /^Heading Bold answer text here\./);
  assert.equal(markdownCard.noteId, 'coach');
  assert.equal(progress.addCard({ front: '', back: 'x' }), null);
});

test('the Worker pack asks for the brief JSON contract and knows the new actions', function () {
  const brief = domain.upscFormatInstruction('brief');
  assert.match(brief, /"oneLine"/);
  assert.match(brief, /"sections"/);
  assert.match(brief, /"examAngle"/);
  assert.match(brief, /"followUps"/);
  assert.match(brief, /raw JSON/);
  assert.equal(domain.upscFormatInstruction('text'), '');
  assert.equal(domain.upscFormatInstruction('json'), '');
  assert.match(domain.upscChipInstruction('explain'), /EXPLAIN/);
  assert.match(domain.upscChipInstruction('check'), /CHECK/);
  const worker = fs.readFileSync(path.join(__dirname, '..', 'api', 'worker.js'), 'utf8');
  assert.match(worker, /upscFormatInstruction\(body\.format\)/);
});

test('Save to revision tells the Today desk to re-read progress', () => {
  const coachSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'upsc', 'coach.js'), 'utf8');
  assert.match(coachSource, /\.addCard\(card\)[\s\S]{0,200}dispatchEvent\(new Event\('upsc:revisionchange'\)\)/);
});

console.log('UPSC Summaverick coach tests passed');
