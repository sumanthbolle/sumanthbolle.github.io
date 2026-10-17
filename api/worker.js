/*
 * Summaverick — General AI Search & Research Worker
 * Cloudflare Worker · Perplexity Sonar API + Hacker News
 *
 * Routes:
 *   POST /              — chat completion (existing); body: { query, context }
 *   POST /flights       — SkyFare search (Google Flights via SerpApi);
 *                         body: { origin, destination, departureDate, returnDate?, passengers, cabin, currency }
 *   POST /flights/inspire — Summaverick destination ideas for SkyFare;
 *                         body: { query, origin?, currency? }
 *   GET  /upsc/brief    — Anchor study tool: daily / weekly UPSC current-affairs
 *                         brief, filtered, scored and verification-gated
 *   POST /upsc/topic    — Anchor topic lookup; body: { topic, paper? }
 *   POST /upsc/enrich   — private source-bound publisher enrichment
 *   POST /upsc/mains    — private Mains drill generation (same publish token)
 *   POST /upsc/verify   — private second-pass verification (different model)
 *   GET  /trending      — landing-page widgets (news / market / tech),
 *                         country-aware via cf.country (or ?country=XX override),
 *                         cached per country in Cloudflare Cache API
 *   GET  /metals        — live gold/silver spot references, FX conversion,
 *                         and 30-day daily context
 *   OPTIONS *           — CORS preflight
 *
 * Environment variables:
 *   PERPLEXITY_API_KEY   — from perplexity.ai/settings/api (chat + /flights/inspire)
 *   ALLOWED_ORIGIN       — e.g. https://sumanthbolle.com (or * for dev)
 *   SERPAPI_KEY          — serpapi.com key; /flights returns Google Flights results
 *   SERVICENOW_DOMAIN_ENABLED — optional; default true. When true, ServiceNow
 *                         questions get domain-pack system guidance (see
 *                         research-agent/ for the full Node domain pack).
 *   SERVICENOW_RELEASE_FAMILY — optional; default australia
 *   UPSC_PUBLISH_TOKEN  — bearer secret required by POST /upsc/enrich
 *
 * /flights source priority: Amadeus real inventory (when keys set & IATA codes
 * resolvable) → Perplexity Sonar fallback. Each response includes data.source
 * ('amadeus' | 'ai') so the UI can label fare provenance.
 */

import {
  SERVICENOW_DOMAIN_SYSTEM_ADDON,
  isServiceNowDomainQuery,
  classifyServiceNowIntent,
  serviceNowSearchHint,
} from './servicenow-domain.js';

import {
  UPSC_DOMAIN_SYSTEM_ADDON,
  isUpscDomainQuery,
  classifyUpscIntent,
  upscChipInstruction,
  upscMetaLine,
  upscFormatInstruction,
} from './upsc-domain.js';
import { primarySourceUrl, retrievePrimarySources, sourceResearchInstruction } from './upsc-sources.js';
import { handlePocketFeed } from './upsc-pocket.js';

