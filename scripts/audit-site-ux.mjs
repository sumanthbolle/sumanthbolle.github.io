#!/usr/bin/env node
// scripts/audit-site-ux.mjs
// =============================================================================
// WEEKLY SITE UX AUDIT
// =============================================================================
// Loads every real top-level page of the static site in headless Chrome at four
// viewports and reports layout and runtime problems that a desktop-only check
// misses: pages that scroll sideways on a phone, text cut off inside buttons,
// tap targets too small for a thumb, pages that cannot scroll, broken images,
// console errors and failed requests.
//
// No npm packages. The repo root is served by a tiny built-in http server and
// Chrome is driven directly over the DevTools protocol (global WebSocket and
// fetch, Node 22+).
//
//   viewports   360x740 and 390x844 (mobile, DPR 3, touch), 768x1024, 1280x800
//               set with Emulation.setDeviceMetricsOverride, so widths below
//               Chrome's minimum window size are real
//
// CHECKS — per page x viewport (severity in brackets):
//   horizontal-overflow [error]  page scrolls sideways; up to 5 widest causes
//   console-error / page-exception [error, warn when the source is 3rd party]
//   failed-request      [error same-origin, warn for /api/* and 3rd party]
//   broken-image [error], img-missing-alt [warn]
//   clipped-text        [warn]   text cut by overflow:hidden without ellipsis
//   small-tap-target    [warn]   mobile only, under 32x32 CSS px
//   scroll-locked       [error]  content taller than the viewport won't scroll
//   fixed-overlap       [warn]   mobile only, fixed/sticky box > 30% of screen
//
// interviews.html extras: deep-link, category-filter, card-overflow,
// answer-render, mobile-sidebar (see auditInterviews below).
//
// OUTPUT — in --out (default ./ux-audit): report.json, report.md and a PNG
// for every page x viewport that has an error-severity finding.
// Exit 0 normally; with --strict, exit 1 when any error-severity finding
// exists. Exit 2 when the audit itself could not run (no Chrome, etc.).
//
// Usage:
//   node scripts/audit-site-ux.mjs
//   node scripts/audit-site-ux.mjs --pages interviews,index --out /tmp/ux
//   node scripts/audit-site-ux.mjs --strict
//   CHROME_PATH=/path/to/chrome node scripts/audit-site-ux.mjs
// Other flags: --seed N (which random cards answer-render opens),
//              --timeout MS (per page x viewport, default 30000)
// =============================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740, deviceScaleFactor: 3, mobile: true },
  { name: '390x844', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  { name: '768x1024', width: 768, height: 1024, deviceScaleFactor: 1, mobile: false },
  { name: '1280x800', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
];

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Files at the root that are not pages (search-console verification, etc.).
const NOT_A_PAGE = /^(google[0-9a-f]+|BingSiteAuth|yandex_[0-9a-f]+|[0-9a-f]{32})\.html$/i;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { pages: null, out: path.resolve('ux-audit'), strict: false, timeout: 30000, seed: Date.now() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--pages') opts.pages = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--out') opts.out = path.resolve(next());
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--timeout') opts.timeout = Number(next());
    else if (arg === '--seed') opts.seed = Number(next());
    else if (arg === '--help' || arg === '-h') {
      console.log('node scripts/audit-site-ux.mjs [--pages a,b] [--out dir] [--strict] [--timeout ms] [--seed n]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function listPages(filter) {
  const all = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.html') && !NOT_A_PAGE.test(f))
    .filter(f => {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /<body[\s>]/i.test(html) && html.length > 1024;
    })
    .sort();
  if (!filter) return all;
  const wanted = filter.map(p => (p.endsWith('.html') ? p : `${p}.html`));
  const missing = wanted.filter(p => !all.includes(p));
  if (missing.length) throw new Error(`Unknown page(s): ${missing.join(', ')}. Known: ${all.join(', ')}`);
  return wanted;
}

// ---------------------------------------------------------------------------
// Static server. The live site serves extensionless URLs (/interviews ->
// interviews.html, per sitemap.xml), so the same mapping is applied here.
// ---------------------------------------------------------------------------

function resolveFile(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  const abs = path.join(ROOT, path.normalize(rel));
  if (!abs.startsWith(ROOT)) return null;
  const candidates = [abs];
  if (rel.endsWith('/')) candidates.unshift(path.join(abs, 'index.html'));
  else if (!path.extname(abs)) candidates.push(`${abs}.html`, path.join(abs, 'index.html'));
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Chrome + DevTools protocol
// ---------------------------------------------------------------------------

function findChrome() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const found = candidates.find(c => fs.existsSync(c));
  if (!found) throw new Error(`Chrome not found. Set CHROME_PATH. Tried: ${candidates.join(', ')}`);
  return found;
}

function launchChrome(binary) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-chrome-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    // Software WebGL, so pages using three.js don't log context errors that
    // only exist because headless has no GPU.
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--mute-audio', '--disable-extensions', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-dev-shm-usage',
    '--window-size=1280,800', 'about:blank'
  ];
  // Ubuntu 24.04 runners block the unprivileged user namespaces Chrome's
  // sandbox needs; the audit only loads our own site.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const proc = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start in 20s:\n${buf.slice(-2000)}`)), 20000);
    proc.stderr.on('data', chunk => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${buf.slice(-2000)}`)); });
  });
  return { proc, userDataDir, wsUrl };
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
    ws.addEventListener('close', () => {
      for (const { reject, method } of this.pending.values()) reject(new Error(`${method}: socket closed`));
      this.pending.clear();
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One tab with its own session and event log.
class Tab {
  constructor(cdp, targetId, sessionId) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.events = [];
    this.waiters = [];
    this.inflight = new Map();
    this.lastNetwork = Date.now();
    this.off = cdp.on(msg => {
      if (msg.sessionId !== sessionId) return;
      this.events.push(msg);
      // Only same-origin traffic counts toward "network quiet": ad and
      // analytics frames keep long-lived requests open indefinitely.
      if (msg.method === 'Network.requestWillBeSent') {
        if (!this.origin || !msg.params.request.url.startsWith(this.origin)) return this.resolveWaiters(msg);
        this.inflight.set(msg.params.requestId, msg.params.request.url);
        this.lastNetwork = Date.now();
      } else if ((msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') &&
          this.inflight.delete(msg.params.requestId)) {
        this.lastNetwork = Date.now();
      }
      this.resolveWaiters(msg);
    });
  }

  resolveWaiters(msg) {
    this.waiters = this.waiters.filter(w => !(w.method === msg.method && (w.resolve(msg.params), true)));
  }

  static async open(cdp) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = new Tab(cdp, targetId, sessionId);
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(m => tab.send(m)));
    await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
    await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    return tab;
  }

  send(method, params) { return this.cdp.send(method, params, this.sessionId); }

  waitFor(method, timeout) {
    return new Promise((resolve, reject) => {
      const w = { method, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        this.waiters = this.waiters.filter(x => x !== w);
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
    });
  }

  async emulate(vp) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile,
      screenWidth: vp.width, screenHeight: vp.height
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 1 });
    if (vp.mobile) await this.send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA, platform: 'Android' });
  }

  // Navigate, wait for load, then for ~600ms of network quiet (capped), then
  // let entrance animations settle.
  async goto(url, budget = 15000) {
    this.origin = new URL(url).origin;
    const loaded = this.waitFor('Page.loadEventFired', budget);
    const nav = await this.send('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigate ${url}: ${nav.errorText}`);
    await loaded;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(this.inflight.size === 0 && Date.now() - this.lastNetwork > 600)) {
      await sleep(100);
    }
    await sleep(700);
  }

  async eval(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`in-page eval failed: ${d.exception?.description || d.text}`);
    }
    return res.result.value;
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  async click(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  async close() {
    this.off();
    try { await this.cdp.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* gone */ }
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// In-page checks. These functions are serialised and run inside the page, so
// they may only use their arguments and browser globals.
// ---------------------------------------------------------------------------

function pageChecks(opts) {
  const out = [];
  const docEl = document.documentElement;
  const vw = docEl.clientWidth;
  const vh = window.innerHeight;

  const selectorOf = el => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
      if (node === document.body || node === docEl) break;
      let part = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift(`${part}#${node.id}`); break; }
      const classes = [...node.classList].filter(c => /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => c.tagName === node.tagName && (!classes.length || c.classList.contains(classes[0])));
        if (same.length > 1) part += `:nth-of-type(${[...parent.children].filter(c => c.tagName === node.tagName).indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  };
  const visible = el => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const text = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const clipsX = el => {
    const s = getComputedStyle(el);
    return s.overflowX !== 'visible';
  };
  // True when some ancestor below <body> clips or scrolls horizontally, so
  // this element cannot widen the page.
  const insideXContainer = el => {
    for (let p = el.parentElement; p && p !== document.body && p !== docEl; p = p.parentElement) {
      if (clipsX(p)) return true;
    }
    return false;
  };
  const isFixed = el => {
    for (let p = el; p && p !== docEl; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') return true;
    }
    return false;
  };

  // horizontal-overflow --------------------------------------------------------
  const pageScrollsX = docEl.scrollWidth > vw + 1;
  const rootStyle = getComputedStyle(docEl);
  const bodyStyle = getComputedStyle(document.body);
  const rootClips = ['hidden', 'clip'].includes(rootStyle.overflowX) || ['hidden', 'clip'].includes(bodyStyle.overflowX);
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BR'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 || r.width === 0 || r.height === 0) continue;
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    if (isFixed(el) || insideXContainer(el)) continue;
    offenders.push(el);
  }
  const outer = offenders.filter(el => !offenders.some(o => o !== el && o.contains(el)));
  if (pageScrollsX || (rootClips && outer.some(visible))) {
    const listed = outer
      .map(el => {
        // Deepest offending descendant with the furthest right edge: usually the real cause.
        const inner = offenders.filter(o => o !== el && el.contains(o))
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
        return { el, inner, right: el.getBoundingClientRect().right };
      })
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ el, inner, right }) => ({
        selector: selectorOf(el),
        overflowPx: Math.round(right - vw),
        width: Math.round(el.getBoundingClientRect().width),
        cause: inner ? `${selectorOf(inner)} (right ${Math.round(inner.getBoundingClientRect().right)}px)` : undefined
      }));
    out.push({
      severity: pageScrollsX ? 'error' : 'warn',
      check: 'horizontal-overflow',
      message: pageScrollsX
        ? `page is ${docEl.scrollWidth}px wide in a ${vw}px viewport`
        : `content extends past the ${vw}px viewport and is clipped by html/body overflow-x`,
      selector: listed[0]?.selector,
      details: { scrollWidth: docEl.scrollWidth, clientWidth: vw, elements: listed }
    });
  }

  // images ---------------------------------------------------------------------
  const imgs = [...document.images];
  const broken = imgs.filter(img => img.complete && img.naturalWidth === 0 && (img.currentSrc || img.getAttribute('src')));
  for (const img of broken.slice(0, 10)) {
    out.push({ severity: 'error', check: 'broken-image', message: `image failed to load: ${img.currentSrc || img.getAttribute('src')}`, selector: selectorOf(img) });
  }
  if (opts.domChecks) {
    const noAlt = imgs.filter(img => !img.hasAttribute('alt'));
    if (noAlt.length) {
      out.push({
        severity: 'warn', check: 'img-missing-alt', message: `${noAlt.length} <img> without alt`,
        selector: selectorOf(noAlt[0]),
        details: { elements: noAlt.slice(0, 5).map(i => ({ selector: selectorOf(i), src: (i.getAttribute('src') || '').slice(0, 100) })) }
      });
    }
  }

  // clipped-text ---------------------------------------------------------------
  const clipped = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,button,a,[role=button],[class*="badge"],[class*="chip"],[class*="tag"],[class*="pill"]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && text(el)) {
      clipped.push({ selector: selectorOf(el), text: text(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  if (clipped.length) {
    out.push({
      severity: 'warn', check: 'clipped-text', message: `${clipped.length} element(s) cut off horizontally without ellipsis`,
      selector: clipped[0].selector, details: { elements: clipped.slice(0, 5) }
    });
  }

  if (opts.mobile) {
    // small-tap-target ---------------------------------------------------------
    // Small = under 32x32 in both dimensions, or under the WCAG 2.5.8 minimum
    // of 24px in either (a 130x30 nav logo is fine; a 177x16 link is not).
    // Links inline in running text are exempt (WCAG 2.5.8 exception).
    const small = [];
    for (const el of document.querySelectorAll('a[href],button,[role=button]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (!((r.width < 32 && r.height < 32) || r.width < 24 || r.height < 24)) continue;
      const s = getComputedStyle(el);
      if (el.tagName === 'A' && s.display === 'inline') {
        const parentText = (el.parentElement?.textContent || '').trim().length;
        if (parentText > (el.textContent || '').trim().length + 15) continue;
      }
      small.push({ selector: selectorOf(el), text: text(el) || el.getAttribute('aria-label') || '', size: `${Math.round(r.width)}x${Math.round(r.height)}` });
    }
    if (small.length) {
      out.push({
        severity: 'warn', check: 'small-tap-target', message: `${small.length} tap target(s) under 32x32px (or under 24px on a side)`,
        selector: small[0].selector, details: { count: small.length, elements: small.slice(0, 5) }
      });
    }

    // fixed-overlap -------------------------------------------------------------
    const area = vw * vh;
    const fixedEls = [];
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const pos = cs.position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      if (cs.pointerEvents === 'none') continue; // decorative backdrops never block taps
      if (!visible(el) || fixedEls.some(f => f.el.contains(el))) continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const share = (w * h) / area;
      fixedEls.push({ el, share });
      if (share > 0.3) {
        out.push({
          severity: 'warn', check: 'fixed-overlap',
          message: `${pos} element covers ${Math.round(share * 100)}% of the viewport`,
          selector: selectorOf(el), details: { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
        });
      }
    }
  }

  // scroll-locked --------------------------------------------------------------
  const tall = docEl.scrollHeight > vh + 1;
  const lockedStyle = ['hidden', 'clip'].includes(rootStyle.overflowY) || ['hidden', 'clip'].includes(bodyStyle.overflowY);
  if (tall) {
    window.scrollTo({ top: docEl.scrollHeight, behavior: 'instant' });
    const moved = window.scrollY > 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!moved || lockedStyle) {
      out.push({
        severity: 'error', check: 'scroll-locked',
        message: lockedStyle
          ? `html/body overflow-y is ${rootStyle.overflowY}/${bodyStyle.overflowY} with ${docEl.scrollHeight}px of content in a ${vh}px viewport`
          : `window.scrollTo did not move (${docEl.scrollHeight}px content, ${vh}px viewport)`,
        selector: 'body'
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Console, exceptions and network, from the events a tab collected.
// ---------------------------------------------------------------------------

const AD_ANALYTICS = /(googlesyndication|doubleclick|googletagmanager|google-analytics|googleadservices|adservice\.google|adtrafficquality|fundingchoices|clarity\.ms|cloudflareinsights)/i;

function runtimeFindings(events, origin) {
  const out = [];
  const urls = new Map();
  const isThirdParty = url => !!url && /^https?:/.test(url) && !url.startsWith(origin);
  const short = u => (u || '').replace(origin, '').slice(0, 160);

  for (const { method, params } of events) {
    if (method === 'Network.requestWillBeSent') urls.set(params.requestId, { url: params.request.url, type: params.type });
    else if (method === 'Network.responseReceived') {
      const { status, url } = params.response;
      if (status < 400) continue;
      out.push(requestFinding(url, `HTTP ${status}`));
    } else if (method === 'Network.loadingFailed') {
      if (params.canceled || params.errorText === 'net::ERR_ABORTED') continue;
      const info = urls.get(params.requestId) || {};
      if (params.blockedReason) continue;
      out.push(requestFinding(info.url, params.errorText));
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      const src = d.url || d.stackTrace?.callFrames?.[0]?.url;
      const msg = (d.exception?.description || d.text || '').split('\n')[0];
      out.push({ severity: isThirdParty(src) ? 'warn' : 'error', check: 'page-exception', message: msg.slice(0, 300), selector: src ? short(src) : undefined });
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      const msg = params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0];
      const src = params.stackTrace?.callFrames?.[0]?.url;
      out.push({ severity: isThirdParty(src) ? 'warn' : 'error', check: 'console-error', message: msg.slice(0, 300), selector: src ? short(src) : undefined });
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      // Network log lines duplicate failed-request; console API lines arrive above.
      if (['network', 'console-api'].includes(params.entry.source)) continue;
      const src = params.entry.url;
      out.push({ severity: isThirdParty(src) ? 'warn' : 'error', check: 'console-error', message: params.entry.text.slice(0, 300), selector: src ? short(src) : undefined });
    }
  }

  function requestFinding(url, why) {
    if (!url || url.startsWith('data:')) return null;
    if (isThirdParty(url)) {
      return { severity: 'warn', check: 'failed-request', message: `${AD_ANALYTICS.test(url) ? 'ad/analytics' : 'third-party'} request failed (${why}): ${url.slice(0, 160)}` };
    }
    // /api/* is the Cloudflare worker and /cdn-cgi/* is injected by the
    // Cloudflare edge; neither exists on the local static server.
    const p = new URL(url).pathname;
    if (p.startsWith('/api/') || p.startsWith('/cdn-cgi/')) {
      return { severity: 'warn', check: 'failed-request', message: `Cloudflare-only path not served locally (${why}): ${short(url)}` };
    }
    return { severity: 'error', check: 'failed-request', message: `same-origin request failed (${why}): ${short(url)}` };
  }

  const seen = new Set();
  return out.filter(Boolean).filter(f => {
    const key = `${f.check}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// interviews.html
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function auditInterviews(ctx, vp, add) {
  const { cdp, base, out, data, seed } = ctx;
  // Record each check that actually ran, so a silent skip is visible.
  const ran = check => { (ctx.ran[check] ||= []).push(vp.name); };
  const url = `${base}/interviews.html`;
  const shot = async (tab, check) => {
    const file = `interviews-${vp.name}-${check}.png`;
    try { await tab.screenshot(path.join(out, file)); return file; } catch { return undefined; }
  };

  const withTab = async fn => {
    const tab = await Tab.open(cdp);
    try { await tab.emulate(vp); return await fn(tab); } finally { await tab.close(); }
  };

  // deep-link ----------------------------------------------------------------
  const firstId = data[0].id;
  ran('deep-link');
  await withTab(async tab => {
    await tab.goto(`${url}#question/${firstId}`);
    await sleep(1800); // openQuestion waits 100ms, then smooth-scrolls
    const r = await tab.eval(id => {
      const card = document.querySelector(`.interview-card[data-id="${id}"]`);
      if (!card) return { missing: true };
      const fixedBottom = Math.max(0, ...['nav', '.sub-tabs'].map(s => document.querySelector(s))
        .filter(Boolean).filter(el => getComputedStyle(el).position === 'fixed')
        .map(el => el.getBoundingClientRect().bottom));
      const rect = card.getBoundingClientRect();
      return {
        open: card.classList.contains('open'), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        fixedBottom: Math.round(fixedBottom), innerHeight: window.innerHeight,
        opacity: Number(getComputedStyle(card).opacity), scrollY: Math.round(window.scrollY)
      };
    }, firstId);
    if (r.missing) {
      add({ severity: 'error', check: 'deep-link', message: `#question/${firstId}: card not rendered`, selector: `.interview-card[data-id="${firstId}"]` });
    } else {
      const problems = [];
      if (!r.open) problems.push('card is not open');
      if (r.top < r.fixedBottom - 1) problems.push(`card top (${r.top}px) is hidden under the fixed header (bottom ${r.fixedBottom}px)`);
      if (r.top >= r.innerHeight) problems.push(`card top (${r.top}px) is below the viewport (${r.innerHeight}px)`);
      if (r.opacity < 0.5) problems.push(`card is still transparent (opacity ${r.opacity})`);
      if (problems.length) {
        add({
          severity: 'error', check: 'deep-link', message: `#question/${firstId}: ${problems.join('; ')}`,
          selector: `.interview-card[data-id="${firstId}"]`, details: r, screenshot: await shot(tab, 'deep-link')
        });
      }
    }
  });

  // category-filter (filter logic is viewport independent: run once) --------
  if (vp.name === '1280x800') {
    ran('category-filter');
    const expected = { 'deep-dives': data.filter(q => q.deepDive).length, ITSM: data.filter(q => q.category === 'ITSM').length };
    for (const [cat, want] of Object.entries(expected)) {
      await withTab(async tab => {
        await tab.goto(`${url}#category/${encodeURIComponent(cat)}`);
        const r = await tab.eval(() => ({
          text: document.getElementById('ivActiveCount')?.textContent || '',
          cards: document.querySelectorAll('.interview-card').length
        }));
        const shown = parseInt(r.text, 10);
        if (shown !== want || r.cards !== want) {
          add({
            severity: 'error', check: 'category-filter',
            message: `#category/${cat}: expected ${want}, #ivActiveCount says "${r.text}" and ${r.cards} cards render`,
            selector: '#ivActiveCount'
          });
        }
      });
    }
  }

  await withTab(async tab => {
    await tab.goto(url);

    // card-overflow ----------------------------------------------------------
    ran('card-overflow');
    const r = await tab.eval(() => {
      const bad = [];
      const list = document.getElementById('interviewList') || document.querySelector('.interview-card')?.parentElement;
      for (const card of document.querySelectorAll('.interview-card')) {
        const cr = card.getBoundingClientRect();
        const parentW = card.parentElement.clientWidth;
        let reason = null;
        if (cr.width > parentW + 1) reason = `card ${Math.round(cr.width)}px wide in a ${parentW}px container`;
        else {
          // Content wider than the card is clipped by its overflow:hidden,
          // unless a horizontally scrollable box (pre, table) wraps it.
          const offenders = [];
          for (const el of card.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= cr.right + 1) continue;
            let scroller = false;
            for (let p = el.parentElement; p && p !== card; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll') { scroller = true; break; }
            }
            if (scroller || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) continue;
            offenders.push({ el, right: r.right, width: r.width });
          }
          // The cause is among the widest offenders: skip wrappers that merely
          // contain another widest one, and prefer intrinsically wide content.
          const maxW = Math.max(0, ...offenders.map(o => o.width));
          const widest = offenders.filter(o => o.width >= maxW - 1);
          const leaves = widest.filter(o => !widest.some(x => x !== o && o.el.contains(x.el)));
          const worst = leaves.find(o => /^(PRE|CODE|TABLE|IMG|svg|VIDEO|IFRAME)$/.test(o.el.tagName)) || leaves[0] || null;
          if (worst) {
            const el = worst.el;
            const tag = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/)[0] : '');
            const where = el.closest('.interview-header') ? 'question header' : 'answer';
            reason = `${tag} in the ${where} overflows the card by ${Math.round(worst.right - cr.right)}px: "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
          }
        }
        if (reason) bad.push({ id: card.dataset.id, reason });
      }
      return { total: document.querySelectorAll('.interview-card').length, listWidth: list?.clientWidth, bad };
    });
    if (r.bad.length) {
      add({
        severity: 'error', check: 'card-overflow',
        message: `${r.bad.length} of ${r.total} cards have content wider than the card (clipped)`,
        selector: `.interview-card[data-id="${r.bad[0].id}"]`, details: { elements: r.bad.slice(0, 5) }
      });
    }

    // card-reveal: cards fade in on scroll; a stagger that grows with the
    // card's index leaves cards far down the list blank when scrolled to.
    if (vp.name === '390x844') {
      ran('card-reveal');
      const reveal = await tab.eval(async () => {
        const cards = [...document.querySelectorAll('.interview-card')];
        const card = cards[Math.min(40, cards.length - 1)];
        if (!card) return null;
        card.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise(r => setTimeout(r, 1500));
        const cs = getComputedStyle(card);
        return { id: card.dataset.id, index: cards.indexOf(card), opacity: Number(cs.opacity), delay: cs.transitionDelay };
      });
      if (reveal && reveal.opacity < 0.5) {
        add({
          severity: 'error', check: 'card-reveal',
          message: `card #${reveal.index + 1} is still invisible (opacity ${reveal.opacity}) 1.5s after scrolling to it; transition-delay ${reveal.delay}`,
          selector: `.interview-card[data-id="${reveal.id}"]`, details: reveal
        });
      }
    }

    // answer-render (rendering is viewport independent: run at 390 only) -----
    if (vp.name === '390x844') {
      ran('answer-render');
      const rnd = mulberry32(seed);
      const ids = [];
      const pool = data.map(q => q.id);
      while (ids.length < Math.min(3, pool.length)) {
        const id = pool[Math.floor(rnd() * pool.length)];
        if (!ids.includes(id)) ids.push(id);
      }
      for (const id of ids) {
        const res = await tab.eval(async id => {
          const card = document.querySelector(`.interview-card[data-id="${id}"]`);
          if (!card) return { missing: true };
          card.scrollIntoView({ block: 'start', behavior: 'instant' });
          card.querySelector('.interview-header').click();
          await new Promise(r => setTimeout(r, 700));
          const answer = card.querySelector('.interview-answer-inner') || card.querySelector('.interview-answer');
          const clone = answer.cloneNode(true);
          clone.querySelectorAll('pre, code').forEach(n => n.remove());
          const prose = clone.textContent;
          const lines = [...answer.querySelectorAll('p, li, div')]
            .filter(n => !n.closest('pre'))
            .flatMap(n => [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent));
          return {
            open: card.classList.contains('open'),
            h4: !!answer.querySelector('h4'),
            fence: prose.includes('```'),
            bold: prose.includes('**'),
            dash: lines.some(t => /^\s*-\s/.test(t)),
            height: Math.round(answer.getBoundingClientRect().height)
          };
        }, id);
        if (res.missing) { add({ severity: 'error', check: 'answer-render', message: `card ${id} not rendered`, selector: `.interview-card[data-id="${id}"]` }); continue; }
        const problems = [];
        if (!res.open) problems.push('card did not open on click');
        if (res.open && res.height < 20) problems.push(`answer did not expand (${res.height}px)`);
        if (!res.h4) problems.push('answer has no <h4>');
        if (res.fence) problems.push('literal ``` in answer');
        if (res.bold) problems.push('literal ** in answer');
        if (res.dash) problems.push('line starting with "- " (unrendered markdown list)');
        if (problems.length) {
          add({ severity: 'error', check: 'answer-render', message: `question ${id}: ${problems.join('; ')}`, selector: `.interview-card[data-id="${id}"]`, details: { seed } });
        }
      }
    }
  });

  // mobile-sidebar -----------------------------------------------------------
  if (vp.name === '390x844') {
    ran('mobile-sidebar');
    await withTab(async tab => {
      await tab.goto(url);
      const toggle = await tab.eval(() => {
        const t = document.getElementById('ivMobileToggle');
        if (!t) return null;
        t.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = t.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, visible: r.width > 0 && r.height > 0, hitOk: !!hit && t.contains(hit), hit: hit ? hit.tagName.toLowerCase() + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') : null };
      });
      const fail = async message => add({ severity: 'error', check: 'mobile-sidebar', message, selector: '#ivSidebar', screenshot: await shot(tab, 'mobile-sidebar') });
      if (!toggle || !toggle.visible) return fail('#ivMobileToggle is missing or hidden at 390px');
      if (!toggle.hitOk) return fail(`#ivMobileToggle is covered by ${toggle.hit}`);
      await tab.click(toggle.x, toggle.y);
      await sleep(500);
      const open = await tab.eval(() => {
        const s = document.getElementById('ivSidebar');
        const r = s.getBoundingClientRect();
        const shown = s.checkVisibility() && r.width > 0 && r.height > 0;
        const scrollable = s.scrollHeight > s.clientHeight + 1;
        let scrolls = null;
        if (scrollable) { s.scrollTop = s.scrollHeight; scrolls = s.scrollTop > 0; s.scrollTop = 0; }
        return {
          shown, scrollable, scrolls, bottom: Math.round(r.bottom), right: Math.round(r.right),
          innerHeight: window.innerHeight, contentHeight: s.scrollHeight
        };
      });
      if (!open.shown) return fail('clicking #ivMobileToggle did not show the sidebar');
      if (open.scrollable && !open.scrolls) await fail('sidebar content is taller than its box but does not scroll');
      if (!open.scrollable && open.bottom > open.innerHeight + 1) await fail(`sidebar extends below the viewport (${open.bottom}px > ${open.innerHeight}px) and cannot scroll`);
      // Close by tapping the overlay to the right of the drawer.
      await tab.click(Math.min(open.right + 40, 380), 500);
      await sleep(500);
      const closed = await tab.eval(() => {
        const s = document.getElementById('ivSidebar');
        const before = window.scrollY;
        window.scrollTo({ top: before + 400, behavior: 'instant' });
        const moved = window.scrollY !== before;
        return {
          hidden: !s.checkVisibility() || s.getBoundingClientRect().width === 0,
          moved,
          bodyOverflow: getComputedStyle(document.body).overflowY
        };
      });
      if (!closed.hidden) await fail('tapping outside the open sidebar did not close it');
      if (!closed.moved) await fail(`page does not scroll after closing the sidebar (body overflow-y: ${closed.bodyOverflow})`);
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function writeReports(out, meta, findings) {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...meta, findings }, null, 2));

  const checks = [...new Set(findings.map(f => f.check))].sort();
  const count = (check, sev) => findings.filter(f => f.check === check && f.severity === sev).length;
  const errors = findings.filter(f => f.severity === 'error').length;
  const md = [];
  md.push('# Site UX audit', '');
  md.push(`${meta.startedAt} | ${meta.pages.length} pages x ${meta.viewports.length} viewports | ${meta.durationSec}s | ` +
    `**${errors} errors, ${findings.length - errors} warnings**`, '');
  if (meta.auditFailures.length) md.push(`Audit could not complete: ${meta.auditFailures.join('; ')}`, '');
  const ranList = Object.entries(meta.interviewChecksRun || {});
  if (ranList.length) {
    md.push(`interviews.html checks run: ${ranList.map(([c, v]) => `${c} (${v.join(', ')})`).join('; ')}`, '');
  }
  md.push('| Check | Errors | Warnings |', '|---|---:|---:|');
  for (const c of checks) md.push(`| ${c} | ${count(c, 'error')} | ${count(c, 'warn')} |`);
  md.push('');

  // Group by page, worst first; identical findings across viewports collapse
  // into one line.
  const pages = [...new Set(findings.map(f => f.page))];
  const score = p => findings.filter(f => f.page === p).reduce((s, f) => s + (f.severity === 'error' ? 1000 : 1), 0);
  pages.sort((a, b) => score(b) - score(a));
  const LIMIT = 20;
  for (const page of pages) {
    const pf = findings.filter(f => f.page === page);
    const groups = new Map();
    for (const f of pf) {
      const key = [f.severity, f.check, f.message.replace(/\d+px/g, 'Npx').replace(/\d+ (tap|element|<img>)/, 'N $1'), f.selector].join('|');
      if (!groups.has(key)) groups.set(key, { ...f, viewports: [] });
      groups.get(key).viewports.push(f.viewport);
    }
    const rows = [...groups.values()].sort((a, b) => (a.severity === b.severity ? a.check.localeCompare(b.check) : a.severity === 'error' ? -1 : 1));
    const e = pf.filter(f => f.severity === 'error').length;
    md.push(`## ${page} (${e} errors, ${pf.length - e} warnings)`, '');
    for (const g of rows.slice(0, LIMIT)) {
      const el = g.details?.elements?.[0];
      const extra = g.check === 'horizontal-overflow' && el
        ? ` (widest: \`${el.selector}\` +${el.overflowPx}px${el.cause ? `, cause \`${el.cause}\`` : ''})`
        : el?.reason ? ` (first: card ${el.id}, ${el.reason})` : '';
      md.push(`- **${g.severity}** \`${g.check}\` [${g.viewports.join(', ')}] ${g.message}` +
        `${g.selector ? ` - \`${g.selector}\`` : ''}${extra}${g.screenshot ? ` - ${g.screenshot}` : ''}`);
    }
    if (rows.length > LIMIT) md.push(`- ... ${rows.length - LIMIT} more in report.json`);
    md.push('');
  }
  if (!findings.length) md.push('No findings.');
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  const pages = listPages(opts.pages);
  fs.mkdirSync(opts.out, { recursive: true });
  for (const f of fs.readdirSync(opts.out)) if (f.endsWith('.png')) fs.rmSync(path.join(opts.out, f));

  let server, chrome, cdp;
  const cleanup = () => {
    try { cdp?.ws.close(); } catch { /* closed */ }
    if (chrome?.proc && chrome.proc.exitCode === null) { try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ } }
    try { server?.close(); server?.closeAllConnections?.(); } catch { /* closed */ }
    if (chrome?.userDataDir) {
      // Chrome may still be flushing its profile for a moment after the kill.
      for (let i = 0; i < 5; i++) {
        try { fs.rmSync(chrome.userDataDir, { recursive: true, force: true }); break; } catch { /* retry */ }
      }
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { cleanup(); process.exit(130); });
  process.once('exit', cleanup);

  const findings = [];
  const auditFailures = [];
  let ctx = { ran: {} };
  try {
    server = await startServer();
    const base = `http://127.0.0.1:${server.address().port}`;
    chrome = launchChrome(findChrome());
    cdp = await CDP.connect(await chrome.wsUrl);

    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'interviews.json'), 'utf8'));
    ctx = { cdp, base, out: opts.out, data, seed: opts.seed, ran: {} };

    for (const page of pages) {
      const pageStart = Date.now();
      for (const [vi, vp] of VIEWPORTS.entries()) {
        const add = f => findings.push({ page, viewport: vp.name, ...f });
        let tab;
        const run = async () => {
          tab = await Tab.open(cdp);
          await tab.emulate(vp);
          await tab.goto(`${base}/${page}`);
          const inPage = await tab.eval(pageChecks, { mobile: vp.mobile, domChecks: vi === 0 });
          const runtime = runtimeFindings(tab.events, base);
          const all = [...runtime, ...inPage];
          all.forEach(add);
          if (all.some(f => f.severity === 'error')) {
            const file = `${page.replace(/\.html$/, '')}-${vp.name}.png`;
            await tab.eval(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await tab.screenshot(path.join(opts.out, file));
            for (const f of all) if (f.severity === 'error') f.screenshot = file;
          }
        };
        try {
          await withTimeout(run(), opts.timeout, `${page} @ ${vp.name}`);
        } catch (err) {
          add({ severity: 'error', check: 'audit-failure', message: err.message.slice(0, 300) });
          auditFailures.push(`${page} @ ${vp.name}: ${err.message.split('\n')[0]}`);
        } finally {
          if (tab) await tab.close();
        }

        if (page === 'interviews.html') {
          try {
            await withTimeout(auditInterviews(ctx, vp, add), opts.timeout, `interviews checks @ ${vp.name}`);
          } catch (err) {
            add({ severity: 'error', check: 'audit-failure', message: `interviews checks: ${err.message.slice(0, 300)}` });
            auditFailures.push(`interviews checks @ ${vp.name}: ${err.message.split('\n')[0]}`);
          }
        }
      }
      const pf = findings.filter(f => f.page === page);
      const e = pf.filter(f => f.severity === 'error').length;
      console.log(`${page.padEnd(28)} ${String(e).padStart(3)} errors ${String(pf.length - e).padStart(3)} warnings  ${((Date.now() - pageStart) / 1000).toFixed(1)}s`);
    }
  } catch (err) {
    auditFailures.push(err.message.split('\n')[0]);
    console.error(`Audit aborted: ${err.message}`);
  } finally {
    cleanup();
  }

  const meta = {
    startedAt: new Date(started).toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    seed: opts.seed,
    pages,
    viewports: VIEWPORTS.map(v => v.name),
    auditFailures,
    interviewChecksRun: ctx.ran,
    summary: {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warn').length
    }
  };
  writeReports(opts.out, meta, findings);
  console.log(`\n${meta.summary.errors} errors, ${meta.summary.warnings} warnings in ${meta.durationSec}s -> ${path.join(opts.out, 'report.md')}`);

  if (!findings.length && auditFailures.length) process.exit(2);
  if (opts.strict && meta.summary.errors > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error(err.message);
  process.exit(2);
});
