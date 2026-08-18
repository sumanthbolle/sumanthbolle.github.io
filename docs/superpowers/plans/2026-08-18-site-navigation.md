# Site Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat site navigation with reliable Learn and Tools disclosures across 13 pages while proving that no page content or primary behavior changes.

**Architecture:** Keep the existing static HTML architecture and shared asset filenames. Add a dependency-free navigation contract validator, refactor the shared disclosure controller into a browser-auto-initializing CommonJS-compatible module, update only primary desktop/mobile navigation regions, and finish with source-boundary plus live browser regression checks.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js 24 built-in `node:test`, Git, and local browser verification.

**Spec:** `docs/superpowers/specs/2026-08-18-site-navigation-design.md`

## Global Constraints

- Change only primary desktop/mobile navigation markup, `assets/css/nav-utilities.css`, `assets/js/shared/nav-utilities.js`, and navigation-specific test/validation scripts.
- Do not modify page bodies, metadata, structured data, APIs, storage, service workers, workflows, data files, or page-specific CSS/JavaScript.
- Keep every existing public URL.
- Desktop destinations are exactly `Learn · Tools · Summaverick · About`; the brand remains Home.
- Learn contains exactly ServiceNow Central, Articles & Tutorials, Interview Prep, and UPSC Today.
- Tools contains exactly SkyFare, Metals, and Save Yourself.
- Existing product labels remain unchanged in this release.
- Mobile navigation exposes all destinations without nested mobile disclosures.
- Disclosure triggers are at least 44 CSS px high and work by click, accurate hover, keyboard, and touch.
- Pointer exit uses a 180 ms close delay; re-entry cancels it.
- No `role="menu"` or `role="menuitem"` semantics.
- All 13 pages must retain their current primary behavior, and homepage dynamic sections must still populate.
- The completed HTML must match the branch base after navigation regions are removed.

## File structure

### Create

- `scripts/lib/site-navigation-contract.mjs` — canonical page/group definitions, navigation extraction, structural validation, and outside-navigation comparison.
- `scripts/tests/site-navigation-contract.test.mjs` — unit tests for structure and change-boundary helpers.
- `scripts/tests/nav-utilities.test.cjs` — dependency-free interaction tests for the shared disclosure controller.
- `scripts/validate-site-navigation.mjs` — repository CLI that validates all pages and compares HTML outside navigation against the merge base.

### Modify

- `assets/js/shared/nav-utilities.js` — testable Learn/Tools disclosure behavior and the Summaverick-only compact mobile site menu.
- `assets/css/nav-utilities.css` — continuous hit region, 44 px triggers, focus/fallback behavior, two-panel styling, and Summaverick compact mobile site menu.
- `index.html`
- `servicenow.html`
- `blog.html`
- `interviews.html`
- `tutorials.html`
- `quiz.html`
- `technical-terms-quiz.html`
- `upsc.html`
- `upsc-patterns.html`
- `flights.html`
- `metals.html`
- `save-yourself.html`
- `summaverick.html`

### Do not modify

- Any other HTML, CSS, JavaScript, JSON, workflow, worker, API, or generated-content file.

---

### Task 1: Build the navigation contract and source-boundary guard

**Files:**

- Create: `scripts/lib/site-navigation-contract.mjs`
- Create: `scripts/tests/site-navigation-contract.test.mjs`
- Create: `scripts/validate-site-navigation.mjs`

**Interfaces:**

- Produces: `PAGE_GROUPS: Record<string, "learn" | "tools" | "summaverick" | "none">`
- Produces: `extractPrimaryNavigation(html: string): string`
- Produces: `extractMobileNavigation(html: string): string`
- Produces: `stripNavigation(html: string): string`
- Produces: `validateNavigation(file: string, html: string): string[]`
- Produces: `compareOutsideNavigation(baseHtml: string, candidateHtml: string): boolean`
- Produces CLI: `node scripts/validate-site-navigation.mjs --base <git-ref>` exits `0` on success and `1` with page-specific errors on failure.
- Consumes: no prior task.

- [ ] **Step 1: Write failing unit tests for navigation extraction, the canonical item sets, active groups, forbidden legacy entries, and outside-navigation comparison**

Create `scripts/tests/site-navigation-contract.test.mjs` with these complete cases:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPrimaryNavigation,
  extractMobileNavigation,
  stripNavigation,
  validateNavigation,
  compareOutsideNavigation
} from '../lib/site-navigation-contract.mjs';

const learn = `
<li class="nav-drop" data-nav-drop data-nav-group="learn">
  <button class="nav-drop__btn active" aria-expanded="false" aria-controls="navLearn">Learn</button>
  <div class="nav-drop__menu" id="navLearn" data-nav-panel="learn">
    <a href="servicenow.html" aria-current="page">ServiceNow Central</a>
    <a href="blog.html">Articles &amp; Tutorials</a>
    <a href="interviews.html">Interview Prep</a>
    <a href="upsc.html">UPSC Today</a>
  </div>
</li>`;

const tools = `
<li class="nav-drop" data-nav-drop data-nav-group="tools">
  <button class="nav-drop__btn" aria-expanded="false" aria-controls="navTools">Tools</button>
  <div class="nav-drop__menu" id="navTools" data-nav-panel="tools">
    <a href="flights.html">SkyFare</a>
    <a href="metals.html">Metals</a>
    <a href="save-yourself.html">Save Yourself</a>
  </div>
</li>`;

