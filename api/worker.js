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

  const [newsRes, marketRes, techRes] = await Promise.allSettled([
    fetchNewsWidget(apiKey, country),
    fetchMarketWidget(apiKey, country),
    fetchTechWidget(),
  ]);

  const widgets = {
    news: pickFulfilled(newsRes),
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

  const ttl = successCount === 3 ? TRENDING_TTL_SECONDS : TRENDING_PARTIAL_TTL_SECONDS;
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

/* ── News widget: top world / country headline of the day via Sonar ── */
async function fetchNewsWidget(apiKey, country) {
  const region = COUNTRY_NAME[country] || 'the world';
  const messages = [
    { role: 'system', content: 'You return strict JSON only. Do not invent facts. Use only verified, citable news from the past 24 hours.' },
    { role: 'user', content: `Pick the single most significant news story being widely reported right now ${country === 'GLOBAL' ? 'around the world' : `in ${region}`}. Return JSON with the headline, a one-sentence neutral summary, the publishing source name, and the article URL. The story must be from the past 24 hours.` },
  ];

  const schema = {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      source: { type: 'string' },
      url: { type: 'string' },
    },
    required: ['headline', 'summary', 'source', 'url'],
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
  if (!parsed || !parsed.headline) return null;

  return {
    kind: 'news',
    label: country === 'GLOBAL' ? 'Top story · Global' : `Top story · ${COUNTRY_NAME[country] || country}`,
    title: String(parsed.headline).slice(0, 200),
    summary: String(parsed.summary || '').slice(0, 280),
    source: String(parsed.source || '').slice(0, 80),
    url: safeUrl(parsed.url),
  };
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
  } finally {
    clearTimeout(timer);
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
