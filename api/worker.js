/*
 * Cloudflare Worker — AI Search Proxy
 * 
 * Two-stage search:
 *   1. Google Custom Search fetches real URLs for the query
 *   2. Claude picks the single best result and explains why
 * 
 * Environment variables:
 *   ANTHROPIC_API_KEY  — Claude API key
 *   GOOGLE_CSE_KEY     — Google Custom Search API key (get from console.cloud.google.com)
 *   GOOGLE_CSE_ID      — Your CSE ID (71b23c515f34d4d52)
 *   ALLOWED_ORIGIN     — https://sumanthbolle.com
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { query } = await request.json();
      if (!query || query.length < 2 || query.length > 200) {
        return jsonResponse({ success: false, error: 'Invalid query' }, allowedOrigin);
      }

      // Stage 1: Get real search results from Google
      const searchResults = await googleSearch(query, env);

      if (!searchResults || searchResults.length === 0) {
        return jsonResponse({ success: true, result: null }, allowedOrigin);
      }

      // Stage 2: Claude picks the best result and explains why
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // No Claude key — return the top Google result directly
        const top = searchResults[0];
        return jsonResponse({
          success: true,
          result: {
            title: top.title,
            snippet: top.snippet,
            url: top.link,
            source: extractDomain(top.link),
            reason: 'Top search result for this query'
          }
        }, allowedOrigin);
      }

      const best = await claudePickBest(query, searchResults, apiKey);
      return jsonResponse({ success: true, result: best }, allowedOrigin);

    } catch(e) {
      return jsonResponse({ success: false, error: e.message }, allowedOrigin);
    }
  }
};

async function googleSearch(query, env) {
  const key = env.GOOGLE_CSE_KEY;
  const cx = env.GOOGLE_CSE_ID || '71b23c515f34d4d52';

  if (!key) return null;

  const q = 'ServiceNow ' + query;
  const url = 'https://www.googleapis.com/customsearch/v1?key=' + key +
    '&cx=' + cx + '&q=' + encodeURIComponent(q) + '&num=5';

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.items || data.items.length === 0) return null;

  return data.items.map(item => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link,
    source: extractDomain(item.link)
  }));
}

async function claudePickBest(query, results, apiKey) {
  const resultsText = results.map((r, i) =>
    `[${i + 1}] ${r.title}\n    URL: ${r.link}\n    Source: ${r.source}\n    Snippet: ${r.snippet}`
  ).join('\n\n');

  const prompt = `A ServiceNow developer searched for: "${query}"

Here are the top search results:

${resultsText}

Pick the SINGLE best result for this query. Return ONLY a JSON object:
{
  "index": <number 1-${results.length}>,
  "reason": "<one sentence — why this specific result is the most useful for someone searching this>"
}

Picking criteria:
- Official docs (docs.servicenow.com, developer.servicenow.com) beat blog posts
- Pages with code examples beat conceptual overviews
- Specific API reference pages beat general guides
- If multiple results are equally good, pick the most specific one

Return ONLY the JSON. No markdown, no explanation.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'You are a ServiceNow expert. Pick the single best search result. Return only JSON.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0
      })
    });

    if (!response.ok) {
      // Claude failed — return top Google result
      return formatResult(results[0], 'Top search result');
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const idx = (parsed.index || 1) - 1;
    const chosen = results[Math.min(idx, results.length - 1)];
    return formatResult(chosen, parsed.reason || 'Best match for this query');

  } catch(e) {
    // Any failure — return top Google result
    return formatResult(results[0], 'Top search result');
  }
}

function formatResult(result, reason) {
  return {
    title: result.title,
    snippet: result.snippet,
    url: result.link,
    source: result.source || extractDomain(result.link),
    reason: reason
  };
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch(e) { return url; }
}

function jsonResponse(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'public, max-age=300'
    }
  });
}
