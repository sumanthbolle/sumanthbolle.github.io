# Summaverick Worker

Single Cloudflare Worker that powers both the Summaverick chat and the landing-page trending widgets.

## Routes

| Method | Path         | Purpose                                                                 |
|--------|--------------|-------------------------------------------------------------------------|
| POST   | `/`          | Chat completion. Body: `{ query: string, context?: Array<{role,content}> }` |
| POST   | `/flights`   | SkyFare flight search + book-redirect enrichment + "best time to book" advisory. See below. |
| POST   | `/flights/inspire` | Summaverick destination ideas for SkyFare (JSON suggestions + one-click search fields). |
| GET    | `/upsc/brief`| Compatibility route for an on-demand daily / weekly model brief |
| POST   | `/upsc/topic`| Optional live topic lookup, separate from reviewed publication. Body: `{ topic, paper? }` |
| POST   | `/upsc/enrich`| Private publisher route: transform one normalized official record into a source-bound exam note |
| POST   | `/upsc/verify`| Private second-pass check of the proposed static-topic tag (uses `sonar-pro`) |
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

## `/upsc/brief`, `/upsc/topic`, and `/upsc/enrich` — Anchor

The reviewed UPSC publication does not depend on a public model request. Its
scheduled pipeline reads `data/upsc/source-registry.json`, validates and stores
official records, calls the private `/upsc/enrich` route, then publishes static
indexes and `upsc-study/` pages. `/upsc/topic` remains an explicitly optional
live lookup. `/upsc/brief` is retained for compatibility but is not the source
of the reviewed Exam Brief.

Prompts, normalisation, scoring and evidence gates live in
[`api/upsc.js`](upsc.js); `worker.js` only does IO, caching and CORS. Model-backed
routes use `PERPLEXITY_API_KEY`.

### `GET /upsc/brief?scope=daily|weekly`

One `sonar` call with a JSON schema, `search_recency_filter` (`day` / `week`)
and `user_location: { country: 'IN' }`. The model is asked to harvest from
newspaper editorials, PIB, PRS, judgments and official reports, then apply the
**examinability filter** — an item survives only if it passes at least two of
syllabus linkage, static anchor, debate content and durability.

The Worker then re-applies the rules rather than trusting the model:

- **Filter enforcement** — an item with no static anchor, no valid syllabus
  code, fewer than two passed tests or no source URL is dropped server-side.
- **Probability score (0–100)** —
  `0.35 × anchor_frequency + 0.25 × debate_strength + 0.20 × official_weight + 0.20 × recency_gap`,
  mapped to a treatment band (`core` / `strong` / `thin` / `log`). The anchor
  frequency term is an editorial estimate from the 20-year recurring-theme
  table, so every response carries `scoring.provisional: true` and the UI says
  so. Scores are revision triage, never prediction.
- **Verification gate** — `verified: true` only when the source host is a
  primary-source domain (upsc.gov.in, pib.gov.in, prsindia.org, ministry and
  `*.gov.in` sites, RBI/MoSPI/NITI, UN/World Bank/IMF/UNFCCC and similar).
  Everything else is returned as secondary coverage to be confirmed.
- **Weekly extras** — anchor clusters with a two-line synthesis, kept only for
  anchors that actually appear in the returned items.
- **Discard log** — the headlines that failed the filter, with the test each
  failed.

Cached per `(scope, UTC date)` in the Cloudflare Cache API: **3 h** for daily,
**6 h** for weekly on a full response, shorter when the item count is thin.
Response: `{ success, data: { scope, generatedAt, items[], discarded[], clusters[], stats, scoring } }`.

### `POST /upsc/topic`

Body `{ topic: string, paper?: 'any'|'GS1'|'GS2'|'GS3'|'GS4'|'ESSAY' }`.
Returns one exam-ready note: anchor, syllabus codes, an opening line, 4–6
points, value-adds typed as constitutional / judicial / committee / data /
scheme / international / thinker, both sides of the debate, Prelims facts,
three probable Mains stems with directive verbs, the usual mark-losing trap,
and sources. Depth is capped by prompt on purpose — the tool exists to stop
over-reading. Not cached (queries are unbounded).

### `POST /upsc/enrich`

This route is for the scheduled publisher, not the public browser. Send exactly
one normalized source record as the JSON body and authenticate with
`Authorization: Bearer <UPSC_PUBLISH_TOKEN>`. The record must contain a stable
`src_…` ID, canonical official `sourceUrl`, `contentHash`, `officialSummary`,
and `sourceVerified: true`.

Success returns `{ "success": true, "data": <exam-note> }`. The normalizer
copies the source ID, URL, and content hash from the request; model output
cannot replace them. A hard fact is `source-backed` only when its locator is
exactly `officialSummary` and the complete normalized fact occurs in that
summary. Unsupported facts remain `needs-review`, lose any cloze, and force
the note to `draft`. Enrichment is compression and classification, not an
independent factual-verification step.

- `401`: publish token absent or incorrect.
- `422`: invalid source record or provider output failed the strict note schema.
- `503`: provider credentials or enrichment service unavailable.

Every response uses `Cache-Control: no-store`. The publisher isolates failures
per record, leaves the Source Desk record available, and retries later. A
corrected source changes `contentHash`, invalidating the old note until a new
enrichment succeeds.

The scheduled job requires two GitHub Actions secrets: `UPSC_ENRICH_ENDPOINT`
(the full deployed URL ending in `/upsc/enrich`) and `UPSC_PUBLISH_TOKEN`. The
same token must be configured as an encrypted Worker variable. The browser must
never receive either value.

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
| `UPSC_PUBLISH_TOKEN` | for publishing | Secret shared only with the scheduled UPSC publisher. Required by `POST /upsc/enrich`; never expose it to browser JavaScript. |

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
wrangler secret put UPSC_PUBLISH_TOKEN
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
