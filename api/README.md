# Summaverick Worker

Single Cloudflare Worker that powers both the Summaverick chat and the landing-page trending widgets.

## Routes

| Method | Path         | Purpose                                                                 |
|--------|--------------|-------------------------------------------------------------------------|
| POST   | `/`          | Chat completion. Body: `{ query: string, context?: Array<{role,content}> }` |
| POST   | `/flights`   | SkyFare flight search + book-redirect enrichment + "best time to book" advisory. See below. |
| POST   | `/flights/inspire` | Summaverick destination ideas for SkyFare (JSON suggestions + one-click search fields). |
| GET    | `/trending`  | Landing widgets (news / market / tech), country-aware + cached          |
| GET    | `/servicenow`| Latest ServiceNow articles across 4 tracks (AI / Agents / LLM / cost), cached |
| GET    | `/metals`    | Live gold/silver spot references, local FX, and 30-day daily context |
| OPTIONS| any          | CORS preflight                                                          |

## `/metals` — Gold and silver market report

Powers the human-first market report at `/metals.html`.

- Query param: `?currency=USD` (supports the currencies listed by the page).
- Live USD XAU/XAG spot references come from the public [Gold API](https://gold-api.com/).
- Daily history and current FX conversion come from the public, open-source
  [Frankfurter](https://frankfurter.dev/) service.
- Responses distinguish `sourceUpdatedAt` from `generatedAt` and label freshness
  as `live` or `delayed`.
- The Cloudflare Cache API stores each currency response for **60 seconds**.
- If FX is unavailable, USD prices still return with
  `conversionAvailable: false`; if either live metal quote is unavailable, the
  route returns a non-cacheable failure so the client can use its last success.

No AI or generated explanation is used for prices or market-causality claims.

## `/servicenow` — ServiceNow live article feed

Powers the "ServiceNow Central" hub (`/servicenow.html`). Uses the same
`PERPLEXITY_API_KEY` to pull the latest **real, citable** ServiceNow articles
across four editorial tracks: **Platform AI**, **AI Agents**, **LLM & GenAI**,
and **Cost Optimization**. Each track runs a `sonar` call with
`search_recency_filter` + a JSON schema and returns up to 5 items, each with a
working source URL (nothing is invented).

- Query params: `?track=ai|agents|llm|cost|all` (default `all`, comma-separated
  allowed) and `?fresh=week|month` (default `week`).
- Tracks are fetched in parallel with `Promise.allSettled` + a 12 s per-track
  timeout, so one slow track can never block the others.
- Cached per `(tracks, recency)` in the Cloudflare Cache API for **3600 s**
  (1 h) on full success and **300 s** (5 min) on a partial response.
- Response: `{ success, recency, generatedAt, tracks: [{ key, label, emoji, articles: [{ title, summary, source, url, date }] }] }`.
- `X-Summaverick-Cache: HIT | MISS` is returned for observability.

## `/flights` — SkyFare

Powers the SkyFare flight-search UI (`/flights.html`).

**Fare source priority:**
1. **Amadeus Self-Service** (real inventory) when `AMADEUS_CLIENT_ID` /
   `AMADEUS_CLIENT_SECRET` are set and origin/destination resolve to IATA codes.
   Uses Flight Offers Search v2, mapped into the SkyFare schema.
2. **Perplexity Sonar** (`sonar-pro`) as the AI-researched fallback.

The response includes `data.source` (`"amadeus"` | `"ai"`). After the source
returns offers, the Worker post-processes them server-side to make them
comparable across booking sites:

- **Scoring & ranking** — each flight is scored 0–100 from price, duration, stops,
  budget fit, confidence and (when comparable data exists) **carbon emissions**.
- **Deal quality** — every fare is tagged `great` / `good` / `typical` / `high`
  relative to the median fare in the result set (Kayak/Hopper-style read).
- **Emissions** — per-passenger `co2_kg` is normalised to a `low` / `typical` /
  `high` level vs. the median, and the greenest option earns a **Low CO2** badge.
- **Baggage & fare transparency** — `fare_brand`, `carry_on_included`,
  `checked_bags_included`, `refundable`, and a `self_transfer` (virtual-interline)
  risk flag.
- **Arrival day offset & red-eye** — `day_offset` (`+1`/`+2`) and `overnight` are
  derived from local times and total duration.
- **Price insights** — a `price_insights` block (low / median / high + CO₂ range)
  for the Google-Flights-style price bar.
- **Best time to book** — a deterministic advance-purchase engine
  (`computeBookingTiming`) merged with the AI's live price read
  (`mergeBookingAdvice`).

Response: `{ success: boolean, data?: {...}, error?: string }`.

## Environment variables

Set these as **secrets** in the Cloudflare Workers dashboard (Settings → Variables → Environment Variables → Add, type "Encrypt"):

| Name                 | Required | Notes                                                                                                                                          |
|----------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `PERPLEXITY_API_KEY` | yes      | From https://www.perplexity.ai/settings/api. Used for chat, widgets, and the AI-researched `/flights` fallback.                                |
| `ALLOWED_ORIGIN`     | yes      | Exact origin allowed by CORS, e.g. `https://sumanthbolle.com`. Use `*` only for local dev.                                                     |
| `AMADEUS_CLIENT_ID`  | no       | Amadeus Self-Service key. When set (with the secret), `/flights` uses real Amadeus inventory as the primary source. Free test quota available. |
| `AMADEUS_CLIENT_SECRET` | no    | Amadeus Self-Service secret. Required alongside `AMADEUS_CLIENT_ID`.                                                                            |
| `AMADEUS_ENV`        | no       | `test` (default, free quota) or `production`. Optionally override the host entirely with `AMADEUS_BASE_URL`.                                    |
| `SERVICENOW_DOMAIN_ENABLED` | no | Default `true`. When enabled, ServiceNow questions get the domain-intelligence system addon (see `research-agent/`). |
| `SERVICENOW_RELEASE_FAMILY` | no | Default `australia`. Release family used for ServiceNowDocs guidance. |

No other keys are required. The tech widget uses the public Hacker News API (no auth).

## ServiceNow domain pack

ServiceNow research questions are detected in `handleChat` and augmented with
domain prompts from `api/servicenow-domain.js`. The full Node domain pack
(SDK `explain` / `query`, ServiceNowDocs retrieval, evidence verification,
evals) lives under [`research-agent/`](../research-agent/README.md).

Live instance queries remain **disabled** by default. Non-ServiceNow chat
behaviour is unchanged.

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
