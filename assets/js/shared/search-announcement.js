/**
 * Search Announcement Badge — v2 (Flashy)
 * Animated shimmer + pulsing star + gradient text
 * Self-contained: injects CSS, finds search bar, persists dismissal.
 *
 * Usage: <script defer src="assets/js/shared/search-announcement.js?v=2"></script>
 *        (load AFTER search.js)
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'sb_ai_search_announce_v3';
  try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) { return; }

  /* ── CSS ── */
  var css = [
    '.sa{display:inline-flex;align-items:center;gap:7px;padding:6px 16px 6px 10px;',
    'border-radius:22px;white-space:nowrap;cursor:default;position:relative;',
    'overflow:hidden;line-height:1;margin-left:8px;flex-shrink:0;',
    'animation:saEnter .6s cubic-bezier(.16,1,.3,1) both;font-family:inherit;z-index:1}',

    '.sa-bg{position:absolute;inset:0;border-radius:inherit;',
    'background:linear-gradient(135deg,rgba(168,85,247,.08),rgba(59,130,246,.06));',
    'border:1px solid rgba(168,85,247,.22);z-index:-2}',

    '.sa-shimmer{position:absolute;inset:0;border-radius:inherit;z-index:-1;overflow:hidden}',
    '.sa-shimmer::after{content:"";position:absolute;top:-50%;left:-75%;width:50%;height:200%;',
    'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%);',
    'animation:saShimmer 3s ease-in-out infinite}',

    '.sa-icon{display:flex;align-items:center;animation:saPulse 2s ease-in-out infinite}',
    '.sa-icon svg{filter:drop-shadow(0 0 3px rgba(168,85,247,.4))}',

    '.sa-pill{background:linear-gradient(135deg,#a855f7,#3b82f6);color:#fff;',
    'font-size:9px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;',
    'padding:2.5px 7px;border-radius:5px;line-height:1.3;',
    'box-shadow:0 1px 6px rgba(168,85,247,.3)}',

    '.sa-text{font-weight:600;font-size:12px;',
    'background:linear-gradient(135deg,#a855f7,#3b82f6);',
    '-webkit-background-clip:text;-webkit-text-fill-color:transparent;',
    'background-clip:text}',

    '.sa-x{background:none;border:none;color:#7c3aed;opacity:.3;font-size:16px;',
    'cursor:pointer;padding:0 0 0 2px;line-height:1;transition:opacity .2s;',
    '-webkit-text-fill-color:initial}',
    '.sa-x:hover{opacity:.8}',

    '@keyframes saEnter{from{opacity:0;transform:translateY(-8px) scale(.9)}',
    'to{opacity:1;transform:translateY(0) scale(1)}}',

    '@keyframes saShimmer{0%{left:-75%}50%{left:125%}100%{left:125%}}',

    '@keyframes saPulse{0%,100%{transform:scale(1) rotate(0deg)}',
    '50%{transform:scale(1.15) rotate(8deg)}}',

    '@media(max-width:600px){.sa-text{display:none}.sa{padding:5px 10px 5px 8px;margin-left:6px}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── SVG star icon with gradient ── */
  var STAR_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="saGrad" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#3b82f6"/>' +
    '</linearGradient></defs>' +
    '<path d="M8 1L9.5 5.5L14 4L10.5 7.5L15 9L10.5 9.5L12 14L8 10.5L4 14L5.5 9.5L1 9L5.5 7.5L2 4L6.5 5.5L8 1Z" fill="url(#saGrad)"/>' +
    '</svg>';

  /* ── Build badge HTML ── */
  function buildBadge() {
    var el = document.createElement('span');
    el.className = 'sa';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'New feature: AI-powered search');
    el.innerHTML =
      '<div class="sa-bg"></div>' +
      '<div class="sa-shimmer"></div>' +
      '<span class="sa-icon">' + STAR_SVG + '</span>' +
      '<span class="sa-pill">NEW</span>' +
      '<span class="sa-text">AI-Powered Search</span>' +
      '<button class="sa-x" title="Dismiss" aria-label="Dismiss">\u00d7</button>';

    el.querySelector('.sa-x').addEventListener('click', function (e) {
      e.stopPropagation();
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px) scale(.92)';
      el.style.transition = 'all .25s ease';
      setTimeout(function () { el.remove(); }, 260);
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (ex) {}
    });

    return el;
  }

  /* ── Poll for search bar ── */
  var attempts = 0;
  var poll = setInterval(function () {
    if (++attempts > 80) { clearInterval(poll); return; }

    var wrap = document.querySelector(
      '.sb-search-wrap, .sb-search-bar, [class*="sb-search"]'
    );

    if (!wrap) {
      var inp = document.querySelector('input[placeholder*="AI research"]') ||
                document.querySelector('input[placeholder*="Search articles"]') ||
                document.querySelector('input[placeholder*="Search questions"]');
      if (inp) wrap = inp.closest('[class*="search"]') || inp.parentElement;
    }

    if (!wrap) return;
    clearInterval(poll);

    if (wrap.parentElement && wrap.parentElement.querySelector('.sa')) return;

    var badge = buildBadge();
    var parent = wrap.parentElement;

    if (parent) {
      var cs = window.getComputedStyle(parent);
      if (cs.display === 'flex' || cs.display === 'inline-flex') {
        if (wrap.nextSibling) {
          parent.insertBefore(badge, wrap.nextSibling);
        } else {
          parent.appendChild(badge);
        }
        return;
      }
    }

    if (wrap.nextSibling) {
      wrap.parentNode.insertBefore(badge, wrap.nextSibling);
    } else if (wrap.parentNode) {
      wrap.parentNode.appendChild(badge);
    }
  }, 100);
})();
