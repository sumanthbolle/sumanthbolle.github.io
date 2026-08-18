# Anchor UPSC study publication — design specification

**Date:** 2026-08-18

**Status:** Approved

**Product:** `upsc.html` / Anchor

**Repository:** `sumanthbolle/sumanthbolle.github.io`

## 1. Objective

Turn Anchor from a live brief-and-notes utility into a hybrid UPSC study publication:

1. a public, searchable archive of current affairs from approved primary sources;
2. an exam layer that converts source items into syllabus-linked, topper-style reading notes; and
3. a private, browser-local active-recall system for memorisation.

The publication must retain every ingested item from the approved source registry. Exam priority controls emphasis and revision treatment; it must not delete low-priority source records.

The single user-facing promise is:

> Read the official record, understand the underlying issue, and retrieve the exam-usable point from memory.

## 2. Product principles

The supplied `upsc-strategy-engine` is the product source of truth. The following constraints are non-negotiable:

- **Primary sources establish facts.** Model output may classify, connect, compress, or propose questions; it is never the source of record.
- **Issue over incident.** Notes explain the static concept, background, current status, competing positions, and way forward instead of restating a headline.
- **Every note has an anchor.** A static anchor and one to three syllabus codes are mandatory before an item enters the Exam Brief.
- **All source items remain available.** The Source Desk is comprehensive within the configured official-source adapters.
- **Memorisation is retrieval.** The personal layer uses cover–blurt–check and spaced retrieval, not passive rereading.
- **Structure is visible.** Content is written for scanning and recall: short sections, numbered points, reusable diagrams, keywords, and answer-ready lines.
- **No manufactured certainty.** Scores are revision-priority signals, never predictions.
- **No coaching-content dependency.** The product links to official primary records and does not republish coaching compilations.

## 3. Approaches considered

### A. Extend the existing live AI brief

Keep `/upsc/brief`, increase item limits, and tighten the model prompt to approved domains.

**Advantages:** smallest implementation; reuses the current Worker and UI.

**Rejected because:** search-backed generation cannot prove complete coverage, cannot provide a durable SEO archive, and conflates retrieval with editorial transformation.

### B. Verified static publication pipeline — selected

Fetch approved official feeds or listing endpoints on a schedule, persist normalized source records as versioned JSON, and separately enrich records into exam notes. GitHub Pages serves the archive; browser-local storage owns personal notes and recall state.

**Advantages:** auditable provenance, deterministic source gate, durable URLs, SEO-friendly archives, graceful operation when enrichment fails, and no user accounts.

**Trade-off:** source adapters and scheduled publication add maintenance. Adapter failures must be isolated and observable.

### C. Full CMS with a database and editor accounts

Store source records and notes in D1 or another database, with editorial review and publishing screens.

**Rejected for the first release:** authentication, permissions, migrations, moderation, and deployment would dominate the product work. The static pipeline leaves a clean upgrade path if editorial volume later justifies a CMS.

## 4. Information architecture

Anchor keeps one top-level page and adds five workspace views:

```text
Anchor
├── Source Desk       every ingested approved-source item
├── Exam Brief        exam-ready notes, ordered by revision priority
├── Syllabus Library  notes grouped by GS paper and static anchor
├── Answer Lab        directive-aware 10/15-mark practice outlines
└── Memory Drill      personal due queue stored in this browser
```

The existing stage and exam-date controls remain. They change emphasis, not source availability:

- **BUILD:** background, static links, and PYQ patterns are prominent.
- **CONVERGE:** answer outlines, debates, and value-adds are prominent.
- **COMPRESS:** recall cards and high-priority synthesis notes are prominent.
- **LOCK:** Source Desk remains accessible, but new-note actions are visually de-emphasized; the default view becomes Memory Drill.

### 4.1 Source Desk

The Source Desk is the complete record of ingested official items. It supports:

- date, publisher, India/international, GS paper, and source-type filters;
- full-text search over normalized titles and official summaries;
- an explicit source badge and direct link to the primary record;
- exam-priority labels without hiding low-priority items;
- `Exam note ready`, `Needs mapping`, and `Source only` editorial states.

Source items render as ruled dossier rows, not a card grid. Low-priority records remain searchable and browsable.

### 4.2 Exam Brief

