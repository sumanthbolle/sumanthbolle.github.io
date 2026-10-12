# Daily Pocket reads

Before this change, Pocket reads were five static evergreen articles in `data/upsc-pocket-reads.json`. The existing official-source job runs at 08:15, 14:15, 20:15 and 02:15 Singapore time and refreshes `data/upsc/`; it does not write Pocket reads.

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

The client works with the existing public Summaverick endpoint. **Direct document downloading requires deploying the updated Worker**, whose entry point is already configured in `wrangler.jsonc`:

```sh
npx wrangler@4.149.0 deploy
```

Use an account authorized to update `wandering-haze-b394` and preserve its existing `PERPLEXITY_API_KEY` secret and origin configuration. Do not put credentials in the repository or chat. This task validated a dry-run bundle and deterministic retrieval/request/response tests; it did not deploy the Worker or verify a live provider answer because Cloudflare authentication was unavailable and source-site requests were blocked in the environment.

Run `node scripts/test-upsc-sources.mjs` for source policy and Worker integration, and `python3 scripts/test-upsc-source-reading-browser.py http://127.0.0.1:8002` for the reader/widget flow with a local static server. Browser research responses are fixtures, not evidence of live retrieval.
