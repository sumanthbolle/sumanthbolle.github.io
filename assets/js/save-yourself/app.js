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
    lastResult: null,
    lastAdvice: null
  };

  function $(id) { return document.getElementById(id); }

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
        currency: state.currency,
        locale: locale,
        savedAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  function clearPrefs() {
    try { localStorage.removeItem(PREF_KEY); } catch (e) { /* ignore */ }
  }

  function populateCurrencySelect() {
    var sel = $('currency');
    var codes = C.listCurrencies();
    sel.innerHTML = '';
    var groupPopular = document.createElement('optgroup');
    groupPopular.label = 'Popular';
    var groupAll = document.createElement('optgroup');
    groupAll.label = 'All currencies';

    var popularSet = Object.create(null);
    C.POPULAR.forEach(function (code) { popularSet[code] = true; });

    var seen = Object.create(null);
    function addOption(group, code) {
      if (seen[code]) return;
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = C.labelFor(code, locale);
      group.appendChild(opt);
      seen[code] = true;
    }

    C.POPULAR.forEach(function (code) {
      if (codes.indexOf(code) !== -1 || true) addOption(groupPopular, code);
    });
    codes.forEach(function (code) {
      if (popularSet[code]) return;
      addOption(groupAll, code);
    });

    sel.appendChild(groupPopular);
    sel.appendChild(groupAll);
    if (!seen[state.currency]) state.currency = 'USD';
    sel.value = state.currency;
  }

  function populateReasons() {
    var wrap = $('reasonList');
    wrap.innerHTML = '';
    Advice.REASONS.forEach(function (r, i) {
      var id = 'reason_' + r.id;
      var label = document.createElement('label');
      label.className = 'choice';
      label.setAttribute('for', id);
      label.innerHTML =
        '<input type="radio" name="reason" id="' + id + '" value="' + r.id + '"'
        + (i === 0 ? '' : '') + '>'
        + '<span>' + escapeHtml(r.label) + '</span>';
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readForm() {
    var amountParse = C.parseAmount($('amount').value);
    var rateParse = C.parseAmount($('rate').value);
    var tenureParse = C.parseAmount($('tenure').value);
    var extraParse = C.parseAmount($('extraPayment').value || '0');
    var oppParse = C.parseAmount($('oppRate').value || '10');
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
      errors.rate = 'Rate looks unrealistic. Check the number (use annual %, not monthly).';
    }
    if (!tenureParse.ok || tenureParse.value <= 0) {
      errors.tenure = 'Enter a tenure greater than zero.';
    }
    var months = MathLib.monthsFromTenure(tenureParse.value, unit);
    if (!errors.tenure && (!Number.isFinite(months) || months < 1 || months > 600)) {
      errors.tenure = 'Tenure must be between 1 month and 50 years.';
    }
    if (extraParse.ok === false && String($('extraPayment').value || '').trim() !== '') {
      errors.extra = 'Enter a valid extra payment amount, or leave blank.';
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
      lenderId: $('lender').value,
      reasonId: reason ? reason.value : null,
      problemSentence: ($('problemSentence').value || '').trim(),
      existingDebt: ($('existingDebt').value || '').trim(),
      emergencyFund: $('emergencyFund').value,
      debtRatioHigh: $('debtRatio').value,
      shortfallType: $('shortfallType').value
    };
  }

  function showFieldErrors(errors) {
    ['amount', 'rate', 'tenure', 'extra'].forEach(function (key) {
      var el = $('err-' + key);
      if (!el) return;
      if (errors[key]) {
        el.textContent = errors[key];
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    });
  }

  function setResultsPlaceholder() {
    $('resultsPanel').setAttribute('data-state', 'empty');
    $('resEmi').textContent = '—';
    $('resTotal').textContent = '—';
    $('resInterest').textContent = '—';
    $('resDaily').textContent = '—';
    $('resOpp').textContent = '—';
    $('resFormula').textContent = 'Enter loan details to see exact reducing-balance or flat-rate results.';
    $('warnings').innerHTML = '';
    $('extraResults').hidden = true;
    $('amortWrap').hidden = true;
  }

  function renderResults(result) {
    var panel = $('resultsPanel');
    if (!result.ok) {
      panel.setAttribute('data-state', 'error');
      $('resFormula').textContent = result.message || 'Could not calculate.';
      return;
    }
    panel.setAttribute('data-state', 'ready');
    var ccy = result.currency;
    $('resEmi').textContent = C.formatMoney(result.emi, ccy, locale);
    $('resTotal').textContent = C.formatMoney(result.totalPayable, ccy, locale);
    $('resInterest').textContent = C.formatMoney(result.totalInterest, ccy, locale);
    $('resDaily').textContent = C.formatMoney(result.costPerDay, ccy, locale);
    $('resOpp').textContent = C.formatMoney(result.opportunity.futureValue, ccy, locale);
    $('resOppNote').textContent = result.opportunity.note;
    $('resFormula').textContent = result.formulaNote
      + ' Principal '
      + C.formatMoney(result.principal, ccy, locale)
      + ' · '
      + C.formatNumber(result.annualRatePercent, 2, locale)
      + '% p.a. · '
      + result.months
      + ' months.';

    var warn = $('warnings');
    warn.innerHTML = '';
    (result.warnings || []).forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'notice visible warn';
      div.setAttribute('role', 'status');
      div.textContent = w.message;
      warn.appendChild(div);
    });

    if (result.withExtra && result.withExtra.months > 0) {
      $('extraResults').hidden = false;
      $('extraEmi').textContent = C.formatMoney(result.withExtra.emi, ccy, locale);
      $('extraMonths').textContent = String(result.withExtra.months);
      $('extraSaved').textContent = C.formatMoney(result.withExtra.interestSaved || 0, ccy, locale);
      $('extraTotalSaved').textContent = C.formatMoney(result.withExtra.totalSaved || 0, ccy, locale);
    } else {
      $('extraResults').hidden = true;
    }

    renderAmortization(result);
    state.lastResult = result;
  }

  function renderAmortization(result) {
    var wrap = $('amortWrap');
    var body = $('amortBody');
    if (!result.schedule || !result.schedule.length) {
      wrap.hidden = true;
      body.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    var rows = result.schedule;
    var html = '';
    var maxShow = rows.length;
    for (var i = 0; i < maxShow; i++) {
      var row = rows[i];
      html += '<tr>'
        + '<td>' + row.month + '</td>'
        + '<td>' + escapeHtml(C.formatMoney(row.payment, result.currency, locale)) + '</td>'
        + '<td>' + escapeHtml(C.formatMoney(row.principal, result.currency, locale)) + '</td>'
        + '<td>' + escapeHtml(C.formatMoney(row.interest, result.currency, locale)) + '</td>'
        + '<td>' + escapeHtml(C.formatMoney(row.balance, result.currency, locale)) + '</td>'
        + '</tr>';
    }
    body.innerHTML = html;
  }

  function renderAdvice(advice) {
    state.lastAdvice = advice;
    var box = $('advicePanel');
    box.hidden = false;

    $('adviceHeadline').textContent = advice.headline;
    $('adviceSeverity').textContent = severityLabel(advice.severity);
    $('adviceSeverity').setAttribute('data-level', advice.severity);

    var rules = $('triggeredRules');
    rules.innerHTML = '';
    advice.triggeredRules.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.label;
      rules.appendChild(li);
    });

    var steps = $('adviceSteps');
    steps.innerHTML = '';
    advice.steps.forEach(function (s, idx) {
      var li = document.createElement('li');
      li.innerHTML = '<strong>' + escapeHtml(s.title) + '</strong>'
        + '<span>' + escapeHtml(s.detail) + '</span>';
      steps.appendChild(li);
    });

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
  }

  function severityLabel(level) {
    if (level === 'critical') return 'Critical caution';
    if (level === 'high') return 'Strong caution';
    if (level === 'low') return 'Lower urgency';
    return 'Worth a careful look';
  }

  function recalculate() {
    var form = readForm();
    showFieldErrors(form.errors);
    var btn = $('copySummary');
    if (!form.valid) {
      setResultsPlaceholder();
      $('advicePanel').hidden = true;
      if (btn) btn.disabled = true;
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
      opportunityRatePercent: form.opportunityRatePercent
    });

    renderResults(result);

    if (form.reasonId && result.ok) {
      var advice = Advice.buildAdvice({
        reasonId: form.reasonId,
        problemSentence: form.problemSentence,
        lenderId: form.lenderId,
        emergencyFund: form.emergencyFund,
        debtRatioHigh: form.debtRatioHigh,
        shortfallType: form.shortfallType,
        existingEmis: form.existingDebt,
        loan: result
      });
      renderAdvice(advice);
    } else {
      $('advicePanel').hidden = true;
      state.lastAdvice = null;
    }

    if (btn) btn.disabled = !result.ok;
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
    $('stickyInterest').textContent = C.formatMoney(r.totalInterest, r.currency, locale);
    // show on small screens when results scrolled past
  }

  function buildSummaryText() {
    var r = state.lastResult;
    if (!r || !r.ok) return '';
    var lines = [
      'Save Yourself — loan cost summary',
      'Generated locally · nothing sent to a server',
      '',
      'Principal: ' + C.formatMoney(r.principal, r.currency, locale),
      'Rate: ' + C.formatNumber(r.annualRatePercent, 2, locale) + '% p.a. (' + r.interestType + ')',
      'Tenure: ' + r.months + ' months',
      'EMI: ' + C.formatMoney(r.emi, r.currency, locale),
      'Total repayable: ' + C.formatMoney(r.totalPayable, r.currency, locale),
      'Interest (pure loss): ' + C.formatMoney(r.totalInterest, r.currency, locale),
      'Approx. cost / day: ' + C.formatMoney(r.costPerDay, r.currency, locale),
      'Opportunity illustration (' + r.opportunity.ratePercent + '%): '
        + C.formatMoney(r.opportunity.futureValue, r.currency, locale)
    ];
    if (r.withExtra) {
      lines.push(
        'With extra payment: EMI '
        + C.formatMoney(r.withExtra.emi, r.currency, locale)
        + ' · finishes in '
        + r.withExtra.months
        + ' months · interest saved '
        + C.formatMoney(r.withExtra.interestSaved || 0, r.currency, locale)
      );
    }
    if (state.lastAdvice) {
      lines.push('', 'Guidance: ' + state.lastAdvice.headline);
      lines.push('Rules triggered: ' + state.lastAdvice.triggeredRules.map(function (x) {
        return x.label;
      }).join('; '));
    }
    lines.push('', 'Educational only — not financial advice.', 'https://sumanthbolle.com/save-yourself');
    return lines.join('\n');
  }

  async function copySummary() {
    var text = buildSummaryText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashStatus('Summary copied.');
    } catch (e) {
      // fallback
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
    a.download = 'save-yourself-summary.txt';
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

  function bindLive() {
    var ids = [
      'amount', 'rate', 'tenure', 'tenureUnit', 'extraPayment', 'oppRate',
      'lender', 'problemSentence', 'existingDebt', 'emergencyFund', 'debtRatio', 'shortfallType'
    ];
    ids.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });
    document.querySelectorAll('input[name="interestType"]').forEach(function (el) {
      el.addEventListener('change', onChange);
    });
    document.querySelectorAll('input[name="reason"]').forEach(function (el) {
      el.addEventListener('change', onChange);
    });

    $('currency').addEventListener('change', function () {
      state.currency = $('currency').value;
      savePrefs();
      updateCurrencyChrome();
      onChange();
    });

    $('currencySearch').addEventListener('input', function () {
      filterCurrencyOptions($('currencySearch').value);
    });

    $('copySummary').addEventListener('click', copySummary);
    $('downloadSummary').addEventListener('click', downloadSummary);
    $('clearData').addEventListener('click', function () {
      clearPrefs();
      $('amount').value = '';
      $('rate').value = '';
      $('tenure').value = '';
      $('extraPayment').value = '';
      $('problemSentence').value = '';
      $('existingDebt').value = '';
      setResultsPlaceholder();
      $('advicePanel').hidden = true;
      flashStatus('Local preferences cleared.');
      onChange();
    });

    // sticky bar visibility
    if ('IntersectionObserver' in window) {
      var results = $('resultsPanel');
      var sticky = $('stickyResults');
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!state.lastResult || !state.lastResult.ok) {
            sticky.classList.remove('show');
            return;
          }
          if (!entry.isIntersecting) sticky.classList.add('show');
          else sticky.classList.remove('show');
        });
      }, { rootMargin: '-48px 0px 0px 0px', threshold: 0 });
      obs.observe(results);
    }
  }

  function filterCurrencyOptions(query) {
    var q = String(query || '').trim().toLowerCase();
    var sel = $('currency');
    var options = sel.querySelectorAll('option');
    var firstVisible = null;
    options.forEach(function (opt) {
      if (!q) {
        opt.hidden = false;
        if (!firstVisible) firstVisible = opt;
        return;
      }
      var match = opt.textContent.toLowerCase().indexOf(q) !== -1
        || opt.value.toLowerCase().indexOf(q) !== -1;
      opt.hidden = !match;
      if (match && !firstVisible) firstVisible = opt;
    });
    // optgroup visibility: hide empty groups
    sel.querySelectorAll('optgroup').forEach(function (g) {
      var any = false;
      g.querySelectorAll('option').forEach(function (o) {
        if (!o.hidden) any = true;
      });
      g.hidden = !any;
    });
  }

  function updateCurrencyChrome() {
    var sym = C.currencySymbol(state.currency, locale);
    var code = state.currency;
    document.querySelectorAll('[data-currency-prefix]').forEach(function (el) {
      el.textContent = code + (sym && sym !== code ? ' ' + sym : '');
    });
  }

  var changeTimer = null;
  function onChange() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(recalculate, 120);
  }

  function init() {
    loadPrefs();
    populateCurrencySelect();
    populateLenders();
    populateReasons();
    updateCurrencyChrome();
    setResultsPlaceholder();
    bindLive();

    // Demo-friendly defaults (not auto-submitted as “advice” without reason)
    if (!$('amount').value) {
      // leave blank — user must enter; privacy-first empty state
    }

    if (window.SBShared) {
      window.SBShared.initNavMenu();
      window.SBShared.initThemeToggle({ storageKey: 'theme' });
    }

    // Initial calc if fields prefilled
    onChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