The Exam Brief contains only mapped notes that satisfy the static-anchor and syllabus requirements. Daily and weekly views remain, but “kept” means promoted into exam treatment—not retained in the archive.

Each note renders in this order:

1. **Why in news**
2. **Static anchor** and **syllabus codes**
3. **Background**
4. **Official facts and value-adds**
5. **Arguments / opportunities**
6. **Challenges / counter-position**
7. **India-specific implications**
8. **Way forward**
9. **Prelims traps**
10. **Mains practice stem and skeleton**
11. **Use in an answer**
12. **60-word recall card**
13. **Evidence and verification status**

The opening and “Use” line must remain short. Long official documents are summarized by dimension, not reproduced.

### 4.3 Syllabus Library

The library groups exam notes by canonical syllabus code and normalized static anchor. An item may appear under up to three codes but has one canonical source record.

Each anchor page shows:

- a short static definition;
- current triggers in reverse chronology;
- reusable constitutional, judicial, committee, report, data, and international anchors;
- associated official sources;
- prior practice questions when available; and
- one monthly synthesis once three or more current triggers cluster under the anchor.

### 4.4 Answer Lab

The first release does not grade free-form answers. It provides practice scaffolds:

- directive verb and scope qualifier;
- 10-mark or 15-mark word/time budget;
- intro choice: definition, official data, constitutional provision, or current hook;
- two to four body dimensions;
- counter-position where required;
- one diagram/map suggestion when naturally useful; and
- conclusion/way-forward prompt.

The lab never labels generated stems as predicted questions. They are practice prioritisation.

### 4.5 Memory Drill

Memory Drill extends the current `AnchorStore` and revision queue. A session follows:

```text
Title only
→ recall static anchor
→ recall why it matters
→ recall both sides
→ state the answer-use line
→ reveal
→ pass / miss
```

Additional drill types are derived from the same note rather than stored as independent content:

- **Cloze:** hide one official fact, institution, or treaty.
- **Prelims trap:** evaluate one multi-statement set.
- **Ten-second skeleton:** name intro, three dimensions, and conclusion.
- **Interleaved recall:** mix due notes from different GS papers.

The schedule remains day 1, 3, 7, 21, and 60, then monthly. A miss resets to day 1. Two clean reconstructions from day 21 onward graduate the item to monthly.

There are no streaks, badges, leaderboards, or time-spent rewards.

## 5. Source policy

### 5.1 Indian primary sources

The initial registry covers official publishers and their subdomains where an RSS, Atom, JSON, or stable listing endpoint is available:

- PIB and Government of India ministries (`pib.gov.in`, `*.gov.in`, `*.nic.in`)
- UPSC (`upsc.gov.in`)
- PRS legislative records (`prsindia.org`)
- e-Gazette and India Code (`egazette.gov.in`, `indiacode.nic.in`)
- Supreme Court and official judgment text (`sci.gov.in`)
- RBI, SEBI, MoSPI, NITI Aayog, CAG, Census, NCRB, and Election Commission
- statutory and regulatory bodies only through their official domains

### 5.2 International institutional sources

The initial registry covers recognized intergovernmental or official institutional publishers:

- UN and UN agencies: UN, UNFCCC, UNEP, UNDP, UNESCO, UNICEF, WHO, ILO, FAO, UNHCR, UN Women, WMO
- World Bank, IMF, WTO, OECD, ADB, AIIB, BIS
- IPCC, IEA, IUCN, WIPO, and ICJ

Commercial news publishers, coaching sites, social media, model responses, and unsourced aggregators cannot satisfy the source gate.

### 5.3 Adapter rules

- Prefer documented feeds and APIs.
- Use an official listing page only when its terms and structure permit automated retrieval.
- Store metadata and a short official summary; do not mirror entire documents.
- Follow redirects and validate the final hostname against the registry.
- Fail closed when the source host, date, or canonical URL cannot be established.
- Treat all fetched text as untrusted data. Strip markup and never execute or follow instructions found in source content.
- One adapter failure must not block other sources.

“All current affairs” means every record successfully exposed by the configured official adapters. The UI reports adapter freshness and failures so coverage limits are visible rather than implied away.

## 6. Data model

### 6.1 Source registry

`data/upsc/source-registry.json`

