# UPSC Daily Editions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish AM and PM UPSC editions from GitHub Actions, show them on a Today desk with a coverage counter and spaced revision, and render Ask Summaverick answers with the same reading components.

**Architecture:** A stdlib-only Python pipeline under `scripts/upsc/` discovers topics from newspaper RSS, binds them to stored official records, fetches official evidence text, writes notes with an LLM over HTTPS, gates them deterministically and writes edition JSON plus static note pages. A self-contained browser module (`assets/js/upsc/edition.js` + `edition-progress.js`) renders the desk inside the existing `#view-brief` and keeps progress in `localStorage`. A shared answer renderer (`assets/js/upsc/answer-render.js`) is used by the edition reader and the Summaverick widget.

**Tech Stack:** Python 3.11 stdlib (`urllib`, `html.parser`, `unittest`), vanilla ES5-style browser JS (UMD like existing modules), Node test scripts (`node scripts/test-*.js`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-upsc-daily-editions-design.md`

## Global Constraints

- Python: stdlib only; must run on 3.11 (CI) and 3.14 (local).
- Browser JS: no build step, no dependencies; UMD wrapper matching `assets/js/upsc/coach.js`; must load in Node for tests.
- Syllabus codes only from `scripts/upsc/models.py:SYLLABUS_CODES`.
- PYQs only from `data/upsc/pyq-bank.json`.
- Discovery (newspaper) items are never evidence; `kind: discovery` sources may only appear on `kind: editorial` notes.
- Banned phrases exactly as listed in the spec "Writing rules" §6.
- Length: no word limits; notes cover everything an aspirant needs (mechanism, facts, context, static linkage, sourced debates) with no padding and no omissions. The gate checks completeness only (required blocks present, every section non-empty).
- Edition slots: AM window 18:00 IST previous day → 06:00 IST; PM window 06:00 → 18:00 IST.
- Crons: `15 0 * * *`, `45 0 * * *`, `15 12 * * *`, `45 12 * * *`.
- Revision intervals: 1, 3, 7, 21, 60 days.
- Breakpoints in new CSS: 600 / 960 / 1200px, `min-width` only.
- Touch targets ≥ 44px; visible focus; `prefers-reduced-motion` respected.
- Do not change existing Pocket, Pattern Atlas or anchor store data shapes.

## Review Focus

- An official page that returns 403/timeout or non-HTML (PDF) → note is held with reason `evidence-unavailable`, run continues.
- LLM returns invalid JSON or the API key is missing → note held / run exits 0 with `status: partial`, never a crash that leaves a half-written edition file.
- Re-running the same slot → identical note ids, no duplicates, existing done-state in browsers still matches.
- Indian number formats ("₹11,440 crore", "2025-26", "5.5%", "1,20,000") → number gate normalises before comparing.
- Untrusted text from feeds/LLM rendered in the browser → always escaped; links only `http(s)`.

---

### Task 1: Discovery feeds

**Files:**
- Create: `data/upsc/discovery-feeds.json`
- Create: `scripts/upsc/discovery.py`
- Test: `scripts/upsc/test_discovery.py`

**Interfaces:**
- Produces: `load_feeds(path) -> list[dict]`; `parse_rss(body: bytes, feed: dict) -> list[dict]` returning `{"title","url","publishedAt","feedId","publisher","section"}`; `fetch_discovery(feeds, opener, since_iso, until_iso) -> list[dict]` (errors per feed collected, never raised).

- [ ] Write tests: RSS 2.0 fixture parses title/link/pubDate to ISO UTC; items outside window dropped; a feed raising `HTTPError` yields `[]` and an error entry; HTML tags in titles stripped.
- [ ] Run `python3 -m unittest scripts.upsc.test_discovery` → fail.
- [ ] Implement with `xml.etree.ElementTree`, `email.utils.parsedate_to_datetime`; feeds file lists The Hindu (`/news/national/feeder/default.rss`, `/business/feeder/default.rss`, `/news/international/feeder/default.rss`, `/opinion/editorial/feeder/default.rss`) and Indian Express (`/section/explained/feed/`, `/section/opinion/editorials/feed/`).
- [ ] Tests pass; commit.

### Task 2: Official evidence fetcher

**Files:**
- Create: `scripts/upsc/evidence.py`
- Test: `scripts/upsc/test_evidence.py`

**Interfaces:**
- Produces: `extract_text(html: str) -> str` (drops script/style/nav/header/footer, collapses whitespace, max 16,000 chars); `fetch_evidence(record: dict, opener) -> dict` → `{"ok": bool, "text": str, "url": str, "reason": str}`. Uses `adapters.request_headers` style UA; falls back to `adapters.curl_open` on 403; non-HTML content type → `ok False, reason "unsupported-content"`.

- [ ] Tests: PIB-like fixture extracts body paragraphs and not menu text; 403 then curl fallback path via injected openers; PDF content type rejected; text shorter than 200 chars → `reason "thin-evidence"`.
- [ ] Implement; tests pass; commit.

### Task 3: Candidates — bind, cluster, rank

**Files:**
- Create: `scripts/upsc/candidates.py`
- Test: `scripts/upsc/test_candidates.py`

**Interfaces:**
- Consumes: official records (`publish._all_current_records`), discovery items (Task 1).
- Produces: `tokens(text) -> set[str]`; `fingerprint(text) -> str` (sha1 of sorted top-8 content tokens); `build_candidates(records, discovery, window) -> list[Candidate]` where `Candidate = {"fingerprint","title","records":[...],"discovery":[...],"kind":"news"|"editorial","score":int,"band":"must"|"useful"|"skip","codesHint":[...]}`.
- Scoring (0–100): `syllabus_fit` from keyword map → codes (25), `primary_source_weight` (pib/rbi/sebi/mea 1.0, un/who/eu 0.7, none 0) (10), `pyq_proximity` token overlap with `pyq-bank.json` (20), `anchor_recurrence` overlap with `data/upsc-patterns.json` names (15), `conceptual_depth` (records with long summaries or discovery in explained/editorial sections) (10), `coverage` newspaper salience: distinct publishers (1 → 8, 2 → 16, 3+ → 18), +1 per extra feed (max 2), +6 when an editorial/explained section carries it (cap 20). Caps: ceremonial 30, routine market/survey items 35, international-institution records with no India mention and no newspaper pickup 40. Selection is relative per slot (see Task 6).

- [ ] Tests: two PIB records + one Hindu item about the same scheme merge into one candidate; a ceremony record scores skip; editorial-only discovery becomes `kind editorial`; deterministic ordering by score then title.
- [ ] Implement; tests pass; commit.

### Task 4: Note gate

**Files:**
- Create: `scripts/upsc/note_gate.py`
- Test: `scripts/upsc/test_note_gate.py`

**Interfaces:**
- Produces: `BANNED_PHRASES: tuple[str, ...]`; `normalise_numbers(text) -> set[str]`; `body_text(note) -> str`; `check_note(note, evidence_text, pyq_ids:set[str]) -> list[str]` (empty list = pass). Reason strings: `missing:<field>`, `bad-code:<code>`, `unsupported-number:<n>`, `faq-number-not-in-body:<n>`, `banned:<phrase>`, `section-without-source:<i>`, `empty-section:<i>`, `heading-not-question:<i>`, `pyq-not-in-bank`, `discovery-source-on-news`, `bad-mcq`.
- Number normalisation: strip `₹`, `%`, commas (both Indian and Western grouping), keep decimals; years and ranges like `2025-26` become `{"2025","26","2025-26"}`; ignore single digits 0–9 and numbers that appear in the note's question headings only.

- [ ] Tests: passing fixture note; each reason triggered by a minimal mutation; "₹11,440 crore" in note matches "Rs 11440 crore" in evidence; "1,20,000" matches "120000"; FAQ number absent from body flagged.
- [ ] Implement; tests pass; commit.

### Task 5: Writer

**Files:**
- Create: `scripts/upsc/writer.py`
- Create: `scripts/upsc/prompts/note_system.txt`
- Test: `scripts/upsc/test_writer.py`

**Interfaces:**
- Consumes: `check_note` (Task 4), `SYLLABUS_CODES`.
- Produces: `build_messages(candidate, evidence: list[dict], pyq_options: list[dict], feedback: list[str]) -> list[dict]`; `call_llm(messages, transport) -> str` (OpenAI `chat/completions` with `response_format: json_object`, model from `UPSC_EDITION_MODEL` default `gpt-4.1-mini`; on failure Gemini `generateContent` with `responseMimeType: application/json`); `write_note(candidate, evidence, pyq_options, transport, max_attempts=2) -> tuple[dict|None, list[str]]` returning the gated note or `None` with reasons.
- The system prompt carries the voice reference (two short excerpts paraphrased from `data/posts.json` style rules, not copied articles), the note JSON schema from the spec, all writing rules and the banned list.

- [ ] Tests with a fake transport: valid JSON passes first try; first reply fails gate and second passes (feedback reasons included in second prompt); both fail → `None` with reasons; non-JSON reply handled; missing keys → transport raises `RuntimeError("no-llm-key")` and caller receives held reason `llm-unavailable`.
- [ ] Implement; tests pass; commit.

### Task 6: Edition builder and static note pages

**Files:**
- Create: `scripts/upsc/edition.py`
- Test: `scripts/upsc/test_edition.py`
- Modify: `scripts/generate-sitemap.js` (include `upsc-study/notes/*/index.html`)

**Interfaces:**
- Consumes: Tasks 1–5, `publish._read_json/_write_json/_all_current_records`.
- Produces: `slot_window(date_ist: str, slot: str) -> (from_iso, to_iso)`; `edition_id(date, slot)`; `build_edition(output_root, date, slot, now, opener, transport, dry_run=False, max_notes=14) -> dict`; `render_note_page(note, edition_id) -> str`; CLI `python scripts/upsc/edition.py --slot am|pm|auto [--date YYYY-MM-DD] [--dry-run] [--max-notes N]`.
- Behaviour: loads existing edition file if present and only writes missing fingerprints (idempotent); a fingerprint already in the same date's AM edition becomes an `updates[]` entry on that AM note when building PM; useful-band candidates become `quickFacts` from the official record title (no LLM); writes `data/upsc/editions/YYYY/MM/DD-<slot>.json`, `data/upsc/editions/index.json` (newest 60), and `upsc-study/notes/<slug>/index.html`; `status` = `closed` if ≥1 note and no exception, `partial` if notes held for `llm-unavailable`, `delayed` never written by the builder (computed by the alert step).
- Static page: complete semantic HTML with title, description, canonical, `Article` JSON-LD, all sections, practice in `<details>`, links `rel="noopener"`, stylesheet `/assets/css/upsc-edition.css`.

- [ ] Tests: window maths for AM/PM across midnight; idempotent second run with same inputs writes byte-identical file; PM duplicate becomes update; held reasons recorded; dry run writes nothing; static page escapes `<script>` in titles.
- [ ] Implement; tests pass; commit.

### Task 7: Workflow, concurrency and late alert

**Files:**
- Create: `.github/workflows/upsc-edition.yml`
- Modify: `.github/workflows/upsc-publish.yml`, `upsc-prelims.yml`, `upsc-revision.yml`, `upsc-live.yml`, `upsc-pocket.yml`, `upsc-daily.yml` (add `concurrency: { group: upsc-data, cancel-in-progress: false }`)
- Modify: `scripts/test-upsc-workflow.js`

**Interfaces:**
- Edition job: checkout → setup-python → `python -m unittest discover -s scripts/upsc -p 'test_*.py'` → `python scripts/upsc/publish.py publish …` (refresh official records, same args as upsc-publish) → `python scripts/upsc/edition.py --slot auto` with `OPENAI_API_KEY`, `GEMINI_API_KEY` → `node scripts/generate-sitemap.js` → commit as `upsc-publisher[bot]` with `git pull --rebase` retry ×3.
- Late alert step (`if: always()`): when run at `:45` and the slot file is missing or `status != closed`, open/refresh a GitHub issue labelled `upsc-edition-late`; close it when a later run closes the slot.

- Modify: `scripts/upsc/prelims_quiz.py` — append MCQs from the last 7 days of editions as items `{id: "ed-<noteId>", stem, options, answer, trap, source}` ahead of existing items; test in `scripts/upsc/test_prelims_quiz.py`.
- Live today strip (spec rollout phase 5) is out of this plan: it needs the owner's Cloudflare secrets.

- [ ] Extend `test-upsc-workflow.js`: asserts the four crons, the concurrency group on every `data/upsc` writer, secrets referenced, and the unittest step precedes the build.
- [ ] Implement; `node scripts/test-upsc-workflow.js` passes; commit.

### Task 8: Progress and revision logic (browser, pure)

**Files:**
- Create: `assets/js/upsc/edition-progress.js`
- Test: `scripts/test-upsc-edition-progress.js`

**Interfaces:**
- Produces global `UpscEditionProgress` / CommonJS export: `create(storage, todayISO)` → `{ isDone(noteId), markDone(note, mcqCorrect|null), isFactTicked(id), tickFact(id), counter(editions) -> {prelims:[done,total], mains:[done,total], facts:[done,total], revise:n, percent, complete:boolean}, dueCards(todayISO) -> card[], gradeCard(cardId, remembered:boolean), missed(editionsByDate) -> [{editionId, left}], exportJSON() -> string, importJSON(text) -> boolean }`.
- Storage key `upscEdition.v1`; cards `{id, noteId, front, back, stage, due}`; stages map to intervals [1,3,7,21,60]; remembered advances stage, forgotten resets to stage 0 due tomorrow; overdue cards stay due (never dropped).
- `complete` = all prelims+mains notes done, all facts ticked, revise = 0.

- [ ] Tests: counter maths, card creation (≤3 per note), interval progression, forgotten reset, missed list over 7 days oldest first, export/import round trip, corrupted storage tolerated.
- [ ] Implement; tests pass; commit.

### Task 9: Shared answer renderer

**Files:**
- Create: `assets/js/upsc/answer-render.js`
- Test: `scripts/test-upsc-answer-render.js`

**Interfaces:**
- Produces `UpscAnswerRender`: `esc(s)`, `safeUrl(u)`, `sourceChip(source)` → `<a class="ue-chip ue-chip--official|secondary">`, `renderBlocks(answer)` for the coach JSON contract (`oneLine, sections[{heading, points[{label,text,cite[]}]}], table, misconception, examAngle, sources, retrieval, followUps`), `renderMarkdown(text, sources)` safe subset (`##`/`###`, `-`/`1.` lists, pipe tables, `**bold**`, `[text](http…)`, `[n]` citation markers → chips), `renderNote(note)` for edition notes (tag line, one-line box, why in news, sections, key numbers table, back to basics, way forward, misconception, practice `<details>`).

- [ ] Tests: XSS strings in every field escaped; `javascript:` URLs dropped; citation `[2]` maps to source 2 with Official badge; table with ragged rows renders; empty optional blocks omitted; `renderNote` output contains `<details class="ue-practice">`.
- [ ] Implement; tests pass; commit.

### Task 10: Today desk and reader

**Files:**
- Create: `assets/js/upsc/edition.js`
- Modify: `upsc.html` (insert `<section class="ue-desk" id="editionDesk" hidden aria-labelledby="editionTitle"></section>` and `<article class="ue-reader" id="editionReader" hidden></article>` as first children of `#view-brief`; load `answer-render.js`, `edition-progress.js`, `edition.js` and `assets/css/upsc-edition.css`)
- Test: `scripts/test-upsc-edition.js`

**Interfaces:**
- Consumes Tasks 8–9; fetches `data/upsc/editions/index.json` then today's AM/PM files (IST date) plus last 7 days for Missed.
- Renders: sticky counter, edition slot pills (AM ✓ time / PM pending), Glimpse list, Prelims cards, Mains cards, Quick facts with tick boxes, Revise today cards (front → reveal → Remembered / Forgot), Missed line, export/import in a small `<details>`.
- Reader route `?view=brief&note=<slug>` via `history.pushState`; Back returns to desk scroll position; done when the `#ue-keynumbers-end` sentinel intersects and the MCQ is answered, or Mark done pressed.
- No edition available → desk stays hidden and the existing page is unchanged.

- [ ] Tests with a minimal DOM shim (pattern from `scripts/test-upsc-render.js`): desk hidden without data; counter text `Prelims 0/2 · Mains 0/1`; marking done updates counter; `complete` shows "Today covered"; missed line lists yesterday PM.
- [ ] Implement; tests pass; commit.

### Task 11: Reading CSS

**Files:**
- Create: `assets/css/upsc-edition.css`
- Modify: `scripts/test-upsc-responsive-browser.py` (add edition fixture page checks when Playwright is available; skip cleanly otherwise)

**Interfaces:**
- Classes prefixed `ue-`. Tokens reuse existing `--` variables from `upsc.css` (paper, ink, accent); defines `--ue-bp-sm/md/lg` as documentation comments (CSS custom properties cannot be used in media queries).
- Components per spec "Reading layout". Key numbers table: `display:block; overflow-x:auto` wrapper; below 480px rows stack via `data-label`. Print: `details{display:block}` + `details > *{display:block}` and `a[href^="http"]::after{content:" (" attr(href) ")"}`.

- [ ] Browser checks at 320/390/768/1440: no horizontal overflow, `.ue-oneline` within first viewport on note page, details toggle via keyboard.
- [ ] Commit.

### Task 12: Summaverick widget

**Files:**
- Modify: `assets/js/upsc/coach.js` (use `UpscAnswerRender` when present: JSON contract → `renderBlocks`; otherwise `renderMarkdown(answer, result.sources)`; add chips `explain`, `check`, `test` (reuse `understanding`), `outline` (reuse `answer` with outline query); add Save to revision button calling `UpscEditionProgress.addCard`)
- Modify: `assets/js/upsc/edition-progress.js` (add `addCard({front, back, noteId})`)
- Modify: `assets/css/upsc-coach.css` (bottom sheet ≤600px at 90vh; 420px side panel ≥960px; answer blocks use `ue-` classes)
- Modify: `api/upsc.js` coach UPSC pack to request the JSON answer contract when `format === 'brief'` (code only; deploy needs Cloudflare secrets)
- Test: `scripts/test-upsc-coach.js`

- [ ] Tests: markdown answer with `[1]` renders chip; JSON contract answer renders one-line box and sections; legacy plain answer still renders paragraphs; Save to revision creates a card; `api` builds the brief contract instruction.
- [ ] Implement; all coach/api tests pass; commit.

### Task 13: Voice samples and dry run

**Files:**
- Create: `data/upsc/editions/samples/2026-10-13-samples.json` (three notes from real 12–13 Oct official records, written to the prompt and passed through `check_note`)
- Create: `docs/upsc-editions-runbook.md` (how to run, secrets, how to read held reasons, how to approve voice)

- [ ] `python scripts/upsc/edition.py --slot am --dry-run` runs end to end with the LLM unavailable and reports held `llm-unavailable` without writing files.
- [ ] Samples pass `check_note`.
- [ ] Full suite: `python3 -m unittest discover -s scripts/upsc -p 'test_*.py'` and every `node scripts/test-upsc-*.js` used in `upsc-publish.yml`.
- [ ] Commit.