import {
  upscScope,
  upscScopeConfig,
  buildUpscBriefPayload,
  buildUpscEnrichmentPayload,
  buildUpscMainsPayload,
  buildUpscTopicPayload,
  buildUpscVerifyPayload,
  normalizeUpscBrief,
  normalizeUpscExamNote,
  normalizeUpscMainsDrill,
  normalizeUpscTopic,
  normalizeUpscVerification,
} from './upsc.js';

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
const METALS_TTL_SECONDS = 60;
const METALS_REQUEST_TIMEOUT_MS = 8000;
const METALS_CURRENCIES = new Set([
  'USD', 'AED', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR',
  'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
]);

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

    if ((request.method === 'GET' && url.pathname === '/upsc/pocket')
      || (request.method === 'POST' && url.pathname === '/upsc/pocket/publish')) {
      return handlePocketFeed(request, env, origin);
    }

    if (request.method === 'GET' && url.pathname === '/trending') {
      return handleTrending(request, env, ctx, origin);
    }

    if (request.method === 'GET' && url.pathname === '/servicenow') {
      return handleServiceNowFeed(request, env, ctx, origin);
    }

    if (request.method === 'GET' && url.pathname === '/metals') {
      return handleMetals(request, ctx, origin);
    }

    if (request.method === 'GET' && url.pathname === '/upsc/brief') {
      return handleUpscBrief(request, env, ctx, origin);
    }

    if (request.method === 'POST' && url.pathname === '/upsc/enrich') {
      return handleUpscEnrich(request, env, origin);
    }

    if (request.method === 'POST' && url.pathname === '/upsc/mains') {
      return handleUpscMains(request, env, origin);
    }

    if (request.method === 'POST' && url.pathname === '/upsc/verify') {
      return handleUpscVerify(request, env, origin);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/upsc/topic') {
      return handleUpscTopic(request, env, origin);
    }

    if (url.pathname === '/flights') {
      return handleFlightSearch(request, env, origin);
    }

    if (url.pathname === '/flights/inspire') {
      return handleFlightInspire(request, env, origin);
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

    // Explicit domain hint from the caller (the UPSC study-page widget sends
    // { domain: 'upsc' }); fall back to text detection otherwise.
    const requestedDomain = typeof body.domain === 'string' ? body.domain.toLowerCase() : '';
    const upscDomain = requestedDomain === 'upsc' || isUpscDomainQuery(query);

    // The widget marks structure-only asks (a model-answer skeleton) so we can
    // skip expensive live search for them. Defaults to full search.
    const liveSearch = body.liveSearch !== false;

    const domainEnabled = env.SERVICENOW_DOMAIN_ENABLED !== 'false';
    // UPSC takes precedence: an aspirant's page never wants the ServiceNow pack.
    const snDomain = !upscDomain && domainEnabled && isServiceNowDomainQuery(query);
    const snIntent = snDomain ? classifyServiceNowIntent(query) : null;
    const releaseFamily =
      (env.SERVICENOW_RELEASE_FAMILY || snIntent?.releaseFamily || 'australia').toLowerCase();

    // Structured chip the widget is driving (prelims/mains/answer/quiz/rubric/
    // evaluate), plus the study/exam mode and marks that shape word limits.
    const upscChip = typeof body.chip === 'string' ? body.chip.toLowerCase() : '';
    const upscMode = body.mode === 'exam' ? 'exam' : 'study';
    const upscMarks = Number(body.marks) === 15 ? 15 : (Number(body.marks) === 10 ? 10 : 0);
    const upscMeta = body.meta && typeof body.meta === 'object' ? body.meta : null;
    const wantsJson = body.format === 'json' || body.format === 'brief';
    const sourceUrls = upscDomain && liveSearch && Array.isArray(body.sourceUrls)
      ? [...new Set(body.sourceUrls.slice(0, 3).map(primarySourceUrl).filter(Boolean))] : [];
    const sourceDocuments = sourceUrls.length ? await retrievePrimarySources(sourceUrls) : [];

    let systemContent = SYSTEM_PROMPT;
    if (upscDomain) {
      const upscIntent = classifyUpscIntent(query);
      const metaLine = upscMetaLine(upscMeta);
      const chipLine = upscChipInstruction(upscChip, { mode: upscMode, marks: upscMarks || undefined });
      const formatLine = upscFormatInstruction(body.format);
      systemContent =
        SYSTEM_PROMPT +
        '\n\n' +
        UPSC_DOMAIN_SYSTEM_ADDON +
        (upscIntent.paper && !upscMeta ? `\n\nLikely paper for this topic: ${upscIntent.paper}.` : '') +
        (metaLine ? `\n\n${metaLine}` : '') +
        (chipLine ? `\n\n${chipLine}` : '') +
        (formatLine ? `\n\n${formatLine}` : '');
    } else if (snDomain) {
      systemContent =
        SYSTEM_PROMPT +
        '\n\n' +
        SERVICENOW_DOMAIN_SYSTEM_ADDON +
        '\n\n' +
        serviceNowSearchHint(releaseFamily) +
        `\nClassified ServiceNow intent: ${snIntent.intent}; modules: ${snIntent.modules.join(', ')}.` +
        (snIntent.requiresLiveInstance
          ? '\nLive instance metadata queries are disabled by default in this Worker; do not invent instance-specific fields.'
          : '');
    }

    const messages = [{ role: 'system', content: systemContent }];
    if (sourceDocuments.length) messages[0].content += '\n\n' + sourceResearchInstruction(sourceDocuments);

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

    // UPSC answers want exam determinism; JSON chips want maximum determinism.
    // A model-answer skeleton needs no live search, so shrink its search
    // context to keep it fast and clean.
    const temperature = upscDomain ? (wantsJson ? 0.1 : 0.15) : (snDomain ? 0.1 : 0.2);
    const maxTokens = upscDomain ? 1200 : (snDomain ? 1600 : 1024);
    const searchContextSize = liveSearch ? 'high' : 'low';

    const sonarPayload = {
      model: 'sonar',
      messages,
      temperature,
      max_tokens: maxTokens,
      web_search_options: { search_context_size: searchContextSize },
      return_related_questions: true
    };
    if (sourceUrls.length) {
      sonarPayload.search_domain_filter = [...new Set(sourceUrls.map(url => new URL(url).hostname.replace(/^www\./, '')))];
      sonarPayload.max_tokens = 1800;
    }

    const data = await callSonar(apiKey, sonarPayload);
    const result = buildResult(data);
    if (result && upscDomain) {
      result.domain = 'upsc';
      if (upscChip) result.chip = upscChip;
      if (upscMeta) result.meta = upscMeta;
      if (sourceDocuments.length) result.sourceRetrieval = sourceDocuments.map(({ text, ...record }) => record);
    } else if (result && snDomain) {
      result.domain = 'servicenow';
      result.servicenow = {
        intent: snIntent.intent,
        modules: snIntent.modules,
        releaseFamily,
        liveInstanceEnabled: false,
      };
    }
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
  const content = sonarData?.choices?.[0]?.message?.content;
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch {
    // Structured mode usually returns bare JSON, but a reasoning preamble or a
    // ```json fence around the object has shown up; take the outermost object.
    const stripped = String(content).replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/* One log line when a provider reply fails a contract: finish reason, usage
 * and the start of the content. The CI runs print the local Worker log, so
 * this is how a 422 "did not satisfy the contract" is diagnosed. */
function logContractFailure(route, sonarData) {
  const choice = sonarData?.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content || null);
  console.error(`UPSC ${route} contract failed:`, JSON.stringify({
    finish_reason: choice?.finish_reason || null,
    usage: sonarData?.usage || null,
    content_length: text ? text.length : 0,
    content_head: text ? text.slice(0, 300) : null,
  }));
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

/* ───────────────── Anchor — UPSC study tool ─────────────────
 * GET  /upsc/brief?scope=daily|weekly
 * POST /upsc/topic   body: { topic, paper? }
 * POST /upsc/enrich  body: one normalized official source record
 *
 * Same Perplexity Sonar key as the rest of the Worker. The prompts, the
 * examinability filter, the probability scoring and the verification gate all
 * live in api/upsc.js; this section only does IO, caching and CORS.
 */
const UPSC_BRIEF_TIMEOUT_MS = 45000;
const UPSC_TOPIC_TIMEOUT_MS = 40000;
const UPSC_ENRICH_TIMEOUT_MS = 55000;
// Leave time for the bounded document fetch inside the publisher's 55s request.
const UPSC_SOURCE_NOTE_TIMEOUT_MS = 45000;

function hasUpscPublishToken(request, env) {
  var expected = String(env.UPSC_PUBLISH_TOKEN || '');
  var supplied = String(request.headers.get('Authorization') || '');
  return Boolean(expected && supplied === 'Bearer ' + expected);
}

function upscEnrichmentResponse(data, origin, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-store',
    },
  });
}