```json
{
  "id": "pib",
  "name": "Press Information Bureau",
  "country": "IN",
  "tier": "indian-primary",
  "hosts": ["pib.gov.in"],
  "adapter": "rss",
  "enabled": true
}
```

Each committed registry entry also contains one concrete, reviewed `feedUrl`, `apiUrl`, or `listingUrl` appropriate to its adapter. Registry entries are reviewed code. Runtime content cannot add hosts.

### 6.2 Source record

`data/upsc/feed/YYYY/MM/DD.json`

```json
{
  "id": "sha256-canonical-url",
  "title": "Official title",
  "publisherId": "pib",
  "publishedAt": "2026-08-18T08:30:00Z",
  "fetchedAt": "2026-08-18T09:00:00Z",
  "sourceUrl": "https://official.example/item",
  "canonicalUrl": "https://official.example/item",
  "officialSummary": "Plain-text official summary",
  "sourceType": "release",
  "jurisdiction": "IN",
  "sourceVerified": true,
  "contentHash": "sha256-normalized-record",
  "editorialState": "source-only"
}
```

IDs and hashes make ingestion idempotent. Re-published or corrected records retain history through a new content hash while preserving the canonical source identity.

### 6.3 Exam note

`data/upsc/notes/<source-id>.json`

```json
{
  "sourceId": "sha256-canonical-url",
  "sourceContentHash": "sha256-normalized-record",
  "anchor": "fiscal federalism",
  "codes": ["GS2.2", "GS3.2"],
  "papers": ["GS2", "GS3"],
  "whyInNews": "",
  "staticDefinition": "",
  "background": [],
  "reusableAnchors": [
    { "kind": "constitutional", "label": "" }
  ],
  "officialFacts": [
    {
      "text": "",
      "evidenceUrl": "https://official.example/item",
      "evidenceLocator": "section or page",
      "verification": "needs-review",
      "cloze": {
        "prompt": "One evidence-backed token replaced by ____",
        "answer": "the omitted token"
      }
    }
  ],
  "argumentsFor": [],
  "argumentsAgainst": [],
  "indiaImplications": [],
  "wayForward": [],
  "prelimsTraps": [],
  "mainsPractice": [
    {
      "directive": "examine",
      "marks": 10,
      "wordBudget": 150,
      "timeMinutes": 7,
      "stem": "",
      "introChoices": [],
      "bodyDimensions": [],
      "counterPosition": "",
      "diagramSuggestion": "",
      "conclusionPrompt": "",
      "skeleton": []
    }
  ],
  "use": "",
  "recallCard": "",
  "priority": 0,
  "priorityProvisional": true,
  "editorialStatus": "draft"
}
```

The note is valid only with one anchor, one to three recognized codes, a source record, and a non-empty `use` line.

`cloze` is optional and is retained only on a source-backed fact. Its prompt contains exactly one blank, and reconstructing that blank must reproduce wording supported by the cited source locator; the browser never guesses which token to hide.

### 6.4 Verification states

- `source-only`: official source record exists; no exam transformation.
- `draft`: transformation exists but hard claims are not evidence-checked.
- `source-backed`: every hard claim points to an official source and locator.
- `reviewed`: claim wording has been checked against the cited record.

Only `source-backed` or `reviewed` hard facts may enter a personal memorisation note. Interpretive fields remain visibly labeled as analysis.

## 7. Publication pipeline

### 7.1 Fetch and normalize

A stdlib Python entry point, `scripts/upsc/publish.py`, reads the registry and runs provider adapters. It:

1. fetches official feed/listing data;
2. validates redirects and final hosts;
3. strips markup and normalizes dates;
4. deduplicates by canonical URL and content hash;
5. writes date-partitioned source JSON; and
6. emits a machine-readable coverage report.

The supplied `ca_engine.py` scoring and schedule rules are adapted, not imported at runtime, because its SQLite CLI and the static web publication have different storage boundaries.

### 7.2 Map and enrich

The enrichment stage receives a normalized source record, never an arbitrary URL. It produces the exam-note schema using the existing UPSC Worker prompt and normalization layer.

Enrichment must:

- use the canonical syllabus code list;
- keep the source record unchanged;
- reject invented or unsupported source URLs;
- mark priority scoring provisional until a tagged PYQ corpus is loaded;
- leave hard claims as `needs-review` unless an evidence locator is available; and
- publish source records even when enrichment fails.

