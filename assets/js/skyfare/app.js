/* SkyFare — Google Flights results with a price check, trade-offs and Summaverick. */
(function () {
  'use strict';

  var API = 'https://wandering-haze-b394.sumanthbolle312.workers.dev/flights';
  var INSPIRE = API + '/inspire';
  var STORE_KEY = 'skyfare_last_search_v2';
  var PAGE = 8;
  var AIRPORTS = window.SKYFARE_AIRPORTS || [];
  var CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'CHF', 'HKD', 'THB', 'MYR', 'NZD', 'ZAR'];
  var locale = navigator.language || 'en-US';

  var $ = function (id) { return document.getElementById(id); };
  var state = { params: null, data: null, sort: 'value', stops: 'any', shown: PAGE };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(v, cur) {
    var c = cur || (state.data && state.data.currency) || 'USD';
    try {
      return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : locale, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v);
    } catch (e) {
      return c + ' ' + Math.round(v);
    }
  }

  function hm(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
  }

  function niceDate(ymd) {
    var d = new Date(ymd + 'T12:00:00');
    return isNaN(d) ? ymd : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function isoDay(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- airport picker ---------- */

  function airportLabel(a) { return a.city + ' (' + a.code + ')'; }

  function findAirport(text) {
    var t = String(text || '').trim();
    var code = (t.match(/\(([A-Z]{3})\)\s*$/) || [])[1] || (/^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : '');
    if (code) {
      return AIRPORTS.filter(function (a) { return a.code === code; })[0] || { code: code, city: code, name: '', country: '' };
    }
    var lower = t.toLowerCase();
    return AIRPORTS.filter(function (a) { return a.city.toLowerCase() === lower; })[0] || null;
  }

  function matches(q) {
    var s = q.trim().toLowerCase();
    if (!s) return AIRPORTS.filter(function (a) { return a.popular; }).slice(0, 8);
    return AIRPORTS.filter(function (a) {
      return a.code.toLowerCase() === s || a.city.toLowerCase().indexOf(s) === 0 ||
        a.name.toLowerCase().indexOf(s) !== -1 || a.country.toLowerCase().indexOf(s) === 0;
    }).sort(function (a, b) {
      return (b.code.toLowerCase() === s) - (a.code.toLowerCase() === s) || (b.popular ? 1 : 0) - (a.popular ? 1 : 0);
    }).slice(0, 8);
  }

  function combo(input) {
    var list = $(input.getAttribute('aria-controls'));
    var items = [];
    var active = -1;

    function render() {
      items = matches(input.value === input.dataset.label ? '' : input.value);
      active = -1;
      list.innerHTML = items.map(function (a, i) {
        return '<li role="option" id="' + list.id + i + '" data-i="' + i + '"><strong>' + esc(a.city) +
          '</strong> <span>' + esc(a.code) + '</span><small>' + esc(a.name) + ', ' + esc(a.country) + '</small></li>';
      }).join('');
      open(items.length > 0);
    }
    function open(yes) {
      list.hidden = !yes;
      input.setAttribute('aria-expanded', yes ? 'true' : 'false');
    }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, j) { li.classList.toggle('is-active', j === i); });
      input.setAttribute('aria-activedescendant', i >= 0 ? list.id + i : '');
    }
    function pick(a) {
      input.value = airportLabel(a);
      input.dataset.label = input.value;
      input.dataset.code = a.code;
      open(false);
    }

    input.addEventListener('focus', function () { input.select(); render(); });
    input.addEventListener('input', function () { delete input.dataset.code; render(); });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter' && items.length) { e.preventDefault(); pick(items[Math.max(active, 0)]); }
      else if (e.key === 'Escape') open(false);
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        open(false);
        if (!input.dataset.code) {
          var a = findAirport(input.value);
          if (a) pick(a);
        }
      }, 150);
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li');
      if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); }
    });

    return {
      set: function (code) { var a = findAirport(code); if (a) pick(a); },
      code: function () { return input.dataset.code || (findAirport(input.value) || {}).code || ''; }
    };
  }

  var from = combo($('from'));
  var to = combo($('to'));

  /* ---------- form ---------- */

  function roundTrip() { return document.querySelector('input[name="trip"]:checked').value === 'round'; }

  function syncTrip() {
    $('returnField').hidden = !roundTrip();
  }

  function readForm() {
    return {
      origin: from.code(),
      destination: to.code(),
      departureDate: $('depart').value,
      returnDate: roundTrip() ? $('return').value : '',
      passengers: Number($('passengers').value),
      cabin: $('cabin').value,
      currency: $('currency').value
    };
  }

  function validate(p) {
    if (!p.origin || !p.destination) return 'Pick both airports from the list.';
    if (p.origin === p.destination) return 'From and To are the same airport.';
    if (!p.departureDate) return 'Pick a departure date.';
    if (p.departureDate < isoDay(0)) return 'Departure date is in the past.';
    if (roundTrip() && !p.returnDate) return 'Pick a return date, or switch to one way.';
    if (p.returnDate && p.returnDate < p.departureDate) return 'Return is before departure.';
    return '';
  }

  function setForm(p) {
    if (p.origin) from.set(p.origin);
    if (p.destination) to.set(p.destination);
    if (p.departureDate) $('depart').value = p.departureDate;
    if (p.returnDate) $('return').value = p.returnDate;
    if ('returnDate' in p) {
      document.querySelector('input[name="trip"][value="' + (p.returnDate ? 'round' : 'oneway') + '"]').checked = true;
    }
    if (p.passengers) $('passengers').value = String(p.passengers);
    if (p.cabin) $('cabin').value = p.cabin;
    if (p.currency && CURRENCIES.indexOf(p.currency) >= 0) $('currency').value = p.currency;
    syncTrip();
  }

  function showError(msg) {
    $('searchError').textContent = msg;
    $('searchError').hidden = !msg;
  }

  /* ---------- search ---------- */

  function search(p) {
    state.params = p;
    state.shown = PAGE;
    showError('');
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    writeUrl(p);

    $('results').hidden = false;
    $('ask').dataset.ready = 'false';
    $('routeTitle').textContent = p.origin + ' → ' + p.destination;
    $('routeMeta').textContent = meta(p);
    $('insight').hidden = true;
    $('showMore').hidden = true;
    $('flightList').innerHTML = Array(4).join('<li class="sf-flight sf-skeleton"></li>');
    $('searchBtn').disabled = true;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 45000);
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.success || !json.data || !json.data.flights || !json.data.flights.length) {
          throw new Error((json && json.error) || 'No flights found for these dates.');
        }
        state.data = json.data;
        score(state.data.flights);
        renderResults();
      })
      .catch(function (err) {
        state.data = null;
        $('flightList').innerHTML = '<li class="sf-empty">' + esc(err.name === 'AbortError' ? 'Search timed out. Try again.' : err.message) +
          ' <a href="' + esc(googleUrl(p)) + '" target="_blank" rel="noopener">Search on Google Flights</a></li>';
        $('googleLink').href = googleUrl(p);
      })
      .finally(function () {
        clearTimeout(timer);
        $('searchBtn').disabled = false;
      });
  }

  function meta(p) {
    return niceDate(p.departureDate) + (p.returnDate ? ' – ' + niceDate(p.returnDate) : ' · one way') +
      ' · ' + p.passengers + (p.passengers > 1 ? ' adults' : ' adult') +
      (p.cabin !== 'economy' ? ' · ' + $('cabin').selectedOptions[0].text : '');
  }

  function googleUrl(p) {
    var q = 'Flights from ' + p.origin + ' to ' + p.destination + ' on ' + p.departureDate +
      (p.returnDate ? ' returning ' + p.returnDate : ' one way') + (p.passengers > 1 ? ' for ' + p.passengers + ' adults' : '');
    return 'https://www.google.com/travel/flights?hl=en&curr=' + p.currency + '&q=' + encodeURIComponent(q);
  }

  function writeUrl(p) {
    var qs = new URLSearchParams({ from: p.origin, to: p.destination, depart: p.departureDate });
    if (p.returnDate) qs.set('return', p.returnDate);
    if (p.passengers > 1) qs.set('adults', p.passengers);
    if (p.cabin !== 'economy') qs.set('cabin', p.cabin);
    qs.set('cur', p.currency);
    try { history.replaceState(null, '', location.pathname + '?' + qs.toString()); } catch (e) { /* ignore */ }
  }

  function readUrl() {
    var q = new URLSearchParams(location.search);
    if (!q.get('from') || !q.get('to') || !q.get('depart')) return null;
    return {
      origin: q.get('from').toUpperCase(),
      destination: q.get('to').toUpperCase(),
      departureDate: q.get('depart'),
      returnDate: q.get('return') || '',
      passengers: Number(q.get('adults')) || 1,
      cabin: q.get('cabin') || 'economy',
      currency: q.get('cur') || $('currency').value
    };
  }

  /* ---------- ranking ---------- */

  // Lower is better: price matters most, then total time, then stops and awkward layovers.
  function score(flights) {
    var prices = flights.map(function (f) { return f.price; });
    var times = flights.map(function (f) { return f.duration; });
    var pMin = Math.min.apply(null, prices), pMax = Math.max.apply(null, prices);
    var tMin = Math.min.apply(null, times), tMax = Math.max.apply(null, times);
    flights.forEach(function (f) {
      var p = pMax > pMin ? (f.price - pMin) / (pMax - pMin) : 0;
      var t = tMax > tMin ? (f.duration - tMin) / (tMax - tMin) : 0;
      var s = Math.min(f.stops, 2) / 2;
      var awkward = f.layovers.some(function (l) { return l.overnight || l.duration > 300; }) ? 0.1 : 0;
      var delayed = f.segments.some(function (x) { return x.oftenDelayed; }) ? 0.05 : 0;
      f.value = 0.55 * p + 0.3 * t + 0.15 * s + awkward + delayed;
    });
  }

  function visible() {
    var list = state.data.flights.filter(function (f) {
      return state.stops === 'any' || f.stops <= Number(state.stops);
    });
    var key = state.sort;
    return list.slice().sort(function (a, b) { return a[key] - b[key] || a.price - b.price; });
  }

  function extremes(list) {
    var by = function (k) { return list.slice().sort(function (a, b) { return a[k] - b[k] || a.price - b.price; })[0]; };
    return { price: by('price'), duration: by('duration'), value: by('value') };
  }

  // One line per flight: what it costs and what it saves against the cheapest and fastest options.
  function tradeOff(f, ex) {
    var parts = [f === ex.price ? 'Cheapest' : money(f.price - ex.price.price) + ' more than cheapest'];
    var faster = ex.price.duration - f.duration;
    if (f === ex.duration) parts.push('fastest');
    else if (f !== ex.price && faster > 0) parts.push(hm(faster) + ' faster than cheapest');
    else parts.push(hm(f.duration - ex.duration.duration) + ' slower than fastest');
    return parts.join(' · ');
  }

  /* ---------- rendering ---------- */

  function renderResults() {
    var d = state.data;
    $('googleLink').href = d.googleUrl || googleUrl(state.params);
    renderInsight(d);
    var ex = extremes(d.flights);
    ['value', 'price', 'duration'].forEach(function (k) {
      document.querySelector('[data-sum="' + k + '"]').textContent = money(ex[k].price) + ' · ' + hm(ex[k].duration);
    });
    var hasStops = d.flights.some(function (f) { return f.stops > 0; });
    var hasNonstop = d.flights.some(function (f) { return f.stops === 0; });
    $('stopsFilter').hidden = !(hasStops && hasNonstop);
    renderList();
    $('ask').dataset.ready = 'true';
  }

  function renderInsight(d) {
    var i = d.insights;
    if (!i || !i.typical) { $('insight').hidden = true; return; }
    var label = { low: 'Prices are low', typical: 'Prices are typical', high: 'Prices are high' }[i.level] || 'Price check';
    $('insightLevel').textContent = label;
    $('insightLevel').dataset.level = i.level || '';
    $('insightText').textContent = 'Cheapest now ' + money(i.lowest) + '. Usually ' + money(i.typical[0]) + '–' + money(i.typical[1]) +
      ' for this trip' + (i.history && i.history.length > 1 ? ', last ' + Math.round((i.history[i.history.length - 1][0] - i.history[0][0]) / 86400) + ' days shown.' : '.');
    var svg = $('insightSpark');
    var pts = (i.history || []).map(function (h) { return h[1]; });
    if (pts.length > 1) {
      var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), span = max - min || 1;
      svg.innerHTML = '<polyline class="is-' + (i.level === 'high' ? 'down' : 'up') + '" points="' + pts.map(function (v, k) {
        return (k / (pts.length - 1) * 300).toFixed(1) + ',' + (44 - (v - min) / span * 40).toFixed(1);
      }).join(' ') + '"/>';
    } else {
      svg.innerHTML = '';
    }
    $('insight').hidden = false;
  }

  function renderList() {
    var list = visible();
    var ex = extremes(list.length ? list : state.data.flights);
    var shown = list.slice(0, state.shown);
    var priceNote = state.data.roundTrip ? 'round trip' : 'one way';
    $('flightList').innerHTML = shown.length ? shown.map(function (f) {
      return flightHtml(f, ex, priceNote);
    }).join('') : '<li class="sf-empty">No flights with these stops.</li>';
    $('showMore').hidden = list.length <= state.shown;
    $('showMore').textContent = 'Show ' + Math.min(PAGE, list.length - state.shown) + ' more';
  }

  function stopsText(f) {
    if (!f.stops) return 'Nonstop';
    return f.stops + (f.stops > 1 ? ' stops' : ' stop') + ' · ' + f.layovers.map(function (l) {
      return l.airport + ' ' + hm(l.duration);
    }).join(', ');
  }

  function flags(f) {
    var out = [];
    if (f.layovers.some(function (l) { return l.overnight; })) out.push('Overnight layover');
    if (f.layovers.some(function (l) { return l.duration < 60; })) out.push('Short connection');
    if (f.segments.some(function (s) { return s.oftenDelayed; })) out.push('Often delayed 30+ min');
    if (f.co2 && f.co2.diffPercent != null && f.co2.diffPercent >= 20) out.push('+' + f.co2.diffPercent + '% CO₂');
    if (f.co2 && f.co2.diffPercent != null && f.co2.diffPercent <= -15) out.push(f.co2.diffPercent + '% CO₂');
    return out;
  }

  function flightHtml(f, ex, priceNote) {
    var tags = flags(f);
    return '<li class="sf-flight' + (f === ex.value ? ' is-best' : '') + '">' +
      '<details>' +
        '<summary>' +
          (f.logo ? '<img src="' + esc(f.logo) + '" alt="" width="32" height="32" loading="lazy">' : '<span class="sf-logo"></span>') +
          '<div class="sf-flight__times"><strong>' + esc(f.depart.time) + ' – ' + esc(f.arrive.time) +
            (f.dayOffset > 0 ? '<sup>+' + f.dayOffset + '</sup>' : '') + '</strong><span>' + esc(f.airlines.join(', ')) + '</span></div>' +
          '<div class="sf-flight__dur"><strong>' + hm(f.duration) + '</strong><span>' + esc(f.depart.airport) + '–' + esc(f.arrive.airport) + '</span></div>' +
          '<div class="sf-flight__stops"><strong>' + (f.stops ? f.stops + (f.stops > 1 ? ' stops' : ' stop') : 'Nonstop') + '</strong><span>' +
            esc(f.layovers.map(function (l) { return l.airport + ' ' + hm(l.duration); }).join(', ')) + '</span></div>' +
          '<div class="sf-flight__price"><strong>' + money(f.price) + '</strong><span>' + priceNote + '</span></div>' +
        '</summary>' +
        '<div class="sf-flight__more">' + segmentsHtml(f) +
          '<a class="btn" href="' + esc(state.data.googleUrl || googleUrl(state.params)) + '" target="_blank" rel="noopener">Book on Google Flights</a>' +
        '</div>' +
      '</details>' +
      '<p class="sf-flight__note">' + (f === ex.value ? '<b>Best value</b> · ' : '') + esc(tradeOff(f, ex)) +
        (tags.length ? ' · <span class="sf-flags">' + esc(tags.join(' · ')) + '</span>' : '') + '</p>' +
    '</li>';
  }

  function segmentsHtml(f) {
    return '<ol class="sf-segs">' + f.segments.map(function (s, i) {
      var lay = f.layovers[i];
      return '<li><strong>' + esc(s.depTime) + ' ' + esc(s.from) + ' → ' + esc(s.arrTime) + ' ' + esc(s.to) + '</strong>' +
        '<span>' + esc([s.airline + ' ' + s.flightNumber, s.airplane, hm(s.duration), s.legroom ? 'Legroom ' + s.legroom : ''].filter(Boolean).join(' · ')) + '</span>' +
        (lay ? '<em>' + hm(lay.duration) + ' layover in ' + esc(lay.name || lay.airport) + (lay.overnight ? ' (overnight)' : '') + '</em>' : '') +
      '</li>';
    }).join('') + '</ol>';
  }

  /* ---------- Summaverick ---------- */

  function context() {
    var d = state.data;
    var p = state.params;
    if (!d || !p) return '';
    var list = visible().slice(0, 6);
    var lines = ['I am searching flights ' + p.origin + ' to ' + p.destination + ', ' + meta(p) + '. Prices are ' +
      (d.roundTrip ? 'round trip' : 'one way') + ' in ' + d.currency + '.'];
    if (d.insights && d.insights.typical) {
      lines.push('Google says prices are ' + (d.insights.level || 'unknown') + '; usual range ' + money(d.insights.typical[0]) + '–' + money(d.insights.typical[1]) + '.');
    }
    lines.push('Options:');
    list.forEach(function (f, i) {
      lines.push((i + 1) + '. ' + f.airlines.join('/') + ' ' + f.depart.time + '–' + f.arrive.time + (f.dayOffset ? '+' + f.dayOffset : '') +
        ', ' + hm(f.duration) + ', ' + stopsText(f) + ', ' + money(f.price) + (flags(f).length ? ' (' + flags(f).join(', ') + ')' : ''));
    });
    return lines.join('\n');
  }

  /* ---------- explore (Summaverick destination ideas) ---------- */

  function explore(text) {
    var box = $('ideas');
    box.innerHTML = '<p class="hint">Finding ideas…</p>';
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 40000);
    fetch(INSPIRE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, origin: from.code(), currency: $('currency').value }),
      signal: ctrl.signal
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var list = json && json.success && json.data && json.data.suggestions;
        if (!list || !list.length) throw new Error('none');
        box.innerHTML = list.map(function (s, i) {
          var pr = s.price_range || {};
          var fare = pr.min ? money(pr.min, pr.currency) + (pr.max && pr.max !== pr.min ? '–' + money(pr.max, pr.currency) : '') : '';
          return '<div class="sf-idea"><strong>' + esc(s.destination_city || s.destination) + '</strong>' +
            '<span>' + esc([s.suggested_departure ? niceDate(s.suggested_departure) + (s.suggested_return ? ' – ' + niceDate(s.suggested_return) : '') : '', fare ? 'about ' + fare : ''].filter(Boolean).join(' · ')) + '</span>' +
            '<button type="button" class="btn btn--quiet" data-idea="' + i + '">Search</button></div>';
        }).join('');
        box.querySelectorAll('[data-idea]').forEach(function (b) {
          b.addEventListener('click', function () {
            var s = list[Number(b.dataset.idea)];
            setForm({
              origin: s.origin_airport || from.code(),
              destination: s.destination_airport,
              departureDate: s.suggested_departure,
              returnDate: s.trip_type === 'one-way' ? '' : s.suggested_return
            });
            $('searchForm').requestSubmit();
          });
        });
      })
      .catch(function () {
        box.innerHTML = '<p class="hint">No ideas right now. Try different words.</p>';
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* ---------- init ---------- */

  $('currency').innerHTML = CURRENCIES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  $('currency').value = /-IN$/i.test(locale) ? 'INR' : 'USD';
  $('depart').min = $('return').min = isoDay(0);

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
  var fromUrl = readUrl();
  if (fromUrl) setForm(fromUrl);
  else if (saved) setForm({ origin: saved.origin, destination: saved.destination, passengers: saved.passengers, cabin: saved.cabin, currency: saved.currency });
  if (!$('depart').value) $('depart').value = isoDay(21);
  if (!$('return').value) $('return').value = isoDay(28);
  syncTrip();

  document.querySelectorAll('input[name="trip"]').forEach(function (r) { r.addEventListener('change', syncTrip); });
  $('depart').addEventListener('change', function () {
    $('return').min = $('depart').value;
    if ($('return').value && $('return').value < $('depart').value) $('return').value = $('depart').value;
  });
  $('swap').addEventListener('click', function () {
    var a = from.code(), b = to.code();
    if (b) from.set(b);
    if (a) to.set(a);
  });
  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = readForm();
    var err = validate(p);
    if (err) { showError(err); return; }
    search(p);
  });
  document.querySelectorAll('.sf-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.sort = tab.dataset.sort;
      state.shown = PAGE;
      document.querySelectorAll('.sf-tab').forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
      if (state.data) renderList();
    });
  });
  document.querySelectorAll('input[name="stops"]').forEach(function (r) {
    r.addEventListener('change', function () { state.stops = r.value; state.shown = PAGE; if (state.data) renderList(); });
  });
  $('showMore').addEventListener('click', function () { state.shown += PAGE; renderList(); });
  $('exploreForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('exploreInput').value.trim();
    if (text.length >= 5) explore(text);
  });

  if (window.SBShared) window.SBShared.initNavMenu();
  window.SBAsk.init({ getContext: context });

  if (fromUrl && !validate(readForm())) search(readForm());
})();
