// scripts/sn-reference/scrape-reference.mjs
// =============================================================================
// SERVICENOW API REFERENCE SCRAPER
// =============================================================================
// Saves every page of the ServiceNow API reference for one release as plain
// text, one file per page, for build-api-index.js. Run it when a new release
// ships, then rebuild data/sn-api-index.json.
//
// developer.servicenow.com is a single-page app: page content is rendered into
// shadow DOM and its data endpoint refuses plain HTTP clients. So this drives
// headless Chrome over the DevTools protocol, walks the shadow roots for the
// text, and keeps only the part between the release picker ("Content available
// for: ...") and the feedback footer. The list of pages comes from the portal's
// public index endpoint.
//
// Usage:
//   node scripts/sn-reference/scrape-reference.mjs <out-dir> [release] [tabs]
//   node scripts/sn-reference/build-api-index.js <out-dir> [release]
// CHROME_PATH overrides the Chrome binary; SN_TYPES=server,client,rest picks the API types.
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const [outDir, release = 'brazil', tabsArg = '6'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/sn-reference/scrape-reference.mjs <out-dir> [release] [tabs]');
  process.exit(1);
}
// SN_TYPES=client narrows the run, e.g. to test the scraper quickly.
const TYPES = (process.env.SN_TYPES || 'server,client,rest').split(',');
const RELEASES = new Set(['Brazil', 'Australia', 'Zurich', 'Yokohama', 'Xanadu', 'Washington DC', 'Vancouver']);
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome');
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Text of the page including shadow DOM, with <pre> blocks kept intact.
const DEEP_TEXT = `(() => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    const tag = n.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    if (n.shadowRoot) walk(n.shadowRoot);
    if (tag === 'PRE') { out.push('\\n<pre>\\n' + n.innerText + '\\n</pre>\\n'); return; }
    for (const c of n.childNodes) walk(c);
    if (/^(P|DIV|LI|TR|H\\d|SECTION|DT|DD|TABLE)$/.test(tag)) out.push('\\n');
  };
  walk(document.body);
  return out.join(' ').replace(/ *\\n[ \\n]*/g, '\\n');
})()`;

function links(items) {
  const found = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      if (x.link) found.push([x.title, x.link]);
      Object.values(x).forEach(walk);
    }
  };
  walk(items);
  return found;
}

function clean(raw) {
  const lines = raw.split('\n');
  const marks = lines.map((l, i) => (l.includes('Content available for') ? i : -1)).filter((i) => i >= 0);
  if (!marks.length) return '';
  let start = marks[marks.length - 1] + 1;
  while (start < lines.length && [...RELEASES].some((r) => lines[start].trim() === r || lines[start].trim() === r + ' ' + r)) start++;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^(Was this page helpful|Sign in to provide feedback|On this page|Feedback)/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

async function openTab() {
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m.result); };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  return { send, close: () => fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`) };
}

// Waits until the page's own content has rendered (its title follows the release picker) and stopped changing.
async function capture(send, previous, title) {
  const name = title.split(/\s+[-(]/)[0].trim();
  let text = '';
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    text = (await send('Runtime.evaluate', { expression: DEEP_TEXT, returnByValue: true }))?.result?.value || '';
    const body = clean(text);
    const ours = body.length > 200 && body.slice(0, 400).includes(name);
    if (ours && text !== previous && text.length === last) break;
    last = text.length;
  }
  return text;
}

async function main() {
  const jobs = [];
  for (const type of TYPES) {
    const res = await fetch(`https://developer.servicenow.com/api/snc/api_index_data?release=${release}&apiType=${type}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const pages = links((await res.json()).result.items);
    fs.mkdirSync(path.join(outDir, type), { recursive: true });
    for (const [title, link] of pages) {
      const file = path.join(outDir, type, link.split(`/${type}/`)[1].replace(/[^\w.-]+/g, '_') + '.txt');
      jobs.push({ title, link, file });
    }
    console.log(`${type}: ${pages.length} pages`);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-ref-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch (e) { await sleep(250); }
    }
    const queue = jobs.slice();
    const seen = new Map();
    let done = 0;
    const worker = async () => {
      const tab = await openTab();
      let previous = '';
      let first = true;
      while (queue.length) {
        const job = queue.shift();
        if (first) { await tab.send('Page.navigate', { url: job.link }); first = false; }
        else await tab.send('Runtime.evaluate', { expression: `location.href = ${JSON.stringify(job.link)}` });
        const raw = await capture(tab.send, previous, job.title);
        previous = raw;
        const body = clean(raw);
        // Same text as another page means the SPA had not switched yet; retry once in a fresh tab.
        if (body && seen.has(body) && seen.get(body) !== job.link) job.retry = (job.retry || 0) + 1;
        if (job.retry === 1) { queue.push(job); continue; }
        seen.set(body, job.link);
        fs.writeFileSync(job.file, `URL: ${job.link}\nTITLE: ${job.title}\n\n${body}\n`);
        if (++done % 50 === 0) console.log(`  ${done}/${jobs.length}`);
      }
      await tab.close();
    };
    await Promise.all(Array.from({ length: Number(tabsArg) || 6 }, worker));
    console.log(`saved ${done} pages to ${outDir}`);
  } finally {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files; the OS temp dir is cleaned later */ }
  }
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
