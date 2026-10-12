# UPSC Today: twice-daily editions

Approved 13 October 2026. Extends [`docs/upsc-today-flagship.md`](../../upsc-today-flagship.md) and [`docs/upsc-editorial-benchmark-plan.md`](../../upsc-editorial-benchmark-plan.md); it does not replace them.

## Goal and acceptance

A learner opens **Today** and, after working through it, can say with confidence that they have covered what matters for Prelims and Mains that day, and that it is scheduled for recall.

Acceptance:

1. Two editions close every day: **AM by 06:30 IST** and **PM by 18:30 IST**.
2. Today shows `Prelims x/y · Mains x/y · Revise z` and reaches "Today covered" when every Must Know note is done, every quick fact is ticked and no revision card is due.
3. Every factual claim in a note is at most two actions from its official source.
4. Notes read like the owner's ServiceNow blog and interview pages: specific, explanatory, sourced at the claim, consistently categorised, with no AI filler.
5. Ask Summaverick answers render with the same components as notes.

## Why nothing published before this work

The ingestion jobs run and store records, but the note path depends on the Cloudflare Worker (`/upsc/enrich`, KV feed). The repository lacks `UPSC_PUBLISH_TOKEN`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; the Worker feed answers `503 Pocket feed storage is not configured`. Result: zero exam notes, empty archive and syllabus indexes.

## Architecture (hybrid)

- **Editions** are built in GitHub Actions and committed to the repository. They call the LLM directly with the existing `OPENAI_API_KEY` (fallback `GEMINI_API_KEY`). They do not need the missing Cloudflare secrets.
- **Live today** stays on the existing Worker/KV path and switches on when the owner adds the three secrets. It is not counted toward coverage.

### Pipeline (`scripts/upsc/edition.py`)

1. **Discover.** New `discovery` entries in `data/upsc/discovery-feeds.json` (The Hindu national, business, international, editorial; Indian Express India, economy, explained, editorial). Only headline, link and time are kept from the feed. A newspaper article is used as evidence only when no official record binds the topic, and then it is always cited as `kind: discovery` (shown with a grey "Secondary" badge). Before falling back to it, the builder fetches official pages the article links to (registry hosts, `*.gov.in`, `*.nic.in`, sci.gov.in, mospi.gov.in, rbi.org.in, prsindia.org); when one is reachable it becomes primary evidence and the note is ordinary `news` citing both.
2. **Bind.** Each discovery topic is matched to current official records (PIB, RBI, SEBI, MEA, UN, WHO, EU Council) by token overlap. Official records without a discovery match also enter as candidates. A discovery topic without an official match becomes `kind: editorial` (when an editorial section carries it) or `kind: secondary`, is written from the article text, and credits the newspaper; it must still pass the number gate against that text.
3. **Cluster and rank.** Same-story items merge by a topic fingerprint. Rank uses the flagship study-priority formula; inputs that cannot be computed default conservatively. Newspaper coverage (distinct publishers, analysis sections) is part of the score.
3a. **Editor pass.** One LLM call per run (`scripts/upsc/editor.py`, prompt `prompts/editor_system.txt`) sees every candidate cluster in the window plus carry-over from the previous 24 hours. It merges clusters about one running story and marks each story `must`, `useful` or `skip` the way a UPSC faculty editor would, with codes and Prelims/Mains angles. Every `must` story becomes a note, ordered by the deterministic score (paper balance only breaks ties within 5 points), hard cap 12 per slot; overflow musts become quick facts flagged `overflow: true`; `useful` stories become quick facts (cap 15). Must and useful topics that do not become notes are carried to the next slot's editor for 24 hours (`carryOver` in the edition). If the editor call fails or its reply is unusable, the edition falls back to deterministic selection (score floor 45 for notes, 30 for quick facts, at most 3 notes per GS paper while others qualify) and records `editor: "fallback"` with the reason.
4. **Write.** One LLM call per note with the official text as the only evidence.
5. **Gate** (deterministic):
   - every number and date in the note appears in the evidence text (FAQ numbers must appear in the body);
   - every section has at least one source;
   - required blocks present; syllabus codes are canonical (`SYLLABUS_CODES`);
   - banned-phrase list;
   - completeness: required blocks present and every section non-empty (no word-count limits).
   A failure allows one rewrite with the failure reasons; a second failure holds the note in `held` with reasons.
6. **Emit** edition JSON, note JSON, static note pages, sitemap entries.
7. **Commit** under the shared `upsc-data` concurrency group.

### Data

`data/upsc/editions/YYYY/MM/DD-am.json` and `-pm.json`:

```json
{
  "id": "2026-10-13-am", "slot": "am", "date": "2026-10-13",
  "window": {"from": "...Z", "to": "...Z"},
  "closedAt": "...Z", "status": "closed|partial|delayed",
  "glimpse": [{"noteId": "...", "line": "...", "code": "GS3.1"}],
  "prelims": ["noteId"], "mains": ["noteId"],
  "quickFacts": [{"id": "...", "fact": "...", "code": "GS2.4", "source": {"title": "...", "url": "...", "publisher": "PIB"}}],
  "held": [{"topic": "...", "reasons": ["..."]}],
  "notes": {"noteId": { "...note..." }}
}
```

`data/upsc/editions/index.json` lists edition ids newest first with counts.

Note object:

