/*
 * Summaverick — General AI Search & Research Worker
 * Cloudflare Worker · Perplexity Sonar API + Hacker News
 *
 * Routes:
 *   POST /              — chat completion (existing); body: { query, context }
 *   GET  /trending      — landing-page widgets (news / market / tech),
 *                         country-aware via cf.country (or ?country=XX override),
 *                         cached per country in Cloudflare Cache API
 *   OPTIONS *           — CORS preflight
 *
 * Environment variables:
 *   PERPLEXITY_API_KEY — from perplexity.ai/settings/api
 *   ALLOWED_ORIGIN     — e.g. https://sumanthbolle.com (or * for dev)
 */

const SYSTEM_PROMPT = `You are Summaverick, a general-purpose AI research assistant. You answer questions on any topic — world news, science, technology, business, culture, code, careers, personal decisions, and everyday curiosity — by synthesizing real sources into clear, grounded answers.

Scope:
- Treat every topic as in-scope unless it is unsafe or genuinely unanswerable.
- Do not assume the user is asking about any one domain (e.g. ServiceNow, enterprise IT) unless their question names it explicitly.
- Default to a global perspective. When location matters (news, regulations, sports, weather, markets), ask or state which region you are answering for.

Answer style:
- Give thorough, practical answers — not just summaries. Lead with the concrete answer, then the reasoning and sources.
- Use citation markers like [1], [2] to reference your sources inline. Only cite sources you actually used.
- Structure longer answers with markdown: short headings, bold for key terms, bullet lists for enumerations, code blocks for code.
- When comparing options, use a clear pros/cons or tradeoff structure.
- If the question is ambiguous, address the most likely interpretation first, then note alternatives in one sentence.
- For code: produce runnable, idiomatic code with brief inline comments only when they add value. Note the language/runtime assumed.
- For emotional or personal questions: be warm but not performative. Validate the situation briefly, then give a concrete suggestion.
- Be direct. Skip filler like "Great question!" or "Sure, I'd be happy to help." No self-references like "As an AI…".`;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

const TRENDING_TTL_SECONDS = 600;        // 10 min for full-success responses
const TRENDING_PARTIAL_TTL_SECONDS = 60; // 1 min when one or more widgets failed
const TRENDING_REQUEST_TIMEOUT_MS = 9000;

/* Country → local stock index. Used to bias the markets widget query.
 * "Top mover" is defined as the largest absolute % move (gainer or loser)
 * in the local benchmark index on the most recent trading day. */
const COUNTRY_TO_INDEX = {
  US: 'S&P 500', CA: 'S&P/TSX Composite', MX: 'IPC Mexico',
  GB: 'FTSE 100', DE: 'DAX 40', FR: 'CAC 40', IT: 'FTSE MIB',
  ES: 'IBEX 35', NL: 'AEX', CH: 'SMI', SE: 'OMXS30',
  IN: 'NIFTY 50', JP: 'Nikkei 225', CN: 'CSI 300', HK: 'Hang Seng',
  KR: 'KOSPI', SG: 'STI', TW: 'TAIEX', AU: 'ASX 200',
  BR: 'Bovespa', AR: 'Merval', ZA: 'JSE Top 40',
  AE: 'ADX General', SA: 'Tadawul', IL: 'TA-35',
};

const COUNTRY_NAME = {
  US: 'United States', CA: 'Canada', MX: 'Mexico',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', CH: 'Switzerland', SE: 'Sweden',
  IN: 'India', JP: 'Japan', CN: 'China', HK: 'Hong Kong',
  KR: 'South Korea', SG: 'Singapore', TW: 'Taiwan', AU: 'Australia',
  BR: 'Brazil', AR: 'Argentina', ZA: 'South Africa',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', IL: 'Israel',
};

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(null, origin, 204);
    }

    if (request.method === 'GET' && url.pathname === '/trending') {
      return handleTrending(request, env, ctx, origin);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    return handleChat(request, env, origin);
  }
};

/* ───────────── Chat (existing behaviour, unchanged contract) ───────────── */

