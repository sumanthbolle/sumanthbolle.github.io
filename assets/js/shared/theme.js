/* Site theme. Load in <head> so the page paints in the right theme.
   Saved choice ('theme' in localStorage) wins; otherwise follow the system setting. */
(function () {
  'use strict';

  var KEY = 'theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return saved() || (media && media.matches ? 'dark' : 'light');
  }

  function sync() {
    var dark = root.getAttribute('data-theme') === 'dark';
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    sync();
  }

  apply(current());

  if (media && media.addEventListener) {
    media.addEventListener('change', function () { if (!saved()) apply(current()); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    sync();
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
      apply(next);
    });
  });
})();
