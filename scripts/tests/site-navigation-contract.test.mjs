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

const desktop = `<nav aria-label="Primary"><a class="nav-logo" href="index.html">Sumanth Bolle</a><ul class="nav-links">${learn}${tools}<li><a data-nav-link="summaverick" href="summaverick.html">Summaverick</a></li><li><a data-nav-link="about" href="index.html#about">About</a></li></ul><div class="mobile-menu" data-mobile-nav><a href="index.html">Home</a><span data-mobile-group="learn">Learn</span><a href="servicenow.html" aria-current="page">ServiceNow Central</a><a href="blog.html">Articles &amp; Tutorials</a><a href="interviews.html">Interview Prep</a><a href="upsc.html">UPSC Today</a><span data-mobile-group="tools">Tools</span><a href="flights.html">SkyFare</a><a href="metals.html">Metals</a><a href="save-yourself.html">Save Yourself</a><a href="summaverick.html">Summaverick</a><a href="index.html#about">About</a></div></nav>`;
const validPage = `<html><body>${desktop}<main id="unchanged">Content</main></body></html>`;

test('extracts primary and mobile navigation', () => {
  assert.match(extractPrimaryNavigation(validPage), /data-nav-group="learn"/);
  assert.match(extractMobileNavigation(validPage), /data-mobile-group="tools"/);
});

test('accepts the exact ServiceNow Learn navigation', () => {
  assert.deepEqual(validateNavigation('servicenow.html', validPage), []);
});

test('rejects legacy global entries and menu roles', () => {
  const invalid = validPage
    .replace('UPSC Today', 'Anchor')
    .replace('data-nav-panel="tools"', 'data-nav-panel="tools" role="menu"');

  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /legacy|role="menu"/i);
});

test('rejects a missing Learn destination', () => {
  const invalid = validPage.replace('<a href="interviews.html">Interview Prep</a>', '');
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /Interview Prep/);
});

test('rejects an extra Tools destination', () => {
  const invalid = validPage.replace(
    '<a href="save-yourself.html">Save Yourself</a>',
    '<a href="save-yourself.html">Save Yourself</a><a href="extra.html">Extra</a>'
  );
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /desktop Tools links/);
});

test('does not accept an active Tools button for a Learn page', () => {
  const invalid = validPage
    .replace('class="nav-drop__btn active"', 'class="nav-drop__btn"')
    .replace('class="nav-drop__btn" aria-expanded="false" aria-controls="navTools"', 'class="nav-drop__btn active" aria-expanded="false" aria-controls="navTools"');
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /Learn parent must be active/);
});

test('rejects aria-current on the wrong exact destination', () => {
  const invalid = validPage
    .replace('href="servicenow.html" aria-current="page"', 'href="servicenow.html"')
    .replace('href="blog.html"', 'href="blog.html" aria-current="page"');
  assert.match(validateNavigation('servicenow.html', invalid).join('\n'), /current destination/i);
});

test('supporting Learn pages activate the parent without claiming a destination', () => {
  const supportingPage = validPage.replaceAll(' aria-current="page"', '');
  assert.deepEqual(validateNavigation('tutorials.html', supportingPage), []);
});

test('detects changes outside navigation', () => {
  const changedNav = validPage.replace('Tools</button>', 'Toolbox</button>');
  const changedBody = validPage.replace('Content', 'Changed content');

  assert.equal(compareOutsideNavigation(validPage, changedNav), true);
  assert.equal(compareOutsideNavigation(validPage, changedBody), false);
  assert.equal(stripNavigation(validPage), stripNavigation(changedNav));
});