async function handleUpscEnrich(request, env, origin) {
  if (!hasUpscPublishToken(request, env)) {
    return upscEnrichmentResponse({ success: false, error: 'Unauthorized' }, origin, 401);
  }

  let record;
  try {
    record = await request.json();
  } catch {
    return upscEnrichmentResponse({ success: false, error: 'Invalid request body.' }, origin, 422);
  }
  const validRecord = record && typeof record === 'object'
    && /^src_[a-f0-9]{16,64}$/i.test(String(record.id || ''))
    && /^https?:\/\//.test(String(record.sourceUrl || ''))
    && String(record.contentHash || '').length >= 16
    && record.sourceVerified === true;
  if (!validRecord) {
    return upscEnrichmentResponse({ success: false, error: 'Invalid source record.' }, origin, 422);
  }
  if (!env.PERPLEXITY_API_KEY) {
    return upscEnrichmentResponse({ success: false, error: 'Enrichment service is not configured.' }, origin, 503);
  }

  try {
    const documents = await retrievePrimarySources([record.sourceUrl]);
    const payload = buildUpscEnrichmentPayload(record);
    payload.messages[0].content += '\n' + sourceResearchInstruction(documents);
    const data = await callSonarWithTimeout(
      env.PERPLEXITY_API_KEY,
      payload,
      UPSC_SOURCE_NOTE_TIMEOUT_MS
    );
    const note = normalizeUpscExamNote(parseStructured(data), record);
    if (!note) {
      logContractFailure('enrich', data);
      return upscEnrichmentResponse({
        success: false,
        error: 'Provider response did not satisfy the source-bound exam-note contract.',
      }, origin, 422);
    }
    return upscEnrichmentResponse({ success: true, data: note }, origin, 200);
  } catch (error) {
    console.error('UPSC enrich failed:', error && error.message || error);
    return upscEnrichmentResponse({
      success: false,
      error: 'Enrichment service could not process this record.',
    }, origin, 503);
  }
}

