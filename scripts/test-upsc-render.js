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