const desktop = `<nav aria-label="Primary"><a class="nav-logo" href="index.html">Sumanth Bolle</a><ul class="nav-links">${learn}${tools}<li><a data-nav-link="summaverick" href="summaverick.html">Summaverick</a></li><li><a data-nav-link="about" href="index.html#about">About</a></li></ul><div class="mobile-menu" data-mobile-nav><a href="index.html">Home</a><span data-mobile-group="learn">Learn</span><a href="servicenow.html">ServiceNow Central</a><a href="blog.html">Articles &amp; Tutorials</a><a href="interviews.html">Interview Prep</a><a href="upsc.html">UPSC Today</a><span data-mobile-group="tools">Tools</span><a href="flights.html">SkyFare</a><a href="metals.html">Metals</a><a href="save-yourself.html">Save Yourself</a><a href="summaverick.html">Summaverick</a><a href="index.html#about">About</a></div></nav>`;
const validPage = `<html><body>${desktop}<main id="unchanged">Content</main></body></html>`;

test('extracts primary and mobile navigation', () => {
  assert.match(extractPrimaryNavigation(validPage), /data-nav-group="learn"/);
  assert.match(extractMobileNavigation(validPage), /data-mobile-group="tools"/);
});

test('accepts the exact ServiceNow Learn navigation', () => {
  assert.deepEqual(validateNavigation('servicenow.html', validPage), []);
});

test('rejects legacy global entries and menu roles', () => {
  const invalid = validPage.replace('UPSC Today', 'Anchor').replace('data-nav-panel="tools"', 'data-nav-panel="tools" role="menu"');
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /legacy|role="menu"/i);
});

test('rejects a missing Learn destination', () => {
  const invalid = validPage.replace('<a href="interviews.html">Interview Prep</a>', '');
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /Interview Prep/);
});

test('detects changes outside navigation', () => {
  const changedNav = validPage.replace('Tools</button>', 'Toolbox</button>');
  const changedBody = validPage.replace('Content', 'Changed content');
  assert.equal(compareOutsideNavigation(validPage, changedNav), true);
  assert.equal(compareOutsideNavigation(validPage, changedBody), false);
  assert.equal(stripNavigation(validPage), stripNavigation(changedNav));
});
```

- [ ] **Step 2: Run the contract tests and verify they fail because the module does not exist**

Run:

```bash
node --test scripts/tests/site-navigation-contract.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/site-navigation-contract.mjs`.

- [ ] **Step 3: Implement the contract helpers and canonical definitions**

Create `scripts/lib/site-navigation-contract.mjs` with these constants and public behavior:

```js
export const PAGE_GROUPS = Object.freeze({
  'index.html': 'none',
  'servicenow.html': 'learn',
  'blog.html': 'learn',
  'interviews.html': 'learn',
  'tutorials.html': 'learn',
  'quiz.html': 'learn',
  'technical-terms-quiz.html': 'learn',
  'upsc.html': 'learn',
  'upsc-patterns.html': 'learn',
  'flights.html': 'tools',
  'metals.html': 'tools',
  'save-yourself.html': 'tools',
  'summaverick.html': 'summaverick'
});

export const LEARN_LINKS = Object.freeze([
  ['servicenow.html', 'ServiceNow Central'],
  ['blog.html', 'Articles & Tutorials'],
  ['interviews.html', 'Interview Prep'],
  ['upsc.html', 'UPSC Today']
]);

export const TOOL_LINKS = Object.freeze([
  ['flights.html', 'SkyFare'],
  ['metals.html', 'Metals'],
  ['save-yourself.html', 'Save Yourself']
]);

function firstMatch(html, expression, label) {
  const match = html.match(expression);
  if (!match) throw new Error(`Missing ${label}`);
  return match[0];
}

export function extractPrimaryNavigation(html) {
  return firstMatch(html, /<nav\b[\s\S]*?<\/nav>/i, 'primary navigation');
}

export function extractMobileNavigation(html) {
  return firstMatch(html, /<div\b[^>]*(?:data-mobile-nav|class="[^"]*\bmobile-menu\b[^"]*")[^>]*>[\s\S]*?<\/div>/i, 'mobile navigation');
}

export function stripNavigation(html) {
  let value = html.replace(/<nav\b[\s\S]*?<\/nav>/i, '\n<!-- PRIMARY_NAV -->\n');
  value = value.replace(/<div\b[^>]*(?:data-mobile-nav|class="[^"]*\bmobile-menu\b[^"]*")[^>]*>[\s\S]*?<\/div>/i, '\n<!-- MOBILE_NAV -->\n');
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\s*<!-- PRIMARY_NAV -->\s*/g, '\n<!-- PRIMARY_NAV -->\n')
    .replace(/\s*<!-- MOBILE_NAV -->\s*/g, '\n<!-- MOBILE_NAV -->\n');
}

function count(source, expression) {
  return (source.match(expression) || []).length;
}

function requireLink(errors, source, [href, label], region) {
  if (!source.includes(`href="${href}"`) || (!source.includes(label.replace('&', '&amp;')) && !source.includes(label))) {
    errors.push(`${region} is missing ${label} (${href})`);
  }
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return startIndex >= 0 && endIndex > startIndex ? source.slice(startIndex, endIndex) : '';
}

function hrefs(source) {
  return Array.from(source.matchAll(/<a\b[^>]*href="([^"]+)"/g), match => match[1]);
}

