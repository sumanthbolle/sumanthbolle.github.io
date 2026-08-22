# Anchor UPSC publication — operator handover

**Interactive desk (flagship):** [`upsc.html`](../upsc.html) → `https://sumanthbolle.com/upsc`

The public desk is now the Topic Packet study system. Product instruction: [`docs/upsc-today-flagship.md`](upsc-today-flagship.md). Full spec: [`docs/upsc-today-enhancement-spec.md`](upsc-today-enhancement-spec.md).

**Static archive:** [`upsc-study/`](../upsc-study/) → `https://sumanthbolle.com/upsc-study/`

**Publisher:** [`scripts/upsc/`](../scripts/upsc/)

**Schedule:** [`.github/workflows/upsc-publish.yml`](../.github/workflows/upsc-publish.yml)

Anchor is an official-source reading, answer-writing and active-recall system for
UPSC Civil Services preparation. The public browser never calls publishers
directly. A scheduled publisher validates each reviewed endpoint, stores every
official record, enriches it behind a private route, rebuilds compact indexes,
then creates crawlable pages only for evidence-cleared notes.

## Publication states

| State | Meaning | Public treatment |
|---|---|---|
| `source-only` | Valid official host, canonical URL and normalized publisher text | Always visible in Source Desk; never memorised as an exam note |
| `draft` | Mapped note contains unsupported or review-needed material | Can be inspected in the app; excluded from static pages and recall facts |
| `source-backed` | Every hard fact is a literal claim in `officialSummary` with the same official URL | Eligible for Exam Brief, recall and static publication |
| `reviewed` | A human editor has checked the source-bound note | Same publication rights as source-backed, with the stronger label |

The source record survives an enrichment failure. A correction changes its
content hash, moves the former record into `data/upsc/history/`, and makes the old
note stale until it is enriched again.

## Reviewed publishers

The feed URL is accepted only when its final host matches the registry allowlist,
its MIME type matches the adapter, its body is at most 5 MiB and it produces
complete records.

| Publisher | Registry endpoint provenance | Notes |
|---|---|---|
| Press Information Bureau | PIB's official `ViewRss.aspx` page advertises `RssMain.aspx` | The feed omits item timestamps, so `datePolicy: fetched-at` is explicit and health reports say `fetch-time` |
| Reserve Bank of India | RBI's official RSS directory → press releases feed | Official RSS summaries are normalized and capped |
| SEBI | SEBI's official RSS page → `sebirss.xml` | Mixed circular, order and press-release stream |
| Ministry of External Affairs | The official press-release page's own `FetchPublicationListingData` endpoint | Reviewed HTML adapter; visible dates and relative links are normalized. GitHub Actions `urllib` often receives HTTP 403 from the NIC WAF, so a live probe retries once with `curl` (HTTP/2, cookie warmup from `/press-releases`) against the same reviewed URL |
| United Nations News | UN News English all-news RSS | International institutional source |
| World Health Organization | WHO English corporate-news RSS | The feed may be stale even while the newsroom is current; health metadata exposes this |
| Council of the European Union | Council's official RSS directory → press releases | International policy and external-relations source |

Do not add a URL merely because it returns XML. First find the endpoint on the
publisher's official site, add its exact hosts, create a fixture for its format,
run the strict probe and inspect its final URL and freshness.

## Commands

```bash
# Contracts and regression suite
python3 -m unittest discover -s scripts/upsc -p 'test_*.py'
node scripts/test-upsc-api.mjs
node scripts/test-upsc-content.js
node scripts/test-upsc-render.js
node scripts/test-upsc-memory.js
node scripts/test-upsc-shell.js
node scripts/test-upsc-sitemap.js

# Live probe: default succeeds when any source is healthy; --strict requires all
python3 scripts/upsc/publish.py check-sources \
  --registry data/upsc/source-registry.json --strict

# Idempotent official-record publication
python3 scripts/upsc/publish.py ingest \
  --registry data/upsc/source-registry.json --output data/upsc

# Private, failure-isolated note enrichment
python3 scripts/upsc/enrich.py \
  --output data/upsc \
  --endpoint "$UPSC_ENRICH_ENDPOINT" \
  --token "$UPSC_PUBLISH_TOKEN"

# Navigation, crawlable pages and sitemap
python3 scripts/upsc/publish.py build-indexes --output data/upsc
python3 scripts/upsc/publish.py build-pages \
  --output data/upsc --site-root upsc-study \
  --base-url https://sumanthbolle.com
node scripts/generate-sitemap.js
```

The static generator will only clear a directory named exactly `upsc-study`
that contains `.upsc-generated`. This prevents an incorrect output path from
overwriting hand-authored site content.

## GitHub secrets

Add these repository Actions secrets before enabling the schedule:

- `UPSC_ENRICH_ENDPOINT`: full HTTPS URL for the deployed Worker route, ending
  in `/upsc/enrich`.
- `UPSC_PUBLISH_TOKEN`: the same bearer secret configured on the Worker.

The workflow validates both before it mutates generated files. Per-record model
failures do not hide the official source archive; successful notes continue to
publish and failed IDs retry on the next run.

## Reading and memory model

- Today is the default view: a Topic Packet priority stack (Must Know / Useful /
  Background / Skip), then the official-source stream grouped by subject.
- Topic selection prefers evidence-ready notes, then durable official briefings
  with actual abstracts over headline-only records. Headline-only feeds are
  labelled honestly and link to the full official document.
- Subjects provides nine permanent shelves, their static foundations, current
  update counts, answer scaffolds and optional full-topic lookup.
- Official sources retains every configured record, even when not exam-worthy,
  but remains secondary to the reading experience.
- Revision uses day 1, 3, 7, 21 and 60, then monthly. A miss resets to day 1;
  two late successful passes graduate to monthly. Hard-fact cloze prompts exist
  only when evidence cleared the official-summary boundary.

Browser storage contains only compact saved-note snapshots and review state. It
does not contain the complete publication and is never synced to a server.

## Recovery

1. If one source fails, inspect `data/upsc/source-health.json` and the latest
   `coverage.json`; do not delete its last valid feed partitions. A listing
   HTTP 403 from GitHub Actions should first be retried with `curl` against
   the same reviewed URL.
2. If all sources fail, stop publication and check redirects, MIME changes,
   login pages and host allowlists before changing an adapter.
3. If the enrichment service fails, keep publishing Source Desk records. Repair
   the Worker or secrets; unchanged records will be retried because no current
   note exists.
4. If a source corrects an item, keep the generated history file. Never edit a
   content hash manually.
5. If generated pages are wrong, fix the data or generator, rerun indexes and
   pages, and then regenerate the sitemap. Do not hand-edit `upsc-study/`.

UPSC's official notifications, syllabus and examination rules always take
precedence over this tool.
