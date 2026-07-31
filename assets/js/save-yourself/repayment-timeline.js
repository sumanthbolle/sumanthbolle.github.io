/**
 * Save Yourself — repayment timeline (presentational, no math).
 *
 * SYRepaymentTimeline.render(containerEl, schedule, options)
 * options: { currency, formatMoney, interestType, selectedMonth, onSelect, grouping: 'auto'|'monthly'|'yearly' }
 *
 * schedule rows: { month, payment, principal, interest, balance }
 */
(function (global) {
  'use strict';

  var MONTHLY_CAP = 60;

  function fmt(options, n) {
    if (options && typeof options.formatMoney === 'function') {
      try { return options.formatMoney(n, options.currency); } catch (e) { /* fall */ }
    }
    var v = Number(n);
    return Number.isFinite(v) ? String(Math.round(v)) : '—';
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function findCrossover(schedule) {
    for (var i = 0; i < schedule.length; i++) {
      var row = schedule[i];
      if (num(row.principal) >= num(row.interest)) return i;
    }
    return -1;
  }

  function resolveGrouping(schedule, options, forced) {
    if (forced === 'monthly' || forced === 'yearly') return forced;
    var g = options && options.grouping;
    if (g === 'monthly' || g === 'yearly') return g;
    return schedule.length <= MONTHLY_CAP ? 'monthly' : 'yearly';
  }

  function aggregateYearly(schedule) {
    var buckets = [];
    var map = Object.create(null);
    for (var i = 0; i < schedule.length; i++) {
      var row = schedule[i];
      var year = Math.ceil(num(row.month) / 12) || 1;
      if (!map[year]) {
        map[year] = {
          id: 'y' + year,
          label: 'Year ' + year,
          monthStart: (year - 1) * 12 + 1,
          monthEnd: Math.min(year * 12, schedule.length),
          payment: 0,
          principal: 0,
          interest: 0,
          balance: 0,
          count: 0,
          months: []
        };
        buckets.push(map[year]);
      }
      var b = map[year];
      b.payment += num(row.payment);
      b.principal += num(row.principal);
      b.interest += num(row.interest);
      b.balance = num(row.balance);
      b.count += 1;
      b.months.push(row);
    }
    return buckets;
  }

  function toBars(schedule, grouping) {
    if (grouping === 'yearly') return aggregateYearly(schedule);
    return schedule.map(function (row, i) {
      return {
        id: 'm' + row.month,
        label: 'Payment ' + row.month,
        monthStart: row.month,
        monthEnd: row.month,
        payment: num(row.payment),
        principal: num(row.principal),
        interest: num(row.interest),
        balance: num(row.balance),
        count: 1,
        index: i,
        months: [row]
      };
    });
  }

  function prefersReducedMotion() {
    try {
      return typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function ensureShell(container) {
    var root = container.querySelector('[data-sy-repay]');
    if (root) return root;
    root = document.createElement('div');
    root.setAttribute('data-sy-repay', '1');
    root.className = 'sy-repay';
    root.innerHTML =
      '<p data-sy-flat-note class="sy-repay__flat-note" hidden></p>' +
      '<div data-sy-toggle class="sy-repay__toggle" hidden>' +
        '<span class="sy-repay__toggle-label">Group by</span>' +
        '<button type="button" data-group="monthly">Monthly</button>' +
        '<button type="button" data-group="yearly">Yearly</button>' +
      '</div>' +
      '<div data-sy-detail class="sy-repay__detail" aria-live="polite"></div>' +
      '<div class="sy-repay__scrubber-wrap">' +
        '<label class="sy-repay__scrubber-label" for="sy-repay-scrubber">Scrub payments</label>' +
        '<input data-sy-scrubber id="sy-repay-scrubber" class="sy-repay__scrubber" type="range" min="0" max="0" value="0" />' +
      '</div>' +
      '<ul data-sy-bars class="sy-repay__bars" role="listbox" aria-label="Repayment schedule" tabindex="0"></ul>' +
      '<p data-sy-annotate class="sy-repay__annotate" hidden></p>' +
      '<details class="sy-repay__table-wrap">' +
        '<summary>Payment schedule table</summary>' +
        '<div class="sy-repay__table-scroll">' +
          '<table data-sy-table class="sy-repay__table">' +
            '<caption class="sy-visually-hidden">Full repayment schedule</caption>' +
            '<thead><tr>' +
              '<th scope="col">#</th><th scope="col">Payment</th>' +
              '<th scope="col">Principal</th><th scope="col">Interest</th>' +
              '<th scope="col">Balance</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
          '</table>' +
        '</div>' +
      '</details>';
    container.appendChild(root);
    return root;
  }

  function maxStack(bars) {
    var m = 0;
    for (var i = 0; i < bars.length; i++) {
      m = Math.max(m, bars[i].principal + bars[i].interest);
    }
    return m || 1;
  }

  function updateDetail(root, bar, barsLen, options, scheduleLen) {
    var el = root.querySelector('[data-sy-detail]');
    if (!el || !bar) return;
    var label = bar.count > 1
      ? bar.label + ' (payments ' + bar.monthStart + '–' + bar.monthEnd + ' of ' + scheduleLen + ')'
      : 'Payment ' + bar.monthStart + ' of ' + scheduleLen;
    el.innerHTML =
      '<strong>' + label + '</strong>' +
      '<span>Payment ' + fmt(options, bar.payment) + '</span>' +
      '<span>Principal ' + fmt(options, bar.principal) + '</span>' +
      '<span>Interest ' + fmt(options, bar.interest) + '</span>' +
      '<span>Balance ' + fmt(options, bar.balance) + '</span>';
  }

  function selectIndex(root, state, index, options) {
    var bars = state.bars;
    if (!bars.length) return;
    index = Math.max(0, Math.min(bars.length - 1, index));
    state.selected = index;
    var items = root.querySelectorAll('[data-sy-bar]');
    for (var i = 0; i < items.length; i++) {
      var on = i === index;
      items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      items[i].classList.toggle('is-selected', on);
    }
    var scrubber = root.querySelector('[data-sy-scrubber]');
    if (scrubber && Number(scrubber.value) !== index) scrubber.value = String(index);
    updateDetail(root, bars[index], bars.length, options, state.schedule.length);
    if (typeof options.onSelect === 'function') {
      var bar = bars[index];
      options.onSelect({
        index: index,
        month: bar.monthStart,
        monthEnd: bar.monthEnd,
        bar: bar
      });
    }
  }

  function renderBars(root, state, options) {
    var list = root.querySelector('[data-sy-bars]');
    var bars = state.bars;
    var max = maxStack(bars);
    var crossover = state.crossover;
    var grouping = state.grouping;

    // Reuse existing <li> nodes when length matches.
    var existing = list.querySelectorAll('[data-sy-bar]');
    while (existing.length > bars.length) {
      list.removeChild(existing[existing.length - 1]);
      existing = list.querySelectorAll('[data-sy-bar]');
    }

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var li = existing[i];
      if (!li) {
        li = document.createElement('li');
        li.setAttribute('data-sy-bar', '1');
        li.setAttribute('role', 'option');
        li.tabIndex = -1;
        li.innerHTML =
          '<button type="button" class="sy-repay__bar-btn" data-sy-bar-btn>' +
            '<span class="sy-repay__stack" data-sy-stack>' +
              '<span class="sy-repay__seg sy-repay__seg--interest" data-seg="interest"></span>' +
              '<span class="sy-repay__seg sy-repay__seg--principal" data-seg="principal"></span>' +
            '</span>' +
            '<span class="sy-repay__bar-label" data-sy-bar-label></span>' +
          '</button>';
        list.appendChild(li);
      }

      li.dataset.index = String(i);
      li.dataset.month = String(bar.monthStart);
      var isCross =
        grouping === 'monthly' && crossover >= 0 && bar.monthStart === state.schedule[crossover].month;
      li.classList.toggle('is-crossover', isCross);

      var iPct = Math.max(0, (bar.interest / max) * 100);
      var pPct = Math.max(0, (bar.principal / max) * 100);
      var interestSeg = li.querySelector('[data-seg="interest"]');
      var principalSeg = li.querySelector('[data-seg="principal"]');
      if (interestSeg) {
        interestSeg.style.height = iPct + '%';
        interestSeg.style.background = 'var(--sy-cost, #e2571e)';
      }
      if (principalSeg) {
        principalSeg.style.height = pPct + '%';
        principalSeg.style.background = 'var(--sy-principal, #2b6fd6)';
      }
      var label = li.querySelector('[data-sy-bar-label]');
      if (label) label.textContent = grouping === 'yearly' ? bar.label : String(bar.monthStart);
      var btn = li.querySelector('[data-sy-bar-btn]');
      if (btn) {
        btn.setAttribute(
          'aria-label',
          bar.label + ', payment ' + fmt(options, bar.payment) +
            ', principal ' + fmt(options, bar.principal) +
            ', interest ' + fmt(options, bar.interest)
        );
      }
    }

    var annotate = root.querySelector('[data-sy-annotate]');
    if (annotate) {
      if (grouping === 'monthly' && crossover >= 0) {
        annotate.hidden = false;
        annotate.textContent = 'Principal becomes the larger share';
        annotate.dataset.month = String(state.schedule[crossover].month);
      } else {
        annotate.hidden = true;
        annotate.textContent = '';
      }
    }
  }

  function renderTable(root, schedule, options) {
    var tbody = root.querySelector('[data-sy-table] tbody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    while (rows.length > schedule.length) {
      tbody.removeChild(rows[rows.length - 1]);
      rows = tbody.querySelectorAll('tr');
    }
    for (var i = 0; i < schedule.length; i++) {
      var row = schedule[i];
      var tr = rows[i];
      if (!tr) {
        tr = document.createElement('tr');
        tr.innerHTML = '<th scope="row"></th><td></td><td></td><td></td><td></td>';
        tbody.appendChild(tr);
      }
      var cells = tr.children;
      cells[0].textContent = String(row.month);
      cells[1].textContent = fmt(options, row.payment);
      cells[2].textContent = fmt(options, row.principal);
      cells[3].textContent = fmt(options, row.interest);
      cells[4].textContent = fmt(options, row.balance);
    }
  }

  function bindOnce(root, state) {
    if (root._syBound) return;
    root._syBound = true;

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-group]');
      if (btn && root.contains(btn)) {
        state.forcedGrouping = btn.getAttribute('data-group');
        if (state.rerender) state.rerender();
        return;
      }
      var barBtn = e.target.closest('[data-sy-bar-btn]');
      if (barBtn) {
        var li = barBtn.closest('[data-sy-bar]');
        if (li) selectIndex(root, state, Number(li.dataset.index), state.options);
      }
    });

    root.addEventListener('keydown', function (e) {
      var list = root.querySelector('[data-sy-bars]');
      if (!list || (e.target !== list && !list.contains(e.target) && e.target !== root.querySelector('[data-sy-scrubber]'))) {
        return;
      }
      var cur = state.selected || 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectIndex(root, state, cur + 1, state.options);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectIndex(root, state, cur - 1, state.options);
      } else if (e.key === 'Home') {
        e.preventDefault();
        selectIndex(root, state, 0, state.options);
      } else if (e.key === 'End') {
        e.preventDefault();
        selectIndex(root, state, state.bars.length - 1, state.options);
      }
    });

    var scrubber = root.querySelector('[data-sy-scrubber]');
    if (scrubber) {
      scrubber.addEventListener('input', function () {
        selectIndex(root, state, Number(scrubber.value), state.options);
      });
    }
  }

  function render(containerEl, schedule, options) {
    if (!containerEl) return;
    options = options || {};
    schedule = Array.isArray(schedule) ? schedule : [];

    var root = ensureShell(containerEl);
    if (!root._syState) root._syState = { selected: 0, forcedGrouping: null };
    var state = root._syState;
    state.options = options;
    state.schedule = schedule;
    state.crossover = findCrossover(schedule);

    if (prefersReducedMotion()) root.classList.add('sy-repay--reduced-motion');
    else root.classList.remove('sy-repay--reduced-motion');

    var flatNote = root.querySelector('[data-sy-flat-note]');
    if (flatNote) {
      if (options.interestType === 'flat') {
        flatNote.hidden = false;
        flatNote.textContent = 'Flat-rate interest is calculated on the original loan amount.';
      } else {
        flatNote.hidden = true;
        flatNote.textContent = '';
      }
    }

    var showToggle = schedule.length > MONTHLY_CAP;
    var toggle = root.querySelector('[data-sy-toggle]');
    if (toggle) {
      toggle.hidden = !showToggle;
      if (showToggle) {
        var g = resolveGrouping(schedule, options, state.forcedGrouping);
        var buttons = toggle.querySelectorAll('[data-group]');
        for (var t = 0; t < buttons.length; t++) {
          buttons[t].setAttribute('aria-pressed', buttons[t].getAttribute('data-group') === g ? 'true' : 'false');
        }
      }
    }

    var grouping = resolveGrouping(schedule, options, showToggle ? state.forcedGrouping : null);
    // When short and auto, force monthly even if user had yearly from a prior long run.
    if (schedule.length <= MONTHLY_CAP && (!options.grouping || options.grouping === 'auto')) {
      grouping = 'monthly';
      state.forcedGrouping = null;
    }
    state.grouping = grouping;
    state.bars = toBars(schedule, grouping);

    var scrubber = root.querySelector('[data-sy-scrubber]');
    if (scrubber) {
      scrubber.max = String(Math.max(0, state.bars.length - 1));
      scrubber.disabled = state.bars.length === 0;
    }

    renderBars(root, state, options);
    renderTable(root, schedule, options);

    bindOnce(root, state);
    state.rerender = function () { render(containerEl, schedule, options); };

    var initial = 0;
    if (typeof options.selectedMonth === 'number' && options.selectedMonth >= 1) {
      for (var i = 0; i < state.bars.length; i++) {
        var b = state.bars[i];
        if (options.selectedMonth >= b.monthStart && options.selectedMonth <= b.monthEnd) {
          initial = i;
          break;
        }
      }
    } else if (typeof state.selected === 'number') {
      initial = state.selected;
    }
    if (state.bars.length) selectIndex(root, state, initial, options);
  }

  global.SYRepaymentTimeline = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
