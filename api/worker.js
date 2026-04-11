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

      const systemPrompt = `You are a ServiceNow technical search engine. Given a search query, find the single most relevant external resource and return its EXACT, REAL, FULL URL that a user can click and land on the correct page.

Your response must be ONLY a valid JSON object:
{
  "title": "Page title exactly as it appears on the page",
  "snippet": "2-3 sentence summary of what the user will find there",
  "url": "The EXACT full URL — must be a real, working, deep-link URL, NOT a domain root like https://docs.servicenow.com/ or https://www.servicenow.com/docs/",
  "source": "Domain name",
  "reason": "Why this specific page is the best match"
}

URL RULES (critical):
- The URL MUST be a deep link to a specific page, article, or section
- NEVER return a domain root (e.g. https://docs.servicenow.com/ or https://www.servicenow.com/docs/)
- NEVER return a generic landing page
- For ServiceNow docs, the URL format is: https://www.servicenow.com/docs/bundle/[release]-[area]/page/[path].html
- For developer site: https://developer.servicenow.com/dev.do#!/reference/api/[release]/[api-name]
- For community: https://www.servicenow.com/community/[forum]/[post-title]/[ids]
- If you cannot find a specific deep-link URL, return null — do NOT guess or fabricate a URL

Source priority:
1. docs.servicenow.com or servicenow.com/docs — official documentation (deep links only)
2. developer.servicenow.com — API references, developer guides
3. servicenow.com/community — community posts with real solutions
4. Other reputable sources with ServiceNow technical depth

Content priority:
- Pages with code examples and step-by-step instructions
- Recent content (2024-2026)
- API reference pages for API queries
- Conceptual documentation for concept queries

If nothing strongly matches with a real deep-link URL, return null.
Return ONLY the JSON object. No markdown, no explanation, no code fences.`;

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
