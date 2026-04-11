/**
 * Search Announcement Badge — v1
 * Adds a "✨ NEW · AI-Powered Search" chip next to the SBSearch bar.
 * Self-contained: injects its own CSS, finds the search container via
 * polling, and persists dismissal in localStorage.
 *
 * Usage:  <script defer src="assets/js/shared/search-announcement.js"></script>
 *         (load AFTER search.js)
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'sb_ai_search_announce_v2';

  /* ── bail early if already dismissed ── */
  try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) { /* private mode */ }

  /* ── inject styles once ── */
  var css = [
    '.search-announce{display:inline-flex;align-items:center;gap:6px;padding:5px 13px 5px 9px;',
    'background:linear-gradient(135deg,rgba(88,86,214,.1),rgba(0,102,204,.07));',
    'border:1px solid rgba(88,86,214,.18);border-radius:20px;font-size:12px;font-weight:600;',
    'color:#5856d6;white-space:nowrap;animation:_saIn .45s ease both;cursor:default;',
    'margin-left:8px;flex-shrink:0;line-height:1;user-select:none}',

    '.search-announce-spark{font-size:13px;line-height:1}',

    '.search-announce-new{background:linear-gradient(135deg,#5856d6,#007aff);color:#fff;',
    'font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;',
    'padding:2px 6px;border-radius:4px;line-height:1.3}',

    '.search-announce-text{color:#5856d6;font-weight:500;font-size:12px}',

    '.search-announce-dismiss{background:none;border:none;color:rgba(88,86,214,.35);',
    'font-size:16px;cursor:pointer;padding:0 0 0 3px;line-height:1;transition:color .2s}',
    '.search-announce-dismiss:hover{color:#5856d6}',

    '@keyframes _saIn{from{opacity:0;transform:translateY(-5px) scale(.96)}',
    'to{opacity:1;transform:translateY(0) scale(1)}}',

    '@media(max-width:600px){.search-announce-text{display:none}',
    '.search-announce{padding:4px 9px 4px 7px;margin-left:6px}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── poll for the search wrapper created by SBSearch.init() ── */
  var attempts = 0;
  var maxAttempts = 80;          // ~8 seconds
  var interval   = 100;          // ms

  var poll = setInterval(function () {
    attempts++;
    if (attempts > maxAttempts) { clearInterval(poll); return; }

    /* SBSearch typically renders a wrapper with class containing "sb-search" */
    var wrap = document.querySelector(
      '.sb-search-wrap, .sb-search-bar, [class*="sb-search"]'
    );

    /* fallback: grab the search input by its AI-related placeholder */
    if (!wrap) {
      var inp = document.querySelector('input[placeholder*="AI research"]') ||
                document.querySelector('input[placeholder*="Search articles"]') ||
                document.querySelector('input[placeholder*="Search questions"]');
      if (inp) wrap = inp.closest('[class*="search"]') || inp.parentElement;
    }

    if (!wrap) return;
    clearInterval(poll);

    /* prevent double-injection (hot-reload / SPA) */
    if (wrap.parentElement && wrap.parentElement.querySelector('.search-announce')) return;

    /* ── build badge ── */
    var badge = document.createElement('span');
    badge.className = 'search-announce';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', 'New feature: AI-powered search');
    badge.innerHTML =
      '<span class="search-announce-spark">\u2728</span>' +
      '<span class="search-announce-new">NEW</span>' +
      '<span class="search-announce-text">AI-Powered Search</span>' +
      '<button class="search-announce-dismiss" title="Dismiss" aria-label="Dismiss">\u00d7</button>';

    /* dismiss handler */
    badge.querySelector('.search-announce-dismiss').addEventListener('click', function (e) {
      e.stopPropagation();
      badge.style.opacity  = '0';
      badge.style.transform = 'translateY(-5px) scale(.96)';
      badge.style.transition = 'all .22s ease';
      setTimeout(function () { badge.remove(); }, 250);
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (ex) { /* ok */ }
    });

    /* ── insert badge ── */
    // If the wrap's parent is flex-row, append inside so it lines up.
    var parent = wrap.parentElement;
    if (parent) {
      var cs = window.getComputedStyle(parent);
      if (cs.display === 'flex' || cs.display === 'inline-flex') {
        // Place right after the search wrap inside the flex container
        if (wrap.nextSibling) {
          parent.insertBefore(badge, wrap.nextSibling);
        } else {
          parent.appendChild(badge);
        }
        return;
      }
    }

    // Default: insert right after the wrap element
    if (wrap.nextSibling) {
      wrap.parentNode.insertBefore(badge, wrap.nextSibling);
    } else if (wrap.parentNode) {
      wrap.parentNode.appendChild(badge);
    }
  }, interval);
})();
