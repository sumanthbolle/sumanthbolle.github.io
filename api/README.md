# Summaverick Worker

Single Cloudflare Worker that powers both the Summaverick chat and the landing-page trending widgets.

## Routes

| Method | Path         | Purpose                                                                 |
|--------|--------------|-------------------------------------------------------------------------|
| POST   | `/`          | Chat completion. Body: `{ query: string, context?: Array<{role,content}> }` |
| GET    | `/trending`  | Landing widgets (news / market / tech), country-aware + cached          |
| OPTIONS| any          | CORS preflight                                                          |

## Environment variables

Set these as **secrets** in the Cloudflare Workers dashboard (Settings → Variables → Environment Variables → Add, type "Encrypt"):

| Name                 | Required | Notes                                                                                                                                          |
|----------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `PERPLEXITY_API_KEY` | yes      | From https://www.perplexity.ai/settings/api. Used for both chat and the news + market widgets (structured-output Sonar calls).                 |
| `ALLOWED_ORIGIN`     | yes      | Exact origin allowed by CORS, e.g. `https://sumanthbolle.com`. Use `*` only for local dev.                                                     |

No other keys are required. The tech widget uses the public Hacker News API (no auth).

## Country detection

The `/trending` endpoint derives the viewer's country in this order:

1. `?country=XX` query override (2-letter ISO code) — useful for testing and for a future "change region" link.
2. `request.cf.country` — free Cloudflare signal, no permission prompt.
3. Falls back to `GLOBAL`.

Detection mode is echoed back as `detected: "override" | "network" | "fallback"` so the UI can disclose it.

## Caching

The `/trending` response is cached per country in the Cloudflare Cache API (`caches.default`) for:

- **600 s** (10 min) on a fully successful response (all three widgets populated).
- **60 s** (1 min) on a partial response (at least one widget succeeded). Short TTL so a transient failure doesn't pin a degraded view.

If every widget fails, nothing is cached and the next request retries.

`X-Summaverick-Cache: HIT | MISS` is returned for observability.

## Per-source behaviour

- **worldNews** — Sonar with `search_recency_filter: 'day'` + `json_schema`, `search_context_size: 'high'`. Prompted for the single biggest globally-notable story in the past 24 hours. Always returned (on success), independent of country.
- **news** — Sonar with `search_recency_filter: 'day'` + `json_schema`, scoped via `user_location: { country }`. Prompted for the biggest story in the user's country. **Skipped** when country resolves to `GLOBAL` (would otherwise duplicate `worldNews`).
- **market** — Sonar with `search_recency_filter: 'day'` + `json_schema`. Identifies the largest absolute percentage mover in the country's local benchmark index (see `COUNTRY_TO_INDEX` in `worker.js`). Falls back to MSCI World when no country is detected.
- **tech** — Hacker News Firebase API. Walks the first 5 `topstories` IDs until it finds a live, non-deleted item with a URL. Cached at the Cloudflare edge for 2 min via the `cf.cacheTtl` fetch option.

Each source is wrapped in `Promise.allSettled` + a 9 s timeout so one slow/broken provider can never block the others.

The frontend renders cards in this order: **#1 worldwide → local top story → top mover → top on HN**. Anything that failed to fetch is simply omitted.

## Deploy

If deploying with `wrangler`:

```bash
wrangler deploy
wrangler secret put PERPLEXITY_API_KEY
wrangler secret put ALLOWED_ORIGIN
```

Or via the dashboard: paste `worker.js` into the Quick Edit editor of the existing Worker, save, and add the secrets under Settings.

## Verifying after deploy

```bash
# News/market/tech widgets, auto-detecting country from your network:
curl -i https://<your-worker-domain>/trending

# Force a specific country:
curl -i 'https://<your-worker-domain>/trending?country=IN'

# Confirm the cache layer — second call within 10 min should return X-Summaverick-Cache: HIT:
curl -sI 'https://<your-worker-domain>/trending?country=IN' | grep -i summaverick-cache
```

Chat endpoint contract is unchanged, so existing front-end calls continue to work without modification.