async function handleUpscMains(request, env, origin) {
  if (!hasUpscPublishToken(request, env)) {
    return upscEnrichmentResponse({ success: false, error: 'Unauthorized' }, origin, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return upscEnrichmentResponse({ success: false, error: 'Invalid request body.' }, origin, 422);
  }
  const anchor = body && body.anchor && typeof body.anchor === 'object' ? body.anchor : null;
  const directive = String(body && body.directive_word || '');
  const paper = String(body && body.gs_paper || 'GS2');
  if (!anchor || !anchor.id || !directive) {
    return upscEnrichmentResponse({ success: false, error: 'Invalid mains request.' }, origin, 422);
  }
  if (!env.PERPLEXITY_API_KEY) {
    return upscEnrichmentResponse({ success: false, error: 'Mains service is not configured.' }, origin, 503);
  }
  try {
    const data = await callSonarWithTimeout(
      env.PERPLEXITY_API_KEY,
      buildUpscMainsPayload(anchor, directive, paper),
      UPSC_ENRICH_TIMEOUT_MS
    );
    const drill = normalizeUpscMainsDrill(parseStructured(data), {
      directive_word: directive,
    });
    if (!drill) {
      return upscEnrichmentResponse({
        success: false,
        error: 'Provider response did not satisfy the mains-drill contract.',
      }, origin, 422);
    }
    return upscEnrichmentResponse({ success: true, data: drill }, origin, 200);
  } catch {
    return upscEnrichmentResponse({
      success: false,
      error: 'Mains service could not process this anchor.',
    }, origin, 503);
  }
}

async function handleUpscVerify(request, env, origin) {
  if (!hasUpscPublishToken(request, env)) {
    return upscEnrichmentResponse({ success: false, error: 'Unauthorized' }, origin, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return upscEnrichmentResponse({ success: false, error: 'Invalid request body.' }, origin, 422);
  }
  const note = body && body.note && typeof body.note === 'object' ? body.note : null;
  const source = body && body.source && typeof body.source === 'object' ? body.source : {};
  if (!note || !note.anchor) {
    return upscEnrichmentResponse({ success: false, error: 'Invalid verification request.' }, origin, 422);
  }
  if (!env.PERPLEXITY_API_KEY) {
    return upscEnrichmentResponse({ success: false, error: 'Verification service is not configured.' }, origin, 503);
  }
  try {
    const documents = await retrievePrimarySources([source.sourceUrl]);
    const payload = buildUpscVerifyPayload(source, note);
    payload.messages[0].content += '\n' + sourceResearchInstruction(documents);
    const data = await callSonarWithTimeout(
      env.PERPLEXITY_API_KEY,
      payload,
      UPSC_SOURCE_NOTE_TIMEOUT_MS
    );
    const result = normalizeUpscVerification(parseStructured(data));
    if (!result) {
      logContractFailure('verify', data);
      return upscEnrichmentResponse({
        success: false,
        error: 'Provider response did not satisfy the verification contract.',
      }, origin, 422);
    }
    return upscEnrichmentResponse({ success: true, verificationVersion: 2, data: result }, origin, 200);
  } catch (error) {
    console.error('UPSC verify failed:', error && error.message || error);
    return upscEnrichmentResponse({
      success: false,
      error: 'Verification service could not process this note.',
    }, origin, 503);
  }
}

async function handleUpscBrief(request, env, ctx, origin) {
  const url = new URL(request.url);
  const scope = upscScope(url.searchParams.get('scope'));
  const cfg = upscScopeConfig(scope);
  const today = new Date().toISOString().slice(0, 10);

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.summaverick.internal/upsc/brief/${scope}/${today}`,
    { method: 'GET' }
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return jsonResponseRaw(body, origin, { 'X-Summaverick-Cache': 'HIT' });
  }

  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'Briefing service is not configured.' }, origin);
  }

  try {
    const data = await callSonarWithTimeout(
      apiKey,
      buildUpscBriefPayload(scope, today),
      UPSC_BRIEF_TIMEOUT_MS
    );
    const brief = normalizeUpscBrief(parseStructured(data), scope, {});

    if (brief.items.length === 0) {
      return jsonResponse({
        success: false,
        error: 'Nothing cleared the examinability filter on this run. Try again in a few minutes.',
      }, origin, { 'Cache-Control': 'no-store' });
    }

    const payload = { success: true, data: brief };
    const responseBody = JSON.stringify(payload);
    const ttl = brief.items.length >= cfg.minItems ? cfg.ttl : cfg.partialTtl;

    if (ctx && typeof ctx.waitUntil === 'function') {
      const toCache = new Response(responseBody, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttl}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }

    return jsonResponseRaw(responseBody, origin, { 'X-Summaverick-Cache': 'MISS' });
  } catch (e) {
    const message = e && e.message ? e.message : '';
    let error = 'The briefing service could not be reached. Your saved notes and revision queue still work.';
    if (message.indexOf('abort') >= 0) {
      error = 'The brief took too long to build. Try again — retrieval runs can be slow at peak times.';
    } else if (message.indexOf('Sonar') >= 0) {
      error = 'The retrieval service returned an error. This is usually temporary.';
    }
    return jsonResponse({ success: false, error }, origin, { 'Cache-Control': 'no-store' });
  }
}

const UPSC_PAPERS = ['any', 'GS1', 'GS2', 'GS3', 'GS4', 'ESSAY'];

async function handleUpscTopic(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, origin);
  }

  const topic = sanitize(String(body.topic || '')).slice(0, 160);
  const paperRaw = sanitize(String(body.paper || 'any')).toUpperCase().replace(/\s+/g, '');
  const paper = UPSC_PAPERS.indexOf(paperRaw) >= 0 ? paperRaw : 'any';

  if (topic.length < 3) {
    return jsonResponse({ success: false, error: 'Give me a topic or an anchor to look up.' }, origin);
  }

  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'Lookup service is not configured.' }, origin);
  }

  try {
    const data = await callSonarWithTimeout(
      apiKey,
      buildUpscTopicPayload(topic, paper),
      UPSC_TOPIC_TIMEOUT_MS
    );
    const note = normalizeUpscTopic(parseStructured(data), topic);

    if (!note) {
      return jsonResponse({
        success: false,
        error: 'Could not build an exam-ready note for that. Try naming the concept rather than the headline.',
      }, origin, { 'Cache-Control': 'no-store' });
    }

    return jsonResponse({ success: true, data: note }, origin, { 'Cache-Control': 'no-store' });
  } catch (e) {
    const message = e && e.message ? e.message : '';
    const error = message.indexOf('abort') >= 0
      ? 'The lookup timed out. Try a narrower topic.'
      : 'The lookup service could not be reached. Try again in a moment.';
    return jsonResponse({ success: false, error }, origin, { 'Cache-Control': 'no-store' });
  }
}

/* ───────────────── Precious-metal market report ───────────────── */

async function fetchMarketJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METALS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: METALS_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`Market data source returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

function normalizeHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      date: String(row && row.date || '').slice(0, 10),
      usdPerOunce: Number(row && row.rate),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.usdPerOunce))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function handleMetals(request, ctx, origin) {
  const url = new URL(request.url);
  const requestedCurrency = (url.searchParams.get('currency') || 'USD').toUpperCase();
  if (!METALS_CURRENCIES.has(requestedCurrency)) {
    return jsonResponse({
      success: false,
      error: 'Unsupported currency',
      supportedCurrencies: Array.from(METALS_CURRENCIES),
    }, origin, { 'Cache-Control': 'no-store' });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.summaverick.internal/metals/${requestedCurrency}`,
    { method: 'GET' }
  );
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return jsonResponseRaw(body, origin, {
      'Cache-Control': `public, max-age=${METALS_TTL_SECONDS}`,
      'X-Summaverick-Cache': 'HIT',
    });
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 35);
  const startDate = start.toISOString().slice(0, 10);
  const historyQuery = `from=${startDate}&to=${endDate}&quotes=USD`;

  const jobs = [
    fetchMarketJson('https://api.gold-api.com/price/XAU'),
    fetchMarketJson('https://api.gold-api.com/price/XAG'),
    fetchMarketJson(`https://api.frankfurter.dev/v2/rates?base=XAU&${historyQuery}`),
    fetchMarketJson(`https://api.frankfurter.dev/v2/rates?base=XAG&${historyQuery}`),
  ];
  if (requestedCurrency !== 'USD') {
    jobs.push(fetchMarketJson(
      `https://api.frankfurter.dev/v2/rate/USD/${encodeURIComponent(requestedCurrency)}`
    ));
  }

  const results = await Promise.allSettled(jobs);
  const goldQuote = settledValue(results[0]);
  const silverQuote = settledValue(results[1]);

  if (!goldQuote || !silverQuote || !Number.isFinite(Number(goldQuote.price))
      || !Number.isFinite(Number(silverQuote.price)) || Number(goldQuote.price) <= 0
      || Number(silverQuote.price) <= 0) {
    return jsonResponse({
      success: false,
      error: 'Live metal prices are temporarily unavailable',
      generatedAt: new Date().toISOString(),
    }, origin, { 'Cache-Control': 'no-store' });
  }

  const fxPayload = requestedCurrency === 'USD' ? null : settledValue(results[4]);
  const fxRate = requestedCurrency === 'USD'
    ? 1
    : Number(fxPayload && (Array.isArray(fxPayload) ? fxPayload[0] && fxPayload[0].rate : fxPayload.rate));
  const hasConversion = Number.isFinite(fxRate) && fxRate > 0;
  const quoteTimes = [goldQuote.updatedAt, silverQuote.updatedAt]
    .map((time) => new Date(time).getTime())
    .filter(Number.isFinite);
  const hasQuoteTimestamps = quoteTimes.length === 2;
  const sourceUpdatedAt = quoteTimes.length
    ? new Date(Math.min(...quoteTimes)).toISOString()
    : null;
  const ageSeconds = sourceUpdatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(sourceUpdatedAt).getTime()) / 1000))
    : null;

  const payload = {
    success: true,
    currency: requestedCurrency,
    fxRate: hasConversion ? fxRate : null,
    fxDate: requestedCurrency === 'USD'
      ? endDate
      : String(fxPayload && (Array.isArray(fxPayload) ? fxPayload[0] && fxPayload[0].date : fxPayload.date) || '').slice(0, 10) || null,
    conversionAvailable: hasConversion,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt,
    quoteTimestampAvailable: hasQuoteTimestamps,
    freshness: hasQuoteTimestamps && ageSeconds <= 300 ? 'live' : 'delayed',
    metals: {
      gold: {
        symbol: 'XAU',
        usdPerOunce: Number(goldQuote.price),
        history: normalizeHistory(settledValue(results[2])),
      },
      silver: {
        symbol: 'XAG',
        usdPerOunce: Number(silverQuote.price),
        history: normalizeHistory(settledValue(results[3])),
      },
    },
    sources: {
      live: { name: 'Gold API', url: 'https://gold-api.com/' },
      historyAndFx: { name: 'Frankfurter', url: 'https://frankfurter.dev/' },
    },
  };
  const responseBody = JSON.stringify(payload);

  if (ctx && typeof ctx.waitUntil === 'function') {
    const toCache = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${METALS_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
  }

  return jsonResponseRaw(responseBody, origin, {
    'Cache-Control': `public, max-age=${METALS_TTL_SECONDS}`,
    'X-Summaverick-Cache': 'MISS',
  });
}

