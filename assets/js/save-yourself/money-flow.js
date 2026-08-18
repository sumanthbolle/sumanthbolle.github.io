/**
 * Save Yourself — money-flow visualization (presentational).
 *
 * SYMoneyFlow.render(containerEl, data, options)
 * data: { principal, netProceeds, upfrontFees, totalPaid, borrowingCost, currency, formatMoney }
 */
(function (global) {
  'use strict';

  var DESKTOP_MQ = '(min-width: 600px)';
  var VIEW_W = 960;
  var VIEW_H = 420;

  function fmt(data, n) {
    if (typeof data.formatMoney === 'function') {
      try { return data.formatMoney(n, data.currency); } catch (e) { /* fall through */ }
    }
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return String(Math.round(v));
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function strokeFor(value, max) {
    if (!(max > 0)) return 2;
    return Math.max(2, Math.round((value / max) * 28));
  }

  function preferCompact(options) {
    if (options && typeof options.compact === 'boolean') return options.compact;
    try {
      return !(typeof matchMedia === 'function' && matchMedia(DESKTOP_MQ).matches);
    } catch (e) {
      return true;
    }
  }

  function ensureRoot(container) {
    var root = container.querySelector('[data-sy-money-flow]');
    if (root) return root;
    root = document.createElement('div');
    root.setAttribute('data-sy-money-flow', '1');
    root.className = 'sy-money-flow';
    container.appendChild(root);
    return root;
  }

  function setText(el, text) {
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
  }

  function renderMobile(root, data) {
    root.setAttribute('data-mode', 'compact');
    var block = root.querySelector('[data-sy-mf-compact]');
    if (!block) {
      block = document.createElement('div');
      block.setAttribute('data-sy-mf-compact', '1');
      block.className = 'sy-money-flow__compact';
      block.innerHTML =
        '<p data-row="borrowed" class="sy-money-flow__line"><span data-val></span> borrowed</p>' +
        '<p class="sy-money-flow__arrow" aria-hidden="true">↓</p>' +
        '<p data-row="reaches" class="sy-money-flow__line"><span data-val></span> reaches you</p>' +
        '<p data-row="fees" class="sy-money-flow__sub"><span data-val></span> removed as fees</p>' +
        '<p class="sy-money-flow__arrow" aria-hidden="true">↓</p>' +
        '<p data-row="returned" class="sy-money-flow__line"><span data-val></span> returned</p>' +
        '<p data-row="cost" class="sy-money-flow__sub"><span data-val></span> was borrowing cost</p>';
      root.appendChild(block);
    }
    var svg = root.querySelector('[data-sy-mf-svg]');
    if (svg) svg.hidden = true;
    block.hidden = false;

    function fill(row, value) {
      var el = block.querySelector('[data-row="' + row + '"] [data-val]');
      if (el) setText(el, fmt(data, value));
    }
    fill('borrowed', data.principal);
    fill('reaches', data.netProceeds);
    fill('fees', data.upfrontFees);
    fill('returned', data.totalPaid);
    fill('cost', data.borrowingCost);
  }

  function renderDesktop(root, data) {
    root.setAttribute('data-mode', 'svg');
    var compact = root.querySelector('[data-sy-mf-compact]');
    if (compact) compact.hidden = true;

    var principal = num(data.principal);
    var net = num(data.netProceeds);
    var fees = num(data.upfrontFees);
    var totalPaid = num(data.totalPaid);
    var cost = num(data.borrowingCost);
    var maxFlow = Math.max(principal, net, fees, totalPaid, cost, 1);

    var swNet = strokeFor(net, maxFlow);
    var swFees = strokeFor(fees, maxFlow);
    var swPrin = strokeFor(principal, maxFlow);
    var swCost = strokeFor(cost, maxFlow);

    var titleText = 'Money flow: cash received and total repaid';
    var descText =
      fmt(data, principal) + ' borrowed; ' +
      fmt(data, net) + ' reaches you after ' +
      fmt(data, fees) + ' in fees; you return ' +
      fmt(data, totalPaid) + ' including ' +
      fmt(data, cost) + ' borrowing cost.';

    var svg = root.querySelector('[data-sy-mf-svg]');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-sy-mf-svg', '1');
      svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-labelledby', 'sy-mf-title sy-mf-desc');
      svg.classList.add('sy-money-flow__svg');
      root.appendChild(svg);
    }
    svg.hidden = false;
    svg.setAttribute('aria-labelledby', 'sy-mf-title sy-mf-desc');

    // Rebuild inner markup once; update attrs/text on subsequent renders.
    if (!svg.querySelector('[data-sy-mf-built]')) {
      svg.innerHTML =
        '<title id="sy-mf-title" data-sy-mf-built="1"></title>' +
        '<desc id="sy-mf-desc"></desc>' +
        '<g class="sy-money-flow__labels" font-size="14" fill="currentColor">' +
          '<text data-label="lender" x="48" y="48">LENDER</text>' +
          '<text data-label="you-a" x="480" y="48" text-anchor="middle">YOU</text>' +
          '<text data-label="fees" x="860" y="48" text-anchor="end">UPFRONT FEES</text>' +
          '<text data-label="you-b" x="48" y="240">YOU</text>' +
          '<text data-label="principal" x="480" y="240" text-anchor="middle">PRINCIPAL RETURNED</text>' +
          '<text data-label="rent" x="860" y="240" text-anchor="end">INTEREST + FEES</text>' +
        '</g>' +
        '<g class="sy-money-flow__moment-a" data-moment="a">' +
          '<path data-flow="net" class="sy-money-flow__path sy-money-flow__path--principal" fill="none" stroke="var(--sy-principal, #2b6fd6)" stroke-linecap="round" stroke-linejoin="round" d="M 80 90 C 220 90, 280 130, 420 130" />' +
          '<path data-flow="fees" class="sy-money-flow__path sy-money-flow__path--cost" fill="none" stroke="var(--sy-cost, #e2571e)" stroke-linecap="round" stroke-linejoin="round" d="M 540 130 C 680 130, 740 90, 880 90" />' +
          '<text data-val="net" x="250" y="78" text-anchor="middle" font-size="13" fill="currentColor"></text>' +
          '<text data-val="fees" x="710" y="78" text-anchor="middle" font-size="13" fill="currentColor"></text>' +
        '</g>' +
        '<g class="sy-money-flow__moment-b" data-moment="b">' +
          '<path data-flow="principal" class="sy-money-flow__path sy-money-flow__path--principal" fill="none" stroke="var(--sy-principal, #2b6fd6)" stroke-linecap="round" stroke-linejoin="round" d="M 80 290 C 220 290, 280 330, 420 330" />' +
          '<path data-flow="cost" class="sy-money-flow__path sy-money-flow__path--cost" fill="none" stroke="var(--sy-cost, #e2571e)" stroke-linecap="round" stroke-linejoin="round" d="M 540 330 C 680 330, 740 290, 880 290" />' +
          '<text data-val="principal" x="250" y="278" text-anchor="middle" font-size="13" fill="currentColor"></text>' +
          '<text data-val="cost" x="710" y="278" text-anchor="middle" font-size="13" fill="currentColor"></text>' +
        '</g>' +
        '<text x="480" y="180" text-anchor="middle" font-size="12" opacity="0.7" fill="currentColor">Moment A · cash in</text>' +
        '<text x="480" y="390" text-anchor="middle" font-size="12" opacity="0.7" fill="currentColor">Moment B · cash out</text>';
    }

    setText(svg.querySelector('#sy-mf-title'), titleText);
    setText(svg.querySelector('#sy-mf-desc'), descText);

    function setPath(name, sw) {
      var p = svg.querySelector('[data-flow="' + name + '"]');
      if (!p) return;
      var prev = p.getAttribute('stroke-width');
      // Force transition: set from previous width then to new on next frame.
      if (prev !== String(sw)) {
        p.classList.remove('sy-money-flow__path--anim');
        // reflow
        void p.getBoundingClientRect();
        p.setAttribute('stroke-width', String(sw));
        p.classList.add('sy-money-flow__path--anim');
      } else {
        p.setAttribute('stroke-width', String(sw));
      }
    }

    setPath('net', swNet);
    setPath('fees', swFees);
    setPath('principal', swPrin);
    setPath('cost', swCost);

    setText(svg.querySelector('[data-val="net"]'), fmt(data, net));
    setText(svg.querySelector('[data-val="fees"]'), fmt(data, fees));
    setText(svg.querySelector('[data-val="principal"]'), fmt(data, principal));
    setText(svg.querySelector('[data-val="cost"]'), fmt(data, cost));
  }

  function render(containerEl, data, options) {
    if (!containerEl || !data) return;
    var root = ensureRoot(containerEl);
    root.dataset.principal = String(num(data.principal));
    root.dataset.net = String(num(data.netProceeds));
    root.dataset.fees = String(num(data.upfrontFees));
    root.dataset.total = String(num(data.totalPaid));
    root.dataset.cost = String(num(data.borrowingCost));

    if (preferCompact(options)) {
      renderMobile(root, data);
    } else {
      renderDesktop(root, data);
    }
  }

  global.SYMoneyFlow = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
