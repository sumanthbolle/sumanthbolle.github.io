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
              content: 'You are a ServiceNow technical search assistant. Given a search query, provide a concise, direct answer in 3-5 sentences. Use citation markers like [1], [2] to reference sources. Focus on practical information a ServiceNow developer or architect needs.'
            },
            {
              role: 'user',
              content: 'ServiceNow: ' + query
            }
          ],
          temperature: 0.1,
          max_tokens: 500,
          search_domain_filter: [
            'docs.servicenow.com',
            'developer.servicenow.com',
            'servicenow.com',
            'community.servicenow.com'
          ],
          web_search_options: {
            search_context_size: 'high'
          },
          return_related_questions: true
        })
      });

      if (!response.ok) {
        return jsonResponse({ success: false, error: 'API error: ' + response.status }, allowedOrigin);
      }

      const data = await response.json();
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
  const relatedQuestions = data.related_questions || [];

  if (!answer && searchResults.length === 0) return null;

  // Build sources array from search_results (real URLs)
  const sources = searchResults.slice(0, 5).map((sr, i) => ({
    index: i + 1,
    title: sr.title || '',
    url: sr.url,
    snippet: sr.snippet || '',
    source: extractDomain(sr.url),
    date: sr.date || null
  }));

  // If no search_results, build from citations
  if (sources.length === 0 && citations.length > 0) {
    citations.slice(0, 5).forEach((url, i) => {
      sources.push({
        index: i + 1,
        title: '',
        url: url,
        snippet: '',
        source: extractDomain(url),
        date: null
      });
    });
  }

  return {
    type: 'rich',
    answer: answer,
    sources: sources,
    relatedQuestions: relatedQuestions.slice(0, 3)
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
