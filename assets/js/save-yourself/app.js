/**
 * Save Yourself — loan cost calculator UI wiring (client-side only).
 */
(function () {
  'use strict';

  var C = window.SYCurrency;
  var MathLib = window.SYLoanMath;
  var Advice = window.SYAdvice;
  var Decision = window.SYDecision;
  var Storage = window.SYStorage;
  var MoneyFlow = window.SYMoneyFlow;
  var Timeline = window.SYRepaymentTimeline;

  var locale = C.detectLocale();
  var COMMIT_FIELDS = ['commitDate', 'commitExtra', 'commitBuffer', 'commitPerson'];
  var ERROR_FIELDS = { amount: 'amount', rate: 'rate', tenure: 'tenure', extra: 'extraPayment' };

  var state = {
    input: null,
    ui: {
      advancedOpen: false,
      selectedPayment: 0,
      timelineGrouping: 'auto',
      editedByUser: false
    },
    filterAnswers: Object.create(null),
    redFlags: Object.create(null),
    escape: Object.create(null),
    lastValidResult: null,
    lastAdvice: null,
    lastFilter: null,
    currencyOptions: [],
    touched: Object.create(null),
    commitment: {},
    amortLoaded: false
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ---------- Persistence ---------- */
  function persist() {
    if (!state.ui.editedByUser) return;
    var input = collectInputForStorage();
    var commitment = {};
    COMMIT_FIELDS.forEach(function (id) {
      commitment[id] = $(id) ? $(id).value : '';
    });
    Storage.save({
      input: input,
      ui: {
        advancedOpen: state.ui.advancedOpen,
        selectedPayment: state.ui.selectedPayment,
        timelineGrouping: state.ui.timelineGrouping,
        editedByUser: true,
        locale: locale
      },
      checklist: {
        filter: state.filterAnswers,
        escape: state.escape,
        redFlags: state.redFlags
      },
      commitment: commitment
    });
  }

  function collectInputForStorage() {
    var amountParse = C.parseAmount($('amount').value);
    var rateParse = C.parseAmount($('rate').value);
    var tenureParse = C.parseAmount($('tenure').value);
    var procParse = C.parseAmount($('processingFee').value || '0');
    var otherParse = C.parseAmount($('otherFees').value || '0');
    var extraParse = C.parseAmount($('extraPayment').value || '0');
    var penaltyParse = C.parseAmount($('prepayPenalty').value || '0');
    var incomeParse = C.parseAmount($('income').value || '');
    var existingParse = C.parseAmount($('existingDebt').value || '');
    var oppParse = C.parseAmount($('oppRate').value || '8');
    var interestType = document.querySelector('input[name="interestType"]:checked');
    var feeTreatment = document.querySelector('input[name="feeTreatment"]:checked');
    var reason = document.querySelector('input[name="reason"]:checked');

    return {
      currency: state.input.currency,
      principal: amountParse.ok ? amountParse.value : null,
      nominalAnnualRate: rateParse.ok ? rateParse.value : null,
      tenureValue: tenureParse.ok ? tenureParse.value : null,
      tenureUnit: $('tenureUnit').value === 'months' ? 'months' : 'years',
      interestType: interestType ? interestType.value : 'reducing',
      processingFee: {
        mode: $('processingUnit').value === 'percent' ? 'percent' : 'fixed',
        value: procParse.ok ? procParse.value : 0,
        treatment: feeTreatment ? feeTreatment.value : 'deducted'
      },
      otherCharges: otherParse.ok ? otherParse.value : 0,
      extraMonthlyPayment: extraParse.ok ? extraParse.value : 0,
      prepaymentPenaltyRate: penaltyParse.ok ? penaltyParse.value : 0,
      grossMonthlyIncome: incomeParse.ok ? incomeParse.value : null,
      existingMonthlyDebt: existingParse.ok ? existingParse.value : null,
      emergencyFundMonths: $('emergencyFund').value || 'unknown',
      opportunityAnnualRate: oppParse.ok ? oppParse.value : 8,
      borrowingReason: reason ? reason.value : null,
      lenderType: $('lender').value || null
    };
  }

  function applyInputToForm(input) {
    input = input || Storage.DEFAULT_EXAMPLE;
    state.input = Object.assign({}, Storage.DEFAULT_EXAMPLE, input);
    var cur = state.input.currency || C.detectDefaultCurrency(locale);
    state.input.currency = cur;

    if (state.input.principal != null) $('amount').value = String(state.input.principal);
    if (state.input.nominalAnnualRate != null) $('rate').value = String(state.input.nominalAnnualRate);
    if (state.input.tenureValue != null) $('tenure').value = String(state.input.tenureValue);
    $('tenureUnit').value = state.input.tenureUnit === 'months' ? 'months' : 'years';

    var type = state.input.interestType === 'flat' ? 'flat' : 'reducing';
    document.querySelectorAll('input[name="interestType"]').forEach(function (el) {
      el.checked = el.value === type;
    });
    updateFlatNote();

    var fee = state.input.processingFee || { mode: 'fixed', value: 0, treatment: 'deducted' };
    $('processingFee').value = fee.value != null ? String(fee.value) : '0';
    $('processingUnit').value = fee.mode === 'percent' ? 'percent' : 'amount';
    var treatment = fee.treatment === 'added' || fee.treatment === 'separate' ? fee.treatment : 'deducted';
    document.querySelectorAll('input[name="feeTreatment"]').forEach(function (el) {
      el.checked = el.value === treatment;
    });

    $('otherFees').value = state.input.otherCharges != null ? String(state.input.otherCharges) : '0';
    $('extraPayment').value = state.input.extraMonthlyPayment ? String(state.input.extraMonthlyPayment) : '';
    $('prepayPenalty').value = state.input.prepaymentPenaltyRate != null
      ? String(state.input.prepaymentPenaltyRate) : '0';
    $('oppRate').value = state.input.opportunityAnnualRate != null
      ? String(state.input.opportunityAnnualRate) : '8';
    $('income').value = state.input.grossMonthlyIncome != null
      ? String(state.input.grossMonthlyIncome) : '';
    $('existingDebt').value = state.input.existingMonthlyDebt != null
      ? String(state.input.existingMonthlyDebt) : '';
    $('emergencyFund').value = state.input.emergencyFundMonths || 'unknown';

    if (state.input.lenderType && $('lender')) $('lender').value = state.input.lenderType;
    if (state.input.borrowingReason) {
      var reasonEl = document.querySelector('input[name="reason"][value="' + state.input.borrowingReason + '"]');
      if (reasonEl) reasonEl.checked = true;
    }
  }

  function loadState() {
    var saved = Storage.load();
    if (saved && saved.input && Object.keys(saved.input).length) {
      state.ui.editedByUser = !!(saved.ui && saved.ui.editedByUser);
      if (saved.ui) {
        state.ui.advancedOpen = !!saved.ui.advancedOpen;
        state.ui.selectedPayment = Number(saved.ui.selectedPayment) || 0;
        state.ui.timelineGrouping = saved.ui.timelineGrouping || 'auto';
        if (typeof saved.ui.locale === 'string') locale = saved.ui.locale;
      }
      if (saved.checklist) {
        if (saved.checklist.filter) state.filterAnswers = Object.assign(Object.create(null), saved.checklist.filter);
        if (saved.checklist.escape) state.escape = Object.assign(Object.create(null), saved.checklist.escape);
        if (saved.checklist.redFlags) state.redFlags = Object.assign(Object.create(null), saved.checklist.redFlags);
      }
      if (saved.commitment) {
        state.commitment = saved.commitment;
        COMMIT_FIELDS.forEach(function (id) {
          if (typeof saved.commitment[id] === 'string' && $(id)) $(id).value = saved.commitment[id];
        });
      }
      applyInputToForm(saved.input);
    } else {
      state.ui.editedByUser = false;
      applyInputToForm(clone(Storage.DEFAULT_EXAMPLE));
    }
    syncExampleBadge();
    if (state.ui.advancedOpen) $('advancedDrawer').open = true;
  }

  function syncExampleBadge() {
    var badge = $('exampleBadge');
    if (!badge) return;
    badge.hidden = !!state.ui.editedByUser;
  }

  function markEdited() {
    if (!state.ui.editedByUser) {
      state.ui.editedByUser = true;
      syncExampleBadge();
    }
    persist();
  }

  /* ---------- Currency combobox ---------- */
  var combo = { open: false, active: -1, visible: [] };

  function buildCurrencyOptions() {
    var codes = C.listCurrencies();
    var popularSet = Object.create(null);
    C.POPULAR.forEach(function (c) { popularSet[c] = true; });
    var seen = Object.create(null);
    var out = [];
    C.POPULAR.forEach(function (code) {
      if (seen[code]) return;
      seen[code] = true;
      out.push({ code: code, name: C.currencyName(code, locale), symbol: C.currencySymbol(code, locale), popular: true });
    });
    codes.forEach(function (code) {
      if (seen[code] || popularSet[code]) return;
      seen[code] = true;
      out.push({ code: code, name: C.currencyName(code, locale), symbol: C.currencySymbol(code, locale), popular: false });
    });
    if (!seen[state.input.currency]) state.input.currency = 'USD';
    state.currencyOptions = out;
  }

  function findOption(code) {
    for (var i = 0; i < state.currencyOptions.length; i++) {
      if (state.currencyOptions[i].code === code) return state.currencyOptions[i];
    }
    return null;
  }

  function currentCurrencyLabel() {
    var o = findOption(state.input.currency);
    if (!o) return state.input.currency;
    var sym = o.symbol && o.symbol !== o.code ? ' ' + o.symbol : '';
    return o.code + sym + ' — ' + o.name;
  }

  function filterOptions(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return state.currencyOptions.slice();
    return state.currencyOptions.filter(function (o) {
      return o.code.toLowerCase().indexOf(q) !== -1 || o.name.toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderCurrencyList(query) {
    var list = $('currencyListbox');
    var opts = filterOptions(query);
    combo.visible = opts;
    combo.active = -1;
    if (!opts.length) {
      list.innerHTML = '<li class="combo-empty" role="presentation">No matching currency.</li>';
      return;
    }
    var html = '';
    var wrotePopularHeader = false;
    var wroteAllHeader = false;
    opts.forEach(function (o, i) {
      if (o.popular && !wrotePopularHeader) {
        html += '<li class="combo-group" role="presentation">Popular</li>';
        wrotePopularHeader = true;
      }
      if (!o.popular && !wroteAllHeader) {
        html += '<li class="combo-group" role="presentation">All currencies</li>';
        wroteAllHeader = true;
      }
      var sym = o.symbol && o.symbol !== o.code ? o.symbol : '';
      html += '<li class="combo-opt" role="option" id="cur-opt-' + i + '" data-code="' + o.code + '"'
        + (o.code === state.input.currency ? ' aria-selected="true"' : '')
        + '><span>' + escapeHtml(o.code) + (sym ? ' ' + escapeHtml(sym) : '')
        + '</span><small>' + escapeHtml(o.name) + '</small></li>';
    });
    list.innerHTML = html;
  }

  function openCombo() {
    if (combo.open) return;
    combo.open = true;
    $('currencyListbox').hidden = false;
    $('currencyInput').setAttribute('aria-expanded', 'true');
    renderCurrencyList($('currencyInput').value === currentCurrencyLabel() ? '' : $('currencyInput').value);
  }

  function closeCombo() {
    combo.open = false;
    $('currencyListbox').hidden = true;
    $('currencyInput').setAttribute('aria-expanded', 'false');
    $('currencyInput').removeAttribute('aria-activedescendant');
    combo.active = -1;
  }

  function setActive(idx) {
    var list = $('currencyListbox');
    var items = list.querySelectorAll('.combo-opt');
    if (!items.length) return;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    combo.active = idx;
    items.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
    var el = items[idx];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      $('currencyInput').setAttribute('aria-activedescendant', el.id);
    }
  }

  function selectCurrency(code) {
    if (!findOption(code)) return;
    state.input.currency = code;
    $('currencyInput').value = currentCurrencyLabel();
    updateCurrencyChrome();
    closeCombo();
    markEdited();
    recalculate();
  }

  function bindCombo() {
    var input = $('currencyInput');
    var toggle = $('currencyToggle');
    var list = $('currencyListbox');

    input.addEventListener('focus', function () {
      input.select();
      openCombo();
    });
    input.addEventListener('input', function () {
      if (!combo.open) openCombo();
      else renderCurrencyList(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!combo.open) openCombo(); setActive(combo.active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!combo.open) openCombo(); setActive(combo.active - 1); }
      else if (e.key === 'Enter') {
        if (combo.open && combo.active >= 0 && combo.visible[combo.active]) {
          e.preventDefault();
          selectCurrency(combo.visible[combo.active].code);
        }
      } else if (e.key === 'Escape') {
        if (combo.open) { e.preventDefault(); closeCombo(); input.value = currentCurrencyLabel(); }
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement !== list && !list.contains(document.activeElement)) {
          closeCombo();
          input.value = currentCurrencyLabel();
        }
      }, 120);
    });
    toggle.addEventListener('click', function () {
      if (combo.open) closeCombo();
      else { input.focus(); openCombo(); }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('.combo-opt');
      if (!li) return;
      e.preventDefault();
      selectCurrency(li.getAttribute('data-code'));
    });
  }

  function updateCurrencyChrome() {
    var sym = C.currencySymbol(state.input.currency, locale);
    var code = state.input.currency;
    document.querySelectorAll('[data-currency-prefix]').forEach(function (el) {
      el.textContent = code + (sym && sym !== code ? ' ' + sym : '');
    });
  }

  /* ---------- Populate reasons / lenders / decision chrome ---------- */
  function populateReasons() {
    var wrap = $('reasonList');
    wrap.innerHTML = '';
    Advice.REASONS.forEach(function (r) {
      var id = 'reason_' + r.id;
      var label = document.createElement('label');
      label.className = 'choice';
      label.setAttribute('for', id);
      var risk = Advice.RISK_LABEL[r.risk] || '';
      label.innerHTML = '<input type="radio" name="reason" id="' + id + '" value="' + r.id + '">'
        + '<span class="choice-body"><span>' + escapeHtml(r.label) + '</span>'
        + (risk ? '<span class="risk-chip" data-risk="' + escapeHtml(r.risk) + '">' + escapeHtml(risk) + '</span>' : '')
        + '</span>';
      wrap.appendChild(label);
    });
  }

  function populateLenders() {
    var sel = $('lender');
    sel.innerHTML = '';
    Advice.LENDERS.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.label;
      sel.appendChild(opt);
    });
  }

  function renderEscapeTiers() {
    var host = $('escapeTiers');
    host.innerHTML = '';
    Decision.ESCAPE_TIERS.forEach(function (tier) {
      var block = document.createElement('div');
      block.className = 'sy-escape-tier';
      var h = document.createElement('h4');
      h.textContent = tier.title;
      block.appendChild(h);
      if (tier.note) {
        var note = document.createElement('p');
        note.className = 'hint';
        note.textContent = tier.note;
        block.appendChild(note);
      }
      var ul = document.createElement('ul');
      ul.className = 'sy-escape-list';
      tier.items.forEach(function (item) {
        var key = tier.id + '.' + item.id;
        var id = 'escape_' + tier.id + '_' + item.id;
        var li = document.createElement('li');
        li.innerHTML = '<label for="' + id + '"><input type="checkbox" id="' + id + '" data-escape="' + escapeHtml(key) + '"'
          + (state.escape[key] ? ' checked' : '') + '><span>' + escapeHtml(item.label) + '</span></label>';
        ul.appendChild(li);
      });
      block.appendChild(ul);
      host.appendChild(block);
    });
    host.querySelectorAll('input[data-escape]').forEach(function (box) {
      box.addEventListener('change', function () {
        var key = box.getAttribute('data-escape');
        if (box.checked) state.escape[key] = true;
        else delete state.escape[key];
        markEdited();
        renderFilter();
      });
    });
  }

  function renderLadder() {
    var body = $('ladderBody');
    body.innerHTML = '';
    Decision.LENDER_LADDER.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td data-tone="' + escapeHtml(row.tone) + '">' + escapeHtml(row.label) + '</td>'
        + '<td>' + escapeHtml(row.apr) + '</td>'
        + '<td>' + escapeHtml(row.use) + '</td>';
      body.appendChild(tr);
    });
  }

  function renderRedFlags() {
    var list = $('redFlagList');
    list.innerHTML = '';
    Decision.RED_FLAGS.forEach(function (flag) {
      var id = 'flag_' + flag.id;
      var li = document.createElement('li');
      li.className = 'sy-flag';
      li.innerHTML = '<input type="checkbox" id="' + id + '" data-flag="' + escapeHtml(flag.id) + '"'
        + (state.redFlags[flag.id] ? ' checked' : '') + '>'
        + '<label for="' + id + '">' + escapeHtml(flag.label) + '</label>';
      list.appendChild(li);
    });
    list.querySelectorAll('input[data-flag]').forEach(function (box) {
      box.addEventListener('change', function () {
        var id = box.getAttribute('data-flag');
        if (box.checked) state.redFlags[id] = true;
        else delete state.redFlags[id];
        markEdited();
        renderFilter();
      });
    });
  }

  /* ---------- Form → math input ---------- */
  function readForm() {
    var amountParse = C.parseAmount($('amount').value);
    var rateParse = C.parseAmount($('rate').value);
    var tenureParse = C.parseAmount($('tenure').value);
    var extraParse = C.parseAmount($('extraPayment').value || '0');
    var oppParse = C.parseAmount($('oppRate').value || '8');
    var procParse = C.parseAmount($('processingFee').value || '0');
    var otherParse = C.parseAmount($('otherFees').value || '0');
    var penaltyParse = C.parseAmount($('prepayPenalty').value || '0');
    var incomeParse = C.parseAmount($('income').value || '');
    var existingParse = C.parseAmount($('existingDebt').value || '');
    var unit = $('tenureUnit').value;
    var interestType = document.querySelector('input[name="interestType"]:checked');
    var feeTreatment = document.querySelector('input[name="feeTreatment"]:checked');
    var reason = document.querySelector('input[name="reason"]:checked');

    var errors = {};
    if (!amountParse.ok || amountParse.value <= 0) {
      errors.amount = amountParse.reason === 'scientific'
        ? 'Scientific notation is not allowed.'
        : 'Enter a loan amount greater than zero.';
    }
    if (!rateParse.ok || rateParse.value < 0) {
      errors.rate = 'Enter a valid interest rate (0 or higher).';
    } else if (rateParse.value > 500) {
      errors.rate = 'Rate looks unrealistic. Use the annual %, not monthly.';
    }
    if (!tenureParse.ok || tenureParse.value <= 0) {
      errors.tenure = 'Enter a tenure greater than zero.';
    }
    var months = MathLib.monthsFromTenure(tenureParse.value, unit);
    if (!errors.tenure && (!Number.isFinite(months) || months < 1 || months > 600)) {
      errors.tenure = 'Tenure must be between 1 month and 50 years.';
    }
    if (String($('extraPayment').value || '').trim() !== '' && !extraParse.ok) {
      errors.extra = 'Enter a valid amount, or leave blank.';
    }

    var treatment = feeTreatment ? feeTreatment.value : 'deducted';
    if (treatment !== 'separate' && treatment !== 'added') treatment = 'deducted';

    return {
      errors: errors,
      valid: Object.keys(errors).length === 0,
      principal: amountParse.value,
      annualRatePercent: rateParse.value,
      months: months,
      interestType: interestType ? interestType.value : 'reducing',
      currency: state.input.currency,
      extraMonthly: extraParse.ok ? Math.max(0, extraParse.value) : 0,
      opportunityRatePercent: oppParse.ok ? oppParse.value : 8,
      fees: {
        processing: procParse.ok ? Math.max(0, procParse.value) : 0,
        processingIsPercent: $('processingUnit').value === 'percent',
        other: otherParse.ok ? Math.max(0, otherParse.value) : 0,
        prepaymentPenaltyPercent: penaltyParse.ok ? Math.max(0, penaltyParse.value) : 0,
        treatment: treatment
      },
      grossMonthlyIncome: incomeParse.ok ? incomeParse.value : null,
      existingMonthlyRepayments: existingParse.ok ? existingParse.value : 0,
      lenderId: $('lender').value,
      reasonId: reason ? reason.value : null,
      problemSentence: ($('problemSentence').value || '').trim(),
      emergencyFund: $('emergencyFund').value,
      shortfallType: $('shortfallType').value,
      withComparisons: true
    };
  }

  function showFieldErrors(errors) {
    Object.keys(ERROR_FIELDS).forEach(function (key) {
      var el = $('err-' + key);
      var input = $(ERROR_FIELDS[key]);
      var show = !!errors[key] && !!state.touched[key];
      if (el) {
        if (show) { el.textContent = errors[key]; el.hidden = false; }
        else { el.textContent = ''; el.hidden = true; }
      }
      if (input) {
        if (show) {
          input.setAttribute('aria-invalid', 'true');
          var described = input.getAttribute('aria-describedby') || '';
          if (described.indexOf('err-' + key) === -1) {
            input.setAttribute('aria-describedby', (described + ' err-' + key).trim());
          }
        } else {
          input.removeAttribute('aria-invalid');
        }
      }
    });
  }

  function updateFlatNote() {
    var flat = document.querySelector('input[name="interestType"]:checked');
    $('flatNote').hidden = !(flat && flat.value === 'flat');
  }

  /* ---------- Rendering ---------- */
  function money(n, ccy) {
    return C.formatMoney(n, ccy, locale);
  }

  function renderReality(result) {
    var ccy = result.currency;
    $('realityBorrow').textContent = money(result.principal, ccy);
    $('realityReturn').textContent = money(result.totalPaid, ccy);
    $('realityRent').textContent = money(result.borrowingCost, ccy);

    var principalShare = result.totalPrincipalPaid || result.principal;
    var interestShare = result.totalInterestPaid || 0;
    var feeShare = result.fees && result.fees.treatment !== 'added' ? (result.upfrontFees || 0) : 0;
    // When fees are added, they are inside principal/interest already — omit fee segment.
    if (result.fees && result.fees.treatment === 'added') feeShare = 0;
    var total = principalShare + interestShare + feeShare;
    if (!(total > 0)) total = 1;
    var pFlex = Math.max(principalShare / total, 0);
    var iFlex = Math.max(interestShare / total, 0);
    var fFlex = Math.max(feeShare / total, 0);
    // Keep tiny fee segments visible (≈2px at typical bar widths).
    if (feeShare > 0 && fFlex < 0.02) fFlex = 0.02;
    $('barPrincipal').style.flex = String(pFlex);
    $('barInterest').style.flex = String(iFlex);
    $('barFees').style.flex = String(fFlex);
    $('feesLegend').hidden = feeShare <= 0;
    if ($('legendPrincipal')) $('legendPrincipal').textContent = money(principalShare, ccy);
    if ($('legendCost')) $('legendCost').textContent = money(result.borrowingCost, ccy);
    if ($('legendFees')) $('legendFees').textContent = money(feeShare, ccy);

    $('metricCashValue').textContent = money(result.netProceeds, ccy);
    $('metricEmiValue').textContent = money(result.emi, ccy);

    if (result.costPerHundred != null) {
      $('metricPerHundred').hidden = false;
      var per = result.costPerHundred;
      var unit = 100;
      var returned = Math.round(per * 10) / 10;
      $('metricPerHundredValue').textContent = returned.toFixed(1);
      var sym = C.currencySymbol(ccy, locale) || '';
      $('metricPerHundredSub').textContent =
        'For every ' + sym + unit + ' borrowed you return ' + sym + returned.toFixed(1);
    } else {
      $('metricPerHundred').hidden = true;
    }

    if (result.estimatedNominalAnnualCost != null) {
      $('metricAnnual').hidden = false;
      $('metricAnnualValue').textContent =
        C.formatNumber(result.estimatedNominalAnnualCost, 1, locale) + '%';
    } else {
      $('metricAnnual').hidden = true;
    }

    renderReceipt(result);
  }

  function renderReceipt(result) {
    var ccy = result.currency;
    var fees = result.upfrontFees || 0;
    var treatment = result.fees && result.fees.treatment;
    var rows = [];

    rows.push(['Advertised loan', money(result.principal, ccy)]);
    if (treatment === 'added') {
      rows.push(['Fees added to loan', money(fees, ccy)]);
      rows.push(['Financed principal', money(result.financedPrincipal, ccy)]);
      rows.push(['Cash reaching you', money(result.netProceeds, ccy)]);
    } else if (treatment === 'separate') {
      rows.push(['Fees paid separately', money(fees, ccy)]);
      rows.push(['Cash reaching you', money(result.principal, ccy)]);
      rows.push(['Net after fees (cash-flow)', money(result.netProceeds, ccy)]);
    } else {
      rows.push(['Less upfront charges', money(fees, ccy)]);
      rows.push(['Cash reaching you', money(result.netProceeds, ccy)]);
    }

    rows.push(['Principal returned', money(result.totalPrincipalPaid || result.financedPrincipal, ccy)]);
    rows.push(['Interest paid', money(result.totalInterestPaid, ccy)]);
    rows.push(['Fees paid', money(result.totalFeesPaid != null ? result.totalFeesPaid : fees, ccy)]);
    rows.push(['Total leaving you', money(result.totalPaid, ccy), 'total']);
    rows.push(['Interest + fees', money(result.borrowingCost, ccy), 'cost']);

    var html = '';
    rows.forEach(function (r) {
      var cls = 'sy-receipt__row';
      if (r[2] === 'total') cls += ' sy-receipt__row--total';
      if (r[2] === 'cost') cls += ' sy-receipt__row--cost';
      html += '<div class="' + cls + '"><dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd></div>';
    });
    $('receiptBody').innerHTML = html;
  }

  function renderMoneyFlow(result) {
    if (!MoneyFlow || !$('moneyFlowMount')) return;
    MoneyFlow.render($('moneyFlowMount'), {
      principal: result.principal,
      netProceeds: result.netProceeds,
      upfrontFees: result.upfrontFees || 0,
      totalPaid: result.totalPaid,
      borrowingCost: result.borrowingCost,
      currency: result.currency,
      formatMoney: function (n, ccy) { return money(n, ccy); }
    });
  }

  function renderTimeline(result) {
    if (!Timeline || !$('timelineMount') || !result.schedule) return;
    Timeline.render($('timelineMount'), result.schedule, {
      currency: result.currency,
      formatMoney: function (n, ccy) { return money(n, ccy); },
      interestType: result.interestType,
      selectedMonth: state.ui.selectedPayment || 0,
      grouping: state.ui.timelineGrouping || 'auto',
      onSelect: function (info) {
        state.ui.selectedPayment = info.index || 0;
        if (state.ui.editedByUser) persist();
      }
    });
  }

  function costSignalPosition(nominal) {
    if (nominal == null || !Number.isFinite(nominal)) return 0;
    var capped = Math.max(0, Math.min(nominal, 40));
    return (capped / 40) * 100;
  }

  function renderCostSignal(result) {
    var signal = result.costSignal;
    var marker = $('costSignalMarker');
    var label = $('costSignalLabel');
    var guidance = $('costSignalGuidance');
    var value = $('costSignalValue');
    if (!signal) {
      label.textContent = '—';
      label.setAttribute('data-band', '');
      guidance.textContent = 'Enter a valid loan to see the cost signal.';
      value.textContent = '';
      marker.style.left = '0%';
      return;
    }
    marker.style.left = costSignalPosition(result.estimatedNominalAnnualCost) + '%';
    label.textContent = signal.label;
    label.setAttribute('data-band', signal.band || '');
    guidance.textContent = signal.guidance || '';
    value.textContent = result.estimatedNominalAnnualCost != null
      ? 'Estimated nominal annual cost: ' + C.formatNumber(result.estimatedNominalAnnualCost, 2, locale) + '%'
      : '';
  }

  function renderCashFlow(result) {
    var pressure = result.cashFlowPressure;
    var panel = $('cashFlowPressure');
    var invite = $('cashFlowInvite');
    if (!pressure) {
      panel.hidden = true;
      invite.hidden = false;
      return;
    }
    panel.hidden = false;
    invite.hidden = true;
    var ccy = result.currency;
    var rows = [
      ['Gross monthly income', money(pressure.income, ccy)],
      ['Existing repayments', money(pressure.existing, ccy)],
      ['This loan EMI', money(pressure.emi, ccy)],
      ['Remaining after payments', money(pressure.remaining, ccy)]
    ];
    var html = '';
    rows.forEach(function (r) {
      html += '<div class="sy-pressure__row"><dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd></div>';
    });
    $('cashFlowBody').innerHTML = html;
    var margin = $('cashFlowMargin');
    var labels = {
      comfortable: 'Comfortable margin after obligations',
      watch: 'Watch — margin is thinning',
      tight: 'Tight — little left after payments',
      negative: 'Negative — payments exceed remaining income'
    };
    margin.textContent = labels[pressure.marginLabel] || pressure.marginLabel;
    margin.setAttribute('data-label', pressure.marginLabel || '');
  }

  function renderScenarios(result) {
    var ccy = result.currency;
    var comps = result.comparisons || [];
    var betterList = $('scenarioBetterList');
    betterList.innerHTML = '';
    if (comps.length) {
      var best = comps.slice().sort(function (a, b) {
        return (b.totalSaved || 0) - (a.totalSaved || 0);
      })[0];
      $('scenarioBetterOutcome').textContent = 'Save ' + money(best.totalSaved, ccy);
      $('scenarioBetterOutcome').classList.add('sy-scenario__outcome--save');
      $('scenarioBetterDetail').textContent = best.label + ' · EMI ' + money(best.emi, ccy);
      comps.forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c.label + ' → save ' + money(c.totalSaved, ccy)
          + ' (EMI ' + money(c.emi, ccy) + ')';
        betterList.appendChild(li);
      });
    } else {
      $('scenarioBetterOutcome').textContent = 'No cheaper scenario from these inputs';
      $('scenarioBetterOutcome').classList.remove('sy-scenario__outcome--save');
      $('scenarioBetterDetail').textContent = 'A lower rate, shorter tenure, or fewer fees would appear here when they reduce total cost.';
    }

    var timeline = result.opportunityTimeline;
    var saveList = $('scenarioSaveList');
    saveList.innerHTML = '';
    if (timeline && timeline.length) {
      var last = timeline[timeline.length - 1];
      $('scenarioSaveOutcome').textContent = money(last.invested, ccy);
      $('scenarioSaveDetail').textContent =
        'If you set aside the EMI for ' + last.label + ' at '
        + C.formatNumber(result.opportunity.ratePercent, 1, locale) + '% instead of borrowing.';
      timeline.forEach(function (row) {
        var li = document.createElement('li');
        li.textContent = row.label + ': ' + money(row.saved, ccy) + ' set aside → '
          + money(row.invested, ccy) + ' invested';
        saveList.appendChild(li);
      });
    } else {
      $('scenarioSaveOutcome').textContent = '—';
      $('scenarioSaveDetail').textContent = 'Set an opportunity rate in advanced inputs.';
    }

    var extra = result.withExtra;
    var extraBox = $('scenarioExtra');
    if (extra) {
      extraBox.hidden = false;
      $('scenarioExtraOutcome').textContent = 'Save ' + money(extra.netSaving || extra.totalSaved || 0, ccy);
      $('scenarioExtraDetail').textContent =
        'Finish in ' + extra.months + ' months (vs ' + result.months + ')'
        + (extra.prepaymentPenalty ? ' · penalty ' + money(extra.prepaymentPenalty, ccy) : '');
    } else {
      extraBox.hidden = true;
    }
  }

  function renderWarnings(result) {
    var warn = $('warnings');
    warn.innerHTML = '';
    (result.warnings || []).forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'notice warn';
      div.textContent = w.message;
      warn.appendChild(div);
    });
  }

  function renderAdvice(form, result) {
    var panel = $('advicePanel');
    if (!form.reasonId) {
      panel.hidden = true;
      state.lastAdvice = null;
      return;
    }
    var advice = Advice.buildAdvice({
      reasonId: form.reasonId,
      lenderId: form.lenderId,
      problemSentence: form.problemSentence,
      emergencyFund: form.emergencyFund,
      shortfallType: form.shortfallType,
      loan: result
    });
    state.lastAdvice = advice;
    panel.hidden = false;
    $('adviceHeadline').textContent = advice.headline || '';
    var top = $('topActions');
    top.innerHTML = '';
    (advice.topActions || []).slice(0, 3).forEach(function (a) {
      var li = document.createElement('li');
      li.innerHTML = '<strong>' + escapeHtml(a.title) + '</strong>'
        + (a.detail ? ' — ' + escapeHtml(a.detail) : '');
      top.appendChild(li);
    });
    var more = advice.moreActions || (advice.steps || []).slice(3);
    var moreWrap = $('moreActionsWrap');
    var moreList = $('moreActions');
    moreList.innerHTML = '';
    if (more.length) {
      moreWrap.hidden = false;
      more.forEach(function (a) {
        var li = document.createElement('li');
        li.innerHTML = '<strong>' + escapeHtml(a.title) + '</strong>'
          + (a.detail ? ' — ' + escapeHtml(a.detail) : '');
        moreList.appendChild(li);
      });
    } else {
      moreWrap.hidden = true;
    }
  }

  function tier1Progress() {
    var tier = Decision.ESCAPE_TIERS[0];
    if (!tier) return { total: 0, checked: 0 };
    var checked = 0;
    tier.items.forEach(function (item) {
      if (state.escape[tier.id + '.' + item.id]) checked += 1;
    });
    return { total: tier.items.length, checked: checked };
  }

  function reasonBucket(reasonId) {
    if (!reasonId) return null;
    var r = Advice.reasonById(reasonId);
    if (!r) return null;
    if (r.bucket === 'emergency' || r.bucket === 'invest' || r.bucket === 'lifestyle' || r.bucket === 'debt') {
      return r.bucket === 'debt' ? 'emergency' : r.bucket;
    }
    if (r.risk === 'extreme') return 'lifestyle';
    if (r.risk === 'low') return 'invest';
    return null;
  }

  function buildFilterCtx(result, form) {
    var t1 = tier1Progress();
    var stressRatio = null;
    if (result && result.dti && result.dti.income > 0) {
      stressRatio = result.dti.totalPayments / (result.dti.income * 0.8);
    }
    var commitSigned = COMMIT_FIELDS.some(function (id) {
      return $(id) && String($(id).value || '').trim() !== '';
    });
    return {
      hasResult: !!(result && result.ok),
      feesEntered: !!(result && result.upfrontFees > 0),
      marginLabel: result && result.cashFlowPressure ? result.cashFlowPressure.marginLabel : null,
      comparedAlternative: !!(result && result.comparisons && result.comparisons.length),
      tier1Total: t1.total,
      tier1Checked: t1.checked,
      reasonBucket: reasonBucket(form && form.reasonId),
      stressRatio: stressRatio,
      aprPercent: result ? result.estimatedNominalAnnualCost : null,
      payoffMonths: result ? result.months : null,
      commitmentSigned: commitSigned
    };
  }

  function renderCheckList(container, rows, answers) {
    container.innerHTML = '';
    rows.forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'sy-check';
      var source = row.source === 'derived' ? 'from your numbers' : (row.source === 'manual' ? 'your answer' : '');
      li.innerHTML =
        '<div class="sy-check__q">' + escapeHtml(row.label)
        + (source ? '<span class="sy-check__source">' + escapeHtml(source) + '</span>' : '')
        + '</div>'
        + '<div class="segmented" role="group" aria-label="' + escapeHtml(row.label) + '">'
        + '<button type="button" class="seg-btn" data-check="' + escapeHtml(row.id) + '" data-val="yes" aria-pressed="'
        + (row.answer === 'yes' ? 'true' : 'false') + '">Yes</button>'
        + '<button type="button" class="seg-btn" data-check="' + escapeHtml(row.id) + '" data-val="no" aria-pressed="'
        + (row.answer === 'no' ? 'true' : 'false') + '">No</button>'
        + '</div>';
      container.appendChild(li);
    });
    container.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-check');
        var val = btn.getAttribute('data-val');
        var current = state.filterAnswers[id];
        if (current === val) delete state.filterAnswers[id];
        else state.filterAnswers[id] = val;
        markEdited();
        renderFilter();
      });
    });
  }

  function renderFilter() {
    var result = state.lastValidResult;
    var form = readForm();
    var ctx = buildFilterCtx(result, form);
    var evaluated = Decision.evaluateFilter(ctx, state.filterAnswers, state.redFlags);
    state.lastFilter = evaluated;
    renderCheckList($('primaryChecks'), evaluated.primary, state.filterAnswers);
    renderCheckList($('optionalChecks'), evaluated.optional, state.filterAnswers);
    var verdict = $('filterVerdict');
    verdict.textContent = evaluated.verdict;
    verdict.setAttribute('data-state', evaluated.state || 'pause');
  }

  function renderAmortization(result) {
    if (!state.amortLoaded || !result || !result.schedule) return;
    var body = $('amortBody');
    body.innerHTML = '';
    result.schedule.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.month + '</td>'
        + '<td>' + money(row.payment, result.currency) + '</td>'
        + '<td>' + money(row.principal, result.currency) + '</td>'
        + '<td>' + money(row.interest, result.currency) + '</td>'
        + '<td>' + money(row.balance, result.currency) + '</td>';
      body.appendChild(tr);
    });
  }

  function updateSticky(result) {
    if (!result || !result.ok) return;
    $('stickyEmi').textContent = money(result.emi, result.currency);
    $('stickyInterest').textContent = money(result.borrowingCost, result.currency);
  }

  var liveTimer = null;
  function scheduleLiveSummary(result) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () {
      if (!result || !result.ok) {
        $('liveSummary').textContent = '';
        return;
      }
      $('liveSummary').textContent =
        'Monthly payment ' + money(result.emi, result.currency)
        + '. Total repaid ' + money(result.totalPaid, result.currency)
        + '. Interest and fees ' + money(result.borrowingCost, result.currency) + '.';
    }, 400);
  }

  function setButtons(enabled) {
    $('copySummary').disabled = !enabled;
    $('downloadSummary').disabled = !enabled;
  }

  function renderAll(result, form) {
    state.lastValidResult = result;
    renderReality(result);
    renderMoneyFlow(result);
    renderTimeline(result);
    renderCostSignal(result);
    renderCashFlow(result);
    renderScenarios(result);
    renderWarnings(result);
    renderAdvice(form, result);
    renderFilter();
    updateSticky(result);
    scheduleLiveSummary(result);
    setButtons(true);
    $('resFormula').textContent = result.formulaNote
      + ' Principal ' + money(result.principal, result.currency)
      + ' · ' + C.formatNumber(result.annualRatePercent, 2, locale) + '% p.a. · '
      + result.months + ' months'
      + (result.fees && result.fees.treatment ? ' · fees ' + result.fees.treatment : '') + '.';
    if (state.amortLoaded) renderAmortization(result);
  }

  function recalculate() {
    var form = readForm();
    showFieldErrors(form.errors);
    if (!form.valid) {
      // Keep last valid result visible; only gate buttons if we never had one.
      if (!state.lastValidResult) setButtons(false);
      return;
    }
    var result = MathLib.calculate(form);
    if (!result.ok) {
      if (!state.lastValidResult) setButtons(false);
      return;
    }
    renderAll(result, form);
  }

  /* ---------- Summary export ---------- */
  function buildSummaryText() {
    var r = state.lastValidResult;
    if (!r || !r.ok) return '';
    var includeDecision = $('includeDecision') && $('includeDecision').checked;
    var includeCommit = $('includeCommit') && $('includeCommit').checked;
    var includeAmort = $('includeAmort') && $('includeAmort').checked;

    var lines = [
      'SAVE YOURSELF — LOAN COST SUMMARY',
      'Generated in the browser',
      '',
      'AMOUNT BORROWED:  ' + money(r.principal, r.currency),
      'TOTAL REPAID:  ' + money(r.totalPaid, r.currency),
      'INTEREST + FEES:  ' + money(r.borrowingCost, r.currency),
      '',
      'Cash received: ' + money(r.netProceeds, r.currency),
      'Monthly payment: ' + money(r.emi, r.currency),
      'Rate: ' + C.formatNumber(r.annualRatePercent, 2, locale) + '% p.a. (' + r.interestType + ')',
      'Tenure: ' + r.months + ' months',
      'One-time fees: ' + money(r.upfrontFees || 0, r.currency)
        + (r.fees && r.fees.treatment ? ' (' + r.fees.treatment + ')' : '')
    ];
    if (r.costPerHundred != null) {
      lines.push('For every 100 borrowed you return ' + C.formatNumber(r.costPerHundred, 1, locale));
    }
    if (r.estimatedNominalAnnualCost != null) {
      lines.push('Estimated annual cost: ' + C.formatNumber(r.estimatedNominalAnnualCost, 2, locale) + '%');
    }
    if (r.costSignal) {
      lines.push('Cost signal: ' + r.costSignal.label + ' — ' + r.costSignal.guidance);
    }
    if (r.cashFlowPressure) {
      lines.push('Cash-flow margin: ' + r.cashFlowPressure.marginLabel
        + ' · remaining ' + money(r.cashFlowPressure.remaining, r.currency) + '/month');
    }
    if (r.withExtra) {
      lines.push('With extra payment: finishes in ' + r.withExtra.months
        + ' months · save ' + money(r.withExtra.netSaving || 0, r.currency));
    }
    if (r.comparisons && r.comparisons.length) {
      lines.push('', 'Better-offer scenarios:');
      r.comparisons.forEach(function (c) {
        lines.push('  · ' + c.label + ' → save ' + money(c.totalSaved, r.currency));
      });
    }
    if (r.opportunityTimeline) {
      lines.push('', 'If you saved the payment instead:');
      r.opportunityTimeline.forEach(function (row) {
        lines.push('  · ' + row.label + ': ' + money(row.saved, r.currency)
          + ' set aside → ' + money(row.invested, r.currency) + ' invested');
      });
    }

    if (includeDecision && state.lastFilter) {
      lines.push('', 'Before you sign — ' + state.lastFilter.verdict
        + ' [' + (state.lastFilter.state || '') + ']');
      state.lastFilter.primary.forEach(function (row) {
        lines.push('  [' + (row.answer ? row.answer.toUpperCase() : ' ? ') + '] ' + row.label);
      });
      state.lastFilter.optional.forEach(function (row) {
        if (row.answer) lines.push('  [' + row.answer.toUpperCase() + '] ' + row.label);
      });
      if (state.lastFilter.redFlags && state.lastFilter.redFlags.length) {
        lines.push('  Red flags:');
        state.lastFilter.redFlags.forEach(function (f) {
          lines.push('    ! ' + f.label);
        });
      }
    }

    if (includeCommit) {
      var commit = {};
      COMMIT_FIELDS.forEach(function (id) { commit[id] = $(id) ? $(id).value : ''; });
      if (commit.commitDate || commit.commitExtra || commit.commitBuffer || commit.commitPerson) {
        lines.push('', 'Commitment:');
        if (commit.commitDate) lines.push('  · Payoff by ' + commit.commitDate);
        if (commit.commitExtra) lines.push('  · Extra monthly ' + commit.commitExtra);
        if (commit.commitBuffer) lines.push('  · Buffer before borrowing again ' + commit.commitBuffer);
        if (commit.commitPerson) lines.push('  · Accountability person: ' + commit.commitPerson);
      }
    }

    if (includeAmort && r.schedule) {
      lines.push('', 'Amortization (first 12 months):');
      r.schedule.slice(0, 12).forEach(function (row) {
        lines.push('  ' + row.month + '  pay ' + money(row.payment, r.currency)
          + '  P ' + money(row.principal, r.currency)
          + '  I ' + money(row.interest, r.currency)
          + '  bal ' + money(row.balance, r.currency));
      });
    }

    lines.push(
      '',
      'Educational estimate only — not financial advice. Verify exact terms with the lender.',
      'https://sumanthbolle.com/save-yourself'
    );
    return lines.join('\n');
  }

  async function copySummary() {
    var text = buildSummaryText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashStatus('Summary copied.');
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flashStatus('Summary copied.'); }
      catch (err) { flashStatus('Could not copy — select and copy manually.'); }
      document.body.removeChild(ta);
    }
  }

  function downloadSummary() {
    var text = buildSummaryText();
    if (!text) return;
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'save-yourself-xray.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashStatus('Summary downloaded.');
  }

  function flashStatus(msg) {
    var el = $('actionStatus');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(function () { el.hidden = true; }, 2500);
  }

  function clearSavedData() {
    var ok = window.confirm(
      'Clear saved data on this device?\n\n'
      + 'This removes your loan inputs, checklist answers, red flags, commitment notes, and preferences '
      + 'stored under save-yourself:v2. Example numbers will load again. Nothing is sent to a server.'
    );
    if (!ok) return;
    Storage.clear();
    state.filterAnswers = Object.create(null);
    state.redFlags = Object.create(null);
    state.escape = Object.create(null);
    state.lastValidResult = null;
    state.lastAdvice = null;
    state.lastFilter = null;
    state.amortLoaded = false;
    state.ui = {
      advancedOpen: false,
      selectedPayment: 0,
      timelineGrouping: 'auto',
      editedByUser: false
    };
    COMMIT_FIELDS.forEach(function (id) { if ($(id)) $(id).value = ''; });
    $('problemSentence').value = '';
    $('shortfallType').value = 'unknown';
    $('advancedDrawer').open = false;
    var checkedReason = document.querySelector('input[name="reason"]:checked');
    if (checkedReason) checkedReason.checked = false;
    applyInputToForm(clone(Storage.DEFAULT_EXAMPLE));
    buildCurrencyOptions();
    $('currencyInput').value = currentCurrencyLabel();
    updateCurrencyChrome();
    renderEscapeTiers();
    renderRedFlags();
    syncExampleBadge();
    flashStatus('Saved data cleared. Example numbers restored.');
    recalculate();
  }

  /* ---------- Sticky strip ---------- */
  function bindSticky() {
    var sticky = $('stickyResults');
    var reality = $('realityCanvas');
    if (!sticky || !reality) return;

    function syncSticky() {
      if (!state.lastValidResult || !state.lastValidResult.ok) {
        sticky.classList.remove('show');
        sticky.setAttribute('aria-hidden', 'true');
        return;
      }
      // Only after the user has scrolled past the reality reveal (not while it is still below).
      var rect = reality.getBoundingClientRect();
      var scrolledPast = rect.bottom < 72;
      if (scrolledPast) {
        sticky.classList.add('show');
        sticky.setAttribute('aria-hidden', 'false');
      } else {
        sticky.classList.remove('show');
        sticky.setAttribute('aria-hidden', 'true');
      }
    }

    window.addEventListener('scroll', syncSticky, { passive: true });
    window.addEventListener('resize', syncSticky);
    syncSticky();

    $('stickyView').addEventListener('click', function () {
      reality.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (window.visualViewport) {
      var onVV = function () {
        var vv = window.visualViewport;
        var keyboardOpen = vv.height < window.innerHeight * 0.75;
        sticky.classList.toggle('sy-sticky--kb-hidden', keyboardOpen);
      };
      window.visualViewport.addEventListener('resize', onVV);
      window.visualViewport.addEventListener('scroll', onVV);
    }
  }

  /* ---------- Live bindings ---------- */
  var changeTimer = null;
  function onChange() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(recalculate, 60);
  }

  function bindLive() {
    var textIds = [
      'amount', 'rate', 'tenure', 'extraPayment', 'oppRate', 'processingFee', 'otherFees',
      'prepayPenalty', 'income', 'existingDebt', 'problemSentence'
    ];
    textIds.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', function () {
        markEdited();
        onChange();
      });
    });

    var selectIds = ['tenureUnit', 'processingUnit', 'lender', 'emergencyFund', 'shortfallType'];
    selectIds.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', function () {
        markEdited();
        onChange();
      });
    });

    Object.keys(ERROR_FIELDS).forEach(function (key) {
      var input = $(ERROR_FIELDS[key]);
      if (!input) return;
      input.addEventListener('blur', function () {
        state.touched[key] = true;
        showFieldErrors(readForm().errors);
      });
    });

    document.querySelectorAll('input[name="interestType"]').forEach(function (el) {
      el.addEventListener('change', function () {
        updateFlatNote();
        markEdited();
        onChange();
      });
    });
    document.querySelectorAll('input[name="feeTreatment"]').forEach(function (el) {
      el.addEventListener('change', function () {
        markEdited();
        onChange();
      });
    });
    document.querySelectorAll('input[name="reason"]').forEach(function (el) {
      el.addEventListener('change', function () {
        markEdited();
        onChange();
      });
    });

    $('advancedDrawer').addEventListener('toggle', function () {
      state.ui.advancedOpen = $('advancedDrawer').open;
      if (state.ui.editedByUser) persist();
    });

    $('openAdvancedLink').addEventListener('click', function (e) {
      e.preventDefault();
      $('advancedDrawer').open = true;
      state.ui.advancedOpen = true;
      $('income').focus();
    });

    $('amortWrap').addEventListener('toggle', function () {
      if ($('amortWrap').open && !state.amortLoaded) {
        state.amortLoaded = true;
        if (state.lastValidResult) renderAmortization(state.lastValidResult);
      }
    });

    COMMIT_FIELDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', function () {
        markEdited();
        renderFilter();
      });
      el.addEventListener('change', function () {
        markEdited();
        renderFilter();
      });
    });

    $('copySummary').addEventListener('click', copySummary);
    $('downloadSummary').addEventListener('click', downloadSummary);
    $('clearData').addEventListener('click', clearSavedData);
  }

  function syncThemePressed() {
    var btn = $('themeToggle');
    if (!btn) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function init() {
    populateLenders();
    populateReasons();
    loadState();
    buildCurrencyOptions();
    $('currencyInput').value = currentCurrencyLabel();
    updateCurrencyChrome();
    renderEscapeTiers();
    renderLadder();
    renderRedFlags();
    bindCombo();
    bindLive();
    bindSticky();

    if (window.SBShared) {
      window.SBShared.initNavMenu();
      window.SBShared.initThemeToggle({ storageKey: 'theme' });
    }
    syncThemePressed();
    $('themeToggle').addEventListener('click', function () {
      setTimeout(syncThemePressed, 0);
    });

    recalculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
