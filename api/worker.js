/*
 * Summaverick — General AI Search & Research Worker
 * Cloudflare Worker · Perplexity Sonar API + Hacker News
 *
 * Routes:
 *   POST /              — chat completion (existing); body: { query, context }
 *   POST /flights       — SkyFare flight discovery + "best time to book" advisory;
 *                         body: { origin, destination, departureDate, ... }
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

    if (request.method === 'GET' && url.pathname === '/servicenow') {
      return handleServiceNowFeed(request, env, ctx, origin);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/flights') {
      return handleFlightSearch(request, env, origin);
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

/* ───────────────────── ServiceNow live article feed ─────────────────────
 * GET /servicenow[?track=ai|agents|llm|cost|all&fresh=week|month]
 *
 * Uses the same Perplexity Sonar key as the rest of the worker to surface the
 * latest, real, citable ServiceNow articles across four editorial tracks that
 * matter most to the community right now: platform AI, AI Agents, LLMs, and
 * cost / licensing optimization. Results are cached per (track, recency) in the
 * Cloudflare Cache API so the page loads instantly and we stay well within API
 * limits. Every item carries a real source URL — nothing is invented.
 */
const SNOW_TRACKS = {
  ai: {
    label: 'Platform AI',
    emoji: '\u2728',
    query:
      'List the most recent, notable news and articles about ServiceNow platform AI — Now Assist, Now Intelligence, generative AI features, AI Search, and predictive intelligence. Prefer official ServiceNow announcements, blog.servicenow.com, community.servicenow.com, and reputable tech/enterprise-IT outlets.',
  },
  agents: {
    label: 'AI Agents',
    emoji: '\uD83E\uDD16',
    query:
      'List the most recent, notable news and articles about ServiceNow AI Agents and agentic AI — the AI Agent Orchestrator, AI Agent Studio, autonomous agents, and agentic workflows on the Now Platform. Prefer official ServiceNow sources and reputable enterprise-IT outlets.',
  },
  llm: {
    label: 'LLM & GenAI',
    emoji: '\uD83E\uDDE0',
    query:
      'List the most recent, notable news and articles about ServiceNow large language models and generative AI — the Now LLM, domain-specific models, partnerships with model providers (e.g. Nvidia, Microsoft, Google), and LLM governance on the Now Platform. Prefer official ServiceNow sources and reputable outlets.',
  },
  cost: {
    label: 'Cost Optimization',
    emoji: '\uD83D\uDCB0',
    query:
      'List the most recent, notable articles and guidance about ServiceNow cost optimization — licensing and subscription optimization, entitlement management, platform efficiency, reducing technical debt, FinOps for ServiceNow, and lowering total cost of ownership. Prefer official ServiceNow sources, established ServiceNow partners, and reputable enterprise-IT outlets.',
  },
};

const SNOW_TTL_SECONDS = 3600;          // 1 hour when the fetch fully succeeds
const SNOW_PARTIAL_TTL_SECONDS = 300;   // 5 min when one or more tracks failed
const SNOW_REQUEST_TIMEOUT_MS = 12000;

const SNOW_FEED_SCHEMA = {
  type: 'object',
  properties: {
    articles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['title', 'summary', 'source', 'url'],
      },
    },
  },
  required: ['articles'],
};

async function fetchServiceNowTrack(apiKey, key, recency) {
  const track = SNOW_TRACKS[key];
  if (!track) return null;
  const payload = {
    model: 'sonar',
    messages: [
      { role: 'system', content: 'You return strict JSON only. Do not invent articles, titles, or URLs. Only include real, citable articles you found via web search, each with a working source URL. Order by most recent first.' },
      { role: 'user', content: `${track.query}\n\nReturn JSON: { "articles": [ { "title", "summary" (one neutral sentence), "source" (publication name), "url" (article URL), "date" (ISO or human date if known) } ] }. Return up to 5 articles, most recent first. Only include items you can cite with a real URL.` },
    ],
    temperature: 0.1,
    max_tokens: 900,
    search_recency_filter: recency,
    web_search_options: { search_context_size: 'medium' },
    response_format: { type: 'json_schema', json_schema: { schema: SNOW_FEED_SCHEMA } },
  };

  const data = await callSonarWithTimeout(apiKey, payload, SNOW_REQUEST_TIMEOUT_MS);
  const parsed = parseStructured(data);
  if (!parsed || !Array.isArray(parsed.articles)) return null;

  const articles = parsed.articles
    .map((a) => ({
      title: String(a.title || '').slice(0, 200),
      summary: String(a.summary || '').slice(0, 300),
      source: String(a.source || '').slice(0, 80),
      url: safeUrl(a.url),
      date: a.date ? String(a.date).slice(0, 40) : null,
    }))
    .filter((a) => a.title && a.url);

  if (articles.length === 0) return null;

  return { key, label: track.label, emoji: track.emoji, articles: articles.slice(0, 5) };
}

