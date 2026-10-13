/**
 * Static-shell regression tests for the two decision-heavy utility pages.
 * Run: node scripts/test-utility-pages.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var metals = fs.readFileSync(path.join(root, 'metals.html'), 'utf8');
var save = fs.readFileSync(path.join(root, 'save-yourself.html'), 'utf8');
var saveApp = fs.readFileSync(path.join(root, 'assets/js/save-yourself/app.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

function indexInOrder(documentText, markers) {
  var previous = -1;
  markers.forEach(function (marker) {
    var current = documentText.indexOf(marker);
    assert.notEqual(current, -1, 'missing marker: ' + marker);
    assert.ok(current > previous, 'out-of-order marker: ' + marker);
    previous = current;
  });
}

test('Metals opens with prices and quote checking before optional market tools', function () {
  indexInOrder(metals, [
    'id="marketReport"',
    'class="price-grid"',
    'id="quoteTools"',
    'id="holdingsPanel"',
    'id="historyPanel"',
    'id="alertsPanel"',
    'id="sourcesPanel"',
  ]);

  assert.match(metals, /<details[^>]+id="holdingsPanel"/);
  assert.match(metals, /<details[^>]+id="historyPanel"/);
  assert.match(metals, /<details[^>]+id="alertsPanel"/);
  assert.match(metals, /<details[^>]+id="sourcesPanel"/);
});

test('Metals has no floating guide or generated explanation route', function () {
  assert.equal(/help-panel\.js|SBHelpGuide\.init|id="askFactors"|id="askUnderstand"/.test(metals), false);
  assert.equal(/How to use the Metals tracker|Ask Summaverick/.test(metals), false);
});

test('Save Yourself answers in plain words: inputs, one answer, three numbers', function () {
  assert.match(save, /<h1>What will this loan really cost\?<\/h1>/);
  indexInOrder(save, [
    'id="loanForm"',
    'id="answer"',
    'id="numEmi"',
    'id="numTotal"',
    'id="numCost"',
    'id="ask"',
  ]);
  assert.match(save, />Monthly payment</);
  assert.match(save, />Total you repay</);
  assert.match(save, />Extra cost</);
  assert.equal(/You borrow|You return|rent on the money|Money rent|Reality receipt|Red flags|Cash-flow pressure/.test(save + saveApp), false);
});

test('Save Yourself hands the loan to Summaverick through the ?q= deep link', function () {
  assert.match(save, /Ask Summaverick about this loan/);
  assert.match(saveApp, /summaverick\.html\?q=' \+ encodeURIComponent/);
  assert.equal(/help-panel\.js|SBHelpGuide\.init|Financial X-Ray guide/.test(save), false);
});

test('Both utility shells keep unique HTML ids', function () {
  [metals, save].forEach(function (documentText) {
    var ids = Array.from(documentText.matchAll(/\bid="([^"]+)"/g)).map(function (match) { return match[1]; });
    assert.equal(new Set(ids).size, ids.length);
  });
});

