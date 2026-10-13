/**
 * SkyFare /flights: SerpApi Google Flights response → SkyFare schema.
 * Run: node scripts/test-skyfare-worker.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import worker from '../api/worker.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/serpapi-google-flights.json', import.meta.url), 'utf8'));
const calls = [];
const store = new Map();
globalThis.caches = {
  default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  },
};
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return new Response(JSON.stringify(raw), { headers: { 'Content-Type': 'application/json' } });
};

const env = { SERPAPI_KEY: 'test-key', ALLOWED_ORIGIN: '*' };
const body = { origin: 'del', destination: 'BOM', departureDate: '2026-11-14', returnDate: '2026-11-18', passengers: 1, cabin: 'economy', currency: 'INR' };
const post = (b) => worker.fetch(new Request('https://w.test/flights', { method: 'POST', body: JSON.stringify(b) }), env, {});

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('ok - ' + name); } catch (e) { failed++; console.error('not ok - ' + name + '\n  ' + e.message); }
}

let data;
await test('calls SerpApi with Google Flights params', async () => {
  const json = await (await post(body)).json();
  assert.equal(json.success, true);
  data = json.data;
  const q = new URL(calls[0]).searchParams;
  assert.equal(q.get('engine'), 'google_flights');
  assert.equal(q.get('departure_id'), 'DEL');
  assert.equal(q.get('type'), '1');
  assert.equal(q.get('return_date'), '2026-11-18');
  assert.equal(q.get('gl'), 'in');
  assert.equal(q.get('currency'), 'INR');
});

await test('normalizes every itinerary', async () => {
  assert.equal(data.flights.length, 6);
  const overnight = data.flights.find((f) => f.layovers.some((l) => l.overnight));
  assert.equal(overnight.stops, 1);
  assert.equal(overnight.dayOffset, 1);
  assert.equal(overnight.arrive.time, '07:35');
  assert.equal(overnight.segments[0].oftenDelayed, true);
  assert.equal(overnight.co2.diffPercent, 38);
  assert.equal(data.flights[0].best, true);
  assert.equal(data.insights.level, 'low');
  assert.deepEqual(data.insights.typical, [9500, 13000]);
  assert.match(data.googleUrl, /google\.com\/travel\/flights/);
});

await test('serves repeat searches from cache', async () => {
  const res = await post(body);
  assert.equal(res.headers.get('X-SkyFare-Cache'), 'hit');
  assert.equal(calls.length, 1);
});

await test('rejects free text airports and missing key', async () => {
  const bad = await (await post({ ...body, origin: 'Delhi' })).json();
  assert.equal(bad.success, false);
  const nokey = await (await worker.fetch(new Request('https://w.test/flights', { method: 'POST', body: JSON.stringify({ ...body, departureDate: '2026-12-01' }) }), {}, {})).json();
  assert.equal(nokey.success, false);
  assert.match(nokey.error, /not set up/);
});

if (process.argv.includes('--write-fixture')) {
  writeFileSync(new URL('./fixtures/skyfare-search.json', import.meta.url), JSON.stringify({ success: true, data }, null, 1));
}
if (failed) process.exit(1);
