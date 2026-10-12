# Pocket news and evergreen reads

The five evergreen articles in `data/upsc-pocket-reads.json` remain available. New Pocket news is projected separately from current official-source notes that pass the source and explanation checks. The library combines both, with news first.

The reading edition groups that order into three recommended reads, remaining latest updates, and remaining evergreen fundamentals. Each article appears once, and search covers the whole edition. This presentation does not reduce the news publication rate.

### Source-bound article prose

The private writer can include `pocket_read`: a factual headline, a distinct deck, two to four descriptive sections, an optional hypothetical example, and an applied question with its reasoned answer. The Worker normalises these as `pocketRead` before complete-note verification. The verification hash includes all those fields; `pocket_feed.py` projects only the unchanged checked content. It never rewrites a headline or answer after checking. Original release titles and dates remain in the source reference.

Older complete, checked notes keep their literal-source-fact and static-concept fallback. The deck is not repeated as the first body paragraph. Malformed new reading objects are excluded by the publisher, and malformed learning aids are rejected at the Worker feed boundary. Source/explanation gates, freshness and study priority remain in place.

Corrections to questions, answers, illustrations or references trigger the same stale-content notice as body changes. Save and source/understanding actions are held until the checked update loads. A refresh failure does not overwrite an active correction warning.

## Live publication path

1. `upsc-live.yml` checks the reviewed official endpoints on a five-minute GitHub schedule, on manual dispatch, or on a trusted `upsc-source-update` repository-dispatch event. Source contracts still validate publisher host, MIME type, redirects, complete records and content hashes. Undated items retain their first detection date between polls instead of becoming new news on each fetch.
2. `live_publish.py` processes up to three recent outstanding records per run. The private Worker produces a source-bound explanation and a separate `sonar-pro` pass checks the entire proposed note against the official summary and available downloaded source text. Missing, malformed, low-confidence, flagged or unavailable verification holds the note. The publisher requires verification protocol version 2, so an older deployed Worker that checks only tagging cannot approve a complete news note. Attestations bind both the source hash and the exact note content.
3. `pocket_feed.py` accepts only unchanged, source-backed or reviewed notes with canonical syllabus codes, substantive source-cleared facts and explanations, study priority at least 60, and publication/detection within the last 14 days. Low-priority records stay in the source archive. Incomplete notes retry with a longer backoff. Verification counts and actual Pocket release counts are separate.
4. Each passing Pocket note is posted immediately to the authenticated `/upsc/pocket/publish` route, before processing the next record or rebuilding static pages. There is no one-article daily limit for news. The Worker stores a bounded snapshot in KV and exposes `/upsc/pocket` to readers. Only the publisher can write; its token never goes into browser code.
5. The visible page checks the feed every 30 seconds and on focus. Conditional requests use ETags with explicit CORS support. Hidden tabs stop polling. The library refreshes automatically; an open article preserves its DOM and reading position until the reader loads additions. A corrected or withdrawn current note triggers a notice, cancels the widget request and disables saving/asking from the stale body immediately. Back/tab navigation applies pending updates. Older snapshots cannot erase a newer client snapshot.

This is polling, not a source-provided push stream: GitHub can delay schedules, a shared publisher job can be busy, providers can take time, and KV propagation can briefly return an older snapshot. A dispatch event starts ingestion sooner but is not a promise of zero latency. New notes reach the feed as soon as their own checks pass. Model agreement is an automated check, not a guarantee or a claim of human editorial review.

The normal archive workflow still runs at 08:15, 14:15, 20:15 and 02:15 Singapore time. It uses the same bounded live release path when enrichment is configured, then builds indexes and crawlable pages. `data/upsc/pocket-feed.json` is a verified fallback if the Worker cannot be reached; failed requests preserve the last good snapshot. The initial fallback is empty because the current repository has no verified enriched news notes. Official source records are not silently promoted into explainers.

## Daily evergreen queue

The new `upsc-pocket.yml` workflow publishes at most one approved article per Singapore calendar day, scheduled around 07:00. GitHub Actions schedules can run late. The workflow must be merged into the default branch with Actions enabled before its schedule is active. It has no model API cost and does not generate or approve articles. The initial queue is empty, so it will skip until an approved article is due.

## Queue an article

Add an entry to `data/upsc-pocket-queue.json` with this shape:

```json
{
  "status": "draft",
  "publishOn": "2026-10-15",
  "article": {
    "id": "stable-topic-slug",
    "title": "A concrete question",
    "subject": "Economy",
    "paper": "GS3",
    "kind": "Explainer",
    "excerpt": "The situation this article explains.",
    "anchor": "The static concept",
    "codes": ["GS3.1"],
    "sections": [],
    "example": {"heading": "A worked situation", "text": "Clearly labelled illustration."},
    "takeaway": "One useful distinction.",
    "question": "An applied recall question?",
    "recallAnswer": "An answer that addresses that exact question.",
    "sources": [{"label": "Issuing institution and document", "url": "https://example.com/document", "note": "The page, section or article to read."}]
  }
}
```

