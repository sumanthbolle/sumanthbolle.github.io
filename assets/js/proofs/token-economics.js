/* ============================================================
   proof-token-economics — Maverick cost model (§5.4)
   Interactive: drag users/month → three live annual-cost bars.
   Ground truth (research: DATA.projects[0] "Maverick"):
     Now Assist ...... $120K–$240K/yr @ 200 users  ($50–100 /user/mo)
     Maverick+Bedrock  $36K–$60K/yr   @ 200 users  ($15–25 /user/mo)
     Maverick+Ollama   $12K–$24K/yr   @ 200 users  ($5–10  /user/mo)
     60–70% token optimization · 75–90% cost savings
   This is a diagram of something true: bars are proportional, numbers
   trace to the stated bands, savings % is the honest ratio.
   Reduced-motion: bars snap (no easing) but stay interactive.
   Keyboard: native range input (arrow keys).
   ============================================================ */
(function () {
  'use strict';

  var STYLE_ID = 'proof-token-economics-style';
  var CSS = [
    '[data-proof="token-economics"]{--pe-track:#1a1a1a;--pe-line:#2a2a2a;font-family:var(--font-body,-apple-system,sans-serif);color:var(--text,#e8e8e8)}',
    '.pe-wrap{background:var(--surface,#111);border:1px solid var(--pe-line);border-radius:var(--r-lg,16px);padding:clamp(20px,4vw,32px)}',
    '.pe-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}',
    '.pe-title{font-family:var(--font-display,sans-serif);font-size:clamp(19px,3vw,24px);font-weight:600;letter-spacing:-.02em}',
    '.pe-note{font-size:12px;color:var(--text-muted,#999)}',
    '.pe-controls{margin:22px 0 26px}',
    '.pe-controls label{display:block;font-size:13px;color:var(--text-muted,#999);margin-bottom:10px}',
    '.pe-controls output{color:var(--text,#e8e8e8);font-family:var(--mono,monospace);font-weight:600}',
    '.pe-slider{width:100%;height:6px;-webkit-appearance:none;appearance:none;background:var(--pe-track);border-radius:999px;outline-offset:4px}',
    '.pe-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--blue-strong,#2563EB);border:3px solid var(--surface,#111);cursor:pointer}',
    '.pe-slider::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--blue-strong,#2563EB);border:3px solid var(--surface,#111);cursor:pointer}',
    '.pe-slider:focus-visible{outline:2px solid var(--blue-strong,#2563EB)}',
    '.pe-bars{display:flex;flex-direction:column;gap:16px}',
    '.pe-row{display:grid;grid-template-columns:170px 1fr;gap:14px;align-items:center}',
    '@media(max-width:560px){.pe-row{grid-template-columns:1fr}}',
    '.pe-name{font-size:13px;font-weight:600}',
    '.pe-name small{display:block;font-weight:400;color:var(--text-muted,#999);font-size:11px;margin-top:2px}',
    '.pe-bartrack{position:relative;background:var(--pe-track);border-radius:var(--r-sm,6px);height:44px;overflow:hidden}',
    '.pe-fill{position:absolute;inset:0 auto 0 0;width:0;border-radius:var(--r-sm,6px);transition:width var(--dur,240ms) var(--ease,ease)}',
    '.pe-fill.now{background:linear-gradient(90deg,#b42318,#e05a4d)}',
    '.pe-fill.bedrock{background:linear-gradient(90deg,#2563EB,#5b8def)}',
    '.pe-fill.ollama{background:linear-gradient(90deg,#1a7f37,#37b45c)}',
    '.pe-fig{position:absolute;top:50%;right:12px;transform:translateY(-50%);font-family:var(--mono,monospace);font-weight:600;font-size:15px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5)}',
    '.pe-save{display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:var(--ok,#22c55e)}',
    '.pe-foot{margin-top:22px;display:flex;flex-wrap:wrap;gap:10px}',
    '.pe-chip{font-size:12px;color:var(--text-muted,#999);background:var(--pe-track);border:1px solid var(--pe-line);border-radius:999px;padding:6px 12px}',
    '.pe-chip b{color:var(--text,#e8e8e8);font-family:var(--mono,monospace)}',
    '@media(prefers-reduced-motion:reduce){.pe-fill{transition:none}}'
  ].join('');

  // per-user, per-month cost midpoints (USD). Bands drive the range chips.
  var MODELS = [
    { key: 'now', name: 'ServiceNow Now Assist', sub: 'per-user licensing', lo: 50, hi: 100 },
    { key: 'bedrock', name: 'Maverick + AWS Bedrock', sub: 'managed cloud LLM', lo: 15, hi: 25 },
    { key: 'ollama', name: 'Maverick + Ollama', sub: 'on-prem / air-gapped', lo: 5, hi: 10 }
  ];

  function mid(m) { return (m.lo + m.hi) / 2; }
  function fmtK(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function render(host) {
    ensureStyle();
    var maxAnnual = mid(MODELS[0]); // Now Assist is the ceiling
    host.innerHTML =
      '<div class="pe-wrap">' +
        '<div class="pe-head">' +
          '<span class="pe-title">What Maverick costs to run</span>' +
          '<span class="pe-note">Modeled from stated Maverick ranges at 200 users</span>' +
        '</div>' +
        '<div class="pe-controls">' +
          '<label for="pe-users">Users on the platform: <output id="pe-out">200</output></label>' +
          '<input class="pe-slider" id="pe-users" type="range" min="50" max="2000" step="50" value="200" ' +
            'aria-label="Users on the platform" aria-valuetext="200 users">' +
        '</div>' +
        '<div class="pe-bars">' +
          MODELS.map(function (m) {
            return '<div class="pe-row">' +
              '<div class="pe-name">' + m.name + '<small>' + m.sub + '</small></div>' +
              '<div class="pe-bartrack"><div class="pe-fill ' + m.key + '" data-k="' + m.key + '"></div>' +
              '<span class="pe-fig" data-fig="' + m.key + '"></span></div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="pe-foot">' +
          '<span class="pe-chip">Token optimization <b>60–70%</b> via structured prompts</span>' +
          '<span class="pe-chip">Cost savings vs Now Assist <b id="pe-savings">75–90%</b></span>' +
          '<span class="pe-chip">40% of queries resolve with <b>zero</b> LLM tokens</span>' +
        '</div>' +
      '</div>';

    var slider = host.querySelector('#pe-users');
    var out = host.querySelector('#pe-out');

    function update() {
      var users = parseInt(slider.value, 10);
      out.textContent = users.toLocaleString();
      slider.setAttribute('aria-valuetext', users + ' users');
      var nowAnnual = mid(MODELS[0]) * users * 12;
      MODELS.forEach(function (m) {
        var annual = mid(m) * users * 12;
        var pct = Math.max(4, (mid(m) / maxAnnual) * 100);
        var fill = host.querySelector('.pe-fill[data-k="' + m.key + '"]');
        var fig = host.querySelector('.pe-fig[data-fig="' + m.key + '"]');
        fill.style.width = pct + '%';
        var save = m.key === 'now' ? '' :
          '<span class="pe-save">−' + Math.round((1 - annual / nowAnnual) * 100) + '%</span>';
        fig.innerHTML = fmtK(annual) + '/yr' + save;
      });
    }

    slider.addEventListener('input', update);
    update();
  }

  function init() {
    var hosts = document.querySelectorAll('[data-proof="token-economics"]');
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
