/*
 * Summaverick — General AI Search & Research Worker
 * Cloudflare Worker · Perplexity Sonar API
 *
 * Handles both single-shot search (blog, interviews) and
 * multi-turn conversation (Summaverick chat) through one endpoint.
 *
 * Environment variables:
 *   PERPLEXITY_API_KEY — from perplexity.ai/settings/api
 *   ALLOWED_ORIGIN     — e.g. https://sumanthbolle.com (or * for dev)
 */

const SYSTEM_PROMPT = `You are Summaverick, an expert AI research assistant. You provide clear, well-structured answers grounded in real sources.

Guidelines:
- Give thorough, practical answers — not just summaries.
- Use citation markers like [1], [2] to reference your sources inline.
- Structure longer answers with markdown: headings, bold for key terms, bullet lists where helpful.
- When comparing options, use a clear pros/cons or tradeoff structure.
- If the question is ambiguous, address the most likely interpretation and note alternatives.
- Be direct. Skip filler phrases like "Great question!" or "Sure, I'd be happy to help."`;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return corsResponse(null, origin, 204);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

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
};

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

function sanitize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function corsResponse(body, origin, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

function jsonResponse(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-cache'
    }
  });
}