async function handleChat(request, env, origin) {
  try {
    const body = await request.json();
    const query = sanitize(body.query);
    const context = body.context;

    if (!query || query.length < 2 || query.length > 1000) {
      return jsonResponse({ success: false, error: 'Invalid query' }, origin);
    }

    if (query === '__analytics__') {
      return jsonResponse({ success: true, result: null }, origin);
    }

    const apiKey = env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return jsonResponse({ success: false, error: 'API key not configured' }, origin);
    }

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (Array.isArray(context) && context.length > 0) {
      for (const msg of context.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: sanitize(msg.content).slice(0, 4000)
          });
        }
      }
    }

    messages.push({ role: 'user', content: query });

    const sonarPayload = {
      model: 'sonar',
      messages,
      temperature: 0.2,
      max_tokens: 1024,
      web_search_options: { search_context_size: 'high' },
      return_related_questions: true
    };

    const data = await callSonar(apiKey, sonarPayload);
    const result = buildResult(data);
    return jsonResponse({ success: true, result }, origin);

  } catch (e) {
    return jsonResponse({ success: false, error: e.message || 'Internal error' }, origin);
  }
}

/* ───────────────────────── Trending widgets ───────────────────────── */

async function handleTrending(request, env, ctx, origin) {
  const url = new URL(request.url);
  const cfCountry = (request.cf && request.cf.country) || null;
  const override = (url.searchParams.get('country') || '').toUpperCase().slice(0, 2) || null;
  const country = override || cfCountry || 'GLOBAL';
  const detected = override ? 'override' : (cfCountry ? 'network' : 'fallback');

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.summaverick.internal/trending/${country}`, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return jsonResponseRaw(body, origin, { 'X-Summaverick-Cache': 'HIT' });
  }

  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'API key not configured' }, origin);
  }

  /* When country is detected, we surface four widgets: local news, world
   * news, local market mover, top on HN. When we can't detect a country
   * (Tor/VPN/weird edge) 'news' would duplicate 'worldNews', so we skip
   * the local news fetch and show three widgets. */
  const localNewsPromise = country === 'GLOBAL'
    ? Promise.resolve(null)
    : fetchNewsWidget(apiKey, country);

  const [newsRes, worldNewsRes, marketRes, techRes] = await Promise.allSettled([
    localNewsPromise,
    fetchWorldNewsWidget(apiKey),
    fetchMarketWidget(apiKey, country),
    fetchTechWidget(),
  ]);

  const widgets = {
    news: pickFulfilled(newsRes),
    worldNews: pickFulfilled(worldNewsRes),
    market: pickFulfilled(marketRes),
    tech: pickFulfilled(techRes),
  };

  const successCount = Object.values(widgets).filter(Boolean).length;

  const payload = {
    success: successCount > 0,
    country,
    countryName: COUNTRY_NAME[country] || (country === 'GLOBAL' ? 'Global' : country),
    detected,
    generatedAt: new Date().toISOString(),
    widgets,
  };

  /* Full success = every widget we *tried* to fetch succeeded. When
   * country is GLOBAL we intentionally skip local news, so the target
   * is 3; otherwise it's 4. */
  const expected = country === 'GLOBAL' ? 3 : 4;
  const ttl = successCount >= expected ? TRENDING_TTL_SECONDS : TRENDING_PARTIAL_TTL_SECONDS;
  const responseBody = JSON.stringify(payload);

  if (successCount > 0 && ctx && typeof ctx.waitUntil === 'function') {
    const toCache = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      }
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
  }

  return jsonResponseRaw(responseBody, origin, { 'X-Summaverick-Cache': 'MISS' });
}

function pickFulfilled(settled) {
  return settled.status === 'fulfilled' && settled.value ? settled.value : null;
}

/* Shared JSON schema for any news fetcher. */
const NEWS_WIDGET_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    source: { type: 'string' },
    url: { type: 'string' },
  },
  required: ['headline', 'summary', 'source', 'url'],
};

function buildNewsPayload(prompt, webSearchOptions) {
  return {
    model: 'sonar',
    messages: [
      { role: 'system', content: 'You return strict JSON only. Do not invent facts. Use only verified, citable news from the past 24 hours.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 400,
    search_recency_filter: 'day',
    web_search_options: webSearchOptions,
    response_format: { type: 'json_schema', json_schema: { schema: NEWS_WIDGET_SCHEMA } },
  };
}

function parseNewsWidget(data, kind, label) {
  const parsed = parseStructured(data);
  if (!parsed || !parsed.headline) return null;
  return {
    kind,
    label,
    title: String(parsed.headline).slice(0, 200),
    summary: String(parsed.summary || '').slice(0, 280),
    source: String(parsed.source || '').slice(0, 80),
    url: safeUrl(parsed.url),
  };
}

/* ── News widget: top country headline of the day via Sonar ── */
async function fetchNewsWidget(apiKey, country) {
  const region = COUNTRY_NAME[country] || 'the world';
  const scope = country === 'GLOBAL' ? 'around the world' : `in ${region}`;
  const payload = buildNewsPayload(
    `Pick the single most significant news story being widely reported right now ${scope}. Return JSON with the headline, a one-sentence neutral summary, the publishing source name, and the article URL. The story must be from the past 24 hours.`,
    countryToSonarLocation(country, 'medium'),
  );
  const data = await callSonarWithTimeout(apiKey, payload, TRENDING_REQUEST_TIMEOUT_MS);
  const label = country === 'GLOBAL'
    ? 'Top story · Global'
    : `Top story · ${COUNTRY_NAME[country] || country}`;
  return parseNewsWidget(data, 'news', label);
}

/* ── World news widget: #1 story anywhere on the planet right now ── */
async function fetchWorldNewsWidget(apiKey) {
  const payload = buildNewsPayload(
    'Pick the SINGLE most significant news story being widely reported anywhere in the world in the past 24 hours — the story that the most international outlets are leading with right now. It must be globally notable (not a story only relevant to one country). Return JSON with the headline, a one-sentence neutral summary, the publishing source name, and the article URL.',
    { search_context_size: 'high' },
  );
  const data = await callSonarWithTimeout(apiKey, payload, TRENDING_REQUEST_TIMEOUT_MS);
  return parseNewsWidget(data, 'worldNews', '#1 worldwide · Top story');
}

/* ── Market widget: top mover in the country's local index, via Sonar ── */
async function fetchMarketWidget(apiKey, country) {
  const indexName = COUNTRY_TO_INDEX[country] || 'MSCI World';
  const messages = [
    { role: 'system', content: 'You return strict JSON only. Use only verified market data from the most recent trading session.' },
    { role: 'user', content: `Identify the single biggest mover (largest absolute percentage change, gainer OR loser) in the ${indexName} index during the most recent completed trading session. Return JSON with the ticker symbol, full company name, percent change with sign (e.g. -4.7 or 12.1), the index name, and a one-sentence reason for the move.` },
  ];

  const schema = {
    type: 'object',
    properties: {
      symbol: { type: 'string' },
      name: { type: 'string' },
      changePercent: { type: 'number' },
      index: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['symbol', 'name', 'changePercent', 'index'],
  };

  const payload = {
    model: 'sonar',
    messages,
    temperature: 0.1,
    max_tokens: 400,
    search_recency_filter: 'day',
    web_search_options: countryToSonarLocation(country, 'medium'),
    response_format: { type: 'json_schema', json_schema: { schema } },
  };

  const data = await callSonarWithTimeout(apiKey, payload, TRENDING_REQUEST_TIMEOUT_MS);
  const parsed = parseStructured(data);
  if (!parsed || !parsed.symbol) return null;

  const change = Number(parsed.changePercent);
  if (!Number.isFinite(change)) return null;

  return {
    kind: 'market',
    label: `Top mover · ${parsed.index || indexName}`,
    symbol: String(parsed.symbol).slice(0, 12),
    name: String(parsed.name || '').slice(0, 80),
    changePercent: Math.round(change * 100) / 100,
    direction: change >= 0 ? 'up' : 'down',
    index: String(parsed.index || indexName).slice(0, 60),
    reason: String(parsed.reason || '').slice(0, 240),
  };
}

/* ── Tech widget: top Hacker News story (free, no key, instant) ── */
async function fetchTechWidget() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRENDING_REQUEST_TIMEOUT_MS);

  try {
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: ctrl.signal,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!idsRes.ok) return null;
    const ids = await idsRes.json();
    if (!Array.isArray(ids) || ids.length === 0) return null;

    /* Walk the top story list until we find one with an external URL.
     * (Ask HN / Show HN posts have no `url`; we still surface them
     * but linked to the HN thread itself.) */
    for (let i = 0; i < Math.min(5, ids.length); i++) {
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${ids[i]}.json`, {
        signal: ctrl.signal,
        cf: { cacheTtl: 120, cacheEverything: true },
      });
      if (!itemRes.ok) continue;
      const item = await itemRes.json();
      if (!item || item.dead || item.deleted) continue;

      const hnUrl = `https://news.ycombinator.com/item?id=${item.id}`;
      return {
        kind: 'tech',
        label: 'Top on Hacker News',
        title: String(item.title || '').slice(0, 200),
        url: safeUrl(item.url) || hnUrl,
        hnUrl,
        source: item.url ? hostnameOf(item.url) : 'news.ycombinator.com',
        score: Number(item.score) || 0,
        comments: Number(item.descendants) || 0,
        by: String(item.by || '').slice(0, 40),
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function countryToSonarLocation(country, ctxSize) {
  const opts = { search_context_size: ctxSize || 'medium' };
  if (country && country !== 'GLOBAL' && /^[A-Z]{2}$/.test(country)) {
    opts.user_location = { country };
  }
  return opts;
}

function parseStructured(sonarData) {
  try {
    const content = sonarData?.choices?.[0]?.message?.content;
    if (!content) return null;
    if (typeof content === 'object') return content;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function callSonarWithTimeout(apiKey, payload, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.perplexity.ai/v1/sonar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('Sonar ' + res.status);
    return await res.json();
  }   finally {
    clearTimeout(timer);
  }
}

/* ───────────── Flight Search ───────────── */

const FLIGHT_SYSTEM_PROMPT = 'You are a real-time flight search and travel pricing assistant. Your task is to find current publicly available flight options for the provided route, dates, passenger count, cabin class, budget, and preferences.\n\nYou must:\n- Search current web results for flight prices.\n- Prefer airline official websites and reputable travel providers (Google Flights, Kayak, Skyscanner, Expedia, etc.).\n- Return only structured JSON. No markdown, no code fences, no explanation text outside JSON.\n- Do not invent flights, prices, booking links, or airlines.\n- If exact prices are not available, mark the confidence as "low" and explain why in the notes field.\n- Include source URLs wherever possible.\n- Include a freshness note indicating when the data was retrieved.\n- Compare flights based on price, duration, stops, layovers, and budget fit.\n- Do not claim that a booking is confirmed.\n- Treat results as price-discovery only.\n- Each flight must have a unique "id" field (e.g., "flight_1", "flight_2").\n- The "badges" array can include values like "Cheapest", "Fastest", "Best Value", "Under Budget", "Nonstop".\n- The "score" field should be your best estimate from 0-100 based on overall value.';

const FLIGHT_TIMEOUT_MS = 55000;

function buildFlightPrompt(p) {
  var preferred = p.preferredAirlines && p.preferredAirlines.length > 0 ? p.preferredAirlines.join(', ') : 'No preference';
  var avoid = p.avoidAirlines && p.avoidAirlines.length > 0 ? p.avoidAirlines.join(', ') : 'None';
  var budget = p.maxBudget ? p.maxBudget + ' ' + p.currency : 'No limit';
  return 'Find current flight options using the following search criteria:\n\n'
    + 'Origin: ' + p.origin + '\nDestination: ' + p.destination + '\n'
    + 'Departure date: ' + p.departureDate + '\nReturn date: ' + (p.returnDate || 'N/A (one-way)') + '\n'
    + 'Trip type: ' + p.tripType + '\nPassengers: ' + p.passengers + '\n'
    + 'Cabin class: ' + p.cabinClass + '\nFlexible date range: +/- ' + (p.flexibleDays || 0) + ' days\n'
    + 'Maximum budget: ' + budget + '\nPreferred airlines: ' + preferred + '\n'
    + 'Avoid airlines: ' + avoid + '\nMaximum stops: ' + p.maxStops + '\n'
    + 'Priority mode: ' + p.priorityMode + '\n\n'
    + 'Return the result in this exact JSON structure (no markdown, no code fences, just raw JSON):\n\n'
    + '{"search_summary":{"origin":"","destination":"","departure_date":"","return_date":"","trip_type":"","passengers":0,"cabin_class":"","currency":"","budget":0,"freshness_note":"","result_confidence":"high | medium | low"},"recommendation":{"best_overall_flight_id":"","cheapest_flight_id":"","fastest_flight_id":"","best_under_budget_flight_id":"","explanation":""},"flights":[{"id":"","airline":"","flight_numbers":[],"provider":"","price":0,"currency":"","is_under_budget":true,"departure_airport":"","arrival_airport":"","departure_time":"","arrival_time":"","total_duration_minutes":0,"stops":0,"layovers":[{"airport":"","duration_minutes":0}],"booking_url":"","source_url":"","source_name":"","confidence":"high | medium | low","notes":"","score":0,"badges":[]}],"warnings":[]}';
}

function extractFlightJson(text) {
  var fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.substring(start, end + 1);
  return text.trim();
}

function normalizeFlightResponse(raw, params) {
  if (!raw.search_summary) {
    raw.search_summary = {
      origin: params.origin, destination: params.destination,
      departure_date: params.departureDate, return_date: params.returnDate || '',
      trip_type: params.tripType, passengers: params.passengers,
      cabin_class: params.cabinClass, currency: params.currency,
      budget: params.maxBudget || 0, freshness_note: 'Data freshness unknown',
      result_confidence: 'low'
    };
  }
  if (!raw.recommendation) {
    raw.recommendation = { best_overall_flight_id: '', cheapest_flight_id: '', fastest_flight_id: '', best_under_budget_flight_id: '', explanation: '' };
  }
  if (!Array.isArray(raw.flights)) raw.flights = [];
  if (!Array.isArray(raw.warnings)) raw.warnings = [];
  raw.flights = raw.flights.map(function(f, i) {
    return {
      id: f.id || 'flight_' + (i + 1),
      airline: f.airline || 'Unknown Airline',
      flight_numbers: Array.isArray(f.flight_numbers) ? f.flight_numbers : [],
      provider: f.provider || '',
      price: typeof f.price === 'number' ? f.price : 0,
      currency: f.currency || params.currency,
      is_under_budget: typeof f.is_under_budget === 'boolean' ? f.is_under_budget : (params.maxBudget ? f.price <= params.maxBudget : true),
      departure_airport: f.departure_airport || params.origin,
      arrival_airport: f.arrival_airport || params.destination,
      departure_time: f.departure_time || '',
      arrival_time: f.arrival_time || '',
      total_duration_minutes: typeof f.total_duration_minutes === 'number' ? f.total_duration_minutes : 0,
      stops: typeof f.stops === 'number' ? f.stops : 0,
      layovers: Array.isArray(f.layovers) ? f.layovers : [],
      booking_url: f.booking_url || '',
      source_url: f.source_url || '',
      source_name: f.source_name || '',
      confidence: ['high', 'medium', 'low'].indexOf(f.confidence) >= 0 ? f.confidence : 'low',
      notes: f.notes || '',
      score: typeof f.score === 'number' ? f.score : 0,
      badges: Array.isArray(f.badges) ? f.badges : [],
    };
  });
  return raw;
}

function flightNorm100(val, min, max) {
  if (max === min) return 100;
  return Math.round(((max - val) / (max - min)) * 100);
}

function scoreFlights(response, priorityMode, maxBudget) {
  var flights = response.flights;
  if (flights.length === 0) return response;
  var prices = flights.map(function(f) { return f.price; }).filter(function(p) { return p > 0; });
  var durs = flights.map(function(f) { return f.total_duration_minutes; }).filter(function(d) { return d > 0; });
  var stopsArr = flights.map(function(f) { return f.stops; });
  var minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices);
  var minD = Math.min.apply(null, durs), maxD = Math.max.apply(null, durs);
  var minS = Math.min.apply(null, stopsArr), maxS = Math.max.apply(null, stopsArr);
  var confMap = { high: 100, medium: 60, low: 25 };
  flights.forEach(function(f) {
    var ps = f.price > 0 ? flightNorm100(f.price, minP, maxP) : 50;
    var ds = f.total_duration_minutes > 0 ? flightNorm100(f.total_duration_minutes, minD, maxD) : 50;
    var ss = flightNorm100(f.stops, minS, maxS);
    var bs = 50;
    if (maxBudget && maxBudget > 0) {
      bs = f.price <= maxBudget ? 100 : Math.max(0, 100 - ((f.price - maxBudget) / maxBudget) * 200);
    }
    var cs = confMap[f.confidence] || 10;
    f.score = Math.round(ps * 0.4 + ds * 0.25 + ss * 0.15 + bs * 0.1 + cs * 0.1);
    f.is_under_budget = maxBudget ? f.price <= maxBudget : true;
    f.badges = [];
  });
  var cheapest = flights.reduce(function(a, b) { return a.price > 0 && (b.price <= 0 || a.price < b.price) ? a : b; });
  var fastest = flights.reduce(function(a, b) { return a.total_duration_minutes > 0 && (b.total_duration_minutes <= 0 || a.total_duration_minutes < b.total_duration_minutes) ? a : b; });
  var best = flights.reduce(function(a, b) { return a.score >= b.score ? a : b; });
  var underBudget = flights.filter(function(f) { return f.is_under_budget; });
  var bestUB = underBudget.length > 0 ? underBudget.reduce(function(a, b) { return a.score >= b.score ? a : b; }) : null;
  function addFlightBadge(id, badge) {
    var f = flights.find(function(fl) { return fl.id === id; });
    if (f && f.badges.indexOf(badge) < 0) f.badges.push(badge);
  }
  addFlightBadge(cheapest.id, 'Cheapest');
  addFlightBadge(fastest.id, 'Fastest');
  addFlightBadge(best.id, 'Best Value');
  if (bestUB) addFlightBadge(bestUB.id, 'Under Budget');
  flights.filter(function(f) { return f.stops === 0; }).forEach(function(f) { addFlightBadge(f.id, 'Nonstop'); });
  var sorted;
  switch (priorityMode) {
    case 'cheapest': sorted = flights.slice().sort(function(a, b) { return a.price - b.price; }); break;
    case 'fastest': sorted = flights.slice().sort(function(a, b) { return a.total_duration_minutes - b.total_duration_minutes; }); break;
    case 'best_under_budget':
      sorted = underBudget.slice().sort(function(a, b) { return b.score - a.score; })
        .concat(flights.filter(function(f) { return !f.is_under_budget; }).sort(function(a, b) { return b.score - a.score; }));
      break;
    default: sorted = flights.slice().sort(function(a, b) { return b.score - a.score; });
  }
  var rec = response.recommendation;
  rec.cheapest_flight_id = cheapest.id;
  rec.fastest_flight_id = fastest.id;
  rec.best_overall_flight_id = best.id;
  rec.best_under_budget_flight_id = bestUB ? bestUB.id : '';
  if (!rec.explanation) {
    var parts = [best.airline + ' at ' + best.currency + ' ' + best.price + ' offers the best overall value.'];
    if (cheapest.id !== best.id) parts.push(cheapest.airline + ' is cheapest at ' + cheapest.currency + ' ' + cheapest.price + '.');
    if (fastest.id !== best.id) parts.push(fastest.airline + ' is fastest at ' + fastest.total_duration_minutes + ' min.');
    rec.explanation = parts.join(' ');
  }
  response.flights = sorted;
  response.recommendation = rec;
  return response;
}

async function handleFlightSearch(request, env, origin) {
  try {
    var body;
    try { body = await request.json(); } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid request body.' }, origin);
    }
    var p = {
      origin: sanitize(String(body.origin || '')),
      destination: sanitize(String(body.destination || '')),
      departureDate: sanitize(String(body.departureDate || '')),
      returnDate: sanitize(String(body.returnDate || '')),
      tripType: sanitize(String(body.tripType || 'one-way')),
      passengers: parseInt(body.passengers) || 1,
      cabinClass: sanitize(String(body.cabinClass || 'economy')),
      flexibleDays: Math.min(Math.max(parseInt(body.flexibleDays) || 0, 0), 7),
      maxBudget: body.maxBudget ? parseInt(body.maxBudget) : null,
      currency: sanitize(String(body.currency || 'USD')),
      preferredAirlines: Array.isArray(body.preferredAirlines) ? body.preferredAirlines.map(function(a) { return sanitize(String(a)); }).filter(Boolean) : [],
      avoidAirlines: Array.isArray(body.avoidAirlines) ? body.avoidAirlines.map(function(a) { return sanitize(String(a)); }).filter(Boolean) : [],
      maxStops: sanitize(String(body.maxStops || '2+')),
      priorityMode: sanitize(String(body.priorityMode || 'best_balance')),
    };
    if (!p.origin) return jsonResponse({ success: false, error: 'Origin is required.' }, origin);
    if (!p.destination) return jsonResponse({ success: false, error: 'Destination is required.' }, origin);
    if (!p.departureDate) return jsonResponse({ success: false, error: 'Departure date is required.' }, origin);
    var apiKey = env.PERPLEXITY_API_KEY;
    if (!apiKey) return jsonResponse({ success: false, error: 'Flight search service is not configured.' }, origin);
    var payload = {
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: FLIGHT_SYSTEM_PROMPT },
        { role: 'user', content: buildFlightPrompt(p) },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      web_search_options: { search_context_size: 'high' },
    };
    var data = await callSonarWithTimeout(apiKey, payload, FLIGHT_TIMEOUT_MS);
    var content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
    if (!content || typeof content !== 'string') throw new Error('Empty response from search engine.');
    var jsonStr = extractFlightJson(content);
    var parsed;
    try { parsed = JSON.parse(jsonStr); } catch (e) { throw new Error('Failed to parse flight data.'); }
    var normalized = normalizeFlightResponse(parsed, p);
    var scored = scoreFlights(normalized, p.priorityMode, p.maxBudget);
    return jsonResponse({ success: true, data: scored }, origin);
  } catch (e) {
    var msg = 'Unable to search for flights right now. Please try again later.';
    if (e && e.message) {
      if (e.message.indexOf('abort') >= 0) msg = 'The search timed out. AI flight searches can take up to a minute — please try again.';
      else if (e.message.indexOf('parse') >= 0) msg = 'The AI returned an unexpected response format. Please try a different route or try again.';
      else if (e.message.indexOf('Sonar') >= 0) msg = 'The AI search service returned an error. This may be a temporary issue — please try again in a moment.';
      else if (e.message.indexOf('Empty') >= 0) msg = 'The AI search returned no content. Please try a more specific route (e.g. use airport codes like SIN, NRT).';
    }
    return jsonResponse({ success: false, error: msg }, origin);
  }
}

