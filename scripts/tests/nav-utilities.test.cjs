const test = require('node:test');
const assert = require('node:assert/strict');
const { init, CLOSE_DELAY } = require('../../assets/js/shared/nav-utilities.js');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
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

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  querySelector(selector) {
    return this.childrenBySelector.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.childrenBySelector.get(selector) || [];
  }

  contains(target) {
    return target === this || this.descendants.has(target);
  }

  focus() {
    this.focused = true;
  }

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

function createEnvironment(count, withSiteMenu = false, withStandardMenu = false) {
  const drops = Array.from({ length: count }, createDrop);
  const document = new FakeTarget();
  const siteTrigger = withSiteMenu ? new FakeTarget() : null;
  const sitePanel = withSiteMenu ? new FakeTarget() : null;
  const standardTrigger = withStandardMenu ? new FakeTarget() : null;
  const standardPanel = withStandardMenu ? new FakeTarget() : null;
  document.querySelectorAll = selector => (
    selector === '[data-nav-drop]' ? drops.map(drop => drop.root) : []
  );
  document.querySelector = selector => {
    if (selector === '[data-site-menu-toggle]') return siteTrigger;
    if (selector === '[data-site-mobile-menu]') return sitePanel;
    if (selector === '.menu-toggle') return standardTrigger;
    if (selector === '.mobile-menu[data-mobile-nav]') return standardPanel;
    return null;
  };

  const env = {
    drops,
    document,
    siteTrigger,
    sitePanel,
    standardTrigger,
    standardPanel,
    pending: null
  };
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
  assert.equal(env.drops[0].button.getAttribute('aria-expanded'), 'true');

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

test('pointer exit closes after the grace period', () => {
  const env = createEnvironment(1);
  init(env.document, env.runtime);

  env.drops[0].root.dispatch('pointerenter');
  env.drops[0].root.dispatch('pointerleave');
  env.pending.fn();

  assert.equal(env.drops[0].root.classList.contains('open'), false);
  assert.equal(env.drops[0].button.getAttribute('aria-expanded'), 'false');
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
  assert.equal(env.siteTrigger.getAttribute('aria-expanded'), 'true');

  env.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(env.sitePanel.classList.contains('open'), false);
  assert.equal(env.siteTrigger.focused, true);
});

test('standard mobile menu synchronizes expanded state and closes on Escape', () => {
  const env = createEnvironment(0, false, true);
  env.standardTrigger.addEventListener('click', () => {
    env.standardTrigger.classList.add('active');
    env.standardPanel.classList.add('active');
  });
  init(env.document, env.runtime);

  env.standardTrigger.dispatch('click', { preventDefault() {} });
  assert.equal(env.standardTrigger.getAttribute('aria-expanded'), 'true');

  env.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(env.standardPanel.classList.contains('active'), false);
  assert.equal(env.standardTrigger.getAttribute('aria-expanded'), 'false');
  assert.equal(env.standardTrigger.focused, true);
});