/* ───────────── Flight Search (SkyFare) ─────────────
 * Google Flights results via SerpApi (https://serpapi.com/google-flights-api).
 * Needs the SERPAPI_KEY secret. Responses are cached for 3 hours per search
 * to keep within the SerpApi quota. */

const FLIGHT_TIMEOUT_MS = 30000;
const FLIGHT_CACHE_SECONDS = 3 * 60 * 60;
const SERP_CABIN = { economy: 1, premium: 2, business: 3, first: 4 };
const SERP_GL = { INR: 'in', GBP: 'uk', EUR: 'de', AED: 'ae', SGD: 'sg', AUD: 'au', CAD: 'ca', JPY: 'jp' };

function serpTime(s) { return typeof s === 'string' ? s.slice(11, 16) : ''; }
function serpDate(s) { return typeof s === 'string' ? s.slice(0, 10) : ''; }

function serpItinerary(item, index, isBest) {
  var legs = Array.isArray(item.flights) ? item.flights : [];
  if (!legs.length || !(Number(item.price) > 0)) return null;
  var first = legs[0];
  var last = legs[legs.length - 1];
  var depDay = serpDate(first.departure_airport && first.departure_airport.time);
  var arrDay = serpDate(last.arrival_airport && last.arrival_airport.time);
  var dayOffset = depDay && arrDay
    ? Math.round((Date.parse(arrDay) - Date.parse(depDay)) / 86400000)
    : 0;
  var airlines = [];
  legs.forEach(function (l) { if (l.airline && airlines.indexOf(l.airline) === -1) airlines.push(l.airline); });
  var co2 = item.carbon_emissions || {};
  return {
    id: (isBest ? 'b' : 'o') + index,
    best: isBest,
    price: Number(item.price),
    airlines: airlines,
    logo: item.airline_logo || first.airline_logo || '',
    depart: { time: serpTime(first.departure_airport.time), date: depDay, airport: first.departure_airport.id, name: first.departure_airport.name },
    arrive: { time: serpTime(last.arrival_airport.time), date: arrDay, airport: last.arrival_airport.id, name: last.arrival_airport.name },
    dayOffset: dayOffset,
    duration: Number(item.total_duration) || 0,
    stops: legs.length - 1,
    layovers: (item.layovers || []).map(function (l) {
      return { airport: l.id, name: l.name, duration: Number(l.duration) || 0, overnight: !!l.overnight };
    }),
    segments: legs.map(function (l) {
      return {
        airline: l.airline || '',
        flightNumber: l.flight_number || '',
        airplane: l.airplane || '',
        legroom: l.legroom || '',
        duration: Number(l.duration) || 0,
        from: l.departure_airport.id,
        to: l.arrival_airport.id,
        depTime: serpTime(l.departure_airport.time),
        arrTime: serpTime(l.arrival_airport.time),
        overnight: !!l.overnight,
        oftenDelayed: !!l.often_delayed_by_over_30_min,
      };
    }),
    co2: co2.this_flight ? {
      kg: Math.round(co2.this_flight / 1000),
      typicalKg: co2.typical_for_this_route ? Math.round(co2.typical_for_this_route / 1000) : null,
      diffPercent: typeof co2.difference_percent === 'number' ? co2.difference_percent : null,
    } : null,
  };
}