/* ───────────── Shared chat helpers (unchanged) ───────────── */

async function callSonar(apiKey, payload) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.perplexity.ai/v1/sonar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) return await res.json();

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error('Sonar API ' + res.status);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
      }

      throw new Error('API error: ' + res.status);
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES && !e.message.startsWith('API error:')) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError;
}

function buildResult(data) {
  const searchResults = data.search_results || [];
  const citations = data.citations || [];
  const answer = data.choices?.[0]?.message?.content || '';
  const relatedQuestions = data.related_questions || [];

  if (!answer && searchResults.length === 0) return null;

  const sources = searchResults.slice(0, 8).map((sr, i) => ({
    index: i + 1,
    title: sr.title || '',
    url: sr.url,
    snippet: sr.snippet || '',
    source: extractDomain(sr.url),
    date: sr.date || null
  }));

  if (sources.length === 0 && citations.length > 0) {
    citations.slice(0, 8).forEach((url, i) => {
      sources.push({
        index: i + 1,
        title: '',
        url,
        snippet: '',
        source: extractDomain(url),
        date: null
      });
    });
  }

  return {
    type: 'rich',
    answer,
    sources,
    relatedQuestions: relatedQuestions.slice(0, 4)
  };
}

/* ───────────────────── Utilities ───────────────────── */

function sanitize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch { return null; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function corsResponse(body, origin, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

function jsonResponse(data, origin, extraHeaders) {
  return jsonResponseRaw(JSON.stringify(data), origin, extraHeaders);
}

function jsonResponseRaw(body, origin, extraHeaders) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'no-cache',
  };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(body, { headers });
}
