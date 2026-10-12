/* A private publisher writes evidence-cleared snapshots; browsers only read. */
import { primarySourceUrl } from './upsc-sources.js';
import { SYLLABUS_CODES } from './upsc.js';

const KEY = 'pocket-feed:v1';
const MAX_BYTES = 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function response(body, origin, status = 200, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'ETag', 'Cache-Control': 'no-store', ...extra,
  } });
}

export function validPocketArticle(article, now = Date.now()) {
  const check = article?.verification;
  return Boolean(article && /^news-src_[a-f0-9]{64}$/.test(article.id)
    && article.id === 'news-' + article.sourceId && HASH.test(article.sourceContentHash)
    && check?.agrees === true && Number.isFinite(check.confidence) && check.confidence >= 0.7 && check.confidence <= 1
    && check.verificationVersion === 2
    && Array.isArray(check.flagged_claims) && check.flagged_claims.length === 0
    && check.sourceContentHash === article.sourceContentHash
    && HASH.test(check.noteContentHash)
    && Number.isFinite(Date.parse(check.checkedAt)) && Date.parse(check.checkedAt) <= now + 60000
    && Number.isFinite(Date.parse(article.publishedAt)) && Date.parse(article.publishedAt) <= now + 60000
    && ['title', 'subject', 'paper', 'anchor', 'excerpt', 'takeaway'].every(key => typeof article[key] === 'string' && article[key].trim() && article[key].length <= 1500)
    && /^\d{4}-\d{2}-\d{2}$/.test(article.publishedOn)
    && Array.isArray(article.codes) && article.codes.length > 0 && article.codes.every(code => Object.hasOwn(SYLLABUS_CODES, code))
    && Array.isArray(article.sections) && article.sections.length >= 2 && article.sections.length <= 6
    && article.sections.every(section => typeof section.heading === 'string' && section.heading.trim()
      && Array.isArray(section.paragraphs) && section.paragraphs.length > 0 && section.paragraphs.length <= 8
      && section.paragraphs.every(text => typeof text === 'string' && text.trim() && text.length <= 2000))
    && Array.isArray(article.sources) && article.sources.length > 0 && article.sources.length <= 3
    && article.sources.every(source => primarySourceUrl(source.url) && typeof source.label === 'string' && typeof source.note === 'string'));
}

export async function handlePocketFeed(request, env, origin) {
  if (request.method === 'POST') {
    if (!env.UPSC_PUBLISH_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.UPSC_PUBLISH_TOKEN) {
      return response({ success: false, error: 'Unauthorized' }, origin, 401);
    }
  } else if (request.method !== 'GET') return response({ success: false }, origin, 405);
  if (!env.UPSC_POCKET_FEED) return response({ success: false, error: 'Pocket feed storage is not configured' }, origin, 503);
  if (request.method === 'GET') {
    const feed = await env.UPSC_POCKET_FEED.get(KEY, 'json');
    if (!feed) return response({ success: false, error: 'No verified snapshot has been published yet' }, origin, 503);
    const etag = '"' + feed.revision + '"';
    if (request.headers.get('If-None-Match') === etag) return response(null, origin, 304, { ETag: etag });
    return response({ success: true, ...feed }, origin, 200, { ETag: etag });
  }
  // Bound the streamed request, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return response({ success: false, error: 'Missing snapshot' }, origin, 422);
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) return response({ success: false, error: 'Snapshot exceeds 1 MiB' }, origin, 413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    const feed = JSON.parse(text + decoder.decode());
    const clock = Date.parse(feed.generatedAt);
    if (feed.version !== 1 || !Number.isFinite(clock) || clock > Date.now() + 60000
      || !Array.isArray(feed.articles) || feed.articles.length > 100
      || new Set(feed.articles.map(article => article.id)).size !== feed.articles.length
      || !feed.articles.every(article => validPocketArticle(article))) {
      return response({ success: false, error: 'Snapshot contains an unverified or malformed article' }, origin, 422);
    }
    const previous = await env.UPSC_POCKET_FEED.get(KEY, 'json');
    if (previous && clock < Date.parse(previous.generatedAt)) {
      return response({ success: false, error: 'An older snapshot cannot replace the current feed' }, origin, 409);
    }
    // Compute the ETag here; never trust a publisher-supplied revision string.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(feed.articles)));
    const revision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (previous && clock === Date.parse(previous.generatedAt) && revision !== previous.revision) {
      return response({ success: false, error: 'Different snapshots need distinct release timestamps' }, origin, 409);
    }
    if (revision !== previous?.revision) {
      await env.UPSC_POCKET_FEED.put(KEY, JSON.stringify({ version: 1, generatedAt: feed.generatedAt, revision, articles: feed.articles }));
    }
    return response({ success: true, changed: revision !== previous?.revision, revision }, origin);
  } catch {
    return response({ success: false, error: 'Invalid snapshot or unavailable storage' }, origin, 422);
  } finally { await reader.cancel(); }
}