function googleFlightsUrl(p) {
  var q = 'Flights from ' + p.origin + ' to ' + p.destination + ' on ' + p.departureDate +
    (p.returnDate ? ' returning ' + p.returnDate : ' one way') +
    (p.passengers > 1 ? ' for ' + p.passengers + ' adults' : '') +
    (p.cabin !== 'economy' ? ' ' + p.cabin + ' class' : '');
  return 'https://www.google.com/travel/flights?hl=en&curr=' + encodeURIComponent(p.currency) + '&q=' + encodeURIComponent(q);
}

async function handleFlightSearch(request, env, origin) {
  var body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid request.' }, origin);
  }
  var iata = /^[A-Z]{3}$/;
  var ymd = /^\d{4}-\d{2}-\d{2}$/;
  var p = {
    origin: String(body.origin || '').trim().toUpperCase(),
    destination: String(body.destination || '').trim().toUpperCase(),
    departureDate: String(body.departureDate || ''),
    returnDate: String(body.returnDate || ''),
    passengers: Math.min(Math.max(parseInt(body.passengers, 10) || 1, 1), 9),
    cabin: SERP_CABIN[body.cabin] ? body.cabin : 'economy',
    currency: /^[A-Z]{3}$/.test(String(body.currency || '')) ? body.currency : 'USD',
  };
  if (!iata.test(p.origin) || !iata.test(p.destination)) {
    return jsonResponse({ success: false, error: 'Pick both airports from the list.' }, origin);
  }
  if (!ymd.test(p.departureDate) || (p.returnDate && !ymd.test(p.returnDate))) {
    return jsonResponse({ success: false, error: 'Pick valid dates.' }, origin);
  }
  if (!env.SERPAPI_KEY) {
    return jsonResponse({ success: false, error: 'Flight search is not set up yet.' }, origin);
  }

  var qs = new URLSearchParams({
    engine: 'google_flights',
    departure_id: p.origin,
    arrival_id: p.destination,
    outbound_date: p.departureDate,
    type: p.returnDate ? '1' : '2',
    adults: String(p.passengers),
    travel_class: String(SERP_CABIN[p.cabin]),
    currency: p.currency,
    hl: 'en',
    gl: SERP_GL[p.currency] || 'us',
  });
  if (p.returnDate) qs.set('return_date', p.returnDate);

  var cache = caches.default;
  var cacheKey = new Request('https://skyfare.cache/flights?' + qs.toString());
  var hit = await cache.match(cacheKey);
  if (hit) return jsonResponseRaw(await hit.text(), origin, { 'X-SkyFare-Cache': 'hit' });

  qs.set('api_key', env.SERPAPI_KEY);
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, FLIGHT_TIMEOUT_MS);
  var raw;
  try {
    var res = await fetch('https://serpapi.com/search.json?' + qs.toString(), { signal: ctrl.signal });
    raw = await res.json();
    if (!res.ok || raw.error) {
      var noResults = raw && typeof raw.error === 'string' && /hasn't returned any results/i.test(raw.error);
      return jsonResponse({ success: false, error: noResults ? 'No flights found for these dates.' : 'Flight search failed. Try again.' }, origin);
    }
  } catch (e) {
    return jsonResponse({ success: false, error: e && e.name === 'AbortError' ? 'Search timed out. Try again.' : 'Flight search failed. Try again.' }, origin);
  } finally {
    clearTimeout(timer);
  }

  var flights = []
    .concat((raw.best_flights || []).map(function (f, i) { return serpItinerary(f, i, true); }))
    .concat((raw.other_flights || []).map(function (f, i) { return serpItinerary(f, i, false); }))
    .filter(Boolean);
  if (!flights.length) {
    return jsonResponse({ success: false, error: 'No flights found for these dates.' }, origin);
  }

  var pi = raw.price_insights || {};
  var data = {
    source: 'google',
    currency: p.currency,
    roundTrip: !!p.returnDate,
    googleUrl: (raw.search_metadata && raw.search_metadata.google_flights_url) || googleFlightsUrl(p),
    insights: pi.lowest_price ? {
      lowest: pi.lowest_price,
      level: pi.price_level || null,
      typical: Array.isArray(pi.typical_price_range) ? pi.typical_price_range : null,
      history: Array.isArray(pi.price_history) ? pi.price_history : [],
    } : null,
    fetchedAt: new Date().toISOString(),
    flights: flights,
  };
  var text = JSON.stringify({ success: true, data: data });
  await cache.put(cacheKey, new Response(text, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + FLIGHT_CACHE_SECONDS },
  }));
  return jsonResponseRaw(text, origin);
}

