/* ============================================================
   proof-retrieval-trace — the retrieval pipeline (§5.2)
   Ground truth: research-agent retrieval/ + providers/ + answer-verifier
     trace: question → domain detect → intent classify → source plan
            → retrieve (SDK / docs / instance) → dedupe + rank
            → verify claims → cited answer
   Stage names, intent+confidence, source types, and the source-ranker
   AUTHORITY weights are all verbatim from the code.
   The reorder is real: chips sort by the ranker score for the detected
   intent (not a fade). Reduced-motion: renders pre-ranked, no motion.
   ============================================================ */
(function () {
  'use strict';
  var STYLE_ID = 'proof-retrieval-trace-style';
  var CSS = [
    '[data-proof="retrieval-trace"]{font-family:var(--font-body,sans-serif);color:var(--text,#e8e8e8)}',
    '.rt-wrap{background:var(--surface,#111);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-lg,16px);padding:clamp(20px,4vw,32px)}',
    '.rt-title{font-family:var(--font-display,sans-serif);font-size:clamp(19px,3vw,24px);font-weight:600;letter-spacing:-.02em;margin-bottom:4px}',
    '.rt-note{font-size:12px;color:var(--text-muted,#999);margin-bottom:18px}',
    '.rt-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}',
    '.rt-chip{font-size:12px;color:var(--text-muted,#999);background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:999px;padding:6px 12px;cursor:pointer}',
    '.rt-chip[aria-pressed="true"]{color:#fff;border-color:var(--blue-strong,#2563EB);background:rgba(37,99,235,.18)}',
    '.rt-chip:focus-visible{outline:2px solid var(--blue-strong,#2563EB);outline-offset:2px}',
    '.rt-stages{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}',
    '.rt-stage{font-family:var(--mono,monospace);font-size:11px;color:var(--text-muted,#666);background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-sm,6px);padding:5px 9px;transition:color var(--dur,240ms),border-color var(--dur,240ms),background var(--dur,240ms)}',
    '.rt-stage.lit{color:#fff;border-color:var(--blue-strong,#2563EB);background:rgba(37,99,235,.16)}',
    '.rt-stage.done{color:#7ee2a8;border-color:rgba(126,226,168,.4)}',
    '.rt-detect{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;min-height:24px}',
    '.rt-pill{font-size:12px;font-family:var(--mono,monospace);border-radius:999px;padding:5px 12px;opacity:0;transform:translateY(6px);transition:opacity var(--dur,240ms),transform var(--dur,240ms)}',
    '.rt-pill.show{opacity:1;transform:none}',
    '.rt-pill.intent{background:rgba(37,99,235,.16);color:#8fb6ff;border:1px solid rgba(37,99,235,.5)}',
    '.rt-pill.module{background:var(--surface-2,#1a1a1a);color:var(--text-muted,#999);border:1px solid var(--line,#2a2a2a)}',
    '.rt-chips{position:relative;display:flex;flex-direction:column;gap:8px;margin-bottom:18px}',
    '.rt-evi{display:grid;grid-template-columns:26px 1fr auto;gap:10px;align-items:center;background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-sm,6px);padding:10px 12px;opacity:0;transform:translateY(8px);transition:transform var(--dur,240ms) var(--ease,ease),opacity var(--dur,240ms),border-color var(--dur,240ms)}',
    '.rt-evi.show{opacity:1;transform:none}',
    '.rt-rank{font-family:var(--mono,monospace);font-weight:700;font-size:13px;color:var(--text-muted,#999);text-align:center}',
    '.rt-evi.top .rt-rank{color:var(--ok,#22c55e)}',
    '.rt-evi.top{border-color:rgba(34,197,94,.45)}',
    '.rt-src{font-size:13px}',
    '.rt-src small{display:block;font-family:var(--mono,monospace);color:var(--text-muted,#999);font-size:11px}',
    '.rt-score{font-family:var(--mono,monospace);font-size:12px;color:#8fb6ff}',
    '.rt-verdict{font-family:var(--mono,monospace);font-size:13px;font-weight:700;color:#7ee2a8;padding:12px 14px;border-radius:var(--r-sm,6px);background:var(--surface-2,#1a1a1a);opacity:0;transition:opacity var(--dur,240ms)}',
    '.rt-verdict.show{opacity:1}',
    '.rt-verdict span{display:block;font-weight:400;font-size:12px;color:var(--text-muted,#999);margin-top:4px}'
  ].join('');

  var STAGES = ['question', 'domain detect', 'intent classify', 'source plan', 'retrieve', 'dedupe + rank', 'verify claims', 'cited answer'];

  // AUTHORITY weights, verbatim from source-ranker.ts
  var AUTHORITY = {
    fluent_sdk: { sdk_explain: 1, sdk_api_reference: 0.95, sdk_example: 0.90, local_repository: 0.85, product_documentation: 0.70 },
    product_concept: { product_documentation: 1, live_instance: 0.75, local_repository: 0.65, sdk_explain: 0.55 },
    instance_schema: { live_instance: 1, local_repository: 0.80, product_documentation: 0.70, sdk_explain: 0.50 }
  };
  var SRC_LABEL = {
    sdk_explain: ['Layer 1 · SDK explain', '@servicenow/sdk explain'],
    sdk_api_reference: ['SDK API reference', 'now.ts metadata'],
    sdk_example: ['SDK example', 'Fluent snippet'],
    product_documentation: ['Layer 2 · ServiceNowDocs', 'llms.txt'],
    local_repository: ['Local repository', 'now.config.json / keys.ts'],
    live_instance: ['Layer 3 · SDK query', 'read-only, task-scoped']
  };

  var PRESETS = [
    { id: 'q1', label: 'Write a Fluent BusinessRule', query: 'How do I define a Fluent BusinessRule with now.ts?',
      intent: 'fluent_sdk', conf: 0.90, module: 'fluent_sdk',
      evidence: [
        { src: 'product_documentation', rel: 0.72 },
        { src: 'sdk_explain', rel: 0.88 },
        { src: 'local_repository', rel: 0.66 },
        { src: 'sdk_example', rel: 0.70 }
      ] },
    { id: 'q2', label: 'What is a CMDB CI relationship?', query: 'What is a CMDB CI relationship and how is it reconciled?',
      intent: 'product_concept', conf: 0.70, module: 'cmdb',
      evidence: [
        { src: 'sdk_explain', rel: 0.60 },
        { src: 'product_documentation', rel: 0.90 },
        { src: 'local_repository', rel: 0.55 },
        { src: 'live_instance', rel: 0.75 }
      ] },
    { id: 'q3', label: 'Schema of incident table', query: 'Show the sys_dictionary schema for the incident table.',
      intent: 'instance_schema', conf: 0.86, module: 'platform',
      evidence: [
        { src: 'product_documentation', rel: 0.70 },
        { src: 'live_instance', rel: 0.92 },
        { src: 'local_repository', rel: 0.68 },
        { src: 'sdk_explain', rel: 0.52 }
      ] }
  ];

  function score(intent, src, rel) {
    var table = AUTHORITY[intent] || AUTHORITY.product_concept;
    var authority = (table[src] || 0.5);
    return authority * 0.45 + rel * 0.35 + 0.10 * 0.8; // freshness ~0.8
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function render(host) {
    ensureStyle();
    host.innerHTML =
      '<div class="rt-wrap">' +
        '<div class="rt-title">How an answer gets retrieved &amp; ranked</div>' +
        '<div class="rt-note">Stage names, intents and ranking weights are the real module code. Evidence reorders by the source-ranker score for the detected intent.</div>' +
        '<div class="rt-presets" role="group" aria-label="Example questions"></div>' +
        '<div class="rt-stages" aria-hidden="true"></div>' +
        '<div class="rt-detect"></div>' +
        '<div class="rt-chips" aria-live="polite"></div>' +
        '<div class="rt-verdict" role="status"></div>' +
      '</div>';

    var presetsEl = host.querySelector('.rt-presets');
    PRESETS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rt-chip'; b.textContent = p.label; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { run(p); mark(i); });
      presetsEl.appendChild(b);
    });
    function mark(idx) { presetsEl.querySelectorAll('.rt-chip').forEach(function (c, j) { c.setAttribute('aria-pressed', j === idx ? 'true' : 'false'); }); }

    var stagesEl = host.querySelector('.rt-stages');
    STAGES.forEach(function (s) { var d = document.createElement('div'); d.className = 'rt-stage'; d.textContent = s; stagesEl.appendChild(d); });
    var stageEls = stagesEl.querySelectorAll('.rt-stage');
    var detectEl = host.querySelector('.rt-detect');
    var chipsEl = host.querySelector('.rt-chips');
    var verdictEl = host.querySelector('.rt-verdict');
    var timers = [];

    function reset() {
      timers.forEach(clearTimeout); timers = [];
      stageEls.forEach(function (el) { el.className = 'rt-stage'; });
      detectEl.innerHTML = ''; chipsEl.innerHTML = '';
      verdictEl.className = 'rt-verdict'; verdictEl.innerHTML = '';
    }

    function buildChips(p, ranked) {
      // ranked evidence with scores; render in given order
      chipsEl.innerHTML = '';
      ranked.forEach(function (e, i) {
        var lbl = SRC_LABEL[e.src] || [e.src, ''];
        var row = document.createElement('div');
        row.className = 'rt-evi' + (i === 0 ? ' top' : '');
        row.dataset.src = e.src;
        row.innerHTML = '<div class="rt-rank">' + (i + 1) + '</div>' +
          '<div class="rt-src">' + lbl[0] + '<small>' + lbl[1] + '</small></div>' +
          '<div class="rt-score">' + e.s.toFixed(2) + '</div>';
        chipsEl.appendChild(row);
      });
    }

    function run(p) {
      reset();
      var scored = p.evidence.map(function (e) { return { src: e.src, s: score(p.intent, e.src, e.rel) }; });
      var ranked = scored.slice().sort(function (a, b) { return b.s - a.s; });

      if (reduced()) {
        stageEls.forEach(function (el) { el.classList.add('done'); });
        detectEl.innerHTML = '<span class="rt-pill intent show">' + p.intent + ' · ' + p.conf.toFixed(2) + '</span>' +
          '<span class="rt-pill module show">module: ' + p.module + '</span>';
        buildChips(p, ranked);
        verdictEl.className = 'rt-verdict show';
        verdictEl.innerHTML = 'answer-verifier: ok · citations required<span>Uncited major claims are linked to top evidence or the answer is withheld.</span>';
        return;
      }

      var t = 0, STEP = 380;
      // light stages 0..3
      [0, 1, 2, 3].forEach(function (si) {
        timers.push(setTimeout(function () {
          stageEls[si].classList.add('lit');
          if (si > 0) stageEls[si - 1].classList.replace('lit', 'done') || stageEls[si - 1].classList.add('done');
          if (si === 1) { detectEl.innerHTML = '<span class="rt-pill module">module: ' + p.module + '</span>'; requestAnimationFrame(function () { detectEl.querySelector('.rt-pill').classList.add('show'); }); }
          if (si === 2) { var s2 = document.createElement('span'); s2.className = 'rt-pill intent'; s2.textContent = p.intent + ' · ' + p.conf.toFixed(2); detectEl.insertBefore(s2, detectEl.firstChild); requestAnimationFrame(function () { s2.classList.add('show'); }); }
        }, t += STEP));
      });
      // retrieve — chips appear unranked (arrival order)
      timers.push(setTimeout(function () {
        stageEls[3].classList.replace('lit', 'done') || stageEls[3].classList.add('done');
        stageEls[4].classList.add('lit');
        buildChips(p, scored); // arrival order, unranked
        requestAnimationFrame(function () {
          chipsEl.querySelectorAll('.rt-evi').forEach(function (el, i) { timers.push(setTimeout(function () { el.classList.add('show'); }, i * 90)); });
        });
      }, t += STEP));
      // rank — FLIP reorder to ranked order
      timers.push(setTimeout(function () {
        stageEls[4].classList.replace('lit', 'done') || stageEls[4].classList.add('done');
        stageEls[5].classList.add('lit');
        flipReorder(chipsEl, ranked);
      }, t += STEP + 300));
      // verify + answer
      timers.push(setTimeout(function () {
        stageEls[5].classList.replace('lit', 'done') || stageEls[5].classList.add('done');
        stageEls[6].classList.add('lit');
      }, t += STEP + 400));
      timers.push(setTimeout(function () {
        stageEls[6].classList.replace('lit', 'done') || stageEls[6].classList.add('done');
        stageEls[7].classList.add('done');
        verdictEl.className = 'rt-verdict show';
        verdictEl.innerHTML = 'answer-verifier: ok · citations required<span>Uncited major claims are linked to top evidence or the answer is withheld (INSUFFICIENT_EVIDENCE).</span>';
      }, t += STEP));
    }

    function flipReorder(container, ranked) {
      var rows = Array.prototype.slice.call(container.querySelectorAll('.rt-evi'));
      var firstRects = {}; rows.forEach(function (r) { firstRects[r.dataset.src] = r.getBoundingClientRect(); });
      // reorder DOM by ranked order
      ranked.forEach(function (e, i) {
        var row = container.querySelector('.rt-evi[data-src="' + e.src + '"]');
        row.querySelector('.rt-rank').textContent = i + 1;
        row.classList.toggle('top', i === 0);
        container.appendChild(row);
      });
      var after = container.querySelectorAll('.rt-evi');
      after.forEach(function (r) {
        var last = r.getBoundingClientRect();
        var dy = firstRects[r.dataset.src].top - last.top;
        if (!dy) return;
        r.style.transition = 'none';
        r.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () {
          r.style.transition = '';
          r.style.transform = '';
        });
      });
    }

    run(PRESETS[0]); mark(0);
  }

  function init() {
    var hosts = document.querySelectorAll('[data-proof="retrieval-trace"]');
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