function requireExactHrefs(errors, source, expected, region) {
  const actual = hrefs(source);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${region} links must be ${expected.join(', ')}; received ${actual.join(', ')}`);
  }
}

export function validateNavigation(file, html) {
  const errors = [];
  let primary = '';
  let mobile = '';
  try { primary = extractPrimaryNavigation(html); } catch (error) { errors.push(error.message); }
  try { mobile = extractMobileNavigation(html); } catch (error) { errors.push(error.message); }
  if (!primary || !mobile) return errors;

  if (count(primary, /data-nav-group="learn"/g) !== 1) errors.push('desktop must contain exactly one Learn disclosure');
  if (count(primary, /data-nav-group="tools"/g) !== 1) errors.push('desktop must contain exactly one Tools disclosure');
  if (count(primary, /id="navLearn"/g) !== 1 || count(primary, /aria-controls="navLearn"/g) !== 1) errors.push('navLearn id/control pair must be unique');
  if (count(primary, /id="navTools"/g) !== 1 || count(primary, /aria-controls="navTools"/g) !== 1) errors.push('navTools id/control pair must be unique');
  if (/role="menu(?:item)?"/.test(primary)) errors.push('role="menu" and role="menuitem" are forbidden');
  if (/\bUtilities\b|>Anchor<|Pattern Atlas/.test(primary + mobile)) errors.push('legacy global navigation entry found');

  const learnRegion = between(primary, 'data-nav-group="learn"', 'data-nav-group="tools"');
  const toolsRegion = between(primary, 'data-nav-group="tools"', 'data-nav-link="summaverick"');
  const mobileLearnRegion = between(mobile, 'data-mobile-group="learn"', 'data-mobile-group="tools"');
  const mobileToolsRegion = between(mobile, 'data-mobile-group="tools"', 'href="summaverick.html"');
  for (const link of LEARN_LINKS) {
    requireLink(errors, learnRegion, link, 'desktop Learn');
    requireLink(errors, mobileLearnRegion, link, 'mobile Learn');
  }
  for (const link of TOOL_LINKS) {
    requireLink(errors, toolsRegion, link, 'desktop Tools');
    requireLink(errors, mobileToolsRegion, link, 'mobile Tools');
  }
  requireExactHrefs(errors, learnRegion, LEARN_LINKS.map(link => link[0]), 'desktop Learn');
  requireExactHrefs(errors, toolsRegion, TOOL_LINKS.map(link => link[0]), 'desktop Tools');
  requireExactHrefs(errors, mobileLearnRegion, LEARN_LINKS.map(link => link[0]), 'mobile Learn');
  requireExactHrefs(errors, mobileToolsRegion, TOOL_LINKS.map(link => link[0]), 'mobile Tools');
  if (!primary.includes('data-nav-link="summaverick"')) errors.push('desktop Summaverick link is missing');
  if (!primary.includes('data-nav-link="about"')) errors.push('desktop About link is missing');
  if (!mobile.includes('data-mobile-group="learn"') || !mobile.includes('data-mobile-group="tools"')) errors.push('mobile group labels are missing');

  const activeGroup = PAGE_GROUPS[file];
  if (activeGroup === 'learn' && !/nav-drop__btn active/.test(learnRegion)) errors.push('Learn parent must be active');
  if (activeGroup === 'tools' && !/nav-drop__btn active/.test(toolsRegion)) errors.push('Tools parent must be active');
  if (activeGroup === 'summaverick' && !/data-nav-link="summaverick"[^>]*aria-current="page"/.test(primary)) errors.push('Summaverick must be current');
  return errors;
}

export function compareOutsideNavigation(baseHtml, candidateHtml) {
  return stripNavigation(baseHtml) === stripNavigation(candidateHtml);
}
```

- [ ] **Step 4: Add the repository validation CLI**

Create `scripts/validate-site-navigation.mjs`:

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PAGE_GROUPS, validateNavigation, compareOutsideNavigation } from './lib/site-navigation-contract.mjs';

const root = process.cwd();
const baseIndex = process.argv.indexOf('--base');
const baseRef = baseIndex >= 0 ? process.argv[baseIndex + 1] : execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
const failures = [];