### 7.3 Build public indexes

The publisher builds:

- a current Source Desk index;
- daily and weekly Exam Brief indexes;
- per-code syllabus indexes;
- per-anchor indexes;
- monthly archive metadata; and
- an adapter coverage/freshness report.

The browser loads compact indexes first and fetches individual notes on demand.

### 7.4 Scheduled publication

`.github/workflows/upsc-publish.yml` runs four times daily and on manual dispatch. It:

1. runs source-adapter tests;
2. ingests new official records;
3. enriches eligible records through an authenticated Worker endpoint;
4. validates schemas and the verification gate;
5. rebuilds indexes; and
6. commits generated data only when content changed.

The workflow uses a scoped `UPSC_PUBLISH_TOKEN`. It does not expose the model provider key. Workflow failure leaves the last valid publication intact.

Enabling the scheduled workflow and configuring its secret are deployment actions and must be reported explicitly during handoff.

## 8. Browser application architecture

Existing responsibilities remain separated:

- `upsc.html`: semantic workspace structure and help copy
- `assets/css/upsc.css`: page-specific visual system
- `assets/js/upsc/store.js`: personal notes and spaced-retrieval state
- `assets/js/upsc/render.js`: safe HTML builders
- `assets/js/upsc/app.js`: view state and event wiring
- `api/upsc.js`: exam schemas, enrichment prompts, scoring, and source verification
- `api/worker.js`: network IO, authentication, caching, and routing

New modules keep files bounded:

- `assets/js/upsc/content.js`: fetch public indexes/records and apply filters
- `assets/js/upsc/memory.js`: derive cloze, statement-trap, and skeleton drills
- `scripts/upsc/`: source adapters, publisher, schemas, and fixtures
- `data/upsc/`: generated public artifacts and reviewed registry

The personal store references public notes by `sourceId` but stores a compact snapshot. A later public-content correction must not corrupt an in-progress revision schedule.

## 9. Visual design

### 9.1 Direction

The visual idea is an **official dossier with a memory margin**. It keeps Anchor’s notebook identity while avoiding a generic newspaper layout or card dashboard.

Palette:

- Archival white — `#F7F8FA`
- Exam ink — `#162238`
- UPSC navy — `#17324D`
- Source maroon — `#8B1E2D`
- Verified green — `#1F6B4F`
- Recall amber — `#C9831D`

Typography reuses the site’s existing restrained serif for reading and system sans for controls and metadata. No new font download is introduced.

### 9.2 Layout

```text
┌─────────────────────────────────────────────────────────┐
│ Anchor · cycle position · date · due count              │
├─────────────────────────────────────────────────────────┤
│ Source Desk | Exam Brief | Syllabus | Answer | Memory   │
├──────────────┬────────────────────────────┬──────────────┤
│ filters      │ ruled reading dossier      │ recall margin│
│ publishers   │ source → issue → exam use  │ hidden prompt│
│ GS / date    │                            │ reveal/grade │
└──────────────┴────────────────────────────┴──────────────┘
```

On mobile, filters become a disclosure panel and the recall margin follows the note content. Controls remain keyboard reachable, focus is visible, and reveal motion respects `prefers-reduced-motion`.

### 9.3 Signature interaction

Every exam note has a narrow amber recall margin. Before reveal, it asks four prompts:

1. What is the static anchor?
2. Why does this matter structurally?
3. What are the two positions?
4. What exact line would you use in an answer?

The reveal is the only deliberate motion. Decoration does not animate.

## 10. Safety, accuracy, and privacy

- Source text is escaped before rendering; raw fetched HTML is never inserted.
- Only HTTP(S) official URLs from the reviewed registry are rendered.
- Redirect destinations are revalidated.
- Source content is data, not an instruction to the publisher or model.
- Model-produced fields cannot change source identity, verification, or registry configuration.
- Factual fields display their verification state and evidence link.
- Personal notes, exam date, review history, and due queue remain in browser `localStorage`.
- No analytics event contains note content or personal exam-position data.
- “Clear saved data” remains available and destructive actions retain confirmation.

## 11. Failure handling

