/* Metals — live gold and silver prices, India landed price, quote checker. */
(function () {
  'use strict';

  var ENDPOINT = 'https://wandering-haze-b394.sumanthbolle312.workers.dev/metals';
  var CACHE_KEY = 'metals_last_success_v1';
  var CURRENCY_KEY = 'metals_currency_v2';
  var OUNCE = 31.1034768;
  var INDIA_DUTY = 0.15; // customs duty on gold and silver since 13 May 2026
  var INDIA_GST = 0.03;
  var INDIA = (1 + INDIA_DUTY) * (1 + INDIA_GST);
  var REFRESH_MS = 5 * 60 * 1000;

  var CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW', 'SGD', 'ZAR', 'BRL', 'MXN', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'THB', 'MYR', 'IDR', 'PHP', 'ILS', 'CZK', 'HUF', 'RON', 'ISK'];
  var UNIT_GRAMS = { gram: 1, tola: 11.6638038, sovereign: 8, ounce: OUNCE, kilogram: 1000 };
  var PURITY = {
    gold: [['0.999', '24K (999)'], ['0.9167', '22K (916)'], ['0.75', '18K (750)'], ['0.585', '14K (585)']],
    silver: [['0.999', 'Fine (999)'], ['0.925', 'Sterling (925)']]
  };

  var $ = function (id) { return document.getElementById(id); };
  var currencySelect = $('currency');
  var data = null;
  var locale = navigator.language || 'en-US';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  function money(value, currency, digits) {
    var cur = currency || data.currency;
    var d = digits != null ? digits : (Math.abs(value) < 100 ? 2 : 0);
    try {
      return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : locale, { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
    } catch (e) {
      return cur + ' ' + Number(value).toFixed(d);
    }
  }

  function num(raw) {
    var n = Number(String(raw || '').replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function isIndia() { return data && data.currency === 'INR'; }

  function perGram(metal) {
    return data.metals[metal].usdPerOunce * data.fxRate / OUNCE;
  }

  /* ---------- data ---------- */

  function isValid(d) {
    return d && d.success && d.metals && d.metals.gold && d.metals.silver &&
      d.metals.gold.usdPerOunce > 0 && d.metals.silver.usdPerOunce > 0 && d.fxRate > 0;
  }

  function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 9000);
    return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  function history(rows) {
    return Array.isArray(rows) ? rows.map(function (r) {
      return { date: String(r.date || '').slice(0, 10), usdPerOunce: Number(r.rate) };
    }).filter(function (r) { return r.date && Number.isFinite(r.usdPerOunce); }) : [];
  }

  // Used when the worker is down: same sources, fetched from the browser.
  function fetchDirect(currency) {
    var end = new Date().toISOString().slice(0, 10);
    var start = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
    var range = 'from=' + start + '&to=' + end + '&quotes=USD';
    var calls = [
      fetchJson('https://api.gold-api.com/price/XAU'),
      fetchJson('https://api.gold-api.com/price/XAG'),
      fetchJson('https://api.frankfurter.dev/v2/rates?base=XAU&' + range),
      fetchJson('https://api.frankfurter.dev/v2/rates?base=XAG&' + range),
      currency === 'USD' ? Promise.resolve({ rate: 1 }) : fetchJson('https://api.frankfurter.dev/v2/rate/USD/' + currency)
    ];
    return Promise.allSettled(calls).then(function (r) {
      var v = r.map(function (x) { return x.status === 'fulfilled' ? x.value : null; });
      if (!v[0] || !v[1] || !v[4]) throw new Error('unavailable');
      var times = [v[0].updatedAt, v[1].updatedAt].map(function (t) { return new Date(t).getTime(); }).filter(Number.isFinite);
      return {
        success: true,
        currency: currency,
        fxRate: Number(v[4].rate),
        sourceUpdatedAt: times.length ? new Date(Math.min.apply(null, times)).toISOString() : null,
        metals: {
          gold: { usdPerOunce: Number(v[0].price), history: history(v[2]) },
          silver: { usdPerOunce: Number(v[1].price), history: history(v[3]) }
        }
      };
    });
  }

  function load() {
    var currency = currencySelect.value;
    setStatus('loading', 'Loading prices');
    return fetchJson(ENDPOINT + '?currency=' + encodeURIComponent(currency))
      .then(function (d) { if (!isValid(d)) throw new Error('bad payload'); return d; })
      .catch(function () { return fetchDirect(currency); })
      .then(function (d) {
        if (!isValid(d)) throw new Error('bad payload');
        writeJson(CACHE_KEY, d);
        show(d, false);
      })
      .catch(function () {
        var cached = readJson(CACHE_KEY);
        if (isValid(cached) && cached.currency === currency) show(cached, true);
        else setStatus('error', 'Prices unavailable. Try again.');
      });
  }

  /* ---------- rendering ---------- */

  function setStatus(state, text) {
    $('statusDot').dataset.state = state;
    $('statusText').textContent = text;
  }

  function ago(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(mins)) return '';
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    return hrs < 24 ? hrs + ' h ago' : new Date(iso).toLocaleDateString(locale);
  }

  function previousClose(metal) {
    var rows = data.metals[metal].history || [];
    var today = String(data.sourceUpdatedAt || new Date().toISOString()).slice(0, 10);
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].date < today) return rows[i].usdPerOunce;
    }
    return null;
  }

  function sparkline(svg, metal) {
    var rows = (data.metals[metal].history || []).slice(-30);
    if (rows.length < 2) { svg.innerHTML = ''; return; }
    var values = rows.map(function (r) { return r.usdPerOunce; });
    values.push(data.metals[metal].usdPerOunce);
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var pts = values.map(function (v, i) {
      return (i / (values.length - 1) * 300).toFixed(1) + ',' + (44 - (v - min) / span * 40).toFixed(1);
    }).join(' ');
    var up = values[values.length - 1] >= values[0];
    svg.innerHTML = '<polyline points="' + pts + '" class="' + (up ? 'is-up' : 'is-down') + '"/>';
  }

  function rowsHtml(rows) {
    return rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('');
  }

  function renderMetal(metal) {
    var card = document.querySelector('[data-metal="' + metal + '"]');
    var field = function (name) { return card.querySelector('[data-field="' + name + '"]'); };
    var usd = data.metals[metal].usdPerOunce;
    var g = perGram(metal);
    var india = isIndia();
    var price, unit, rows;

    if (metal === 'gold') {
      var g24 = g * 0.999;
      var g22 = g * 0.9167;
      if (india) {
        price = money(g24 * 10 * INDIA, 'INR', 0);
        unit = 'per 10 g · 24K · with duty + GST';
        rows = [['22K · 10 g', money(g22 * 10 * INDIA, 'INR', 0)], ['Market price · 10 g', money(g24 * 10, 'INR', 0)], ['Per ounce', money(usd, 'USD', 2)]];
      } else {
        price = money(usd * data.fxRate, null, 2);
        unit = 'per troy ounce';
        rows = [['24K · 1 g', money(g24)], ['24K · 10 g', money(g24 * 10)], ['22K · 10 g', money(g22 * 10)]];
      }
    } else {
      var s = g * 0.999;
      if (india) {
        price = money(s * 1000 * INDIA, 'INR', 0);
        unit = 'per kg · with duty + GST';
        rows = [['10 g', money(s * 10 * INDIA, 'INR', 0)], ['Market price · kg', money(s * 1000, 'INR', 0)], ['Per ounce', money(usd, 'USD', 2)]];
      } else {
        price = money(usd * data.fxRate, null, 2);
        unit = 'per troy ounce';
        rows = [['1 g', money(s, null, 2)], ['100 g', money(s * 100)], ['1 kg', money(s * 1000)]];
      }
    }

    field('price').textContent = price;
    field('priceUnit').textContent = unit;
    field('rows').innerHTML = rowsHtml(rows);
    sparkline(field('spark'), metal);

    var prev = previousClose(metal);
    var change = field('change');
    if (prev) {
      var pct = (usd - prev) / prev * 100;
      change.textContent = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(2) + '%';
      change.className = 'mt-change ' + (pct >= 0 ? 'is-up' : 'is-down');
      change.title = 'Since previous close';
    } else {
      change.textContent = '';
    }
  }

  function show(d, stale) {
    data = d;
    renderMetal('gold');
    renderMetal('silver');
    var when = d.sourceUpdatedAt ? ago(d.sourceUpdatedAt) : '';
    setStatus(stale ? 'stale' : 'live', (stale ? 'Offline · saved prices from ' : 'Live · updated ') + when);
    document.querySelectorAll('[data-currency-prefix]').forEach(function (n) { n.textContent = symbol(d.currency); });
    $('ask').dataset.ready = 'true';
    calculate();
  }

  function symbol(cur) {
    try {
      var part = new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).formatToParts(0)
        .filter(function (p) { return p.type === 'currency'; })[0];
      return part ? part.value : cur;
    } catch (e) {
      return cur;
    }
  }

  /* ---------- calculator ---------- */

  function fillPurity() {
    var metal = $('calcMetal').value;
    var keep = $('calcPurity').value;
    $('calcPurity').innerHTML = PURITY[metal].map(function (p) {
      return '<option value="' + p[0] + '">' + p[1] + '</option>';
    }).join('');
    if (PURITY[metal].some(function (p) { return p[0] === keep; })) $('calcPurity').value = keep;
    else if (metal === 'gold') $('calcPurity').value = '0.9167';
  }

  function calc() {
    var weight = num($('calcWeight').value);
    if (!data || !(weight > 0)) return null;
    var metal = $('calcMetal').value;
    var purity = Number($('calcPurity').value);
    var pure = weight * UNIT_GRAMS[$('calcUnit').value] * purity;
    var value = pure * perGram(metal);
    var quote = num($('calcQuote').value);
    var base = isIndia() ? value * INDIA : value;
    return {
      metal: metal,
      label: $('calcWeight').value + ' ' + $('calcUnit').selectedOptions[0].text + ' ' + $('calcPurity').selectedOptions[0].text + ' ' + metal,
      pure: pure,
      value: value,
      india: isIndia() ? value * INDIA : null,
      quote: quote > 0 ? quote : null,
      premium: quote > 0 ? quote - base : null,
      premiumPct: quote > 0 ? (quote - base) / base * 100 : null
    };
  }

  function calculate() {
    var r = calc();
    $('valSpot').textContent = r ? money(r.value) : '—';
    $('valIndiaWrap').hidden = !(r && r.india);
    if (r && r.india) $('valIndia').textContent = money(r.india);
    $('valPremiumWrap').hidden = !(r && r.premium != null);
    if (r && r.premium != null) {
      $('valPremium').textContent = (r.premium >= 0 ? '+' : '−') + money(Math.abs(r.premium)) + ' · ' + r.premiumPct.toFixed(1) + '%';
    }
    $('calcNote').textContent = r ? r.pure.toFixed(3).replace(/\.?0+$/, '') + ' g pure ' + r.metal : '';
  }

  /* ---------- Summaverick context ---------- */

  function context() {
    if (!data) return '';
    var parts = [
      'Prices now: gold ' + money(data.metals.gold.usdPerOunce, 'USD', 2) + '/oz, silver ' +
        money(data.metals.silver.usdPerOunce, 'USD', 2) + '/oz.'
    ];
    if (isIndia()) {
      parts.push('In India with 15% customs duty and 3% GST: 24K gold ' +
        money(perGram('gold') * 0.999 * 10 * INDIA, 'INR', 0) + ' per 10 g, 22K gold ' +
        money(perGram('gold') * 0.9167 * 10 * INDIA, 'INR', 0) + ' per 10 g, silver ' +
        money(perGram('silver') * 0.999 * 1000 * INDIA, 'INR', 0) + ' per kg.');
    } else if (data.currency !== 'USD') {
      parts.push('USD to ' + data.currency + ' rate ' + data.fxRate + '.');
    }
    var r = calc();
    if (r) {
      var line = 'I am looking at ' + r.label + ': metal value ' + money(r.value);
      if (r.india) line += ', ' + money(r.india) + ' with duty and GST';
      if (r.quote) line += '. The shop quoted ' + money(r.quote) + ' (' + r.premiumPct.toFixed(1) + '% above that)';
      parts.push(line + '.');
    }
    return parts.join(' ');
  }

  /* ---------- init ---------- */

  function defaultCurrency() {
    var saved = null;
    try { saved = localStorage.getItem(CURRENCY_KEY); } catch (e) { /* ignore */ }
    if (saved && CURRENCIES.indexOf(saved) >= 0) return saved;
    return /-IN$/i.test(locale) ? 'INR' : 'USD';
  }

  currencySelect.innerHTML = CURRENCIES.map(function (c) {
    return '<option value="' + c + '">' + c + '</option>';
  }).join('');
  currencySelect.value = defaultCurrency();

  var cached = readJson(CACHE_KEY);
  if (isValid(cached) && cached.currency === currencySelect.value) show(cached, true);

  fillPurity();
  currencySelect.addEventListener('change', function () {
    try { localStorage.setItem(CURRENCY_KEY, currencySelect.value); } catch (e) { /* ignore */ }
    load();
  });
  $('refresh').addEventListener('click', load);
  $('calcMetal').addEventListener('change', function () { fillPurity(); calculate(); });
  $('calc').addEventListener('input', calculate);
  $('calc').addEventListener('change', calculate);
  $('calc').addEventListener('submit', function (e) { e.preventDefault(); });

  setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);

  window.SBAsk.init({ getContext: context });
  load();
})();
