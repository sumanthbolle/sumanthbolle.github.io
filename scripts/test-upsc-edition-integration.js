'use strict';

// Cross-language check: an edition tree written by scripts/upsc/edition.py
// must load through edition.js exactly as the browser fetches it
// (BASE 'data/upsc/editions/' + index path), with no path guessing.
// Usage: node scripts/test-upsc-edition-integration.js [editions-dir]
// Default dir: scripts/fixtures/upsc-edition-generated (regenerate with
// UPSC_UPDATE_FIXTURES=1 python3 -m unittest scripts.upsc.test_edition).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Edition = require('../assets/js/upsc/edition.js');
const Render = require('../assets/js/upsc/answer-render.js');
const Progress = require('../assets/js/upsc/edition-progress.js');

const dir = path.resolve(process.argv[2] || path.join(__dirname, 'fixtures', 'upsc-edition-generated'));
const BASE = 'data/upsc/editions/';

function element(id) {
  const attrs = {};
  const classes = new Set();
  return {
    id, hidden: true, innerHTML: '',
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    toggleAttribute(name, on) { if (on) attrs[name] = ''; else delete attrs[name]; return !!on; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : on; if (v) classes.add(c); else classes.delete(c); return v; },
      contains: (c) => classes.has(c),
    },
    focus() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, bottom: 0, height: 0 }; },
  };
}

const fetched = [];
function strictFetch(url) {
  fetched.push(url);
  const relative = url.startsWith(BASE) ? url.slice(BASE.length) : null;
  const file = relative && !relative.includes('..') ? path.join(dir, relative) : null;
  if (!file || !fs.existsSync(file)) {
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + url)) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) });
}

(async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.ok(index.editions.length > 0, 'index lists editions');
  const latest = index.editions[0];
  assert.match(latest.path, /^\d{4}\/\d{2}\/\d{2}-(am|pm)\.json$/, 'index paths are relative to the editions directory');
  const edition = JSON.parse(fs.readFileSync(path.join(dir, latest.path), 'utf8'));

  const els = { editionDesk: element('editionDesk'), editionReader: element('editionReader'), 'view-brief': element('view-brief') };
  els['view-brief'].hidden = false;
  const doc = { body: element('body'), getElementById: (id) => els[id] || null, querySelector: () => null,
    addEventListener() {}, dispatchEvent() {}, title: 'UPSC Today' };
  const win = { location: { href: 'https://sumanthbolle.com/upsc.html' }, history: { pushState() {} },
    addEventListener() {}, scrollY: 0, scrollTo() {}, innerHeight: 800 };
  const data = {};
  const storage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  // 08:00 IST on the edition's date.
  const now = new Date(edition.date + 'T02:30:00Z');

  const desk = Edition.createDesk({ doc, win, fetch: strictFetch, storage, now: () => now, Render, Progress, observe: false });
  assert.equal(await desk.load(), true, 'desk loads the Python-written edition; fetched: ' + fetched.join(', '));
  assert.deepEqual(fetched.slice(0, 2), [BASE + 'index.json', BASE + latest.path]);
  const html = els.editionDesk.innerHTML;
  const text = html.replace(/<[^>]+>/g, '');
  assert.equal(els.editionDesk.hidden, false);
  const prelims = edition.prelims.length;
  const mains = edition.mains.length;
  assert.ok(text.includes(`Prelims 0/${prelims} · Mains 0/${mains}`), 'counter shows edition counts: ' + text.slice(0, 200));
  const note = edition.notes[(edition.prelims.concat(edition.mains))[0]];
  assert.ok(html.includes(note.oneLine.replace(/&/g, '&amp;').slice(0, 30)), 'glimpse shows the note');
  assert.equal(typeof note.readTime, 'number', 'Python stores read time as whole minutes');
  assert.ok(html.includes(note.readTime + ' min read'), 'note card shows the read time');
  (edition.quickFacts || []).forEach((fact) => assert.ok(html.includes(`data-ue-fact="${fact.id}"`), fact.id));
  console.log('UPSC edition integration test passed (' + path.relative(process.cwd(), dir) + ')');
})().catch((error) => { console.error(error); process.exit(1); });
