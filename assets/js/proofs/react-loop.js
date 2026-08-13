/* ============================================================
   proof-react-loop — agentic warranty resolution (§5.3)
   Case: Medtric Global medical-device warranty agent.
   Two real branches:
     Mumbai Devices .............. REJECTED (expired + physical damage)
     Singapore General Hospital .. AUTO-RESOLVED (remote firmware push)
   Stopwatch contrasts the 7-day human baseline vs 35-second agent.
   Diagram of something true: the Thought→Action→Observation cycle runs
   the real decision path; branches reach distinct terminal states.
   Reduced-motion: static two-branch flow + the two numbers.
   ============================================================ */
(function () {
  'use strict';
  var STYLE_ID = 'proof-react-loop-style';
  var CSS = [
    '[data-proof="react-loop"]{font-family:var(--font-body,sans-serif);color:var(--text,#e8e8e8)}',
    '.rl-wrap{background:var(--surface,#111);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-lg,16px);padding:clamp(20px,4vw,32px)}',
    '.rl-title{font-family:var(--font-display,sans-serif);font-size:clamp(19px,3vw,24px);font-weight:600;letter-spacing:-.02em;margin-bottom:4px}',
    '.rl-note{font-size:12px;color:var(--text-muted,#999);margin-bottom:18px}',
    '.rl-cases{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}',
    '.rl-case{font-size:12px;color:var(--text-muted,#999);background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:999px;padding:6px 12px;cursor:pointer}',
    '.rl-case[aria-pressed="true"]{color:#fff;border-color:var(--blue-strong,#2563EB);background:rgba(37,99,235,.18)}',
    '.rl-case:focus-visible{outline:2px solid var(--blue-strong,#2563EB);outline-offset:2px}',
    '.rl-steps{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}',
    '.rl-step{display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:start;opacity:.28;transition:opacity var(--dur,240ms)}',
    '.rl-step.on{opacity:1}',
    '.rl-tag{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;padding:4px 8px;border-radius:var(--r-sm,6px);text-align:center}',
    '.rl-tag.thought{background:rgba(37,99,235,.16);color:#8fb6ff}',
    '.rl-tag.action{background:rgba(154,103,0,.2);color:#f0c274}',
    '.rl-tag.observe{background:rgba(34,197,94,.16);color:#7ee2a8}',
    '.rl-body{font-size:13px;line-height:1.45;padding-top:3px}',
    '.rl-terminal{font-family:var(--mono,monospace);font-weight:700;font-size:15px;padding:12px 14px;border-radius:var(--r-sm,6px);background:var(--surface-2,#1a1a1a);opacity:0;transition:opacity var(--dur,240ms);margin-bottom:20px}',
    '.rl-terminal.show{opacity:1}',
    '.rl-terminal.reject{color:#ff9b8f;border:1px solid rgba(180,35,24,.5)}',
    '.rl-terminal.resolve{color:#7ee2a8;border:1px solid rgba(34,197,94,.5)}',
    '.rl-race{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:480px){.rl-race{grid-template-columns:1fr}}',
    '.rl-lane{background:var(--surface-2,#1a1a1a);border:1px solid var(--line,#2a2a2a);border-radius:var(--r-md,10px);padding:14px}',
    '.rl-lane h4{font-size:12px;color:var(--text-muted,#999);font-weight:500;margin-bottom:6px}',
    '.rl-big{font-family:var(--font-display,sans-serif);font-size:clamp(26px,6vw,40px);font-weight:700;letter-spacing:-.02em}',
    '.rl-lane.human .rl-big{color:#ff9b8f}.rl-lane.agent .rl-big{color:#7ee2a8}',
    '.rl-lane small{display:block;font-size:11px;color:var(--text-muted,#999);margin-top:4px}'
  ].join('');

  var CASES = [
    { id: 'sgh', label: 'Singapore General Hospital', terminal: 'resolve',
      terminalText: 'AUTO-RESOLVED · remote firmware push · full audit trail',
      steps: [
        ['thought', 'Claim received for infusion pump SN-4471. Need warranty status, fault class, and eligibility.'],
        ['action', 'query-instance → warranty coverage (read-only, allowlisted).'],
        ['observe', 'Under warranty (expires 2027-03). Fault: firmware regression, no physical damage.'],
        ['thought', 'Firmware faults are remotely remediable. No parts, no dispatch needed.'],
        ['action', 'Push signed firmware 3.8.2 via Integration Hub; log change.'],
        ['observe', 'Device reports healthy. Ticket closed, customer notified.']
      ] },
    { id: 'mumbai', label: 'Mumbai Devices', terminal: 'reject',
      terminalText: 'REJECTED · warranty expired + physical damage excluded',
      steps: [
        ['thought', 'Claim received for monitor SN-2210. Check warranty window and fault class.'],
        ['action', 'query-instance → warranty coverage (read-only, allowlisted).'],
        ['observe', 'Warranty expired 2024-11. Fault: cracked casing — physical damage.'],
        ['thought', 'Two independent exclusions: out-of-window and non-covered damage.'],
        ['action', 'Draft rejection with cited policy clauses; route to human for sign-off.'],
        ['observe', 'Rejection recorded with reason codes; no auto-remediation attempted.']
      ] }
  ];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function render(host) {
    ensureStyle();
    host.innerHTML =
      '<div class="rl-wrap">' +
        '<div class="rl-title">One agent, two outcomes — reasoned, not scripted</div>' +
        '<div class="rl-note">A ReAct loop (Thought → Action → Observation) drives each warranty claim to a distinct terminal state.</div>' +
        '<div class="rl-cases" role="group" aria-label="Warranty cases"></div>' +
        '<div class="rl-steps" aria-live="polite"></div>' +
        '<div class="rl-terminal" role="status"></div>' +
        '<div class="rl-race">' +
          '<div class="rl-lane human"><h4>Human baseline</h4><div class="rl-big">7 days</div><small>4–5 handoffs · L1 → L2 → warranty</small></div>' +
          '<div class="rl-lane agent"><h4>Agent</h4><div class="rl-big">35 sec</div><small>0 handoffs · 100% audit trail</small></div>' +
        '</div>' +
      '</div>';

    var casesEl = host.querySelector('.rl-cases');
    CASES.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rl-case'; b.textContent = c.label; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { run(c); mark(i); });
      casesEl.appendChild(b);
    });
    function mark(idx) { casesEl.querySelectorAll('.rl-case').forEach(function (c, j) { c.setAttribute('aria-pressed', j === idx ? 'true' : 'false'); }); }

    var stepsEl = host.querySelector('.rl-steps');
    var terminalEl = host.querySelector('.rl-terminal');
    var timers = [];

    function run(c) {
      timers.forEach(clearTimeout); timers = [];
      stepsEl.innerHTML = c.steps.map(function (s) {
        return '<div class="rl-step"><div class="rl-tag ' + s[0] + '">' + s[0].toUpperCase() + '</div><div class="rl-body">' + s[1] + '</div></div>';
      }).join('');
      terminalEl.className = 'rl-terminal';
      var stepEls = stepsEl.querySelectorAll('.rl-step');

      if (reduced()) {
        stepEls.forEach(function (el) { el.classList.add('on'); });
        terminalEl.className = 'rl-terminal show ' + c.terminal;
        terminalEl.textContent = c.terminalText;
        return;
      }
      stepEls.forEach(function (el, i) {
        timers.push(setTimeout(function () { el.classList.add('on'); }, 360 + i * 460));
      });
      timers.push(setTimeout(function () {
        terminalEl.className = 'rl-terminal show ' + c.terminal;
        terminalEl.textContent = c.terminalText;
      }, 360 + c.steps.length * 460));
    }

    run(CASES[0]); mark(0);
  }

  function init() {
    var hosts = document.querySelectorAll('[data-proof="react-loop"]');
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
