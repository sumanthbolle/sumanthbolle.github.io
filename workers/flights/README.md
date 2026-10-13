# SkyFare / Summaverick Cloudflare Worker (versioned source)

This directory is the **checked-in source of truth** (DEF-002 / DEF-014) for the
Worker deployed at `https://wandering-haze-b394.sumanthbolle312.workers.dev`.

- `worker.js` — the Worker (kept in sync with `../../api/worker.js`).
- `wrangler.toml` — deploy config.

## Routes
- `POST /flights` — SkyFare flight search + book-redirect enrichment.
- `POST /flights/inspire` — Summaverick destination suggestions (JSON) for one-click SkyFare search.
- `POST /` — Summaverick chat.
- `GET /trending`, `GET /servicenow` — landing/hub widgets.
- `GET /metals` — precious-metals spot references (when deployed from `api/worker.js`).

## `/flights` data source

Google Flights results via [SerpApi](https://serpapi.com/google-flights-api).
Set the key with `wrangler secret put SERPAPI_KEY`. Without it, `/flights`
returns `{ success: false, error: "Flight search is not set up yet." }`.

Each distinct search (route, dates, travellers, cabin, currency) is cached in
the Cloudflare Cache API for 3 hours, so repeat searches don't use quota.
Response: `data.flights[]` (price, airlines, times, duration, stops,
layovers, segments, CO₂), `data.insights` (Google's price level, typical
range, price history) and `data.googleUrl`.

The Amadeus Self-Service connector was removed: Amadeus shut that portal
down on 17 July 2026. The AI-researched fare fallback was removed too; it
returned placeholder flights with no prices.

## Deploy

```bash
cd workers/flights
wrangler deploy
wrangler secret put PERPLEXITY_API_KEY        # chat + /flights/inspire
wrangler secret put ALLOWED_ORIGIN            # e.g. https://sumanthbolle.com
wrangler secret put SERPAPI_KEY               # /flights
```

## Verify after deploy

```bash
curl -s -X POST https://<your-worker-domain>/flights \
  -H 'Content-Type: application/json' \
  -d '{"origin":"DEL","destination":"BOM","departureDate":"2026-11-14","passengers":1,"cabin":"economy","currency":"INR"}' \
  | head -c 400
# Look for "source":"google" in the response.
```

> Keep `worker.js` here identical to `api/worker.js`.

If `/flights` fails, `flights.html` shows the error and a prefilled Google
Flights link for the same search.