This is a shape example, not a publishable article: replace the placeholder source and add at least two substantive sections with `heading` and `paragraphs`. Keep the main explanation between 200 and 450 words. Worked examples and an optional two-column `comparison` add depth without turning the main article into a long note. Do not present illustrative numbers as measured data.

An editor should check the source documents, legal status, dates and numbers; distinguish facts from interpretation; remove generic filler; and confirm that the recall answer answers the question. Only then set `status` to `approved` and add the actual approval date as `approvedOn`. A script or model must not supply a fictitious human byline or approval.

The earliest due approved entry is published, with its actual publication date. The queue retains its approval and publication dates and article ID. Drafts, future dates and entries approved in the future are skipped. Duplicate IDs are rejected; revise an existing article with an honest `updatedOn` instead of giving an unchanged article a new publication date.

For a local check, use temporary copies of the library and queue:

```sh
python3 scripts/upsc/pocket_publish.py --library /tmp/reads.json --queue /tmp/queue.json --date 2026-10-15
python3 -m unittest scripts.upsc.test_pocket_publish
```

## Ask Summaverick

The article action opens a source-reading panel and immediately requests a deeper explanation. The panel receives the current article's text, metadata and source URLs. Its two actions read the sources or check understanding; free-form answers retain the understanding-check context. Navigating between articles clears the conversation and aborts pending requests. Reading-size preferences stay in this browser.

The updated Worker downloads bounded HTML/plain-text extracts from the allowlisted primary institutions in `api/upsc-sources.js`, restricts redirects to those institutions, and sends the extracts as document data. It also asks the research provider to search the linked institutions. Direct excerpts use `[P1]` identifiers; research citations retain the provider's numeric order. The widget distinguishes retrieved text, unavailable/unsupported documents and research citations. A directory page or partial extract does not establish every claim in an article. PDF parsing is not included; an unsupported PDF is never labelled directly read.

Article references currently include several institutional landing pages, with specific section/article locators to guide reading. Exact new document URLs were not verified from this cloud environment, so no unverified deep links were invented. For a new article, prefer the exact dated document and record its reading locator.

## Deployment and secure configuration

The client uses the existing public Summaverick endpoint. **The new document retrieval and Pocket feed routes require deployment.** `upsc-worker.yml` deploys on relevant changes merged to `main` or manual dispatch. `scripts/deploy-upsc-worker.mjs` reuses or creates the named Pocket KV namespace, attaches the binding, and preserves existing plain variables and unrelated configured bindings. The deployment workflow synchronizes the private publisher token from the repository secret. It preserves the existing `PERPLEXITY_API_KEY`.

Repository Actions configuration:

- `CLOUDFLARE_API_TOKEN` secret: authorized for Worker deployment and KV namespace management.
- `CLOUDFLARE_ACCOUNT_ID` variable (or existing secret): the account that owns `wandering-haze-b394`.
- `UPSC_PUBLISH_TOKEN` secret: the shared private publisher token. Reuse the existing value when one is already configured on the Worker.
- `UPSC_ENRICH_ENDPOINT` variable or existing secret is optional; the workflow defaults to `https://wandering-haze-b394.sumanthbolle312.workers.dev/upsc/enrich`.

For a cloud/manual deployment, securely supply the Cloudflare credentials and run:

```sh
node scripts/deploy-upsc-worker.mjs
```

Then ensure the Worker's `UPSC_PUBLISH_TOKEN` matches the secure publisher binding and run the source publisher with `UPSC_ENRICH_ENDPOINT` and `UPSC_PUBLISH_TOKEN` in its environment. The Cloudflare API token and account ID requirements, publisher-token requirement and official-source network destinations are saved in the cloud environment configuration draft. Saving the draft does not supply values, update GitHub Actions secrets, deploy the Worker or activate a schedule.

This task validated the KV-enabled dry-run deployment, deterministic source/request/response checks, source correction handling, strict verification and browser updates. **Production deployment and live-provider checks remain blocked by absent credentials.** Do not put credentials in repository files or chat. After configuration and merge, run the Worker deployment and Pocket news workflows once and confirm a real source-checked note appears through `/upsc/pocket` and in the browser before calling the feed live.

Run `node scripts/test-upsc-sources.mjs` for source policy and Worker integration, and `python3 scripts/test-upsc-source-reading-browser.py http://127.0.0.1:8002` for the reader/widget flow with a local static server. Browser research responses are fixtures, not evidence of live retrieval.

Run `node scripts/test-upsc-pocket.mjs`, `python3 -m unittest scripts.upsc.test_pocket_feed`, and `python3 scripts/test-upsc-live-browser.py http://127.0.0.1:8002` for the dynamic release path, auth/ETag contracts and browser correction behavior. Use `node scripts/deploy-upsc-worker.mjs --dry-run` to validate the bundle and KV binding without mutating Cloudflare.
