/**
 * Static-shell regression tests for the Metals and Save Yourself pages.
 * Run: node scripts/test-utility-pages.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var metals = fs.readFileSync(path.join(root, 'metals.html'), 'utf8');
var flights = fs.readFileSync(path.join(root, 'flights.html'), 'utf8');
var flightsApp = fs.readFileSync(path.join(root, 'assets/js/skyfare/app.js'), 'utf8');
var save = fs.readFileSync(path.join(root, 'save-yourself.html'), 'utf8');
var saveApp = fs.readFileSync(path.join(root, 'assets/js/save-yourself/app.js'), 'utf8');
var metalsApp = fs.readFileSync(path.join(root, 'assets/js/metals.js'), 'utf8');

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

test('Metals shows prices, then the price checker and Ask Summaverick', function () {
  indexInOrder(metals, [
    'data-metal="gold"',
    'data-metal="silver"',
    'id="calc"',
    'id="ask"',
  ]);
  assert.equal(/holdingsPanel|alertsPanel|sourcesPanel|Share snapshot|help-panel\.js/.test(metals), false);
});

test('Metals India price adds 15% customs duty and 3% GST', function () {
  assert.match(metalsApp, /INDIA_DUTY = 0\.15/);
  assert.match(metalsApp, /INDIA_GST = 0\.03/);
});

test('Ask Summaverick opens in place on both tool pages', function () {
  [metals, save].forEach(function (doc) {
    assert.match(doc, /assets\/js\/shared\/ask-widget\.js/);
    assert.match(doc, /data-ask-form/);
  });
  assert.equal(/summaverick\.html\?q=/.test(saveApp + metalsApp), false);
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

test('Tool pages load the shared theme script and nav menu', function () {
  [metals, save, flights].forEach(function (doc) {
    assert.match(doc, /<script src="assets\/js\/shared\/theme\.js[^"]*"><\/script>\s*<link/);
    assert.equal(/<html[^>]+data-theme=/.test(doc), false);
  });
  [saveApp, metalsApp, flightsApp].forEach(function (js) {
    assert.match(js, /SBShared\.initNavMenu\(\)/);
  });
});

test('SkyFare keeps search simple and puts results before Summaverick', function () {
  indexInOrder(flights, ['id="searchForm"', 'id="from"', 'id="to"', 'id="depart"', 'id="results"', 'id="insight"', 'id="flightList"', 'id="ask"']);
  assert.equal(/priorityMode|maxBudget|Advanced Options|help-panel\.js|Value Score/.test(flights + flightsApp), false);
  assert.match(flightsApp, /SBAsk\.init\(/);
});

test('Both utility shells keep unique HTML ids', function () {
  [metals, save, flights].forEach(function (documentText) {
    var ids = Array.from(documentText.matchAll(/\bid="([^"]+)"/g)).map(function (match) { return match[1]; });
    assert.equal(new Set(ids).size, ids.length);
  });
});

