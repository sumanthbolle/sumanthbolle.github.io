/*
 * Cloudflare Worker — Perplexity AI Search Proxy
 * 
 * Single API call: Perplexity searches the web, reads the pages,
 * and returns the best result with a real URL and reasoning.
 * 
 * Environment variables:
 *   PERPLEXITY_API_KEY — Get from perplexity.ai/settings/api
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

      const apiKey = env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        return jsonResponse({ success: false, error: 'API key not configured' }, allowedOrigin);
      }

      const response = await fetch('https://api.perplexity.ai/v1/sonar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a ServiceNow technical search assistant. Given a search query, find the single most relevant and authoritative resource. Respond with ONLY a JSON object: {"title":"page title","snippet":"2-sentence summary","reason":"one sentence why this is the best match"}. No markdown, no code fences, just the JSON object. If nothing relevant exists, respond with null.'
            },
            {
              role: 'user',
              content: 'Find the best ServiceNow resource for: ' + query
            }
          ],
          temperature: 0.1,
          max_tokens: 300,
          search_domain_filter: [
            'docs.servicenow.com',
            'developer.servicenow.com',
            'servicenow.com',
            'community.servicenow.com'
          ],
          search_recency_filter: 'year',
          web_search_options: {
            search_context_size: 'medium'
          }
        })
      });

      if (!response.ok) {
        return jsonResponse({ success: false, error: 'API error: ' + response.status }, allowedOrigin);
      }

      const data = await response.json();

      // Extract the best result from search_results + citations + model answer
      const result = buildResult(data, query);
      return jsonResponse({ success: true, result }, allowedOrigin);

    } catch(e) {
      return jsonResponse({ success: false, error: e.message }, allowedOrigin);
    }
  }
};

function buildResult(data, query) {
  const searchResults = data.search_results || [];
  const citations = data.citations || [];
  const answer = data.choices?.[0]?.message?.content || '';

  // Parse Claude-style JSON from the answer
  let parsed = null;
  try {
    const cleaned = answer.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    if (cleaned && cleaned !== 'null') {
      parsed = JSON.parse(cleaned);
    }
  } catch(e) {
    // Not JSON — use as plain text snippet
  }

  // Priority: use search_results (they have real verified URLs)
  if (searchResults.length > 0) {
    // Pick the best search result — prefer official ServiceNow domains
    const preferred = ['docs.servicenow.com', 'developer.servicenow.com', 'community.servicenow.com'];
    let best = searchResults[0];

    for (const sr of searchResults) {
      const domain = extractDomain(sr.url);
      if (preferred.some(p => domain.includes(p))) {
        best = sr;
        break;
      }
    }

    return {
      title: best.title || (parsed && parsed.title) || query,
      snippet: (parsed && parsed.snippet) || best.snippet || answer.substring(0, 200),
      url: best.url,
      source: extractDomain(best.url),
      reason: (parsed && parsed.reason) || 'Most relevant ServiceNow resource found'
    };
  }

  // Fallback: use citations if search_results is empty
  if (citations.length > 0) {
    const bestUrl = citations.find(url => {
      const d = extractDomain(url);
      return d.includes('servicenow.com');
    }) || citations[0];

    return {
      title: (parsed && parsed.title) || query,
      snippet: (parsed && parsed.snippet) || answer.substring(0, 200),
      url: bestUrl,
      source: extractDomain(bestUrl),
      reason: (parsed && parsed.reason) || 'Cited source from search results'
    };
  }

  // No search results at all
  if (parsed && parsed.title) {
    return null; // parsed has no URL, useless
  }

  return null;
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
