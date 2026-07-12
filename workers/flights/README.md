# SkyFare / Summaverick Cloudflare Worker (versioned source)

This directory is the **checked-in source of truth** (DEF-002 / DEF-014) for the
Worker deployed at `https://wandering-haze-b394.sumanthbolle312.workers.dev`.

- `worker.js` — the Worker (kept in sync with `../../api/worker.js`).
- `wrangler.toml` — deploy config.

## Routes
- `POST /flights` — SkyFare flight search + book-redirect enrichment.
- `POST /` — Summaverick chat.
- `GET /trending`, `GET /servicenow` — landing/hub widgets.

## Deploy

```bash
cd workers/flights
wrangler deploy
wrangler secret put PERPLEXITY_API_KEY
wrangler secret put ALLOWED_ORIGIN   # e.g. https://sumanthbolle.com
```

> Keep `worker.js` here identical to `api/worker.js`. The `api/` copy is the
> historical location referenced by existing docs; this folder adds a
> Wrangler-ready project so the Worker can be versioned and redeployed cleanly.

## Frontend resilience

Even if this Worker is down, `flights.html` degrades gracefully:
- automatic retry on transient failures,
- clear error messaging for 405/429/5xx/timeout,
- a **Demo mode** fallback that shows illustrative sample flights so users are
  never left at a dead end (see `buildDemoData` in `flights.html`).