for (const file of Object.keys(PAGE_GROUPS)) {
  const candidate = fs.readFileSync(path.join(root, file), 'utf8');
  for (const message of validateNavigation(file, candidate)) failures.push(`${file}: ${message}`);
  const base = execFileSync('git', ['show', `${baseRef}:${file}`], { cwd: root, encoding: 'utf8' });
  if (!compareOutsideNavigation(base, candidate)) failures.push(`${file}: content changed outside primary/mobile navigation`);
  for (const asset of ['assets/css/nav-utilities.css', 'assets/js/shared/nav-utilities.js']) {
    if ((candidate.match(new RegExp(asset.replaceAll('/', '\\/'), 'g')) || []).length !== 1) failures.push(`${file}: ${asset} must be included exactly once`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Navigation contract passed for ${Object.keys(PAGE_GROUPS).length} pages against ${baseRef}.`);
```

- [ ] **Step 5: Run unit tests and verify the helper tests pass**

Run:

```bash
node --test scripts/tests/site-navigation-contract.test.mjs
```

Expected: 5 tests PASS.

- [ ] **Step 6: Run the repository validator and verify the current navigation fails for the expected reasons**

Run:

```bash
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
```

Expected: FAIL on all current pages with missing Learn/Tools contracts and legacy Utilities/Anchor/Pattern Atlas entries. It must not report outside-navigation changes before HTML is edited.

- [ ] **Step 7: Commit the contract harness**

```bash
git add scripts/lib/site-navigation-contract.mjs scripts/tests/site-navigation-contract.test.mjs scripts/validate-site-navigation.mjs
git commit -m "test: define site navigation contract"
```

---

### Task 2: Refactor and test the shared disclosure controller

**Files:**

- Create: `scripts/tests/nav-utilities.test.cjs`
- Modify: `assets/js/shared/nav-utilities.js`
- Modify: `assets/css/nav-utilities.css`

**Interfaces:**

- Consumes markup: `[data-nav-drop]`, `.nav-drop__btn`, `.nav-drop__menu`.
- Consumes optional Summaverick markup: `[data-site-menu-toggle]`, `[data-site-mobile-menu]`.
- Produces CommonJS/browser API: `{ CLOSE_DELAY: 180, init(document, runtime): Controller }`.
- Produces controller: `{ open(drop), close(drop), destroy() }`.
- Produces CSS contract: `.open`, `.site-mobile-menu.open`, 44 px triggers, continuous trigger-to-panel hit area.

- [ ] **Step 1: Write failing dependency-free interaction tests**

Create `scripts/tests/nav-utilities.test.cjs` with this dependency-free event/DOM fake followed by the test bodies:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { init, CLOSE_DELAY } = require('../../assets/js/shared/nav-utilities.js');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.childrenBySelector = new Map();
    this.descendants = new Set();
    this.focused = false;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    if (this.listeners.has(type)) this.listeners.get(type).delete(handler);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  querySelector(selector) { return this.childrenBySelector.get(selector) || null; }
  querySelectorAll(selector) { return this.childrenBySelector.get(selector) || []; }
  contains(target) { return target === this || this.descendants.has(target); }
  focus() { this.focused = true; }
  dispatch(type, event = {}) {
    if (!event.target) event.target = this;
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

function createDrop() {
  const root = new FakeTarget();
  const button = new FakeTarget();
  const panel = new FakeTarget();
  root.childrenBySelector.set('.nav-drop__btn', button);
  root.childrenBySelector.set('.nav-drop__menu', panel);
  root.descendants.add(button);
  root.descendants.add(panel);
  return { root, button, panel };
}

function createEnvironment(count, withSiteMenu = false) {
  const drops = Array.from({ length: count }, createDrop);
  const document = new FakeTarget();
  const siteTrigger = withSiteMenu ? new FakeTarget() : null;
  const sitePanel = withSiteMenu ? new FakeTarget() : null;
  document.querySelectorAll = selector => selector === '[data-nav-drop]' ? drops.map(drop => drop.root) : [];
  document.querySelector = selector => {
    if (selector === '[data-site-menu-toggle]') return siteTrigger;
    if (selector === '[data-site-mobile-menu]') return sitePanel;
    return null;
  };
  const env = { drops, document, siteTrigger, sitePanel, pending: null };
  let timerId = 0;
  env.runtime = {
    matchMedia: () => ({ matches: true }),
    setTimeout(fn, delay) {
      env.pending = { id: ++timerId, fn, delay };
      return timerId;
    },
    clearTimeout(id) {
      if (env.pending && env.pending.id === id) env.pending = null;
    }
  };
  return env;
}

test('click opens one disclosure and closes the other', () => {
  const env = createEnvironment(2);
  init(env.document, env.runtime);
  env.drops[0].button.dispatch('click', { preventDefault() {} });
  assert.equal(env.drops[0].root.classList.contains('open'), true);
  env.drops[1].button.dispatch('click', { preventDefault() {} });
  assert.equal(env.drops[0].root.classList.contains('open'), false);
  assert.equal(env.drops[1].root.classList.contains('open'), true);
});

test('pointer exit waits 180ms and re-entry cancels closure', () => {
  const env = createEnvironment(1);
  init(env.document, env.runtime);
  env.drops[0].root.dispatch('pointerenter');
  env.drops[0].root.dispatch('pointerleave');
  assert.equal(env.pending.delay, CLOSE_DELAY);
  env.drops[0].root.dispatch('pointerenter');
  assert.equal(env.pending, null);
  assert.equal(env.drops[0].root.classList.contains('open'), true);
});

test('Escape closes and restores trigger focus', () => {
  const env = createEnvironment(1);
  init(env.document, env.runtime);
  env.drops[0].button.dispatch('click', { preventDefault() {} });
  env.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(env.drops[0].root.classList.contains('open'), false);
  assert.equal(env.drops[0].button.focused, true);
});

test('outside click closes all disclosures', () => {
  const env = createEnvironment(1);
  init(env.document, env.runtime);
  env.drops[0].button.dispatch('click', { preventDefault() {} });
  env.document.dispatch('click', { target: new FakeTarget() });
  assert.equal(env.drops[0].root.classList.contains('open'), false);
});

test('missing markup initializes without throwing', () => {
  const env = createEnvironment(0);
  assert.doesNotThrow(() => init(env.document, env.runtime));
});

test('optional site mobile menu toggles and Escape restores focus', () => {
  const env = createEnvironment(0, true);
  init(env.document, env.runtime);
  env.siteTrigger.dispatch('click', { preventDefault() {} });
  assert.equal(env.sitePanel.classList.contains('open'), true);
  env.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(env.sitePanel.classList.contains('open'), false);
  assert.equal(env.siteTrigger.focused, true);
});
```

Do not inspect source strings in these behavior tests.

- [ ] **Step 2: Run the interaction tests and verify the current IIFE fails to export the controller**

Run:

```bash
node --test scripts/tests/nav-utilities.test.cjs
```

Expected: FAIL because `init` and `CLOSE_DELAY` are not exported.

- [ ] **Step 3: Refactor the shared script into an auto-initializing testable module**

Use this module boundary in `assets/js/shared/nav-utilities.js`:

```js
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.init(root.document, root);
})(typeof window !== 'undefined' ? window : null, function () {
  var CLOSE_DELAY = 180;

  function init(doc, runtime) {
    runtime = runtime || {};
    var drops = Array.prototype.slice.call(doc.querySelectorAll('[data-nav-drop]'));
    var timers = new Map();
    var removers = [];
    var canHover = runtime.matchMedia && runtime.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var setTimer = runtime.setTimeout ? runtime.setTimeout.bind(runtime) : setTimeout;
    var clearTimer = runtime.clearTimeout ? runtime.clearTimeout.bind(runtime) : clearTimeout;

    function button(drop) { return drop.querySelector('.nav-drop__btn'); }
    function cancel(drop) {
      if (!timers.has(drop)) return;
      clearTimer(timers.get(drop));
      timers.delete(drop);
    }
    function close(drop) {
      cancel(drop);
      drop.classList.remove('open');
      var trigger = button(drop);
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
    function open(drop) {
      drops.forEach(function (other) { if (other !== drop) close(other); });
      cancel(drop);
      drop.classList.add('open');
      var trigger = button(drop);
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }
    function scheduleClose(drop) {
      cancel(drop);
      timers.set(drop, setTimer(function () { timers.delete(drop); close(drop); }, CLOSE_DELAY));
    }
    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      removers.push(function () { target.removeEventListener(type, handler); });
    }

    drops.forEach(function (drop) {
      var trigger = button(drop);
      if (!trigger || !drop.querySelector('.nav-drop__menu')) return;
      listen(trigger, 'click', function (event) {
        event.preventDefault();
        if (drop.classList.contains('open')) close(drop); else open(drop);
      });
      if (canHover) {
        listen(drop, 'pointerenter', function () { open(drop); });
        listen(drop, 'pointerleave', function () { scheduleClose(drop); });
      }
      listen(drop, 'focusout', function (event) {
        if (!drop.contains(event.relatedTarget)) scheduleClose(drop);
      });
    });

    listen(doc, 'click', function (event) {
      drops.forEach(function (drop) { if (!drop.contains(event.target)) close(drop); });
    });
    listen(doc, 'keydown', function (event) {
      if (event.key !== 'Escape') return;
      drops.forEach(function (drop) {
        if (!drop.classList.contains('open')) return;
        close(drop);
        var trigger = button(drop);
        if (trigger) trigger.focus();
      });
    });

    initSiteMobileMenu(doc, listen);
    return {
      open: open,
      close: close,
      destroy: function () {
        drops.forEach(close);
        removers.forEach(function (remove) { remove(); });
      }
    };
  }

  function initSiteMobileMenu(doc, listen) {
    var trigger = doc.querySelector && doc.querySelector('[data-site-menu-toggle]');
    var panel = doc.querySelector && doc.querySelector('[data-site-mobile-menu]');
    if (!trigger || !panel) return;
    function close() { panel.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); }
    listen(trigger, 'click', function (event) {
      event.preventDefault();
      var willOpen = !panel.classList.contains('open');
      close();
      if (willOpen) { panel.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
    });
    listen(doc, 'keydown', function (event) { if (event.key === 'Escape' && panel.classList.contains('open')) { close(); trigger.focus(); } });
  }

  return { CLOSE_DELAY: CLOSE_DELAY, init: init };
});
```

- [ ] **Step 4: Update shared CSS without touching page-specific styles**

In `assets/css/nav-utilities.css`:

- set `.nav-drop__btn` to `min-height: 44px`, `padding: 0 10px`, and `line-height: 1.2`;
- set `.nav-drop__menu` to `top: calc(100% - 2px)` and `margin-top: 0`;
- increase its top padding to create visual separation inside the continuous box rather than outside it;
- add `.nav-drop:hover .nav-drop__menu` and `.nav-drop:focus-within .nav-drop__menu` to the same visible-state rule as `.nav-drop.open .nav-drop__menu`;
- add `:focus-visible` outlines to triggers and menu links;
- keep reduced-motion behavior;
- add hidden-by-default `.site-menu-toggle` and `.site-mobile-menu` rules;
- at `max-width: 760px`, display `.site-menu-toggle`, position `.site-mobile-menu` below Summaverick’s top bar, and display it only when it has `.open`.

Use these exact sizing rules:

```css
.nav-drop__btn { min-height: 44px; padding: 0 10px; line-height: 1.2; }
.nav-drop__menu { top: calc(100% - 2px); margin-top: 0; padding: 12px 6px 6px; }
.nav-drop__btn:focus-visible,
.nav-drop__menu a:focus-visible { outline: 2px solid var(--nav-drop-accent, var(--blue, #0066cc)); outline-offset: 2px; }
.site-menu-toggle,
.site-mobile-menu { display: none; }
@media (max-width: 760px) {
  .site-menu-toggle {
    display: inline-flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--nav-drop-line, rgba(0, 0, 0, 0.1));
    border-radius: 10px;
    background: var(--nav-drop-bg, #fff);
    color: var(--nav-drop-fg, inherit);
    font: inherit;
  }
  .site-mobile-menu {
    position: fixed;
    top: 60px;
    right: 12px;
    left: 12px;
    z-index: 10000;
    max-height: calc(100dvh - 72px);
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--nav-drop-line, rgba(0, 0, 0, 0.1));
    border-radius: 14px;
    background: var(--nav-drop-bg, #fff);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.16);
  }
  .site-mobile-menu.open { display: block; }
  .site-mobile-menu a { display: block; min-height: 44px; padding: 12px; color: inherit; text-decoration: none; }
}
```

- [ ] **Step 5: Run the interaction tests**

Run:

```bash
node --test scripts/tests/nav-utilities.test.cjs
```

Expected: all disclosure and optional mobile-menu tests PASS.

- [ ] **Step 6: Commit the shared interaction fix**

```bash
git add assets/js/shared/nav-utilities.js assets/css/nav-utilities.css scripts/tests/nav-utilities.test.cjs
git commit -m "fix: make shared navigation reliable"
```

---

### Task 3: Replace standard-page desktop and mobile navigation only

**Files:**

- Modify: `index.html` primary `<nav>` only.
- Modify: `servicenow.html` primary `<nav>` only.
- Modify: `blog.html` primary `<nav>` only.
- Modify: `interviews.html` primary `<nav>` only.
- Modify: `tutorials.html` primary `<nav>` and its adjacent `.mobile-menu` only.
- Modify: `quiz.html` primary `<nav>` only; preserve the existing theme-toggle button unchanged.
- Modify: `technical-terms-quiz.html` primary `<nav>` only.
- Modify: `upsc.html` primary portfolio `<nav>` only; do not edit `#subjectJump`.
- Modify: `upsc-patterns.html` primary portfolio `<nav>` only.
- Modify: `flights.html` primary `<nav>` only.
- Modify: `metals.html` primary portfolio `<nav>` only.
- Modify: `save-yourself.html` primary portfolio `<nav>` only.

**Interfaces:**

- Consumes: Task 1 navigation contract.
- Consumes: Task 2 `[data-nav-drop]` controller and shared CSS.
- Produces: two desktop disclosures and a flat mobile menu on 12 standard pages.

- [ ] **Step 1: Run the repository validator and capture the expected red state**

```bash
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
```

Expected: the 12 standard pages fail the Learn/Tools contract.

- [ ] **Step 2: Replace each standard desktop destination list with the canonical navigation**

Preserve each page’s outer `<nav>`, `.nav-c`, `.nav-right`, theme-toggle, and menu-toggle wrappers. Replace only the destination list with:

```html
<ul class="nav-links">
  <li class="nav-drop" data-nav-drop data-nav-group="learn">
    <button type="button" class="nav-drop__btn" aria-expanded="false" aria-controls="navLearn">Learn<svg class="nav-drop__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="nav-drop__menu" id="navLearn" data-nav-panel="learn">
      <a href="servicenow.html"><span class="nav-drop__name">ServiceNow Central</span><span class="nav-drop__desc">Platform guides and practice</span></a>
      <a href="blog.html"><span class="nav-drop__name">Articles &amp; Tutorials</span><span class="nav-drop__desc">Technical articles and walkthroughs</span></a>
      <a href="interviews.html"><span class="nav-drop__name">Interview Prep</span><span class="nav-drop__desc">Scenario questions and explanations</span></a>
      <a href="upsc.html"><span class="nav-drop__name">UPSC Today</span><span class="nav-drop__desc">Current affairs and revision</span></a>
    </div>
  </li>
  <li class="nav-drop" data-nav-drop data-nav-group="tools">
    <button type="button" class="nav-drop__btn" aria-expanded="false" aria-controls="navTools">Tools<svg class="nav-drop__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="nav-drop__menu" id="navTools" data-nav-panel="tools">
      <a href="flights.html"><span class="nav-drop__name">SkyFare</span><span class="nav-drop__desc">Flight search and fare comparison</span></a>
      <a href="metals.html"><span class="nav-drop__name">Metals</span><span class="nav-drop__desc">Gold and silver prices</span></a>
      <a href="save-yourself.html"><span class="nav-drop__name">Save Yourself</span><span class="nav-drop__desc">Loan cost calculator</span></a>
    </div>
  </li>
  <li><a data-nav-link="summaverick" href="summaverick.html">Summaverick</a></li>
  <li><a data-nav-link="about" href="index.html#about">About</a></li>
</ul>
```

On `index.html`, use `href="#about"`. Preserve the existing theme-toggle `<li>` in `quiz.html` after About.

Add `active` to the Learn trigger on ServiceNow, Blog, Interviews, Tutorials, Quiz, Technical Terms Quiz, UPSC, and Pattern Atlas. Add `active` to the Tools trigger on SkyFare, Metals, and Save Yourself. Do not activate a parent on the homepage.

Add `aria-current="page"` only to exact disclosure destinations:

| Page | Exact current link |
|---|---|
| `servicenow.html` | ServiceNow Central |
| `blog.html` | Articles & Tutorials |
| `interviews.html` | Interview Prep |
| `upsc.html` | UPSC Today |
| `flights.html` | SkyFare |
| `metals.html` | Metals |
| `save-yourself.html` | Save Yourself |

Tutorials, both quizzes, and Pattern Atlas activate Learn but do not mark a disclosure destination current.

- [ ] **Step 3: Replace each standard mobile menu with the canonical flat order**

Preserve each menu’s existing `id="mobileMenu"` when present and add `data-mobile-nav`:

```html
<div class="mobile-menu" id="mobileMenu" data-mobile-nav>
  <a href="index.html">Home</a>
  <span class="mobile-menu__label" data-mobile-group="learn">Learn</span>
  <a class="mobile-menu__sub" href="servicenow.html">ServiceNow Central</a>
  <a class="mobile-menu__sub" href="blog.html">Articles &amp; Tutorials</a>
  <a class="mobile-menu__sub" href="interviews.html">Interview Prep</a>
  <a class="mobile-menu__sub" href="upsc.html">UPSC Today</a>
  <span class="mobile-menu__label" data-mobile-group="tools">Tools</span>
  <a class="mobile-menu__sub" href="flights.html">SkyFare</a>
  <a class="mobile-menu__sub" href="metals.html">Metals</a>
  <a class="mobile-menu__sub" href="save-yourself.html">Save Yourself</a>
  <a href="summaverick.html">Summaverick</a>
  <a href="index.html#about">About</a>
</div>
```

On the homepage, use `href="#about"`. Apply `class="active"` and `aria-current="page"` only to the seven exact destination pages listed in Step 2. Preserve Tutorials’ mobile menu outside the closing `</nav>` so its existing page script continues to find `#mobileMenu` without any script change.

- [ ] **Step 4: Run unit, interaction, repository, and whitespace checks**

```bash
node --test scripts/tests/site-navigation-contract.test.mjs scripts/tests/nav-utilities.test.cjs
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
git diff --check
```

Expected: unit/interaction tests PASS; the repository validator now fails only on `summaverick.html`; `git diff --check` is silent.

- [ ] **Step 5: Inspect the HTML diff and prove only navigation changed**

```bash
git diff -- index.html servicenow.html blog.html interviews.html tutorials.html quiz.html technical-terms-quiz.html upsc.html upsc-patterns.html flights.html metals.html save-yourself.html
```

Expected: every hunk is confined to the first primary navigation or Tutorials’ adjacent mobile menu. No page heading, form, article, calculator, dataset, or page script appears in the diff.

- [ ] **Step 6: Commit the standard-page navigation**

```bash
git add index.html servicenow.html blog.html interviews.html tutorials.html quiz.html technical-terms-quiz.html upsc.html upsc-patterns.html flights.html metals.html save-yourself.html
git commit -m "feat: consolidate site learning and tools navigation"
```

---

### Task 4: Adapt Summaverick’s application header without changing chat controls

**Files:**

- Modify: `summaverick.html` `.topnav` only.
- Modify: `assets/css/nav-utilities.css` only if the mobile panel needs a positioning correction found during this task.
- Modify: `assets/js/shared/nav-utilities.js` only if the existing optional mobile-menu tests expose a defect.
- Test: `scripts/tests/nav-utilities.test.cjs`

**Interfaces:**

- Consumes: Task 2 optional `[data-site-menu-toggle]` / `[data-site-mobile-menu]` controller.
- Produces: the same Learn/Tools/Summaverick/About destinations while preserving `.theme-toggle`, `#historyBtn`, and `#newChatBtn` unchanged.

- [ ] **Step 1: Confirm the repository validator’s remaining Summaverick failure**

```bash
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
```

Expected: FAIL for `summaverick.html` navigation structure only.

- [ ] **Step 2: Replace only the global links at the start of `.topnav`**

Use the same Learn and Tools disclosure markup from Task 3, changing outer `<li>` elements to `<div>` because Summaverick uses a flex `<nav>` instead of a list. Follow them with:

```html
<a data-nav-link="summaverick" class="active" aria-current="page" href="summaverick.html">Summaverick</a>
<a data-nav-link="about" href="index.html#about">About</a>
<button class="site-menu-toggle" type="button" data-site-menu-toggle aria-expanded="false" aria-controls="siteMobileNav">Menu</button>
<div class="site-mobile-menu" id="siteMobileNav" data-mobile-nav data-site-mobile-menu>
  <a href="index.html">Home</a>
  <span class="mobile-menu__label" data-mobile-group="learn">Learn</span>
  <a class="mobile-menu__sub" href="servicenow.html">ServiceNow Central</a>
  <a class="mobile-menu__sub" href="blog.html">Articles &amp; Tutorials</a>
  <a class="mobile-menu__sub" href="interviews.html">Interview Prep</a>
  <a class="mobile-menu__sub" href="upsc.html">UPSC Today</a>
  <span class="mobile-menu__label" data-mobile-group="tools">Tools</span>
  <a class="mobile-menu__sub" href="flights.html">SkyFare</a>
  <a class="mobile-menu__sub" href="metals.html">Metals</a>
  <a class="mobile-menu__sub" href="save-yourself.html">Save Yourself</a>
  <a class="active" aria-current="page" href="summaverick.html">Summaverick</a>
  <a href="index.html#about">About</a>
</div>
```

Leave the existing `.theme-toggle`, `#historyBtn`, and `#newChatBtn` markup byte-for-byte unchanged after this block.

- [ ] **Step 3: Run all navigation checks**

```bash
node --test scripts/tests/site-navigation-contract.test.mjs scripts/tests/nav-utilities.test.cjs
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
git diff --check
```

Expected: all tests PASS, the validator reports 13 pages passed, and whitespace check is silent.

- [ ] **Step 4: Inspect the Summaverick diff**

```bash
git diff -- summaverick.html assets/css/nav-utilities.css assets/js/shared/nav-utilities.js
```

Expected: `summaverick.html` changes are inside `.topnav`; theme/history/new-chat controls and all chat/landing content are unchanged. Shared asset changes, if any, are limited to the tested optional mobile site menu.

- [ ] **Step 5: Commit the Summaverick navigation adaptation**

```bash
git add summaverick.html assets/css/nav-utilities.css assets/js/shared/nav-utilities.js scripts/tests/nav-utilities.test.cjs
git commit -m "feat: align Summaverick site navigation"
```

---

### Task 5: Run live regression, accessibility, and viewport verification

**Files:**

- Modify only previously listed navigation files if a verified navigation defect is found.
- Do not modify page-specific files to resolve a page-body issue discovered during verification; report pre-existing issues separately.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: evidence that navigation works and every page’s primary behavior remains present.

- [ ] **Step 1: Run the complete automated verification from a clean shell**

```bash
node --test scripts/tests/site-navigation-contract.test.mjs scripts/tests/nav-utilities.test.cjs
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
git diff --check
git status --short
```

Expected: tests PASS; 13-page contract PASS; whitespace check is silent; status lists only intentional navigation files and plan/spec documentation.

- [ ] **Step 2: Start a local static server**

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Expected: server listens at `http://127.0.0.1:4173/`.

- [ ] **Step 3: Verify dropdown interaction on desktop**

At 1440×900 and 1024×768 on `index.html`, `upsc.html`, `flights.html`, and `summaverick.html`:

1. Move the pointer slowly from Learn into every menu link; the panel must not close while crossing.
2. Move out and immediately back within 180 ms; the pending close must cancel.
3. Open Learn, then Tools; Learn must close.
4. Click outside; the open panel must close.
5. Use Tab to reach both triggers and every link.
6. Press Escape; the panel must close and focus must return to its trigger.
7. Confirm no horizontal overflow and no new console errors.

- [ ] **Step 4: Verify mobile navigation**

At 375×812 and 768×1024 on the same four representative pages:

1. Open the existing mobile menu, or Summaverick’s new Menu button.
2. Confirm Home, Learn’s four links, Tools’ three links, Summaverick, and About are visible without another nested disclosure.
3. Confirm every target is at least 44 CSS px high.
4. Activate one link and confirm the expected existing page loads.
5. Press Escape on Summaverick’s menu and confirm focus returns to Menu.

- [ ] **Step 5: Verify all 13 pages retain their primary content and controls**

Load each page and check these exact markers:

| Page | Required regression evidence |
|---|---|
| `index.html` | `#aboutGrid`, `#statsRow`, `#certScroll`, `#blogPreview`, and `#interviewPreview` each contain rendered children |
| `servicenow.html` | `#heroSearchBtn` is present and clickable |
| `blog.html` | `#blogGrid` contains article content and its existing tabs switch |
| `interviews.html` | `#interviewList` contains questions |
| `tutorials.html` | `#searchInput` and `#mainContent` are present |
| `quiz.html` | `#difficultyFilter` and populated `#categoryGrid` are present |
| `technical-terms-quiz.html` | `#modeScreen` and `#modeGrid` are present |
| `upsc.html` | `#briefState`, `#topicOfDay`, and `#subjectJump` initialize |
| `upsc-patterns.html` | `#tab-atlas` and `#view-atlas` initialize |
| `flights.html` | `#searchForm` and `#searchBtn` remain usable |
| `metals.html` | `#marketReport` and `#quoteTools` are present |
| `save-yourself.html` | `#loanControls`, `#amount`, and `#rate` remain usable |
| `summaverick.html` | `#queryInput`, `#historyBtn`, and `#newChatBtn` remain usable |

Treat any new uncaught console exception as a failure. Do not edit body code to mask a pre-existing data/network error.

- [ ] **Step 6: Verify the source boundary one final time**

```bash
node scripts/validate-site-navigation.mjs --base "$(git merge-base HEAD origin/main)"
git diff "$(git merge-base HEAD origin/main)" --stat
git diff "$(git merge-base HEAD origin/main)" -- . ':!docs/superpowers/specs/**' ':!docs/superpowers/plans/**'
```

Expected: HTML hunks are navigation-only; non-HTML changes are only shared navigation assets and navigation tests/scripts.

- [ ] **Step 7: Commit any verification-only navigation corrections**

If verification required a navigation correction:

```bash
git add assets/css/nav-utilities.css assets/js/shared/nav-utilities.js scripts/tests/nav-utilities.test.cjs scripts/lib/site-navigation-contract.mjs scripts/tests/site-navigation-contract.test.mjs scripts/validate-site-navigation.mjs index.html servicenow.html blog.html interviews.html tutorials.html quiz.html technical-terms-quiz.html upsc.html upsc-patterns.html flights.html metals.html save-yourself.html summaverick.html
git commit -m "fix: complete navigation regression checks"
```

If no correction was required, do not create an empty commit.