async function handleServiceNowFeed(request, env, ctx, origin) {
  const url = new URL(request.url);
  const trackParam = (url.searchParams.get('track') || 'all').toLowerCase();
  const recency = url.searchParams.get('fresh') === 'month' ? 'month' : 'week';
  const requested = trackParam === 'all'
    ? Object.keys(SNOW_TRACKS)
    : trackParam.split(',').map((t) => t.trim()).filter((t) => SNOW_TRACKS[t]);
  const keys = requested.length ? requested : Object.keys(SNOW_TRACKS);

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.summaverick.internal/servicenow/${keys.join('-')}/${recency}`,
    { method: 'GET' }
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return jsonResponseRaw(body, origin, { 'X-Summaverick-Cache': 'HIT' });
  }

  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'API key not configured' }, origin);
  }

  const settled = await Promise.allSettled(
    keys.map((k) => fetchServiceNowTrack(apiKey, k, recency))
  );

  const tracks = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter(Boolean);

  const successCount = tracks.length;
  const payload = {
    success: successCount > 0,
    recency,
    generatedAt: new Date().toISOString(),
    tracks,
  };

  const ttl = successCount >= keys.length ? SNOW_TTL_SECONDS : SNOW_PARTIAL_TTL_SECONDS;
  const responseBody = JSON.stringify(payload);

  if (successCount > 0 && ctx && typeof ctx.waitUntil === 'function') {
    const toCache = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
  }

  return jsonResponseRaw(responseBody, origin, { 'X-Summaverick-Cache': 'MISS' });
}

/* ───────────── Flight Search ───────────── */

const FLIGHT_SYSTEM_PROMPT = 'You are a real-time flight search and travel pricing assistant. Your task is to find current publicly available flight options for the provided route, dates, passenger count, cabin class, budget, and preferences.\n\nYou must:\n- Search current web results for flight prices.\n- Prefer airline official websites and reputable travel providers (Google Flights, Kayak, Skyscanner, Expedia, etc.).\n- Return only structured JSON. No markdown, no code fences, no explanation text outside JSON.\n- Do not invent flights, prices, booking links, or airlines.\n- If exact prices are not available, mark the confidence as "low" and explain why in the notes field.\n- Include source URLs wherever possible.\n- Include a freshness note indicating when the data was retrieved.\n- Compare flights based on price, duration, stops, layovers, budget fit, baggage, and carbon emissions.\n- Do not claim that a booking is confirmed.\n- Treat results as price-discovery only.\n- Each flight must have a unique "id" field (e.g., "flight_1", "flight_2").\n- The "badges" array can include values like "Cheapest", "Fastest", "Best Value", "Under Budget", "Nonstop", "Low CO2", "Great Deal".\n- The "score" field should be your best estimate from 0-100 based on overall value.\n\nFor every flight also estimate, where known:\n- "co2_kg": estimated carbon emissions per passenger for the whole itinerary, in kilograms (number). Use typical aircraft/route emissions if a precise figure is unavailable; otherwise omit.\n- "fare_brand": the fare family / branded fare (e.g. "Basic Economy", "Main Cabin", "Economy Flex", "Business Saver").\n- "carry_on_included": true/false — whether a full-size cabin bag is included.\n- "checked_bags_included": number of checked bags included in the quoted fare (0 if none).\n- "refundable": true/false if known.\n- "self_transfer": true if the itinerary mixes separate tickets / virtual-interline / non-protected connections (Kiwi-style self-transfer) where the traveller must re-check bags and missed connections are not protected.\nBe honest: prefer omitting a field over guessing a specific figure. Basic Economy / "light" fares usually do not include a carry-on or checked bag — reflect that.';

const FLIGHT_TIMEOUT_MS = 55000;

/* ── "Best time to book" engine ──────────────────────────────────────────
 * A deterministic advance-purchase model that runs even when the AI omits
 * timing guidance. Sweet-spot windows are derived from widely-cited fare
 * studies (Google Flights / Hopper / CheapAir): the cheapest fares cluster
 * a few weeks out for short/domestic trips and a few months out for
 * long-haul international ones. The AI's live price read (low/typical/high
 * + rising/falling) is layered on top of this skeleton in mergeBookingAdvice.
 */
const BOOKING_WINDOWS = {
  domestic:      { tooEarly: 120, sweetStart: 21, sweetEnd: 60, late: 14, lastMin: 3 },
  international: { tooEarly: 300, sweetStart: 60, sweetEnd: 150, late: 30, lastMin: 7 },
};

/* Northern-hemisphere peak travel months by rough demand. Used only as a
 * fallback hint; the AI provides the route-specific seasonality note. */
const PEAK_MONTHS = [6, 7, 8, 12];      // Jun, Jul, Aug, Dec
const SHOULDER_MONTHS = [4, 5, 9, 10];  // Apr, May, Sep, Oct

/* IATA code → country, mirroring the airport DB used by the SkyFare UI.
 * Lets the timing engine tell domestic from international trips so it can
 * pick the right advance-purchase window. */
var AIRPORT_COUNTRY = {
  JFK:'USA',LAX:'USA',ORD:'USA',ATL:'USA',DFW:'USA',SFO:'USA',MIA:'USA',SEA:'USA',BOS:'USA',EWR:'USA',
  IAD:'USA',DEN:'USA',LAS:'USA',MCO:'USA',HNL:'USA',PHX:'USA',IAH:'USA',MSP:'USA',DTW:'USA',PHL:'USA',
  LHR:'UK',LGW:'UK',STN:'UK',MAN:'UK',EDI:'UK',CDG:'France',ORY:'France',NCE:'France',
  FRA:'Germany',MUC:'Germany',BER:'Germany',AMS:'Netherlands',MAD:'Spain',BCN:'Spain',
  FCO:'Italy',MXP:'Italy',VCE:'Italy',ZRH:'Switzerland',GVA:'Switzerland',VIE:'Austria',
  CPH:'Denmark',OSL:'Norway',ARN:'Sweden',HEL:'Finland',IST:'Turkey',SAW:'Turkey',ATH:'Greece',
  LIS:'Portugal',DUB:'Ireland',BRU:'Belgium',WAW:'Poland',PRG:'Czech Republic',BUD:'Hungary',
  DXB:'UAE',AUH:'UAE',DOH:'Qatar',RUH:'Saudi Arabia',JED:'Saudi Arabia',BAH:'Bahrain',MCT:'Oman',
  AMM:'Jordan',TLV:'Israel',CAI:'Egypt',NRT:'Japan',HND:'Japan',KIX:'Japan',ICN:'South Korea',
  GMP:'South Korea',PEK:'China',PKX:'China',PVG:'China',CAN:'China',HKG:'Hong Kong',TPE:'Taiwan',
  SIN:'Singapore',KUL:'Malaysia',BKK:'Thailand',DMK:'Thailand',CGK:'Indonesia',DPS:'Indonesia',
  MNL:'Philippines',SGN:'Vietnam',HAN:'Vietnam',DEL:'India',BOM:'India',BLR:'India',MAA:'India',
  HYD:'India',CCU:'India',CMB:'Sri Lanka',DAC:'Bangladesh',KTM:'Nepal',SYD:'Australia',MEL:'Australia',
  BNE:'Australia',PER:'Australia',AKL:'New Zealand',YYZ:'Canada',YVR:'Canada',YUL:'Canada',
  MEX:'Mexico',CUN:'Mexico',GRU:'Brazil',GIG:'Brazil',EZE:'Argentina',SCL:'Chile',BOG:'Colombia',
  LIM:'Peru',JNB:'South Africa',CPT:'South Africa',NBO:'Kenya',ADD:'Ethiopia',CMN:'Morocco',
  LOS:'Nigeria',ACC:'Ghana',MRU:'Mauritius',
};

var CITY_COUNTRY = {
  'new york':'USA','los angeles':'USA','chicago':'USA','atlanta':'USA','dallas':'USA','san francisco':'USA',
  'miami':'USA','seattle':'USA','boston':'USA','newark':'USA','washington':'USA','denver':'USA',
  'las vegas':'USA','orlando':'USA','honolulu':'USA','phoenix':'USA','houston':'USA',
  london:'UK','manchester':'UK','edinburgh':'UK','paris':'France','nice':'France','frankfurt':'Germany',
  munich:'Germany','berlin':'Germany','amsterdam':'Netherlands','madrid':'Spain','barcelona':'Spain',
  rome:'Italy','milan':'Italy','venice':'Italy','zurich':'Switzerland','geneva':'Switzerland',
  vienna:'Austria','copenhagen':'Denmark','oslo':'Norway','stockholm':'Sweden','helsinki':'Finland',
  istanbul:'Turkey',athens:'Greece',lisbon:'Portugal',dublin:'Ireland',brussels:'Belgium',
  warsaw:'Poland',prague:'Czech Republic',budapest:'Hungary',dubai:'UAE','abu dhabi':'UAE',doha:'Qatar',
  riyadh:'Saudi Arabia',jeddah:'Saudi Arabia',muscat:'Oman',amman:'Jordan','tel aviv':'Israel',cairo:'Egypt',
  tokyo:'Japan',osaka:'Japan',seoul:'South Korea',beijing:'China',shanghai:'China',guangzhou:'China',
  'hong kong':'Hong Kong',taipei:'Taiwan',singapore:'Singapore','kuala lumpur':'Malaysia',bangkok:'Thailand',
  jakarta:'Indonesia',bali:'Indonesia',manila:'Philippines','ho chi minh city':'Vietnam',hanoi:'Vietnam',
  'new delhi':'India',delhi:'India',mumbai:'India',bangalore:'India',chennai:'India',hyderabad:'India',
  kolkata:'India',colombo:'Sri Lanka',dhaka:'Bangladesh',kathmandu:'Nepal',sydney:'Australia',
  melbourne:'Australia',brisbane:'Australia',perth:'Australia',auckland:'New Zealand',toronto:'Canada',
  vancouver:'Canada',montreal:'Canada','mexico city':'Mexico',cancun:'Mexico','sao paulo':'Brazil',
  'rio de janeiro':'Brazil','buenos aires':'Argentina',santiago:'Chile',bogota:'Colombia',lima:'Peru',
  johannesburg:'South Africa','cape town':'South Africa',nairobi:'Kenya','addis ababa':'Ethiopia',
  casablanca:'Morocco',lagos:'Nigeria',accra:'Ghana',mauritius:'Mauritius',
};

/* Resolve a free-text place ("Tokyo (NRT)", "SIN", "singapore") to a country. */
function countryForPlace(place) {
  if (!place) return null;
  var s = String(place).trim();
  var paren = s.match(/\(([A-Za-z]{3})\)/);
  if (paren && AIRPORT_COUNTRY[paren[1].toUpperCase()]) return AIRPORT_COUNTRY[paren[1].toUpperCase()];
  var bare = s.match(/\b([A-Za-z]{3})\b/);
  if (bare && AIRPORT_COUNTRY[bare[1].toUpperCase()]) return AIRPORT_COUNTRY[bare[1].toUpperCase()];
  var lower = s.toLowerCase();
  for (var city in CITY_COUNTRY) {
    if (lower.indexOf(city) >= 0) return CITY_COUNTRY[city];
  }
  return null;
}

function daysBetween(fromISO, toISO) {
  var a = Date.parse(fromISO + 'T00:00:00Z');
  var b = Date.parse(toISO + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* Infer whether the trip crosses an international border, using the airport
 * DB country tags when we can resolve the codes; defaults to international
 * (the more conservative, longer window) when unknown. */
function inferScope(origin, destination) {
  var oc = countryForPlace(origin);
  var dc = countryForPlace(destination);
  if (oc && dc) return oc === dc ? 'domestic' : 'international';
  return 'international';
}

function computeBookingTiming(p, todayISO) {
  var today = todayISO || new Date().toISOString().split('T')[0];
  var daysOut = p.departureDate ? daysBetween(today, p.departureDate) : null;
  var scope = inferScope(p.origin, p.destination);
  var w = BOOKING_WINDOWS[scope];

  var recommendation, urgency, headline, window;

  if (daysOut === null) {
    recommendation = 'monitor';
    urgency = 'info';
    headline = 'Add a departure date for booking-timing advice';
    window = '';
  } else if (daysOut < 0) {
    recommendation = 'book_now';
    urgency = 'high';
    headline = 'This date is in the past — pick an upcoming date';
    window = '';
  } else if (daysOut <= w.lastMin) {
    recommendation = 'book_now';
    urgency = 'high';
    headline = 'Book now — last-minute fares rarely fall';
    window = 'Book today';
  } else if (daysOut <= w.late) {
    recommendation = 'book_soon';
    urgency = 'elevated';
    headline = 'Book soon — prices usually climb in the final weeks';
    window = 'Within the next few days';
  } else if (daysOut < w.sweetStart) {
    recommendation = 'book_soon';
    urgency = 'elevated';
    headline = 'Good to book — you are approaching the cheapest window';
    window = 'Within 1–2 weeks';
  } else if (daysOut <= w.sweetEnd) {
    recommendation = 'book_now';
    urgency = 'good';
    headline = "You're in the sweet spot — a strong time to book";
    window = 'Now through the next couple of weeks';
  } else if (daysOut <= w.tooEarly) {
    recommendation = 'monitor';
    urgency = 'info';
    headline = 'Plenty of time — track the price and book in the sweet spot';
    window = 'Aim for ' + w.sweetStart + '–' + w.sweetEnd + ' days before departure';
  } else {
    recommendation = 'wait';
    urgency = 'info';
    headline = 'Very early — fares are often not optimized yet';
    window = 'Revisit around ' + w.sweetEnd + ' days before departure';
  }

  var month = p.departureDate ? (parseInt(p.departureDate.slice(5, 7), 10) || 0) : 0;
  var season = PEAK_MONTHS.indexOf(month) >= 0 ? 'peak'
    : SHOULDER_MONTHS.indexOf(month) >= 0 ? 'shoulder'
    : month ? 'off-peak' : 'unknown';

  return {
    days_until_departure: daysOut,
    route_scope: scope,
    season: season,
    recommendation: recommendation,   // book_now | book_soon | wait | monitor
    urgency: urgency,                  // good | elevated | high | info
    headline: headline,
    best_booking_window: window,
    sweet_spot_days: { start: w.sweetStart, end: w.sweetEnd },
  };
}

/* Merge the deterministic timing skeleton with the AI's live price read.
 * The AI is authoritative on price level / trend / seasonality (it can see
 * current fares); our engine is authoritative on advance-purchase position. */
function mergeBookingAdvice(timing, aiAdvice) {
  var a = aiAdvice && typeof aiAdvice === 'object' ? aiAdvice : {};
  var priceLevel = ['low', 'typical', 'high'].indexOf(a.price_assessment) >= 0 ? a.price_assessment : 'unknown';
  var trend = ['rising', 'stable', 'falling'].indexOf(a.expected_trend) >= 0 ? a.expected_trend : 'unknown';
  var confidence = ['high', 'medium', 'low'].indexOf(a.confidence) >= 0 ? a.confidence : 'low';

  var rec = timing.recommendation;
  var urgency = timing.urgency;
  var hasDate = typeof timing.days_until_departure === 'number' && timing.days_until_departure >= 0;

  // Let a strong live price signal override the calendar-only verdict
  // (only when we have a valid future departure date to reason about).
  if (hasDate && priceLevel === 'low' && (rec === 'monitor' || rec === 'wait')) {
    rec = 'book_now'; urgency = 'good';
  } else if (hasDate && priceLevel === 'high' && trend === 'falling' && rec === 'book_now' && timing.urgency !== 'high') {
    rec = 'wait'; urgency = 'info';
  } else if (hasDate && trend === 'rising' && rec === 'monitor') {
    rec = 'book_soon'; urgency = 'elevated';
  }

  var summaryBits = [];
  if (typeof timing.days_until_departure === 'number' && timing.days_until_departure >= 0) {
    summaryBits.push(timing.days_until_departure + ' days out (' + timing.route_scope + ' route)');
  }
  if (priceLevel !== 'unknown') summaryBits.push('current fares look ' + priceLevel);
  if (trend !== 'unknown') summaryBits.push('prices trending ' + trend);

  var summary = a.summary && typeof a.summary === 'string'
    ? a.summary.slice(0, 300)
    : (timing.headline + (summaryBits.length ? '. ' + capitalize(summaryBits.join(', ')) + '.' : '.'));

  return {
    recommendation: rec,                       // book_now | book_soon | wait | monitor
    urgency: urgency,                          // good | elevated | high | info
    headline: REC_HEADLINE[rec] || timing.headline,
    summary: summary,
    price_assessment: priceLevel,              // low | typical | high | unknown
    expected_trend: trend,                     // rising | stable | falling | unknown
    confidence: confidence,
    days_until_departure: timing.days_until_departure,
    route_scope: timing.route_scope,
    season: timing.season,
    best_booking_window: (a.best_booking_window && typeof a.best_booking_window === 'string')
      ? a.best_booking_window.slice(0, 120) : timing.best_booking_window,
    seasonality_note: (a.seasonality_note && typeof a.seasonality_note === 'string')
      ? a.seasonality_note.slice(0, 240) : '',
    cheaper_alternative_dates: (a.cheaper_alternative_dates && typeof a.cheaper_alternative_dates === 'string')
      ? a.cheaper_alternative_dates.slice(0, 240) : '',
    sweet_spot_days: timing.sweet_spot_days,
  };
}

var REC_HEADLINE = {
  book_now:  'Book now',
  book_soon: 'Book soon',
  wait:      'Consider waiting',
  monitor:  'Track the price',
};

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

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
    + 'In addition to listing flights, give booking-timing guidance for THIS route and date. '
    + 'Assess whether current fares are low/typical/high versus the usual price for this route and season, '
    + 'whether prices are likely rising/stable/falling between now and departure, the best window to book, '
    + 'a short seasonality note, and (if helpful) nearby cheaper dates. Base this on real fare-trend and '
    + 'seasonality information from your web search; if unsure, say so and use a lower confidence.\n\n'
    + 'Return the result in this exact JSON structure (no markdown, no code fences, just raw JSON):\n\n'
    + '{"search_summary":{"origin":"","destination":"","departure_date":"","return_date":"","trip_type":"","passengers":0,"cabin_class":"","currency":"","budget":0,"freshness_note":"","result_confidence":"high | medium | low"},"booking_advice":{"price_assessment":"low | typical | high","expected_trend":"rising | stable | falling","confidence":"high | medium | low","best_booking_window":"","seasonality_note":"","cheaper_alternative_dates":"","summary":""},"recommendation":{"best_overall_flight_id":"","cheapest_flight_id":"","fastest_flight_id":"","best_under_budget_flight_id":"","explanation":""},"flights":[{"id":"","airline":"","flight_numbers":[],"provider":"","price":0,"currency":"","is_under_budget":true,"departure_airport":"","arrival_airport":"","departure_time":"","arrival_time":"","total_duration_minutes":0,"stops":0,"layovers":[{"airport":"","duration_minutes":0}],"co2_kg":0,"fare_brand":"","carry_on_included":true,"checked_bags_included":0,"refundable":false,"self_transfer":false,"booking_url":"","source_url":"","source_name":"","confidence":"high | medium | low","notes":"","score":0,"badges":[]}],"warnings":[]}';
}

function extractFlightJson(text) {
  var fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.substring(start, end + 1);
  return text.trim();
}

/* Coerce a possibly-string numeric value; fall back to `fallback` if not finite. */
function flightNum(v, fallback) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    var n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/* Like flightNum but returns null (not a default) when there is no usable value. */
function flightNumOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    var n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* Enforce the user's max-stops preference in case the model ignores it. */
function enforceMaxStops(flights, maxStops) {
  if (maxStops === 'nonstop') return flights.filter(function(f) { return f.stops === 0; });
  if (maxStops === '1') return flights.filter(function(f) { return f.stops <= 1; });
  return flights;
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
    // Models frequently return numbers as strings ("450"); coerce safely so
    // scoring, deal quality, budget checks and filters don't silently break.
    var price = flightNum(f.price, 0);
    var checkedBags = flightNumOrNull(f.checked_bags_included);
    var co2 = flightNumOrNull(f.co2_kg);
    return {
      id: f.id || 'flight_' + (i + 1),
      airline: f.airline || 'Unknown Airline',
      flight_numbers: Array.isArray(f.flight_numbers) ? f.flight_numbers : [],
      provider: f.provider || '',
      price: price,
      currency: f.currency || params.currency,
      is_under_budget: typeof f.is_under_budget === 'boolean' ? f.is_under_budget : (params.maxBudget ? price <= params.maxBudget : true),
      departure_airport: f.departure_airport || params.origin,
      arrival_airport: f.arrival_airport || params.destination,
      departure_time: f.departure_time || '',
      arrival_time: f.arrival_time || '',
      total_duration_minutes: flightNum(f.total_duration_minutes, 0),
      stops: flightNum(f.stops, 0),
      layovers: Array.isArray(f.layovers) ? f.layovers.map(function(l) {
        return { airport: (l && l.airport) || '', duration_minutes: flightNum(l && l.duration_minutes, 0) };
      }) : [],
      co2_kg: co2 !== null && co2 > 0 ? Math.round(co2) : null,
      fare_brand: typeof f.fare_brand === 'string' ? f.fare_brand.slice(0, 60) : '',
      carry_on_included: typeof f.carry_on_included === 'boolean' ? f.carry_on_included : null,
      checked_bags_included: checkedBags !== null ? Math.max(0, Math.round(checkedBags)) : null,
      refundable: typeof f.refundable === 'boolean' ? f.refundable : null,
      self_transfer: f.self_transfer === true,
      emissions_level: 'unknown',
      deal_quality: 'unknown',
      day_offset: 0,
      overnight: false,
      booking_url: safeUrl(f.booking_url) || '',
      source_url: safeUrl(f.source_url) || '',
      source_name: f.source_name || '',
      confidence: ['high', 'medium', 'low'].indexOf(f.confidence) >= 0 ? f.confidence : 'low',
      notes: f.notes || '',
      score: flightNum(f.score, 0),
      badges: Array.isArray(f.badges) ? f.badges : [],
    };
  });
  return raw;
}

function flightNorm100(val, min, max) {
  if (max === min) return 100;
  return Math.round(((max - val) / (max - min)) * 100);
}

function flightMedian(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* "HH:MM" (24h) or "8:00 AM" -> minutes since midnight, or null. */
function flightTimeToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  var ampm = t.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (ampm) {
    var h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return h * 60 + parseInt(ampm[2], 10);
  }
  var m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (parseInt(m[1], 10) % 24) * 60 + parseInt(m[2], 10);
}

/* Derive arrival day offset (+1, +2…) and red-eye flag from local clock
 * times and the total duration, the way Google Flights shows "11:05 +1". */
function flightDayShape(f) {
  var dep = flightTimeToMinutes(f.departure_time);
  var arr = flightTimeToMinutes(f.arrival_time);
  var dur = f.total_duration_minutes;
  var offset = 0;
  if (dep !== null && dur > 0) {
    offset = Math.floor((dep + dur) / 1440);
  } else if (dep !== null && arr !== null && arr < dep) {
    offset = 1;
  }
  // Red-eye: departs late evening / overnight and lands the next day, or a
  // long-haul that flies through the night.
  var overnight = offset >= 1 && dep !== null && (dep >= 18 * 60 || dep <= 5 * 60);
  return { day_offset: offset, overnight: overnight };
}

function scoreFlights(response, priorityMode, maxBudget) {
  var flights = response.flights;
  if (flights.length === 0) return response;
  var prices = flights.map(function(f) { return f.price; }).filter(function(p) { return p > 0; });
  var durs = flights.map(function(f) { return f.total_duration_minutes; }).filter(function(d) { return d > 0; });
  var stopsArr = flights.map(function(f) { return f.stops; });
  var co2s = flights.map(function(f) { return f.co2_kg; }).filter(function(c) { return typeof c === 'number' && c > 0; });
  // Guard against empty arrays: Math.min/max of [] yield Infinity/-Infinity,
  // which propagate NaN into every score. Fall back to neutral bounds.
  var minP = prices.length ? Math.min.apply(null, prices) : 0, maxP = prices.length ? Math.max.apply(null, prices) : 0;
  var minD = durs.length ? Math.min.apply(null, durs) : 0, maxD = durs.length ? Math.max.apply(null, durs) : 0;
  var minS = stopsArr.length ? Math.min.apply(null, stopsArr) : 0, maxS = stopsArr.length ? Math.max.apply(null, stopsArr) : 0;
  var minC = co2s.length ? Math.min.apply(null, co2s) : 0;
  var maxC = co2s.length ? Math.max.apply(null, co2s) : 0;
  var medP = flightMedian(prices);
  var medC = flightMedian(co2s);
  var hasEmissions = co2s.length >= 2 && maxC > minC;
  var confMap = { high: 100, medium: 60, low: 25 };

  // Weighted factors. Emissions only participate when we have comparable
  // data for several flights; otherwise their weight folds back into price.
  var W = hasEmissions
    ? { price: 0.34, dur: 0.22, stops: 0.13, budget: 0.08, conf: 0.08, co2: 0.15 }
    : { price: 0.45, dur: 0.25, stops: 0.13, budget: 0.09, conf: 0.08, co2: 0 };

  flights.forEach(function(f) {
    var ps = f.price > 0 ? flightNorm100(f.price, minP, maxP) : 50;
    var ds = f.total_duration_minutes > 0 ? flightNorm100(f.total_duration_minutes, minD, maxD) : 50;
    var ss = flightNorm100(f.stops, minS, maxS);
    var es = (hasEmissions && typeof f.co2_kg === 'number' && f.co2_kg > 0) ? flightNorm100(f.co2_kg, minC, maxC) : 50;
    var bs = 50;
    if (maxBudget && maxBudget > 0) {
      bs = f.price <= maxBudget ? 100 : Math.max(0, 100 - ((f.price - maxBudget) / maxBudget) * 200);
    }
    var cs = confMap[f.confidence] || 10;
    f.score = Math.round(ps * W.price + ds * W.dur + ss * W.stops + bs * W.budget + cs * W.conf + es * W.co2);
    f.is_under_budget = maxBudget ? f.price <= maxBudget : true;

    // Emissions level relative to the result set's median.
    if (typeof f.co2_kg === 'number' && f.co2_kg > 0 && medC > 0) {
      f.emissions_level = f.co2_kg <= medC * 0.88 ? 'low' : (f.co2_kg >= medC * 1.12 ? 'high' : 'typical');
    } else {
      f.emissions_level = 'unknown';
    }

    // Deal quality vs the median fare (Kayak/Hopper-style read).
    if (f.price > 0 && medP > 0) {
      f.deal_quality = f.price <= medP * 0.82 ? 'great'
        : f.price <= medP * 0.96 ? 'good'
        : f.price <= medP * 1.18 ? 'typical' : 'high';
    } else {
      f.deal_quality = 'unknown';
    }

    var shape = flightDayShape(f);
    f.day_offset = shape.day_offset;
    f.overnight = shape.overnight;
    f.badges = [];
  });
  // Only consider flights with a usable value; the previous reduce could
  // "walk off" to the last flight when no flight had a valid price/duration.
  var pricedFlights = flights.filter(function(f) { return f.price > 0; });
  var timedFlights = flights.filter(function(f) { return f.total_duration_minutes > 0; });
  var cheapest = (pricedFlights.length ? pricedFlights : flights).reduce(function(a, b) { return a.price <= b.price ? a : b; });
  var fastest = (timedFlights.length ? timedFlights : flights).reduce(function(a, b) { return a.total_duration_minutes <= b.total_duration_minutes ? a : b; });
  var best = flights.reduce(function(a, b) { return a.score >= b.score ? a : b; });
  var greenest = co2s.length ? flights.reduce(function(a, b) {
    var av = typeof a.co2_kg === 'number' && a.co2_kg > 0 ? a.co2_kg : Infinity;
    var bv = typeof b.co2_kg === 'number' && b.co2_kg > 0 ? b.co2_kg : Infinity;
    return av <= bv ? a : b;
  }) : null;
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
  // "Great Deal" for fares meaningfully below the median (only meaningful with a few quotes).
  if (flights.length >= 3) {
    flights.filter(function(f) { return f.deal_quality === 'great'; }).forEach(function(f) { addFlightBadge(f.id, 'Great Deal'); });
  }
  if (hasEmissions && greenest) addFlightBadge(greenest.id, 'Low CO2');
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
  // Price-insights summary (Google-Flights-style low / median / high range).
  response.price_insights = {
    currency: flights[0] ? flights[0].currency : '',
    low: prices.length ? Math.round(minP) : 0,
    median: prices.length ? Math.round(medP) : 0,
    high: prices.length ? Math.round(maxP) : 0,
    cheapest_deal_quality: cheapest.deal_quality || 'unknown',
    co2_low: co2s.length ? Math.round(minC) : 0,
    co2_median: co2s.length ? Math.round(medC) : 0,
    co2_high: co2s.length ? Math.round(maxC) : 0,
    greenest_flight_id: greenest ? greenest.id : '',
  };
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
    normalized.flights = enforceMaxStops(normalized.flights, p.maxStops);
    var scored = scoreFlights(normalized, p.priorityMode, p.maxBudget);
    var timing = computeBookingTiming(p);
    scored.booking_advice = mergeBookingAdvice(timing, parsed.booking_advice);
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
