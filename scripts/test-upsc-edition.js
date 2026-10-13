'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const Edition = require('../assets/js/upsc/edition.js');
const Render = require('../assets/js/upsc/answer-render.js');
const Progress = require('../assets/js/upsc/edition-progress.js');
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'upsc-edition-sample.json'), 'utf8'));

function test(name, body) {
  return Promise.resolve().then(body).then(
    () => console.log('ok - ' + name),
    (error) => { console.error('not ok - ' + name); throw error; }
  );
}

/* ── minimal DOM shim: ids, innerHTML strings, hidden, attributes, listeners ── */
function element(id) {
  const attrs = {};
  const classes = new Set();
  return {
    id, hidden: true, innerHTML: '', listeners: {},
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    toggleAttribute(name, on) { if (on) attrs[name] = ''; else delete attrs[name]; return !!on; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
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

function fakeDom(href) {
  const els = { editionDesk: element('editionDesk'), editionReader: element('editionReader'), 'view-brief': element('view-brief') };
  els['view-brief'].hidden = false;
  const body = element('body');
  const doc = {
    body,
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    dispatchEvent() {},
    title: 'UPSC Today',
  };
  const pushed = [];
  const win = {
    location: { href: href || 'https://sumanthbolle.com/upsc.html' },
    history: { pushState(state, title, url) { pushed.push(url); win.location.href = new URL(url, win.location.href).href; } },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    scrollY: 0,
    scrollTo() {},
    innerHeight: 800,
  };
  return { els, doc, win, pushed };
}

function storage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fetcher(files) {
  const calls = [];
  const fn = (url) => {
    calls.push(url);
    const key = Object.keys(files).find((k) => url.endsWith(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(files[key]))) });
  };
  fn.calls = calls;
  return fn;
}

const indexFor = (entries) => ({ editions: entries });
const entry = (id, date, slot) => ({ id, date, slot, path: date.slice(0, 4) + '/' + date.slice(5, 7) + '/' + date.slice(8) + '-' + slot + '.json',
  closedAt: date + 'T00:52:00Z', status: 'closed', counts: { prelims: 2, mains: 1, quickFacts: 3, held: 1 } });

const yesterdayPm = {
  id: '2026-10-12-pm', slot: 'pm', date: '2026-10-12', status: 'closed', closedAt: '2026-10-12T12:50:00Z',
  glimpse: [], prelims: ['upi-credit-lines'], mains: [], quickFacts: [], held: [],
  notes: { 'upi-credit-lines': { id: 'upi-credit-lines', slug: 'upi-credit-lines', kind: 'news', title: 'Credit lines on UPI', oneLine: 'Banks can now offer pre-sanctioned credit lines over UPI.', codes: ['GS3.1'], sources: [] } },
};

// 13 Oct 2026, 08:00 IST
const NOW = new Date('2026-10-13T02:30:00Z');

function makeDesk(dom, files, extra) {
  return Edition.createDesk(Object.assign({
    doc: dom.doc, win: dom.win, fetch: fetcher(files), storage: storage(), now: () => NOW,
    Render, Progress, observe: false,
  }, extra || {}));
}

(async function main() {
  await test('loads in node and as a browser global', function () {
    const context = { window: {}, UpscAnswerRender: Render, UpscEditionProgress: Progress };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/upsc/edition.js'), 'utf8'), context, { filename: 'edition.js' });
    assert.equal(typeof context.window.UpscEdition.createDesk, 'function');
  });

  await test('desk stays hidden and the page unchanged without an edition index', async function () {
    const dom = fakeDom();
    const desk = makeDesk(dom, {});
    const shown = await desk.load();
    assert.equal(shown, false);
    assert.equal(dom.els.editionDesk.hidden, true);
    assert.equal(dom.els.editionDesk.innerHTML, '');
    assert.equal(dom.els.editionReader.hidden, true);
    assert.equal(dom.els['view-brief'].hasAttribute('data-ue-reading'), false);
    // An index that lists nothing usable also keeps it hidden.
    const empty = makeDesk(fakeDom(), { 'editions/index.json': indexFor([]) });
    assert.equal(await empty.load(), false);
  });

  await test('renders the counter, slots, sections and facts for today', async function () {
    const dom = fakeDom();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': sample,
    });
    assert.equal(await desk.load(), true);
    const html = dom.els.editionDesk.innerHTML;
    const text = html.replace(/<[^>]+>/g, '');
    assert.equal(dom.els.editionDesk.hidden, false);
    assert.match(text, /Prelims 0\/2 · Mains 0\/1 · Revise 0/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /AM ✓ 06:22/);
    assert.match(html, /PM/);
    assert.match(html, /Glimpse/);
    assert.match(html, /RBI holds the repo rate at 5\.5%/);
    assert.match(html, /href="\?view=brief&amp;note=rbi-policy-oct-2026"/);
    assert.match(html, /data-ue-fact="qf-gst-council-56"/);
    assert.match(html, /Quick facts/);
    assert.match(html, /Revise today/);
    assert.match(html, /<details class="ue-sync">/);
    assert.match(html, /1 topic held back/);
    assert.doesNotMatch(html, /Today covered/);
  });

  await test('marking done, ticking facts and grading update the counter', async function () {
    const dom = fakeDom();
    const store = storage();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': sample,
    }, { storage: store });
    await desk.load();
    desk.markDone('rbi-policy-oct-2026', true);
    assert.match(dom.els.editionDesk.innerHTML.replace(/<[^>]+>/g, ''), /Prelims 1\/2 · Mains 0\/1/);
    desk.markDone('pm-e-drive-extension');
    desk.markDone('india-eu-fta-chapters');
    sample.quickFacts.forEach((fact) => desk.tickFact(fact.id, true));
    const html = dom.els.editionDesk.innerHTML;
    const text = html.replace(/<[^>]+>/g, '');
    assert.match(html, /Today covered/);
    assert.match(text, /Prelims 2\/2 · Mains 1\/1 · Revise 0/);
    assert.match(html, /data-complete="true"/);
    // Next day those notes produce revision cards on the same storage.
    const next = Edition.createDesk({ doc: fakeDom().doc, win: fakeDom().win, fetch: fetcher({}), storage: store,
      now: () => new Date('2026-10-14T02:30:00Z'), Render, Progress, observe: false });
    assert.ok(next.progress().dueCards().length >= 3);
  });

  await test('re-reads progress when another script or tab changes it', async function () {
    const dom = fakeDom();
    const store = storage();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': sample,
    }, { storage: store });
    await desk.load();
    const text = () => dom.els.editionDesk.innerHTML.replace(/<[^>]+>/g, '');
    assert.match(text(), /Prelims 0\/2/);
    // Another instance on the same storage (Summaverick, another tab) marks a note done.
    Progress.create(store, '2026-10-13').markDone(sample.notes['rbi-policy-oct-2026'], true);
    (dom.doc.listeners['upsc:revisionchange'] || []).forEach((fn) => fn({ type: 'upsc:revisionchange' }));
    assert.match(text(), /Prelims 1\/2/);
    Progress.create(store, '2026-10-13').markDone(sample.notes['pm-e-drive-extension'], true);
    (dom.win.listeners.storage || []).forEach((fn) => fn({ type: 'storage', key: 'unrelated' }));
    assert.match(text(), /Prelims 1\/2/, 'unrelated keys are ignored');
    (dom.win.listeners.storage || []).forEach((fn) => fn({ type: 'storage', key: Progress.STORAGE_KEY }));
    assert.match(text(), /Prelims 2\/2/);
    // The desk's own next save keeps the other instance's work.
    desk.tickFact(sample.quickFacts[0].id, true);
    assert.equal(Progress.create(store, '2026-10-13').isDone('pm-e-drive-extension'), true);
  });

  await test('note cards show read time from a number or an "N min" string', async function () {
    const withString = JSON.parse(JSON.stringify(sample));
    withString.notes['rbi-policy-oct-2026'].readTime = '4 min';
    const dom = fakeDom();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': withString,
    });
    await desk.load();
    assert.match(dom.els.editionDesk.innerHTML, /4 min read/);
    assert.match(dom.els.editionDesk.innerHTML, /5 min read/);
  });

  await test('falls back to the latest closed edition with a delay notice', async function () {
    const dom = fakeDom();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-12-pm', '2026-10-12', 'pm')]),
      '2026/10/12-pm.json': yesterdayPm,
    });
    assert.equal(await desk.load(), true);
    assert.match(dom.els.editionDesk.innerHTML, /AM edition is late/);
    assert.match(dom.els.editionDesk.innerHTML, /Credit lines on UPI/);
  });

  await test('missed line lists yesterday PM', async function () {
    const dom = fakeDom();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am'), entry('2026-10-12-pm', '2026-10-12', 'pm')]),
      '2026/10/13-am.json': sample,
      '2026/10/12-pm.json': yesterdayPm,
    });
    await desk.load();
    await desk.ready();
    const html = dom.els.editionDesk.innerHTML;
    const text = html.replace(/<[^>]+>/g, '');
    assert.match(html, /Missed in the last 7 days/);
    assert.match(html, /12 Oct · PM/);
    assert.match(html, /Credit lines on UPI/);
    assert.doesNotMatch(html.slice(0, html.indexOf('Missed')), /Credit lines on UPI/);
  });

  await test('note route opens the reader and Back returns to the desk', async function () {
    const dom = fakeDom('https://sumanthbolle.com/upsc.html?view=brief&note=pm-e-drive-extension');
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': sample,
    });
    await desk.load();
    const reader = dom.els.editionReader;
    assert.equal(reader.hidden, false);
    assert.equal(dom.els['view-brief'].hasAttribute('data-ue-reading'), true);
    assert.equal(dom.doc.body.classList.contains('ue-reading'), true);
    assert.match(reader.innerHTML, /PM E-DRIVE extended to 2028/);
    assert.match(reader.innerHTML, /class="ue-oneline"/);
    assert.match(reader.innerHTML, /data-ue-back/);
    assert.match(reader.innerHTML, /data-ue-done/);
    assert.match(reader.innerHTML, /data-ue-ask/);
    assert.match(reader.innerHTML, /Next note/);
    desk.closeNote(true);
    assert.equal(reader.hidden, true);
    assert.equal(dom.els['view-brief'].hasAttribute('data-ue-reading'), false);
    assert.doesNotMatch(dom.win.location.href, /note=/);
    desk.openNote('india-eu-fta-chapters', true);
    assert.match(dom.pushed[dom.pushed.length - 1], /note=india-eu-fta-chapters/);
    // An unknown note slug shows a message rather than a blank page.
    dom.win.location.href = 'https://sumanthbolle.com/upsc.html?note=nope';
    desk.route();
    assert.equal(reader.hidden, false);
    assert.match(reader.innerHTML, /not in the last 7 days/);
    // Other views or a pocket article never show the edition reader.
    dom.win.location.href = 'https://sumanthbolle.com/upsc.html?view=memory&note=pm-e-drive-extension';
    desk.route();
    assert.equal(reader.hidden, true);
  });

  await test('reader done rules: end of key numbers plus MCQ, or Mark done', async function () {
    const dom = fakeDom();
    const desk = makeDesk(dom, {
      'editions/index.json': indexFor([entry('2026-10-13-am', '2026-10-13', 'am')]),
      '2026/10/13-am.json': sample,
    });
    await desk.load();
    desk.openNote('rbi-policy-oct-2026', false);
    desk.reachedEnd('rbi-policy-oct-2026');
    assert.equal(desk.progress().isDone('rbi-policy-oct-2026'), false);
    desk.answeredMcq('rbi-policy-oct-2026', true);
    assert.equal(desk.progress().isDone('rbi-policy-oct-2026'), true);
    desk.answeredMcq('pm-e-drive-extension', false);
    assert.equal(desk.progress().isDone('pm-e-drive-extension'), false);
    desk.reachedEnd('pm-e-drive-extension');
    assert.equal(desk.progress().isDone('pm-e-drive-extension'), true);
  });

  await test('pure helpers: IST clock, routes and date labels', function () {
    assert.equal(Edition.istClock(new Date('2026-10-13T00:52:00Z')), '06:22');
    assert.equal(Edition.dateLabel('2026-10-12'), '12 Oct');
    assert.equal(Edition.noteFromUrl('https://x/upsc.html?view=brief&note=a-b'), 'a-b');
    assert.equal(Edition.noteFromUrl('https://x/upsc.html?note=a-b'), 'a-b');
    assert.equal(Edition.noteFromUrl('https://x/upsc.html?view=source&note=a-b'), '');
    assert.equal(Edition.noteFromUrl('https://x/upsc.html?article=p&note=a-b'), '');
    assert.equal(Edition.noteHref('a b'), '?view=brief&note=a%20b');
  });

  await test('upsc.html mounts the desk and reader first in Today and loads the modules', function () {
    const html = fs.readFileSync(path.join(root, 'upsc.html'), 'utf8');
    const brief = html.indexOf('id="view-brief"');
    const deskAt = html.indexOf('id="editionDesk"');
    const readerAt = html.indexOf('id="editionReader"');
    const feedAt = html.indexOf('class="pr-feed-controls"');
    assert.ok(brief > 0 && brief < deskAt && deskAt < readerAt && readerAt < feedAt);
    assert.match(html, /<section class="ue-desk" id="editionDesk" hidden aria-labelledby="editionTitle"><\/section>/);
    assert.match(html, /<article class="ue-reader" id="editionReader" hidden><\/article>/);
    const render = html.indexOf('assets/js/upsc/answer-render.js?v=20261013-1');
    const progress = html.indexOf('assets/js/upsc/edition-progress.js?v=20261013-1');
    const edition = html.indexOf('assets/js/upsc/edition.js?v=20261013-1');
    const coach = html.indexOf('assets/js/upsc/coach.js');
    assert.ok(render > 0 && progress > 0 && edition > render && edition > progress && edition < coach);
    assert.match(html, /assets\/css\/upsc-edition\.css\?v=\d{8}-\d+/);
  });

  console.log('UPSC edition desk tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