const INSPIRE_SYSTEM_PROMPT = 'You are Summaverick planning flights for SkyFare. Given a natural-language trip request, suggest 3 concrete destinations the traveller can search right away. Return ONLY JSON — no markdown, no code fences, no prose outside JSON. Prefer real IATA codes. Suggest realistic departure/return ISO dates (YYYY-MM-DD) within the stated month/season or the next 90 days if unspecified. Rough fares should be typical economy round-trip totals including taxes when possible. Never invent fake airport codes.';

const INSPIRE_TIMEOUT_MS = 35000;

function extractInspireJson(text) {
  if (!text || typeof text !== 'string') return null;
  var cleaned = text.trim();
  var fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  var start = cleaned.indexOf('{');
  var end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { return null; }
}

var INSPIRE_MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/* The model is told to use YYYY-MM-DD, but sonar occasionally still writes
   day-first (e.g. treats "12 Sep" as month=12 day=09). Both orderings can be
   syntactically valid dates (when day <= 12), so a shape-only regex isn't
   enough — cross-check against any month mentioned in the suggestion text
   and reorder if that resolves the ambiguity. */
function inspireMonthHint(text) {
  if (!text) return 0;
  var t = String(text).toLowerCase();
  for (var i = 0; i < INSPIRE_MONTH_NAMES.length; i++) {
    if (t.indexOf(INSPIRE_MONTH_NAMES[i]) !== -1) return i + 1;
  }
  return 0;
}
function inspirePad2(n) { return (n < 10 ? '0' : '') + n; }
function inspireIsValidYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function inspireFixDateOrder(iso, monthHint) {
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var y = parseInt(m[1], 10), a = parseInt(m[2], 10), b = parseInt(m[3], 10);
  var asIs = inspireIsValidYmd(y, a, b);
  var swapped = a !== b && inspireIsValidYmd(y, b, a);
  if (asIs && swapped) {
    // Ambiguous (both day <= 12): trust the month the suggestion text agrees with.
    if (monthHint && b === monthHint && a !== monthHint) return y + '-' + inspirePad2(b) + '-' + inspirePad2(a);
    return iso;
  }
  if (asIs) return iso;
  if (swapped) return y + '-' + inspirePad2(b) + '-' + inspirePad2(a);
  return '';
}