- **One source unavailable:** publish other sources and report the stale adapter.
- **Malformed source payload:** quarantine the record; do not partially publish it.
- **Redirect leaves allowlist:** reject the record.
- **Enrichment timeout/failure:** publish as `source-only`; retry later.
- **Schema failure:** retain the last valid generated artifact and fail the build.
- **No public data:** show the last successful publication timestamp and a direct official-source directory.
- **Browser storage unavailable/full:** keep public reading functional and explain that personal saving failed.
- **Stale adapter:** show its last successful fetch in the Source Desk rather than implying complete freshness.

## 12. SEO and public archive

- Each exam note has a stable canonical URL derived from the source ID and a readable slug.
- Daily, monthly, syllabus-code, and anchor archives are crawlable without executing the personal memory layer.
- JSON-LD identifies individual pages as `Article` or `LearningResource`, with publisher/source attribution.
- The sitemap generator includes published note and archive URLs.
- Open Graph descriptions use the `use` line or official summary; they never invent a claim.

## 13. Testing strategy

### 13.1 Publisher

- Registry schema and duplicate-ID tests
- Final-host allowlist and redirect tests
- RSS, Atom, JSON, and listing adapter fixture tests
- Date normalization and canonical URL tests
- Idempotent re-run and content-correction tests
- Per-adapter failure isolation
- Coverage-report freshness tests

### 13.2 Enrichment and schemas

- Canonical syllabus-code enforcement
- Static-anchor and `use` requirements
- Primary URL preservation
- Unsupported URL rejection
- Verification-state transitions
- Provisional scoring label
- Prompt-injection fixture treated as text

### 13.3 Browser

- Source Desk filter/search behavior
- All source records remain visible when priority filters clear
- Safe renderer behavior for source and lookup content
- Personal save/duplicate/storage-error paths
- Recall schedule, fail reset, and graduation
- Derived cloze/trap/skeleton drills
- Keyboard tab/reveal flow and reduced-motion behavior
- Responsive smoke checks at mobile, tablet, and desktop widths

### 13.4 End-to-end proof

A fixed fixture set from PIB plus at least three Indian and three international official publishers runs through:

```text
ingest → validate → map → build indexes → render → save → recall → export
```

The proof must include an enrichment failure and an adapter failure while the rest of the publication remains usable.

## 14. Acceptance criteria

The first complete release satisfies all of the following:

1. Source Desk displays every fixture record from the configured official adapters with publisher, date, and primary link.
2. Exam-priority controls never delete or conceal the underlying record from Source Desk.
3. Exam Brief notes follow the topper-style schema and visibly separate official fact from analysis.
4. Hard facts without evidence cannot enter the permanent memory queue as verified.
5. Users can filter by GS paper, syllabus code, anchor, publisher, date, and India/international scope.
6. Users can save an exam note and complete cover–blurt–check retrieval on the existing schedule.
7. A miss resets the item to day 1; two late clean recalls graduate it to monthly.
8. Public pages remain readable when the Worker, enrichment, or browser storage is unavailable.
9. The publisher is idempotent, source failures are isolated, and generated schemas validate.
10. Syntax, focused tests, accessibility checks, responsive smoke checks, and `git diff --check` pass.
11. Deployment handoff states which official adapters are live, their freshness, and whether scheduled publishing is enabled.

## 15. Explicit non-goals

- Optional-subject content
- Full free-form answer grading in the first release
- User accounts, cloud sync, social features, or leaderboards
- Republishing full official documents or copyrighted news articles
- Coaching-material aggregation
- Scraping sources that do not expose a permitted stable endpoint
- Claiming generated questions are predictions
- Gamification based on time spent or reading volume
- A general-purpose CMS
- Automatic `reviewed` verification without evidence checking

## 16. Implementation sequence

The implementation plan should deliver vertical slices in this order:

1. source registry, schemas, fixtures, and idempotent publisher;
2. Source Desk using generated fixture indexes;
3. topper-note schema and Exam Brief rendering;
4. syllabus/anchor indexes and public archives;
5. Memory Drill extensions;
6. authenticated enrichment and scheduled workflow;
7. SEO, accessibility, responsive QA, and deployment handoff.

Each slice must remain runnable. Scheduled publishing is enabled only after the local fixture pipeline and static fallback pass end to end.
