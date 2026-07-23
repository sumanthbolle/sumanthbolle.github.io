/**
 * Save Yourself — UI wiring (client-side only).
 */
(function () {
  'use strict';

  var C = window.SYCurrency;
  var MathLib = window.SYLoanMath;
  var Advice = window.SYAdvice;

  var PREF_KEY = 'sy_prefs_v1';
  var locale = C.detectLocale();
  var state = {
    currency: C.detectDefaultCurrency(locale),
    currencyOptions: [],
    lastResult: null,
    lastAdvice: null,
    touched: Object.create(null),
    interacted: false
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Preferences ---------- */
  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p && typeof p.currency === 'string') state.currency = p.currency;
      if (p && typeof p.locale === 'string') locale = p.locale;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        currency: state.currency, locale: locale, savedAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }
  function clearPrefs() {
    try { localStorage.removeItem(PREF_KEY); } catch (e) { /* ignore */ }
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
    if (!seen[state.currency]) state.currency = 'USD';
    state.currencyOptions = out;
  }

  function currentCurrencyLabel() {
    var o = findOption(state.currency);
    if (!o) return state.currency;
    var sym = o.symbol && o.symbol !== o.code ? ' ' + o.symbol : '';
    return o.code + sym + ' — ' + o.name;
  }
  function findOption(code) {
    for (var i = 0; i < state.currencyOptions.length; i++) {
      if (state.currencyOptions[i].code === code) return state.currencyOptions[i];
    }
    return null;
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
        + (o.code === state.currency ? ' aria-selected="true"' : '')
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
    state.currency = code;
    $('currencyInput').value = currentCurrencyLabel();
    savePrefs();
    updateCurrencyChrome();
    closeCombo();
    markInteracted();
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
      if (combo.open) { closeCombo(); }
      else { input.focus(); openCombo(); }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('.combo-opt');
      if (!li) return;
      e.preventDefault();
      selectCurrency(li.getAttribute('data-code'));
    });
  }

  /* ---------- Populate selects ---------- */
  function populateReasons() {
    var wrap = $('reasonList');
    wrap.innerHTML = '';
    Advice.REASONS.forEach(function (r) {
      var id = 'reason_' + r.id;
      var label = document.createElement('label');
      label.className = 'choice';
      label.setAttribute('for', id);
      label.innerHTML = '<input type="radio" name="reason" id="' + id + '" value="' + r.id + '">'
        + '<span>' + escapeHtml(r.label) + '</span>';
      wrap.appendChild(label);
    });
  }
  function populateLenders() {
    var sel = $('lender');
    sel.innerHTML = '';
    Advice.LENDERS.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.id; opt.textContent = l.label;
      sel.appendChild(opt);
    });
  }

  /* ---------- Form reading ---------- */
  function readForm() {
    var amountParse = C.parseAmount($('amount').value);
    var rateParse = C.parseAmount($('rate').value);
    var tenureParse = C.parseAmount($('tenure').value);
    var extraParse = C.parseAmount($('extraPayment').value || '0');
    var oppParse = C.parseAmount($('oppRate').value || '10');
    var procParse = C.parseAmount($('processingFee').value || '0');
    var otherParse = C.parseAmount($('otherFees').value || '0');
    var penaltyParse = C.parseAmount($('prepayPenalty').value || '0');
    var incomeParse = C.parseAmount($('income').value || '');
    var existingParse = C.parseAmount($('existingDebt').value || '');
    var unit = $('tenureUnit').value;
    var interestType = document.querySelector('input[name="interestType"]:checked');
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

    return {
      errors: errors,
      valid: Object.keys(errors).length === 0,
      principal: amountParse.value,
      annualRatePercent: rateParse.value,
      months: months,
      interestType: interestType ? interestType.value : 'reducing',
      currency: state.currency,
      extraMonthly: extraParse.ok ? Math.max(0, extraParse.value) : 0,
      opportunityRatePercent: oppParse.ok ? oppParse.value : 10,
      fees: {
        processing: procParse.ok ? Math.max(0, procParse.value) : 0,
        processingIsPercent: $('processingUnit').value === 'percent',
        other: otherParse.ok ? Math.max(0, otherParse.value) : 0,
        prepaymentPenaltyPercent: penaltyParse.ok ? Math.max(0, penaltyParse.value) : 0
      },
      grossMonthlyIncome: incomeParse.ok ? incomeParse.value : null,
      existingMonthlyRepayments: existingParse.ok ? existingParse.value : 0,
      lenderId: $('lender').value,
      reasonId: reason ? reason.value : null,
      problemSentence: ($('problemSentence').value || '').trim(),
      emergencyFund: $('emergencyFund').value,
      shortfallType: $('shortfallType').value
    };
  }

  var ERROR_FIELDS = { amount: 'amount', rate: 'rate', tenure: 'tenure', extra: 'extraPayment' };

  function showFieldErrors(errors) {
    Object.keys(ERROR_FIELDS).forEach(function (key) {
      var el = $('err-' + key);
      var input = $(ERROR_FIELDS[key]);
      var show = errors[key] && (state.touched[key] || state.submitAttempted);
      if (el) {
        if (show) { el.textContent = errors[key]; el.hidden = false; }
        else { el.textContent = ''; el.hidden = true; }
      }
      if (input) {
        if (show) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    });
  }

  /* ---------- Rendering: results ---------- */
  function setResultsPlaceholder() {
    $('resultsPanel').setAttribute('data-state', 'empty');
    ['resEmi', 'resTotal', 'resInterest', 'resApr', 'resDaily', 'resOpp', 'resDti'].forEach(function (id) {
      $(id).textContent = '—';
    });
    $('resFormula').textContent = 'Enter loan details to see estimated reducing-balance or flat-rate results.';
    $('warnings').innerHTML = '';
    $('extraResults').hidden = true;
    $('amortWrap').hidden = true;
    $('splitViz').hidden = true;
    $('burnViz').hidden = true;
    $('compareViz').hidden = true;
    $('dtiMetric').hidden = true;
    $('oppMetric').hidden = true;
    $('liveSummary').textContent = '';
    setButtons(false);
  }

  function setButtons(enabled) {
    $('copySummary').disabled = !enabled;
    $('downloadSummary').disabled = !enabled;
  }

  function renderResults(result) {
    var panel = $('resultsPanel');
    if (!result.ok) {
      panel.setAttribute('data-state', 'error');
      $('resFormula').textContent = result.message || 'Could not calculate.';
      setButtons(false);
      return;
    }
    panel.setAttribute('data-state', 'ready');
    var ccy = result.currency;

    $('resEmi').textContent = C.formatMoney(result.emi, ccy, locale);
    $('resTotal').textContent = C.formatMoney(result.totalPayable, ccy, locale);
    $('resInterest').textContent = C.formatMoney(result.costOfBorrowing, ccy, locale);
    $('resApr').textContent = result.aprPercent == null
      ? '—'
      : C.formatNumber(result.aprPercent, 2, locale) + '%';
    $('resAprNote').textContent = result.fees.total > 0
      ? 'Includes ' + C.formatMoney(result.fees.total, ccy, locale) + ' in one-time fees; the true annual cost.'
      : 'The true annual cost (no fees entered).';
    $('resDaily').textContent = C.formatMoney(result.costPerDay, ccy, locale);

    $('resFormula').textContent = result.formulaNote
      + ' Principal ' + C.formatMoney(result.principal, ccy, locale)
      + ' · ' + C.formatNumber(result.annualRatePercent, 2, locale) + '% p.a. · '
      + result.months + ' months.';

    // DTI
    if (result.dti) {
      $('dtiMetric').hidden = false;
      $('resDti').textContent = C.formatNumber(result.dti.percent, 0, locale) + '%';
      var bandNote = result.dti.band === 'high'
        ? 'On the higher side. Thresholds vary by lender, product, and country — a smaller amount or shorter tenure eases this.'
        : result.dti.band === 'elevated'
          ? 'Somewhat elevated. Some products (e.g. housing) allow more; this is a signal, not a hard limit.'
          : 'Within a commonly comfortable range, though limits vary by lender and country.';
      $('resDtiNote').textContent = 'About ' + C.formatMoney(result.dti.totalPayments, ccy, locale)
        + ' of debt payments on ' + C.formatMoney(result.dti.income, ccy, locale) + ' income. ' + bandNote;
    } else {
      $('dtiMetric').hidden = true;
    }

    // Opportunity — only when refine is open (per progressive-disclosure)
    var refineOpen = $('refine').open;
    if (refineOpen && result.opportunity && result.opportunity.futureValue > 0) {
      $('oppMetric').hidden = false;
      $('resOpp').textContent = C.formatMoney(result.opportunity.futureValue, ccy, locale);
      $('resOppNote').textContent = result.opportunity.note;
    } else {
      $('oppMetric').hidden = true;
    }

    renderSplit(result);
    renderBurn(result);
    renderComparisons(result);

    var warn = $('warnings');
    warn.innerHTML = '';
    (result.warnings || []).forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'notice visible warn';
      div.textContent = w.message;
      warn.appendChild(div);
    });

    if (result.withExtra && result.withExtra.months > 0) {
      $('extraResults').hidden = false;
      $('extraEmi').textContent = C.formatMoney(result.withExtra.emi, ccy, locale);
      $('extraMonths').textContent = String(result.withExtra.months);
      $('extraSaved').textContent = C.formatMoney(result.withExtra.interestSaved || 0, ccy, locale);
      $('extraTotalSaved').textContent = C.formatMoney(result.withExtra.totalSaved || 0, ccy, locale);
      if (result.withExtra.prepaymentPenalty > 0) {
        $('extraPenaltyNote').hidden = false;
        $('extraPenaltyNote').textContent = 'After a prepayment penalty of '
          + C.formatMoney(result.withExtra.prepaymentPenalty, ccy, locale) + '.';
      } else {
        $('extraPenaltyNote').hidden = true;
      }
    } else {
      $('extraResults').hidden = true;
    }

    renderAmortization(result);

    // Concise live-region summary (screen readers)
    $('liveSummary').textContent = 'EMI ' + C.formatMoney(result.emi, ccy, locale)
      + '. Cost of borrowing ' + C.formatMoney(result.costOfBorrowing, ccy, locale)
      + (result.aprPercent != null ? '. Effective rate ' + C.formatNumber(result.aprPercent, 1, locale) + ' percent.' : '.');

    state.lastResult = result;
    setButtons(true);
  }

  function renderSplit(result) {
    var principal = result.principal;
    var cost = result.costOfBorrowing;
    var total = principal + cost;
    if (total <= 0) { $('splitViz').hidden = true; return; }
    $('splitViz').hidden = false;
    var pPct = Math.max(2, Math.round(principal / total * 100));
    var cPct = Math.max(0, 100 - pPct);
    $('splitP').style.width = pPct + '%';
    $('splitC').style.width = cPct + '%';
    $('legendP').textContent = C.formatMoney(principal, result.currency, locale) + ' (' + pPct + '%)';
    $('legendC').textContent = C.formatMoney(cost, result.currency, locale) + ' (' + cPct + '%)';
  }

  function renderBurn(result) {
    var svg = $('burnChart');
    var schedule = result.schedule;
    if (!schedule || schedule.length < 2) { $('burnViz').hidden = true; return; }
    $('burnViz').hidden = false;

    var W = 640, H = 200, padL = 6, padR = 6, padT = 10, padB = 6;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = schedule.length;

    // Sample to <= 160 points for performance on long tenures.
    var step = Math.max(1, Math.ceil(n / 160));
    var pts = [];
    for (var i = 0; i < n; i += step) pts.push(schedule[i]);
    if (pts[pts.length - 1] !== schedule[n - 1]) pts.push(schedule[n - 1]);

    var maxPay = 0;
    pts.forEach(function (r) { if (r.payment > maxPay) maxPay = r.payment; });
    if (maxPay <= 0) { $('burnViz').hidden = true; return; }

    var m = pts.length;
    function xAt(i) { return padL + (m === 1 ? 0 : (i / (m - 1)) * plotW); }
    var yBase = padT + plotH;
    function hFor(v) { return (v / maxPay) * plotH; }

    var interestTop = [];
    var stackTop = [];
    for (var k = 0; k < m; k++) {
      var iH = hFor(pts[k].interest);
      var pH = hFor(pts[k].principal);
      interestTop.push([xAt(k), yBase - iH]);
      stackTop.push([xAt(k), yBase - (iH + pH)]);
    }

    function poly(topArr, bottomArr) {
      var d = 'M' + topArr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
      for (var j = bottomArr.length - 1; j >= 0; j--) {
        d += ' L' + bottomArr[j][0].toFixed(1) + ',' + bottomArr[j][1].toFixed(1);
      }
      return d + ' Z';
    }
    var baseline = [];
    for (var b = 0; b < m; b++) baseline.push([xAt(b), yBase]);

    var interestArea = poly(interestTop, baseline);
    var principalArea = poly(stackTop, interestTop);

    svg.innerHTML =
      '<path d="' + principalArea + '" fill="var(--principal)" opacity="0.9"></path>'
      + '<path d="' + interestArea + '" fill="var(--interest)" opacity="0.92"></path>';

    // Crossover month: first month principal >= interest
    var crossover = null;
    for (var c = 0; c < schedule.length; c++) {
      if (schedule[c].principal >= schedule[c].interest) { crossover = schedule[c].month; break; }
    }
    var cap;
    if (result.interestType === 'flat') {
      cap = 'Flat-rate loans split interest evenly across every payment, so the true cost stays high the whole term — see the EIR above.';
    } else if (crossover && crossover > 1) {
      cap = 'Early payments are mostly interest. You cross into paying more principal than interest around month ' + crossover + '.';
    } else {
      cap = 'Most of each payment goes to principal from the start — a sign of a low-cost loan.';
    }
    $('burnCap').textContent = cap;
  }

  function renderComparisons(result) {
    var wrap = $('compareViz');
    var body = $('compareBody');
    if (!result.comparisons || !result.comparisons.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var ccy = result.currency;
    var html = '<tr class="current"><td>Your current inputs</td><td>'
      + escapeHtml(C.formatMoney(result.emi, ccy, locale)) + '</td><td>'
      + escapeHtml(C.formatMoney(result.totalInterest, ccy, locale)) + '</td><td>—</td></tr>';
    result.comparisons.forEach(function (c) {
      var emiCell = escapeHtml(C.formatMoney(c.emi, ccy, locale));
      if (c.id === 'shorter_tenure' && typeof c.emiDelta === 'number' && c.emiDelta > 0) {
        emiCell += ' <span class="up">(+' + escapeHtml(C.formatMoney(c.emiDelta, ccy, locale)) + ')</span>';
      }
      html += '<tr><td>' + escapeHtml(c.label) + '</td><td>' + emiCell + '</td><td>'
        + escapeHtml(C.formatMoney(c.totalInterest, ccy, locale)) + '</td><td class="save">'
        + (c.interestSaved > 0 ? escapeHtml(C.formatMoney(c.interestSaved, ccy, locale)) : '—') + '</td></tr>';
    });
    body.innerHTML = html;
  }

  function renderAmortization(result) {
    var wrap = $('amortWrap');
    var body = $('amortBody');
    if (!result.schedule || !result.schedule.length) { wrap.hidden = true; body.innerHTML = ''; return; }
    wrap.hidden = false;
    var rows = result.schedule, html = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      html += '<tr><td>' + row.month + '</td><td>'
        + escapeHtml(C.formatMoney(row.payment, result.currency, locale)) + '</td><td>'
        + escapeHtml(C.formatMoney(row.principal, result.currency, locale)) + '</td><td>'
        + escapeHtml(C.formatMoney(row.interest, result.currency, locale)) + '</td><td>'
        + escapeHtml(C.formatMoney(row.balance, result.currency, locale)) + '</td></tr>';
    }
    body.innerHTML = html;
  }

  /* ---------- Rendering: advice ---------- */
  function renderAdvice(advice) {
    state.lastAdvice = advice;
    $('advicePanel').hidden = false;
    $('adviceHeadline').textContent = advice.headline;
    $('adviceSeverity').textContent = severityLabel(advice.severity);
    $('adviceSeverity').setAttribute('data-level', advice.severity);

    function fillSteps(id, arr) {
      var el = $(id);
      el.innerHTML = '';
      arr.forEach(function (s) {
        var li = document.createElement('li');
        li.innerHTML = '<strong>' + escapeHtml(s.title) + '</strong><span>' + escapeHtml(s.detail) + '</span>';
        el.appendChild(li);
      });
    }
    fillSteps('topActions', advice.topActions);
    if (advice.moreActions && advice.moreActions.length) {
      $('moreActionsWrap').hidden = false;
      fillSteps('moreActions', advice.moreActions);
    } else {
      $('moreActionsWrap').hidden = true;
    }

    $('honestQuote').textContent = '“' + advice.honestQuestion + '”';

    function fillList(id, arr) {
      var el = $(id);
      el.innerHTML = '';
      arr.forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t;
        el.appendChild(li);
      });
    }
    fillList('plan30', advice.plan.days30);
    fillList('plan60', advice.plan.days60);
    fillList('plan90', advice.plan.days90);
    fillList('alternatives', advice.alternatives);

    var rules = $('triggeredRules');
    rules.innerHTML = '';
    advice.triggeredRules.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.label;
      rules.appendChild(li);
    });
  }

  function severityLabel(level) {
    if (level === 'critical') return 'Highest caution';
    if (level === 'high') return 'Extra caution';
    if (level === 'low') return 'Lower urgency';
    return 'Worth a careful look';
  }

  /* ---------- Recalculate ---------- */
  function recalculate() {
    var form = readForm();
    showFieldErrors(form.errors);

    if (!form.valid) {
      setResultsPlaceholder();
      $('advicePanel').hidden = true;
      state.lastResult = null;
      updateSticky();
      return;
    }

    var result = MathLib.calculate({
      principal: form.principal,
      annualRatePercent: form.annualRatePercent,
      months: form.months,
      interestType: form.interestType,
      currency: form.currency,
      extraMonthly: form.extraMonthly,
      opportunityRatePercent: form.opportunityRatePercent,
      fees: form.fees,
      grossMonthlyIncome: form.grossMonthlyIncome,
      existingMonthlyRepayments: form.existingMonthlyRepayments,
      withComparisons: true
    });

    renderResults(result);

    if (form.reasonId && result.ok) {
      renderAdvice(Advice.buildAdvice({
        reasonId: form.reasonId,
        problemSentence: form.problemSentence,
        lenderId: form.lenderId,
        emergencyFund: form.emergencyFund,
        shortfallType: form.shortfallType,
        loan: result
      }));
    } else {
      $('advicePanel').hidden = true;
      state.lastAdvice = null;
    }

    updateSticky();
  }

  function updateSticky() {
    var sticky = $('stickyResults');
    if (!sticky || !state.lastResult || !state.lastResult.ok) {
      if (sticky) sticky.classList.remove('show');
      return;
    }
    var r = state.lastResult;
    $('stickyEmi').textContent = C.formatMoney(r.emi, r.currency, locale);
    $('stickyInterest').textContent = C.formatMoney(r.costOfBorrowing, r.currency, locale);
  }

  /* ---------- Summary export ---------- */
  function buildSummaryText() {
    var r = state.lastResult;
    if (!r || !r.ok) return '';
    var lines = [
      'Save Yourself — estimated loan cost summary',
      'Generated locally · nothing sent to a server',
      '',
      'Principal: ' + C.formatMoney(r.principal, r.currency, locale),
      'Rate: ' + C.formatNumber(r.annualRatePercent, 2, locale) + '% p.a. (' + r.interestType + ')',
      'Tenure: ' + r.months + ' months',
      'One-time fees: ' + C.formatMoney(r.fees.total, r.currency, locale),
      'EMI: ' + C.formatMoney(r.emi, r.currency, locale),
      'Total repayable: ' + C.formatMoney(r.totalPayable, r.currency, locale),
      'Cost of borrowing (interest + fees): ' + C.formatMoney(r.costOfBorrowing, r.currency, locale),
      'Effective rate (EIR/APR): ' + (r.aprPercent == null ? 'n/a' : C.formatNumber(r.aprPercent, 2, locale) + '%'),
      'Approx. cost / day: ' + C.formatMoney(r.costPerDay, r.currency, locale)
    ];
    if (r.dti) {
      lines.push('Debt-to-income with this EMI: ' + C.formatNumber(r.dti.percent, 0, locale) + '%');
    }
    if (r.opportunity && r.opportunity.futureValue > 0) {
      lines.push('Opportunity illustration (' + r.opportunity.ratePercent + '%): '
        + C.formatMoney(r.opportunity.futureValue, r.currency, locale));
    }
    if (r.withExtra) {
      lines.push('With extra payment: EMI ' + C.formatMoney(r.withExtra.emi, r.currency, locale)
        + ' · finishes in ' + r.withExtra.months + ' months · interest saved '
        + C.formatMoney(r.withExtra.interestSaved || 0, r.currency, locale));
    }
    if (r.comparisons && r.comparisons.length) {
      lines.push('', 'Better-deal scenarios:');
      r.comparisons.forEach(function (c) {
        lines.push('  · ' + c.label + ' → EMI ' + C.formatMoney(c.emi, r.currency, locale)
          + ', save ' + C.formatMoney(c.interestSaved, r.currency, locale) + ' interest');
      });
    }
    if (state.lastAdvice) {
      lines.push('', 'Guidance: ' + state.lastAdvice.headline);
      lines.push('Top actions:');
      state.lastAdvice.topActions.forEach(function (a) { lines.push('  · ' + a.title); });
    }
    lines.push('', 'Educational estimate only — not financial advice. Verify exact terms with the lender.',
      'https://sumanthbolle.com/save-yourself');
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
      ta.value = text; document.body.appendChild(ta); ta.select();
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
    a.href = url; a.download = 'save-yourself-summary.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashStatus('Summary downloaded.');
  }
  function flashStatus(msg) {
    var el = $('actionStatus');
    el.textContent = msg; el.hidden = false;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(function () { el.hidden = true; }, 2500);
  }

  /* ---------- Currency chrome ---------- */
  function updateCurrencyChrome() {
    var sym = C.currencySymbol(state.currency, locale);
    var code = state.currency;
    document.querySelectorAll('[data-currency-prefix]').forEach(function (el) {
      el.textContent = code + (sym && sym !== code ? ' ' + sym : '');
    });
  }

  /* ---------- Interaction / debounce ---------- */
  var changeTimer = null;
  function onChange() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(recalculate, 60);
  }
  function markInteracted() { state.interacted = true; }

  function bindLive() {
    var textIds = ['amount', 'rate', 'tenure', 'extraPayment', 'oppRate', 'processingFee', 'otherFees',
      'prepayPenalty', 'income', 'existingDebt', 'problemSentence'];
    textIds.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', function () { markInteracted(); onChange(); });
    });
    var selectIds = ['tenureUnit', 'processingUnit', 'lender', 'emergencyFund', 'shortfallType'];
    selectIds.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', function () { markInteracted(); onChange(); });
    });
    // Deferred validation: mark touched on blur.
    Object.keys(ERROR_FIELDS).forEach(function (key) {
      var input = $(ERROR_FIELDS[key]);
      if (!input) return;
      input.addEventListener('blur', function () { state.touched[key] = true; showFieldErrors(readForm().errors); });
    });

    document.querySelectorAll('input[name="interestType"]').forEach(function (el) {
      el.addEventListener('change', function () { markInteracted(); onChange(); });
    });
    document.querySelectorAll('input[name="reason"]').forEach(function (el) {
      el.addEventListener('change', function () { markInteracted(); onChange(); });
    });

    $('refine').addEventListener('toggle', function () { recalculate(); });

    $('copySummary').addEventListener('click', copySummary);
    $('downloadSummary').addEventListener('click', downloadSummary);
    $('clearData').addEventListener('click', function () {
      clearPrefs();
      ['amount', 'rate', 'tenure', 'extraPayment', 'processingFee', 'otherFees', 'income',
        'existingDebt', 'problemSentence'].forEach(function (id) { $(id).value = ''; });
      $('prepayPenalty').value = '0';
      $('oppRate').value = '10';
      state.touched = Object.create(null);
      state.submitAttempted = false;
      var checkedReason = document.querySelector('input[name="reason"]:checked');
      if (checkedReason) checkedReason.checked = false;
      setResultsPlaceholder();
      $('advicePanel').hidden = true;
      flashStatus('Local data cleared.');
      recalculate();
    });

    if ('IntersectionObserver' in window) {
      var results = $('resultsPanel');
      var sticky = $('stickyResults');
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!state.lastResult || !state.lastResult.ok) { sticky.classList.remove('show'); return; }
          if (!entry.isIntersecting) sticky.classList.add('show');
          else sticky.classList.remove('show');
        });
      }, { rootMargin: '-48px 0px 0px 0px', threshold: 0 });
      obs.observe(results);
    }
  }

  /* ---------- Theme toggle a11y ---------- */
  function syncThemePressed() {
    var btn = $('themeToggle');
    if (!btn) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function init() {
    loadPrefs();
    buildCurrencyOptions();
    $('currencyInput').value = currentCurrencyLabel();
    populateLenders();
    populateReasons();
    updateCurrencyChrome();
    setResultsPlaceholder();
    bindCombo();
    bindLive();

    if (window.SBShared) {
      window.SBShared.initNavMenu();
      window.SBShared.initNavDropdowns();
      window.SBShared.initThemeToggle({ storageKey: 'theme' });
    }
    syncThemePressed();
    $('themeToggle').addEventListener('click', function () { setTimeout(syncThemePressed, 0); });

    recalculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