```
id, slug, fingerprint, kind (news|editorial|explained|secondary), title, deck, oneLine,
subject, codes[1..3], papers, anchor, readTime, publishedAt, priority, band,
whyInNews {text, sources[]},
sections[{heading (question), body[{label?, text}], sources[]}],
keyNumbers[{figure, meaning, source}],
back2basics {concept, text, patternId?},
wayForward [{label, text, source}] (may be empty),
misconception?,
practice {
  mcq {stem, options[4], answer (0-3), trap},
  mains {question, directive, marks, demand, structure {intro, body[], conclusion}},
  pyq? {year, paper, marks, question, why}  (only from pyq-bank.json),
  faq [{q, a}] (3)
},
sources[{n, title, publisher, url, date, kind: official|discovery}],
updates[{at, text, source}]
```

## Writing rules

Voice reference: `data/posts.json` and `data/interviews.json`.

1. Explain how and why, not only what. Specific nouns; second person only when it helps.
2. Bullets lead with a bold label and run one or two sentences.
3. Name the authority (Article, case and year, committee and year, exact report name) only when the evidence contains it.
4. Source at the claim: every section carries its own sources.
5. One misconception where the evidence supports it.
6. Banned phrases (case-insensitive): "in today's rapidly", "rapidly evolving", "plays a pivotal role", "pivotal", "it is worth noting", "it is important to note", "delve", "landscape", "multifaceted", "in conclusion", "a testament to", "navigating", "robust framework", "holistic", "game-changer", "paradigm shift", "tapestry", "underscores", "in the realm of".
7. Length: no word limits. Cover everything an aspirant needs on the topic for Prelims and Mains — mechanism, facts, context, static linkage, debates where sourced — with no padding and no omissions; length follows the topic. The gate checks completeness only: required blocks present and every section non-empty.
8. No invented balance: Challenges and Way forward appear only when the evidence or a named body raises them.
9. Codes come from `SYLLABUS_CODES`; PYQs only from `pyq-bank.json`.

## Today page

Sticky counter, Glimpse, Prelims, Mains, Quick facts, Revise today, Live today (when available), Missed (last 7 days, oldest first). A note is done when the reader reaches the end of Key numbers and answers the MCQ, or presses Mark done. Done creates up to three revision cards (one-line, one key number, the MCQ trap) on Day 1/3/7/21/60. Progress stays in `localStorage` through the existing store; export/import moves it between devices. Notes render on the client from edition JSON and also as static pages under `upsc-study/notes/<slug>/`.

## Reading layout

Owner decision (13 Oct, after reviewing samples): the edition desk, note reader and Summaverick answers match the blog article pages in `blog.html`, not the Newsreader/warm-paper look. That means the system sans stack, `#f5f5f7` page with white surfaces, `#0066CC` accent, `.article-content` body (16px / 1.8), blog `.tip-box` for the one-line summary, `.warn-box` for misreadings, `.scenario-box` for Back to basics, bordered tables, a 3px reading-progress bar, a floating question TOC at ≥1100px, `.mark-complete-btn` and `.article-nav-btn`, and desk cards like `.blog-card` with a paper-coloured accent bar.

New `assets/css/upsc-edition.css`, mobile-first, `min-width` only, breakpoints `600 / 960 / 1200px`. Components: tag line, one-line box, question headings, source chips (44px target), key-numbers table (stacks below 480px, scrolls inside itself), Back to basics, practice in native `<details>` (closed, never removed), done bar, sticky counter. Print expands all details and prints URLs. Dark mode, reduced motion and focus rings are required.

## Ask Summaverick

The Worker coach route asks for a JSON answer:

```
{oneLine, sections[{heading, points[{label, text, cite[]}]}], table?, misconception?,
 examAngle{prelims, mains}, sources[{n, title, publisher, date, url, kind}],
 retrieval[{url, status}], followUps[]}
```

The widget renders it with the note components. Non-JSON replies fall back to a safe Markdown subset (headings, lists, tables, links, bold) with escaping. Actions: Explain this step, Check this claim, Test me, Make it a Mains answer. Save to revision on each answer. Bottom sheet on phones, 420px side panel on desktop.

## Schedule

`upsc-edition.yml`: `15 0 * * *` (AM), `45 0 * * *` (AM retry), `15 12 * * *` (PM), `45 12 * * *` (PM retry), plus `workflow_dispatch` with `slot` and `dry_run`. Runs are idempotent by edition id; a retry adds only missing topics. A topic already in the previous edition (the same day's AM for PM, the previous day's PM for AM) becomes an `updates[]` line on that note, not a new note. Newspaper items from the 24 hours before a window count toward coverage, but only topics with an item inside the window are candidates. If an edition is not closed by 07:00 / 19:00 IST, a GitHub issue opens and Today shows the latest closed edition with a delay notice. `upsc-prelims.yml` reads edition MCQs. All `data/upsc` writers share concurrency group `upsc-data`.

## Rollout

1. Edition builder, gates, discovery feeds, dry run, three sample notes for voice sign-off.
2. Today page, counter, revision cards, CSS, static note pages.
3. Schedule on; first week labelled beta.
4. Summaverick JSON contract and renderer; Worker redeploy.
5. Live today strip after the owner adds the three secrets.

## Out of scope

Hindi, PYQ heat map, monthly PDF, PYQ bank expansion.
