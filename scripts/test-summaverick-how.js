/**
 * Summaverick how-it-works timeline — structure and wiring.
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

test('how section sits after starters, before supporting Today', function () {
  var starters = html.indexOf('class="starter-wrap"');
  var how = html.indexOf('id="summaverick-how"');
  var today = html.indexOf('class="support-block"');
  assert.ok(starters > -1);
  assert.ok(how > starters);
  assert.ok(today > how);
});

test('four capability acts are present', function () {
  ['Search', 'Live search', 'Reasoning', 'Accuracy'].forEach(function (title) {
    assert.ok(html.indexOf(title) > -1, 'missing ' + title);
  });
  assert.ok(html.indexOf('Ask from here') > -1);
});

test('assets are linked and cinematic film is gone', function () {
  assert.ok(html.indexOf('assets/css/summaverick-how.css') > -1);
  assert.ok(html.indexOf('assets/js/summaverick-how.js') > -1);
  assert.equal(html.indexOf('ScrollTrigger.min.js') === -1, true);
  assert.equal(html.indexOf('id="smHowCanvas"') === -1, true);
});

test('script reveals once and is reduced-motion aware', function () {
  assert.ok(js.indexOf('IntersectionObserver') > -1);
  assert.ok(js.indexOf('prefers-reduced-motion') > -1);
  assert.ok(js.indexOf('is-revealed') > -1);
  assert.ok(js.indexOf('queryInput') > -1);
});

test('CSS is a timeline, not a pinned film', function () {
  assert.ok(css.indexOf('.sm-how__acts') > -1);
  assert.ok(css.indexOf('grid-template-columns: repeat(4') > -1);
  assert.ok(css.indexOf('prefers-reduced-motion') > -1);
  assert.equal(css.indexOf('100dvh') === -1, true);
});

console.log('All Summaverick how-it-works checks passed.');
