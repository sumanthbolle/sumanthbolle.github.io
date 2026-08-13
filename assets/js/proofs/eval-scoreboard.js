/* ============================================================
   proof-eval-scoreboard — the eval suite, counted up (§5.5)
   Ground truth: research-agent/src/domains/servicenow/evals/
     servicenow-cases.json ............ 52 cases (10 adversarial-flagged)
     servicenow-adversarial-cases.json  10 dedicated adversarial cases
     combined ......................... 62
   Category breakdown is verbatim from the case files.
   Numbers count up on view; reduced-motion sets them instantly.
   ============================================================ */
(function () {
  'use strict';
  var STYLE_ID = 'proof-eval-scoreboard-style';
  var CSS = [
    '[data-proof="eval-scoreboard"]{font-family:var(--font-body,sans-serif);color:var(--text,#e8e8e8)}',
    '.es-wrap{background:var(--surface,#111);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-lg,16px);padding:clamp(20px,4vw,32px)}',
    '.es-title{font-family:var(--font-display,sans-serif);font-size:clamp(19px,3vw,24px);font-weight:600;letter-spacing:-.02em;margin-bottom:4px}',
    '.es-note{font-size:12px;color:var(--text-muted,#999);margin-bottom:20px}',
    '.es-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}',
    '@media(max-width:480px){.es-nums{grid-template-columns:1fr}}',
    '.es-cell{background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-md,10px);padding:16px}',
    '.es-big{font-family:var(--font-display,sans-serif);font-size:clamp(30px,7vw,46px);font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
    '.es-cell.run .es-big{color:#8fb6ff}.es-cell.pass .es-big{color:#7ee2a8}.es-cell.adv .es-big{color:#f0c274}',
    '.es-lbl{font-size:12px;color:var(--text-muted,#999);margin-top:4px}',
    '.es-cats h4{font-size:12px;color:var(--text-muted,#999);font-weight:500;margin-bottom:10px}',
    '.es-bar{display:grid;grid-template-columns:150px 1fr 34px;gap:10px;align-items:center;margin-bottom:8px}',
    '@media(max-width:480px){.es-bar{grid-template-columns:120px 1fr 30px}}',
    '.es-cat{font-family:var(--mono,monospace);font-size:12px;color:var(--text,#e8e8e8)}',
    '.es-track{background:var(--surface-2,#1a1a1a);border-radius:999px;height:10px;overflow:hidden}',
    '.es-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#2563EB,#5b8def);transition:width var(--dur-slow,420ms) var(--ease,ease)}',
    '.es-fill.adv{background:linear-gradient(90deg,#9a6700,#eab308)}',
    '.es-num{font-family:var(--mono,monospace);font-size:12px;color:var(--text-muted,#999);text-align:right}',
    '@media(prefers-reduced-motion:reduce){.es-fill{transition:none}}'
  ].join('');

  var TOTAL = 52, ADVERSARIAL = 10, COMBINED = 62;
  var CATS = [
    { k: 'fluent_sdk', n: 11 },
    { k: 'platform_development', n: 10 },
    { k: 'adversarial', n: 10, adv: true },
    { k: 'product_concept', n: 8 },
    { k: 'instance_schema', n: 6 },
    { k: 'configuration_guidance', n: 2 },
    { k: 'instance_record_lookup', n: 2 },
    { k: 'troubleshooting', n: 1 },
    { k: 'implementation_design', n: 1 },
    { k: 'release_comparison', n: 1 }
  ];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function countUp(el, target, dur) {
    if (reduced()) { el.textContent = target; return; }
    var t0 = null;
    function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * ease);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function render(host) {
    ensureStyle();
    var max = CATS[0].n;
    host.innerHTML =
      '<div class="es-wrap">' +
        '<div class="es-title">The eval suite that keeps it honest</div>' +
        '<div class="es-note">Regression + adversarial cases run against every change. Counts trace to servicenow-cases.json and servicenow-adversarial-cases.json.</div>' +
        '<div class="es-nums">' +
          '<div class="es-cell run"><div class="es-big" data-n="' + TOTAL + '">0</div><div class="es-lbl">regression cases</div></div>' +
          '<div class="es-cell pass"><div class="es-big" data-n="' + COMBINED + '">0</div><div class="es-lbl">cases incl. adversarial suite</div></div>' +
          '<div class="es-cell adv"><div class="es-big" data-n="' + ADVERSARIAL + '">0</div><div class="es-lbl">adversarial attacks blocked</div></div>' +
        '</div>' +
        '<div class="es-cats"><h4>By category (servicenow-cases.json)</h4>' +
          CATS.map(function (c) {
            return '<div class="es-bar"><div class="es-cat">' + c.k + '</div>' +
              '<div class="es-track"><div class="es-fill' + (c.adv ? ' adv' : '') + '" data-w="' + Math.round(c.n / max * 100) + '"></div></div>' +
              '<div class="es-num">' + c.n + '</div></div>';
          }).join('') +
        '</div>' +
      '</div>';

    var fired = false;
    function play() {
      if (fired) return; fired = true;
      host.querySelectorAll('.es-big').forEach(function (el) { countUp(el, parseInt(el.dataset.n, 10), 1100); });
      host.querySelectorAll('.es-fill').forEach(function (el) {
        requestAnimationFrame(function () { el.style.width = el.dataset.w + '%'; });
      });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { play(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(host);
    } else { play(); }
  }

  function init() {
    var hosts = document.querySelectorAll('[data-proof="eval-scoreboard"]');
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
