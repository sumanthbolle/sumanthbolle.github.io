import assert from 'node:assert/strict';
import worker from '../api/worker.js';
import { canonicalJson, validPocketArticle } from '../api/upsc-pocket.js';
import { buildUpscVerifyPayload, normalizeUpscVerification } from '../api/upsc.js';
import { deploymentConfig, pocketNamespace } from './deploy-upsc-worker.mjs';

const now = new Date(Date.now() - 1000).toISOString();
assert.equal(canonicalJson({ b: 1, a: 1.0 }), '{"a":1,"b":1}');
const article = {
  id: 'news-src_' + 'a'.repeat(64), sourceId: 'src_' + 'a'.repeat(64), sourceContentHash: 'b'.repeat(64),
  verification: { verificationVersion: 2, agrees: true, confidence: 0.91, flagged_claims: [], checkedAt: now,
    sourceContentHash: 'b'.repeat(64), noteContentHash: 'c'.repeat(64) },
  title: 'A source-bound policy update', subject: 'Polity', paper: 'GS2', anchor: 'Fiscal federalism',
  codes: ['GS2.2'], excerpt: 'The official source describes the change.', takeaway: 'Understand the division of responsibilities.',
  publishedOn: now.slice(0, 10), publishedAt: now,
  sections: [{ heading: 'What changed', paragraphs: ['The policy changed.'] },
    { heading: 'The underlying idea', paragraphs: ['Fiscal powers are distributed across levels of government.'] }],
  sources: [{ label: 'PIB release', url: 'https://pib.gov.in/release/1', note: 'Read the original release.' }],
};
assert.ok(validPocketArticle(article));
for (const invalid of [
  { ...article, codes: ['GS2.999'] }, { ...article, sourceContentHash: 'old' },
  { ...article, verification: { ...article.verification, agrees: false } },
  { ...article, verification: { ...article.verification, flagged_claims: ['unsupported'] } },
  { ...article, sources: [{ ...article.sources[0], url: 'https://pib.gov.in.evil.test/' }] },
]) assert.equal(validPocketArticle(invalid), false);
for (const malformed of [{ agrees: true, confidence: 2 }, { agrees: true, confidence: 0.9 },
  { agrees: true, confidence: '0.9', flagged_claims: [] },
  { agrees: true, confidence: 0.9, flagged_claims: [4] }]) assert.equal(normalizeUpscVerification(malformed), null);
assert.match(buildUpscVerifyPayload({}, { background: ['x'.repeat(12000)], recallCard: 'TAIL_MUST_BE_CHECKED' }).messages[1].content, /TAIL_MUST_BE_CHECKED/);

let stored = null, writes = 0;
const env = { UPSC_PUBLISH_TOKEN: 'fixture-token', ALLOWED_ORIGIN: 'https://sumanthbolle.com',
  UPSC_POCKET_FEED: { get: async () => stored && JSON.parse(stored), put: async (key, value) => { stored = value; writes++; } } };
const get = (headers = {}) => worker.fetch(new Request('https://fixture.workers.dev/upsc/pocket', { headers }), env, {});
const post = (feed, auth = 'Bearer fixture-token') => worker.fetch(new Request('https://fixture.workers.dev/upsc/pocket/publish', {
  method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(feed),
}), env, {});
const feed = { version: 1, generatedAt: now, revision: 'publisher-cannot-choose-etag', articles: [article] };
const preflight = await worker.fetch(new Request('https://fixture.workers.dev/upsc/pocket', {
  method: 'OPTIONS', headers: { Origin: 'https://sumanthbolle.com', 'Access-Control-Request-Headers': 'if-none-match' },
}), env, {});
assert.equal(preflight.status, 204);
assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /If-None-Match/i);
assert.equal((await get()).status, 503);
assert.equal((await post(feed, '')).status, 401);
assert.equal((await post({ ...feed, articles: [{ ...article, verification: {} }] })).status, 422);
assert.equal(writes, 0);
assert.equal((await post(feed)).status, 200);
assert.equal(writes, 1);
const response = await get();
assert.equal(response.status, 200);
assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://sumanthbolle.com');
assert.equal(response.headers.get('Cache-Control'), 'no-store');
const published = await response.json();
assert.notEqual(published.revision, feed.revision);
assert.deepEqual(published.articles, [article]);
assert.equal((await get({ 'If-None-Match': response.headers.get('ETag') })).status, 304);
await post(feed);
assert.equal(writes, 1, 'unchanged snapshots must not cost extra KV writes');
await post({ ...feed, articles: [Object.fromEntries(Object.entries(article).reverse())] });
assert.equal(writes, 1, 'key order must not cause a false revision');
assert.equal((await post({ ...feed, generatedAt: '2020-01-01T00:00:00Z' })).status, 409);
assert.equal((await post({ ...feed, articles: [article, article] })).status, 422);
// Corrections withdraw a stale article immediately rather than retaining its old body.
assert.equal((await post({ ...feed, articles: [] })).status, 409);
await post({ ...feed, generatedAt: new Date(Date.parse(now) + 1).toISOString(), articles: [] });
assert.deepEqual((await (await get()).json()).articles, []);
const tooBig = await worker.fetch(new Request('https://fixture.workers.dev/upsc/pocket/publish', {
  method: 'POST', headers: { Authorization: 'Bearer fixture-token' }, body: 'x'.repeat(1024 * 1024 + 1),
}), env, {});
assert.equal(tooBig.status, 413);

