/*
 * Cloudflare Worker — Claude AI Search Proxy
 * 
 * Deploy:
 *   1. Go to dash.cloudflare.com > Workers & Pages > Create Worker
 *   2. Paste this code
 *   3. Add environment variable: ANTHROPIC_API_KEY = your Claude API key
 *   4. Add environment variable: ALLOWED_ORIGIN = https://sumanthbolle.com
 *   5. Deploy
 *   6. Set your worker URL in search.js: config.aiSearchEndpoint = 'https://your-worker.workers.dev/search'
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

      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return jsonResponse({ success: false, error: 'API key not configured' }, allowedOrigin);
      }

      const systemPrompt = `You are a ServiceNow technical search engine. Given a search query, provide the single most relevant and authoritative external resource.

Your response must be ONLY a valid JSON object with these exact fields:
{
  "title": "Article or page title",
  "snippet": "2-3 sentence summary of what this resource covers and why it is relevant",
  "url": "Full URL",
  "source": "Domain name (e.g. docs.servicenow.com)",
  "reason": "One sentence explaining why this is the best match for this specific query"
}

Prioritize in this order:
1. docs.servicenow.com — official product documentation
2. developer.servicenow.com — developer guides, API references, learning paths
3. community.servicenow.com — high-quality community posts with real solutions
4. support.servicenow.com — knowledge base articles
5. Other reputable ServiceNow blogs or resources with technical depth

Rules:
- Only return resources that actually exist and are currently accessible
- Prefer recent content (2024-2026) over older content
- Prefer content with code examples or step-by-step instructions
- If the query is about a specific API (GlideRecord, GlideAjax, etc.), link to the official API reference
- If the query is about a concept (CSDM, ITSM, ACL), link to the official conceptual documentation
- If nothing strongly matches, return null instead of a weak result
- Return ONLY the JSON object, no markdown, no explanation, no code fences`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [
            { role: 'user', content: 'ServiceNow search query: ' + query }
          ],
          system: systemPrompt,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const err = await response.text();
        return jsonResponse({ success: false, error: 'API error: ' + response.status }, allowedOrigin);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';

      let result = null;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && parsed.url && parsed.title) {
          result = parsed;
        }
      } catch(e) {
        // Claude returned non-JSON or null
      }

      return jsonResponse({ success: true, result }, allowedOrigin);

    } catch(e) {
      return jsonResponse({ success: false, error: e.message }, allowedOrigin);
    }
  }
};

function jsonResponse(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'public, max-age=300'
    }
  });
}