function normalizeInspireSuggestion(raw, fallbackCurrency, queryHint) {
  if (!raw || typeof raw !== 'object') return null;
  var destCity = sanitize(String(raw.destination || raw.city || '')).slice(0, 80);
  var destCode = sanitize(String(raw.destination_airport || raw.iata || raw.airport || '')).toUpperCase().slice(0, 3);
  if (!destCity && !destCode) return null;
  if (destCode && !/^[A-Z]{3}$/.test(destCode)) destCode = '';
  var originCity = sanitize(String(raw.origin || raw.origin_hint || '')).slice(0, 80);
  var originCode = sanitize(String(raw.origin_airport || '')).toUpperCase().slice(0, 3);
  if (originCode && !/^[A-Z]{3}$/.test(originCode)) originCode = '';
  var weeks = Array.isArray(raw.best_weeks) ? raw.best_weeks : [];
  weeks = weeks.map(function(w) { return sanitize(String(w)).slice(0, 40); }).filter(Boolean).slice(0, 4);
  var price = raw.price_range && typeof raw.price_range === 'object' ? raw.price_range : {};
  var min = parseInt(price.min, 10);
  var max = parseInt(price.max, 10);
  var cur = sanitize(String(price.currency || fallbackCurrency || 'USD')).toUpperCase().slice(0, 3) || 'USD';
  var dep = sanitize(String(raw.suggested_departure || raw.departure_date || '')).slice(0, 10);
  var ret = sanitize(String(raw.suggested_return || raw.return_date || '')).slice(0, 10);
  if (dep && !/^\d{4}-\d{2}-\d{2}$/.test(dep)) dep = '';
  if (ret && !/^\d{4}-\d{2}-\d{2}$/.test(ret)) ret = '';
  var monthHint = inspireMonthHint(weeks.join(' ') + ' ' + (raw.why || '') + ' ' + (queryHint || ''));
  if (dep) dep = inspireFixDateOrder(dep, monthHint);
  if (ret) ret = inspireFixDateOrder(ret, monthHint);
  if (dep && ret && ret < dep) {
    // Return landed before departure — most likely dep/ret still disagree on
    // day/month order between themselves. Try re-deriving ret from dep's month.
    var reordered = inspireFixDateOrder(ret, parseInt(dep.slice(5, 7), 10));
    ret = (reordered && reordered >= dep) ? reordered : '';
  }
  var destLabel = destCity
    ? (destCode ? destCity + ' (' + destCode + ')' : destCity)
    : destCode;
  var originLabel = originCity
    ? (originCode ? originCity + ' (' + originCode + ')' : originCity)
    : (originCode || '');
  return {
    destination: destLabel,
    destination_city: destCity || destCode,
    destination_airport: destCode,
    origin: originLabel,
    origin_city: originCity,
    origin_airport: originCode,
    best_weeks: weeks,
    price_range: {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
      currency: cur,
    },
    why: sanitize(String(raw.why || raw.reason || raw.notes || '')).slice(0, 220),
    trip_type: /one.?way/i.test(String(raw.trip_type || '')) ? 'one-way' : 'round-trip',
    suggested_departure: dep,
    suggested_return: ret,
  };
}

async function handleFlightInspire(request, env, origin) {
  try {
    var body;
    try { body = await request.json(); } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid request body.' }, origin);
    }
    var query = sanitize(String(body.query || '')).slice(0, 400);
    var originHint = sanitize(String(body.origin || '')).slice(0, 80);
    var currency = sanitize(String(body.currency || 'USD')).toUpperCase().slice(0, 3) || 'USD';
    if (!query || query.length < 5) {
      return jsonResponse({ success: false, error: 'Describe your trip in a short sentence.' }, origin);
    }

    var apiKey = env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return jsonResponse({ success: false, error: 'Inspiration service is not configured.' }, origin);
    }

    var userPrompt = 'Trip request: "' + query + '"\n'
      + (originHint ? 'Preferred origin (if not in the request): ' + originHint + '\n' : '')
      + 'Currency for rough fares: ' + currency + '\n'
      + 'Return JSON with this exact shape:\n'
      + '{"suggestions":[{"destination":"Bali","destination_airport":"DPS","origin":"Singapore","origin_airport":"SIN","best_weeks":["mid September","late September"],"price_range":{"min":280,"max":450,"currency":"' + currency + '"},"why":"Warm beaches in shoulder season","trip_type":"round-trip","suggested_departure":"2026-09-12","suggested_return":"2026-09-19"}]}\n'
      + 'Rules: exactly 3 suggestions; use real IATA codes; dates must be YYYY-MM-DD; keep "why" under 180 characters; if origin is unknown leave origin fields empty.';

    var payload = {
      model: 'sonar',
      messages: [
        { role: 'system', content: INSPIRE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1600,
      web_search_options: { search_context_size: 'medium' },
    };

    var data = await callSonarWithTimeout(apiKey, payload, INSPIRE_TIMEOUT_MS);
    var content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    var parsed = extractInspireJson(content);
    if (!parsed || !Array.isArray(parsed.suggestions)) {
      throw new Error('Could not parse destination suggestions.');
    }
    var suggestions = parsed.suggestions
      .map(function(s) { return normalizeInspireSuggestion(s, currency, query); })
      .filter(Boolean)
      .slice(0, 3);
    if (!suggestions.length) throw new Error('No usable destination suggestions returned.');

    return jsonResponse({
      success: true,
      data: {
        query: query,
        suggestions: suggestions,
        source: 'summaverick',
      },
    }, origin);
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e.message || 'Could not suggest destinations. Try a clearer trip description.',
    }, origin);
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

  const orderedResults = citations.length ? citations.slice(0, 8).map(url => (
    searchResults.find(row => row.url === url) || { url }
  )) : searchResults.slice(0, 8);
  const sources = orderedResults.map((sr, i) => ({
    index: i + 1,
    title: sr.title || '',
    url: sr.url,
    snippet: sr.snippet || '',
    source: extractDomain(sr.url),
    date: sr.date || null
  }));

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
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
