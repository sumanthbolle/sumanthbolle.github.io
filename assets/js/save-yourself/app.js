/* Save Yourself — loan cost checker.
   Reads four inputs, shows one plain answer, and hands the numbers to Summaverick. */
(function () {
  'use strict';

  var C = window.SYCurrency;
  var L = window.SYLoanMath;
  var STORE_KEY = 'sy-simple-v1';
  var locale = C.detectLocale();

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    amount: $('amount'),
    rate: $('rate'),
    tenure: $('tenure'),
    tenureUnit: $('tenureUnit'),
    fee: $('fee'),
    currency: $('currency'),
    answer: $('answer'),
    barPrincipal: $('barPrincipal'),
    barCost: $('barCost'),
    numEmi: $('numEmi'),
    numTotal: $('numTotal'),
    numCost: $('numCost'),
    verdict: $('verdict'),
    scheduleBody: $('scheduleBody'),
    ask: $('ask'),
    askForm: $('askForm'),
    askInput: $('askInput')
  };

  var VERDICT = {
    lower: 'Reasonable for a loan. Still compare one or two other offers.',
    elevated: 'On the high side. A lower rate or smaller fee would save real money.',
    expensive: 'Expensive. Try another lender, a smaller amount or a shorter term.',
    severe: 'Very expensive. Pause and look for alternatives before signing.'
  };

  var current = null;

  function money(value) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: els.currency.value,
        maximumFractionDigits: 0
      }).format(Math.round(value));
    } catch (e) {
      return C.formatMoney(value, els.currency.value, locale);
    }
  }

  function num(input) {
    var parsed = C.parseAmount(input.value);
    return parsed.ok ? parsed.value : NaN;
  }

  function interestType() {
    var checked = document.querySelector('input[name="interestType"]:checked');
    return checked ? checked.value : 'reducing';
  }

  function setError(field, message) {
    var input = els[field];
    var out = $('err-' + field);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    out.textContent = message || '';
    out.hidden = !message;
  }

  function fillCurrencies() {
    var preferred = C.detectDefaultCurrency(locale) || 'INR';
    C.POPULAR.forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = C.labelFor(code, locale);
      els.currency.appendChild(opt);
    });
    els.currency.value = C.POPULAR.indexOf(preferred) >= 0 ? preferred : 'INR';
  }

  function updatePrefix() {
    var sym = C.currencySymbol(els.currency.value, locale);
    document.querySelectorAll('[data-currency-prefix]').forEach(function (node) {
      node.textContent = sym;
    });
  }

  function yearlyRows(schedule) {
    var rows = [];
    for (var i = 0; i < schedule.length; i += 12) {
      var slice = schedule.slice(i, i + 12);
      rows.push({
        year: rows.length + 1,
        paid: slice.reduce(function (s, r) { return s + r.payment; }, 0),
        interest: slice.reduce(function (s, r) { return s + r.interest; }, 0),
        balance: slice[slice.length - 1].balance
      });
    }
    return rows;
  }

  function renderEmpty() {
    current = null;
    els.answer.innerHTML = '<span class="sy-empty">Enter amount, rate and term.</span>';
    els.numEmi.textContent = els.numTotal.textContent = els.numCost.textContent = '—';
    els.barPrincipal.style.flexGrow = 1;
    els.barCost.style.flexGrow = 0;
    els.verdict.hidden = true;
    els.scheduleBody.innerHTML = '';
    els.ask.dataset.ready = 'false';
  }

  function render(r) {
    current = r;
    var extra = r.costOfBorrowing;
    var per100 = Math.round((r.totalPaid / r.principal) * 100);

    els.answer.innerHTML =
      'You pay <strong>' + money(r.emi) + '</strong> a month for ' + r.months + ' months. ' +
      'For every 100 you borrow, you pay back <strong class="cost">' + per100 + '</strong>.';

    els.numEmi.textContent = money(r.emi);
    els.numTotal.textContent = money(r.totalPaid);
    els.numCost.textContent = money(extra);
    els.barPrincipal.style.flexGrow = r.principal;
    els.barCost.style.flexGrow = Math.max(0, extra);

    var signal = r.costSignal;
    if (signal && r.estimatedNominalAnnualCost != null) {
      var rateNote = r.interestType === 'flat' || r.upfrontFees > 0
        ? 'Real yearly cost ~' + r.estimatedNominalAnnualCost.toFixed(1) + '% (includes ' +
          (r.interestType === 'flat' ? 'flat-rate effect' : 'fees') + '). '
        : '';
      els.verdict.innerHTML = '<strong>' + signal.label + '.</strong> ' + rateNote + VERDICT[signal.band];
      els.verdict.dataset.band = signal.band;
      els.verdict.hidden = false;
    } else {
      els.verdict.hidden = true;
    }

    els.scheduleBody.innerHTML = (r.schedule ? yearlyRows(r.schedule) : []).map(function (row) {
      return '<tr><td>' + row.year + '</td><td>' + money(row.paid) + '</td><td>' +
        money(row.interest) + '</td><td>' + money(row.balance) + '</td></tr>';
    }).join('');

    els.ask.dataset.ready = 'true';
  }

  function update() {
    var amountRaw = els.amount.value.trim();
    var rateRaw = els.rate.value.trim();
    var tenureRaw = els.tenure.value.trim();
    save();

    if (!amountRaw || !rateRaw || !tenureRaw) {
      ['amount', 'rate', 'tenure'].forEach(function (f) { setError(f, ''); });
      renderEmpty();
      return;
    }

    var result = L.calculate({
      principal: num(els.amount),
      annualRatePercent: num(els.rate),
      months: L.monthsFromTenure(num(els.tenure), els.tenureUnit.value),
      interestType: interestType(),
      currency: els.currency.value,
      fees: { processing: num(els.fee) || 0, treatment: 'separate' }
    });

    ['amount', 'rate', 'tenure'].forEach(function (f) {
      setError(f, !result.ok && result.error === f ? result.message : '');
    });
    if (!result.ok) {
      renderEmpty();
      return;
    }
    render(result);
  }

  function loanContext() {
    var r = current;
    var lines = [
      'My loan: ' + money(r.principal) + ' at ' + r.annualRatePercent + '% per year (' +
        (r.interestType === 'flat' ? 'flat' : 'reducing') + ' rate) for ' + r.months + ' months.',
      'Monthly payment ' + money(r.emi) + ', total repaid ' + money(r.totalPaid) +
        ', interest plus fees ' + money(r.costOfBorrowing) + '.'
    ];
    if (r.upfrontFees > 0) lines.push('Processing fee ' + money(r.upfrontFees) + '.');
    return lines.join(' ');
  }

  function ask(question) {
    if (!current || !question) return;
    var q = loanContext() + '\n\n' + question;
    window.location.href = 'summaverick.html?q=' + encodeURIComponent(q.slice(0, 1000));
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        amount: els.amount.value,
        rate: els.rate.value,
        tenure: els.tenure.value,
        tenureUnit: els.tenureUnit.value,
        fee: els.fee.value,
        currency: els.currency.value,
        interestType: interestType()
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    var data;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (e) {
      data = null;
    }
    if (!data) return;
    ['amount', 'rate', 'tenure', 'fee'].forEach(function (k) {
      if (typeof data[k] === 'string') els[k].value = data[k];
    });
    if (data.tenureUnit) els.tenureUnit.value = data.tenureUnit;
    if (data.currency && C.POPULAR.indexOf(data.currency) >= 0) els.currency.value = data.currency;
    var radio = document.querySelector('input[name="interestType"][value="' + data.interestType + '"]');
    if (radio) radio.checked = true;
  }

  fillCurrencies();
  restore();
  updatePrefix();

  $('loanForm').addEventListener('input', update);
  $('loanForm').addEventListener('change', function (e) {
    if (e.target === els.currency) updatePrefix();
    update();
  });
  $('loanForm').addEventListener('submit', function (e) { e.preventDefault(); });

  els.ask.querySelectorAll('[data-q]').forEach(function (btn) {
    btn.addEventListener('click', function () { ask(btn.getAttribute('data-q')); });
  });
  els.askForm.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(els.askInput.value.trim());
  });

  update();
})();
