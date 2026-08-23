/**
 * Homepage Summaverick intro — structure and asset wiring.
 * Run: node scripts/test-summaverick-intro.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/summaverick-intro.css'), 'utf8');
var js = fs.readFileSync(path.join(root, 'assets/js/summaverick-intro.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

test('old aurora banner is gone', function () {
  assert.equal(index.includes('sm-announce'), false);
  assert.equal(index.includes('smAuroraRotate'), false);
});

test('intro section, heading, and CTA are wired', function () {
  assert.ok(index.includes('id="summaverick-intro"'));
  assert.ok(index.includes('id="smIntroCanvas"'));
  assert.ok(index.includes('Meet Summaverick'));
  assert.ok(index.includes('href="summaverick.html"'));
  assert.ok(index.includes('Ask Summaverick'));
  assert.ok(index.includes('class="sm-intro__cta"'));
});

test('Velorix-style manifesto copy is present', function () {
  assert.ok(index.includes('Where questions find their edge'));
  assert.ok(index.includes('and research rewrites what comes next'));
});

test('scroll and 3D libraries are linked', function () {
  assert.ok(index.includes('assets/css/summaverick-intro.css'));
  assert.ok(index.includes('assets/js/summaverick-intro.js'));
  assert.ok(index.includes('three@0.160.1'));
  assert.ok(index.includes('ScrollTrigger.min.js'));
});

test('intro script is scroll-driven and reduced-motion aware', function () {
  assert.ok(js.includes('ScrollTrigger'));
  assert.ok(js.includes('prefers-reduced-motion'));
  assert.ok(js.includes('WebGLRenderer'));
  assert.ok(js.includes('ExtrudeGeometry'));
});

test('intro CSS pins a full viewport scene', function () {
  assert.ok(css.includes('.sm-intro__pin'));
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('100dvh'));
});

console.log('All Summaverick intro checks passed.');
