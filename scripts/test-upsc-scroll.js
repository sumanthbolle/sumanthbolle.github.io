'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = [
  'upsc.html',
  'upsc-guide.html',
  'upsc-patterns.html',
  'revision.html',
  'mains.html',
  'upsc-quiz.html',
  'needs-review.html',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function test(name, body) {
  try { body(); console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('classic UPSC pages load the shared scroll motion assets', function () {
  for (const file of pages) {
    const html = read(file);
    assert.match(html, /assets\/css\/upsc-motion\.css/, file);
    assert.match(html, /assets\/js\/upsc\/scroll\.js/, file);
    assert.doesNotMatch(html, /scrolltide/i, file);
    assert.doesNotMatch(html, /gsap|ScrollTrigger|lottie/i, file);
  }
});

test('motion CSS stays editorial and honours reduced motion', function () {
  const css = read('assets/css/upsc-motion.css');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.sb-progress/);
  assert.match(css, /\.sb-reveal/);
  assert.match(css, /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
  assert.doesNotMatch(css, /aurora|glow|neon|gradient-animation/i);
});

test('scroll script reveals in-view nodes and does not run under reduced motion', function () {
  const js = read('assets/js/upsc/scroll.js');
  assert.match(js, /prefers-reduced-motion:\s*reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /sb-motion/);
  assert.match(js, /is-in/);
});

console.log('UPSC scroll motion tests passed');