let namespaceCalls = [];
const id = 'd'.repeat(32);
assert.equal(await pocketNamespace('account', 'fixture-token', async (url, options) => {
  namespaceCalls.push(options.method);
  assert.match(url, /\/workers\/scripts\/wandering-haze-b394\/settings$/);
  return Response.json({ success: true, result: { bindings: [{ type: 'kv_namespace', name: 'UPSC_POCKET_FEED', namespace_id: id }] } });
}), id);
assert.deepEqual(namespaceCalls, ['GET'], 'reuse the deployed namespace without creating or swapping storage');
namespaceCalls = [];
assert.equal(await pocketNamespace('account', 'fixture-token', async (url, options) => {
  namespaceCalls.push(options.method);
  return Response.json({ success: true, result: [{ title: 'wandering-haze-b394-UPSC_POCKET_FEED', id }] });
}), id);
assert.deepEqual(namespaceCalls, ['GET', 'GET']);
namespaceCalls = [];
assert.equal(await pocketNamespace('account', 'fixture-token', async (url, options) => {
  namespaceCalls.push(options.method);
  return Response.json({ success: true, result: options.method === 'GET' ? [] : { id } });
}), id);
assert.deepEqual(namespaceCalls, ['GET', 'GET', 'POST']);
await assert.rejects(pocketNamespace('account', 'fixture-token', async () => new Response('', { status: 403 })), /HTTP 403/);
const config = deploymentConfig({ main: 'api/worker.js', vars: { EXISTING: 'preserved' },
  kv_namespaces: [{ binding: 'OTHER', id }] }, '/repo', 'account', id);
assert.equal(config.main, '/repo/api/worker.js');
assert.equal(config.keep_vars, true);
assert.equal(config.kv_namespaces[0].binding, 'OTHER');
assert.equal(config.kv_namespaces[1].binding, 'UPSC_POCKET_FEED');
assert.equal(config.vars.EXISTING, 'preserved');

// Exercise actual primary-document retrieval in both private writing/checking routes.
const originalFetch = globalThis.fetch;
const source = { id: article.sourceId, sourceUrl: article.sources[0].url, contentHash: article.sourceContentHash,
  sourceVerified: true, title: article.title, officialSummary: 'Cabinet approved the fiscal policy.' };
let modelCalls = 0;
try {
  globalThis.fetch = async (url, options) => {
    if (url === source.sourceUrl) return new Response('<main>' + 'The full primary document contains policy details. '.repeat(5) + '</main>',
      { headers: { 'Content-Type': 'text/html' } });
    assert.equal(url, 'https://api.perplexity.ai/v1/sonar');
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /full primary document contains policy details/);
    modelCalls++;
    const data = modelCalls === 1 ? { anchor: 'Fiscal federalism', codes: ['GS2.2'],
      use: 'Compare coordination across levels of government.', why_in_news: 'The fiscal policy changed.',
      static_definition: 'Distribution of fiscal powers across levels of government.',
      official_facts: [{ text: source.officialSummary, evidence_locator: 'officialSummary' }] }
      : { agrees: true, confidence: 0.91, flagged_claims: [] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(data) } }] });
  };
  const privateCall = (path, body) => worker.fetch(new Request('https://fixture.workers.dev' + path, {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token' }, body: JSON.stringify(body),
  }), { ...env, PERPLEXITY_API_KEY: 'fixture-key' }, {});
  const enriched = await (await privateCall('/upsc/enrich', source)).json();
  assert.equal(enriched.success, true);
  assert.equal(enriched.data.editorialStatus, 'source-backed');
  const verified = await (await privateCall('/upsc/verify', { source, note: enriched.data })).json();
  assert.equal(verified.success, true);
  assert.equal(verified.data.agrees, true);
  assert.equal(verified.verificationVersion, 2);
  assert.equal(modelCalls, 2);
} finally { globalThis.fetch = originalFetch; }
console.log('Pocket Worker publication, auth, correction, cache and deployment checks passed');
