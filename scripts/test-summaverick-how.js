/**
 * Summaverick how-it-works film — structure and wiring.
 * Run: node scripts/test-summaverick-how.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'summaverick.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/summaverick-how.css'), 'utf8');
var js = fs.readFileSync(path.join(root, 'assets/js/summaverick-how.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

test('how section sits on the landing, before starters', function () {
  var how = html.indexOf('id="summaverick-how"');
  var starters = html.indexOf('class="starter-wrap"');
  assert.ok(how > -1);
  assert.ok(starters > how);
});

test('four capability acts are present', function () {
  ['Search', 'Live search', 'Reasoning', 'Accuracy'].forEach(function (title) {
    assert.ok(html.indexOf(title) > -1, 'missing ' + title);
  });
  assert.ok(html.indexOf('Ask from here') > -1);
});

test('assets and scroll library are linked', function () {
  assert.ok(html.indexOf('assets/css/summaverick-how.css') > -1);
  assert.ok(html.indexOf('assets/js/summaverick-how.js') > -1);
  assert.ok(html.indexOf('ScrollTrigger.min.js') > -1);
});

test('script is scroll-driven and chat-aware', function () {
  assert.ok(js.indexOf('ScrollTrigger') > -1);
  assert.ok(js.indexOf('prefers-reduced-motion') > -1);
  assert.ok(js.indexOf('app-active') > -1);
  assert.ok(js.indexOf('queryInput') > -1);
});

test('CSS pins a full-viewport island', function () {
  assert.ok(css.indexOf('.sm-how__pin') > -1);
  assert.ok(css.indexOf('100dvh') > -1);
  assert.ok(css.indexOf('prefers-reduced-motion') > -1);
});

console.log('All Summaverick how-it-works checks passed.');
