/**
 * Summaverick workspace — hierarchy, motion tokens, and responsive shell.
 * Run: node scripts/test-summaverick-workspace.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'summaverick.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/summaverick-workspace.css'), 'utf8');
var js = fs.readFileSync(path.join(root, 'assets/js/summaverick-workspace.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

test('workspace assets are wired', function () {
  assert.ok(html.indexOf('assets/css/summaverick-workspace.css') > -1);
  assert.ok(html.indexOf('assets/js/summaverick-workspace.js') > -1);
  assert.ok(html.indexOf('viewport-fit=cover') > -1);
});

test('ask-first hierarchy: hero, then starters, then how', function () {
  var hero = html.indexOf('class="hero-title');
  var starters = html.indexOf('id="starterGrid"');
  var how = html.indexOf('id="summaverick-how"');
  var composer = html.indexOf('id="composer"');
  assert.ok(hero > -1 && starters > hero && how > starters);
  assert.ok(composer > -1);
  assert.ok(html.indexOf('Search less.') > -1);
  assert.ok(html.indexOf('Ask anything.') > -1);
});

test('motion tokens and reduced-motion exist', function () {
  assert.ok(css.indexOf('--motion-instant') > -1);
  assert.ok(css.indexOf('--ease-enter') > -1);
  assert.ok(css.indexOf('prefers-reduced-motion') > -1);
  assert.ok(css.indexOf('100dvh') > -1);
  assert.ok(css.indexOf('safe-area-inset-bottom') > -1);
  assert.ok(css.indexOf('--answer-max-width') > -1);
});

test('citation preview and source rail markup exist', function () {
  assert.ok(html.indexOf('id="citePreview"') > -1);
  assert.ok(html.indexOf('id="citeSheet"') > -1);
  assert.ok(html.indexOf('id="sourceRail"') > -1);
  assert.ok(js.indexOf('openCite') > -1);
});

test('mode selector is an accessible radiogroup', function () {
  assert.ok(html.indexOf('role="radiogroup"') > -1);
  assert.ok(html.indexOf('data-mode="quick"') > -1);
  assert.ok(html.indexOf('data-mode="deeper"') > -1);
  assert.ok(html.indexOf('data-mode="research"') > -1);
  assert.ok(css.indexOf('.mode-indicator') > -1);
});

test('no decorative particle or neon loops were added', function () {
  assert.equal(/particle|starfield|webgl|matrix/i.test(css + js), false);
  assert.equal(html.indexOf('rgbShift') === -1, true);
});

test('mobile hamburger and new-chat controls exist', function () {
  assert.ok(html.indexOf('id="workspaceMenuBtn"') > -1);
  assert.ok(html.indexOf('id="newChatBtn"') > -1);
  assert.ok(css.indexOf('.hamburger') > -1);
});

console.log('All Summaverick workspace checks passed.');
