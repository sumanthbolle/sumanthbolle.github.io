# Summaverick UPSC Coach — Handover Spec

A handover spec for Claude Code / Cursor to evolve the Summaverick UPSC coach
widget into a UPSC-style exam mentor tightly integrated with the live UPSC
feeds (Today, Pattern Atlas, Mains drills, Prelims quiz, Revisit).

---

## 0. Status — what already landed on this branch

This branch (`claude/upsc-coach-research-mode`) implements the foundation the
rest of this spec builds on. Treat the sections below as the remaining roadmap;
the items here are done and must not be regressed.

| Area | Status | Where |
| --- | --- | --- |
| UPSC exam-coach system pack (India frame, GS mapping, IBC/directive rules, value-additions, "never invent a figure → verify line", credible-source steering) | **Done** | `api/upsc-domain.js`, wired in `api/worker.js` `handleChat` |
| Worker applies the pack on `{ domain: 'upsc' }` (with text-detection fallback), lowers temperature, honours a `liveSearch` flag | **Done** | `api/worker.js` |
| Widget sends `domain: 'upsc'` + per-prompt `liveSearch` | **Done** | `assets/js/upsc/coach.js` |
| Live Perplexity citations rendered as a numbered **Sources** list; related questions rendered as follow-up chips (http(s)-only, escaped) | **Done** | `assets/js/upsc/coach.js`, `assets/css/upsc-coach.css` |
| Grounding on an expanded Pattern Atlas anchor's static core / traps / verify | **Done (DOM-based)** | `assets/js/upsc/coach.js` `openAnchorContext()` |
| Loop caps: one truncation auto-continue, retry ceiling + manual retry | **Done** | `assets/js/upsc/coach.js` |
| Tests for the above | **Done** | `scripts/test-upsc-coach.js` (runs in `upsc-publish.yml`) |

**Repo reality (path mapping for anyone reading the older PR text):**

- The widget script is `assets/js/upsc/coach.js` (the spec sometimes calls it
  `scripts/upsc-coach.js`).
- The Worker is `api/worker.js`; the UPSC system pack lives in
  `api/upsc-domain.js`. The Worker must be redeployed (`wrangler deploy`) for
  server-side prompt changes to take effect on the live endpoint.
- The five study pages are `upsc.html` (Today), `upsc-patterns.html` (Pattern
  Atlas), `mains.html` (Mains drills), `upsc-quiz.html` (Prelims quiz),
  `revision.html` (Revisit Today).
- Structured anchor data already exists in `data/upsc-patterns.json`
  (`static_core`, `traps`, `verify`, `skeleton`, `stems`, `codes`, `band`,
  `prelims_angle`). This is the natural source for the `meta` object below.

**Grounding upgrade to prefer next:** the current grounding reads the *open
anchor's rendered DOM*. Section 3 asks for structured `meta` fields. The clean
path is to expose a `window.UPSC_CONTEXT` (or `data-upsc-*` attributes) from
each page's app code and have the widget prefer that over DOM scraping.

---

## 1. Scope and Goals

### 1.1 Objective

Transform the existing "Summaverick exam-coach" widget on UPSC study pages into
a structured UPSC-style assistant that:

- Enforces UPSC Mains answer-writing standards (Introduction–Body–Conclusion,
  directive words, word limits).
- Generates UPSC-style Prelims questions tied to static topics behind current
  affairs.
- Uses page-level UPSC metadata (static topic, GS paper, pattern tags,
  triggers) instead of only raw text.
- Provides practice and feedback loops that mimic exam-hall discipline (timed,
  word-limited, rubric-based).

### 1.2 Current State (from PR #152)

The widget, docked bottom-right on UPSC study pages (Today, Pattern Atlas, Mains
drills, Prelims quiz, Revisit Today):

- Uses the existing public chat route (`POST /`) to a Cloudflare Worker.
- Can take either highlighted text on the page or the "lead article / open
  drill" as its main context.
- Offers four chips:
  - **Prelims angle** — how this topic can be asked or answered in Prelims.
  - **Mains POV** — GS paper, directive, demand, three dimensions.
  - **Model answer** — a 150-word exam-hall skeleton.
  - **Quick quiz** — one question at a time.
- Quiz mode retries on truncation or premature ending, and keeps going until the
  student stops.
- Each assistant reply plays a short major-triad tone (C–E–G), with mute
  persisted in browser.
- `scripts/test-upsc-coach.js` covers: prompt wiring, the 1000-character Worker
  query cap, never-stop helpers, HTML escaping, and page wiring.
- The widget is included in `upsc-publish.yml` and deployed via Cloudflare
  Pages/Workers.

This spec extends behavior; **do not remove** the existing reliability features
(retry, never-stop quiz, HTML escaping, tests).

---

## 2. UPSC Ground Truth (What We Must Match)

Claude/Cursor should hard-code the following constraints into prompts and UI
logic; these are consistent across multiple UPSC answer-writing guides.
[cite:17][cite:6][cite:22][cite:28]

### 2.1 Mains Answer Structure

Every UPSC Mains GS answer follows an Introduction → Body → Conclusion (IBC)
structure:

- **Introduction:** 20–25 words (10-mark) / 30–40 words (15-mark).
- **Body:** 100–110 words (10-mark) / 165–180 words (15-mark).
- **Conclusion:** 20–25 words (10-mark) / 30–40 words (15-mark).

Word limit: ~150 words (10 marks) and ~250 words (15 marks), with ~10%
tolerance. [cite:22][cite:28][cite:27]

### 2.2 Directive Words

Directive words (Discuss, Examine, Analyse, Evaluate, Critically examine,
Elucidate, Explain, Comment, etc.) dictate the shape of the answer.
[cite:23][cite:26][cite:29]

Examples:

- **Discuss:** Multiple perspectives, pros/cons, balanced conclusion.
- **Analyse:** Break issue into components and interrelations.
- **Evaluate:** Weigh strengths/weaknesses and give judgment.

### 2.3 Prelims Question Types

UPSC Prelims uses a limited set of question formats: [cite:18]

- Single-statement direct.
- Statement-based ("Which of the above statements is/are correct?").
- How many of the above are correct.
- Match the pairs.
- Assertion–Reason.
- Odd-one-out.
- Chronological ordering.

These formats should be reflected in **Prelims angle** and **Quick quiz**
outputs.

### 2.4 Value-addition Signals

High-scoring Mains answers routinely use: [cite:19][cite:20][cite:27]

- Constitutional articles.
- Committees and reports.
- Government schemes and policies.
- Data points and examples.
- Brief diagrams / flowcharts where suitable (GS1/GS3).

The coach should nudge the user and the model to include at least one such
anchor per answer.

---

## 3. Integration With Live UPSC Pages

### 3.1 Inputs

On each of these UPSC pages — Today, Pattern Atlas, Mains drills, Prelims quiz,
Revisit Today — there is already page-level metadata (in HTML `data-*`
attributes or JSON) that includes at least:

- `static_topic` (e.g., "Parliamentary Committees", "Fiscal Federalism").
- `gs_paper` (GS1/GS2/GS3/GS4).
- `pattern_tag` (e.g., "GS2 Parliament – Role & Functions", "GS3 Environment –
  Conservation").
- `source` (PIB, PRS, RBI, etc.).
- `trigger_date` and/or `anchor_date`.

### 3.2 Required Behavior

For all four chips, if text is not highlighted explicitly by the user, the
widget MUST:

- Read the page metadata (via DOM or a JSON global) and pass it to the Worker as
  structured fields alongside the textual context.
- Display that metadata in a header line in the response, e.g.
  "GS2 – Parliament; Static: Parliamentary committees; Pattern: Role in ensuring
  accountability (2018-style)."

### 3.3 Highlighted Text vs Page Context

- **If text is highlighted:** use highlighted text as primary context; still
  send page metadata as secondary context.
- **If no highlight:** use the page's lead article / open drill text as primary
  context, plus metadata.

**Implementation hint:** extend the widget's query-building code
(`assets/js/upsc/coach.js` — the spec's `scripts/upsc-coach.js`) to:

- Extract metadata from `data-upsc-*` attributes or a global `window.UPSC_CONTEXT`
  object.
- Add a `meta` object to the body of the `POST` request to `/`.

> The current build already sends `domain` and `liveSearch` and grounds on the
> open anchor's DOM. Adding a structured `meta` object is the next step; the
> Worker should read `body.meta` and fold the fields into the system/user
> context (and echo them back for the header line).

---

## 4. Chip-by-Chip Behavior

### 4.1 Prelims Angle

**Goal:** Generate UPSC-style Prelims questions for the topic, emphasizing the
static concept behind the current event. [cite:18]

**Prompt Requirements (Server-side / Worker).** For Prelims angle, instruct the
model:

> "Generate 1–2 UPSC Prelims-style questions for the given topic. Prefer
> statement-based or match-the-pairs format. Each question must have 4 options
> and an explanation. Focus on the static concept (e.g., provisions, schemes,
> committees) illustrated by the current event, not headline trivia."

Provide metadata: `gs_paper`, `static_topic`, `pattern_tag`, `source`, `date`.

**Response Schema (client-side parsing).** Expect JSON (or parseable text) of the
form:

```json
{
  "questions": [
    {
      "stem": "With reference to parliamentary committees, consider the following statements...",
      "options": ["Only 1", "Only 2", "Both 1 and 2", "Neither 1 nor 2"],
      "correct": "Both 1 and 2",
      "explanation": "Both the Estimates Committee and the Public Accounts Committee are financial committees of Parliament..."
    }
  ],
  "meta": {
    "format": "statement-based",
    "topic": "Parliamentary committees",
    "difficulty": "Medium"
  }
}
```

In the widget UI:

- Render stem + options with radio buttons.
- After the user selects an option and submits, show correct answer +
  explanation.
- Optionally show difficulty tag.

### 4.2 Mains POV

**Goal:** Give a structural view: GS paper mapping, directive word, demand, and
3–4 dimensions that the aspirant should cover. [cite:23][cite:29]

**Prompt Requirements.** For Mains POV, instruct the model:

> "Identify the most likely UPSC Mains question this topic can lead to. Return:
> GS paper number; a question stem; the main directive word; the demand; 3–4
> body dimensions. Do NOT write a full answer; only give the skeleton."

Include metadata so the model correctly maps to GS paper and syllabus head.

**Response Schema:**

```json
{
  "gs_paper": "GS2",
  "question": "Discuss the role of parliamentary committees in ensuring executive accountability in India.",
  "directive": "Discuss",
  "demand": "Role of committees in holding government accountable",
  "dimensions": [
    "Historical evolution of committees",
    "Types of committees and their functions",
    "Strengths in enhancing accountability",
    "Limitations and reforms needed"
  ]
}
```

Widget rendering:

- Show GS paper and directive prominently.
- List dimensions as bullet points for the user to use as heads when writing.

### 4.3 Model Answer

**Goal:** Generate a tight IBC-structured answer at 150 or 250 words with clear
heads and value-addition anchors. [cite:17][cite:22][cite:24][cite:27]

**Prompt Requirements.** If the page/drill indicates marks (10 or 15), map
10 marks → 150 words, 15 marks → 250 words. Instruct the model explicitly:

> "Write a UPSC GS Mains answer to the following question. Use
> Introduction–Body–Conclusion structure. Word limit: 150 words for 10 marks /
> 250 words for 15 marks. In the introduction (20–25 or 30–40 words), define the
> key term or give context. In the body (100–110 or 165–180 words), write 3–6
> points with sub-headings, each backed by an example/data/scheme. In the
> conclusion (20–25 or 30–40 words), give a forward-looking way forward or
> balanced judgment. Include at least one constitutional article,
> committee/report, government scheme, or data point. Match the structure to the
> directive word."

**Parsing and Display:**

- Expect answer as text with clear section markers (e.g., "Introduction:",
  "Body:", "Conclusion:").
- Compute approximate word count client-side and display it (e.g.,
  "≈148 words (10 marks)").
- In the UI: visually separate Introduction, Body, Conclusion. Optionally
  highlight value-addition items (articles, committees, schemes, data) via
  simple regex patterns.

### 4.4 Quick Quiz

**Goal:** Provide continuous UPSC-style questions (Prelims or short Mains
prompts) that never "wrap up" unless the user stops, with explanations and
simple metrics. [cite:18][cite:25]

**Prompt Requirements.** For Quick quiz, instruct the model:

> "Generate one UPSC-style question at a time on this topic. Alternate between
> Prelims statement-based MCQs and short Mains prompts. For Prelims questions,
> provide stem, options, correct answer, and explanation. For Mains prompts,
> provide a 10- or 15-mark question only (no full answer). Do not say 'this is
> the last question'; always be ready with the next question."

**Widget Logic:**

- After each response:
  - If it is a Prelims question, handle as in Prelims angle (user selects, then
    sees explanation).
  - If it is a Mains prompt, simply show the question and optionally a timer
    (e.g., "Try writing in 7–8 minutes").
- Maintain counters per session: `questions_attempted`, `correct_prelims_answers`.

Existing never-stop and retry logic already implemented **must be preserved**.

---

## 5. Exam-Hall Discipline Features

### 5.1 Word Count and Mode

Add two modes:

- **Study mode:** full explanations, relaxed tone; word counts displayed but not
  enforced.
- **Exam mode:** strict adherence to word limits (150/250) in prompts; UI shows
  a timer per question (7–8 minutes for 10-mark, 12–14 minutes for 15-mark);
  audio tones default to muted. [cite:17][cite:27][cite:25]

**Implementation:**

- Store mode in `localStorage` as `summaverick_upsc_mode`.
- Switch prompts slightly based on mode (more coaching text in study mode,
  tighter in exam mode).

### 5.2 Rubric Feedback

For Model answer, add a lightweight rubric line. Send an additional prompt to the
model:

> "Given this answer, rate presence (✓/✗) of: structure (IBC), relevance to
> demand, data/examples, committees/schemes, way forward in conclusion. Respond
> with a short JSON object." [cite:22][cite:27]

Parse and display as:
`Structure ✓ | Relevance ✓ | Data/examples ✓ | Committees/schemes ✗ | Way forward ✓`.

### 5.3 User Answer Evaluation (Optional but Recommended)

Allow the user to paste their own answer (or type in a text area) and receive
rubric feedback:

- Provide a "Paste your answer" button when a Mains question is shown.
- On submit, send user answer + original question + metadata to the Worker with
  an evaluation prompt:

> "Evaluate this UPSC Mains answer on structure, relevance, depth,
> value-addition, and way forward. Give specific suggestions in 3–5 bullet
> points." [cite:24][cite:27]

---

## 6. Implementation Plan

### 6.1 Files Likely to Touch

- `assets/js/upsc/coach.js` (spec's `scripts/upsc-coach.js`): widget launcher,
  chip event handlers, request-building logic, response parsing and rendering.
- The five UPSC pages (`upsc.html`, `upsc-patterns.html`, `mains.html`,
  `upsc-quiz.html`, `revision.html`): ensure UPSC metadata is exposed via
  `data-upsc-*` attributes or JS globals.
- Cloudflare Worker route backing `POST /` (`api/worker.js` +
  `api/upsc-domain.js`): extend prompts to include the new per-chip behaviour;
  enforce word limits and schema wherever possible.
- `scripts/test-upsc-coach.js`: add tests for the new JSON schemas and modes.

### 6.2 Steps

1. **Expose UPSC metadata on pages.** For each UPSC page template, ensure static
   topic, GS paper, pattern tag, source, and date are accessible to JS. Example:

   ```html
   <div id="upsc-root"
        data-static-topic="Parliamentary committees"
        data-gs-paper="GS2"
        data-pattern-tag="Parliament – accountability"
        data-source="PRS"
        data-anchor-date="2026-08-15">
   </div>
   ```

2. **Extend request-building in the widget script.** Read metadata from DOM or
   JS, build a `meta` object, and include it in the POST body. Keep query length
   under 1000 characters (existing test/Worker cap).

3. **Update Worker prompts per chip.** Implement prompts as specified in Sections
   4.1–4.4. Where possible, standardize on JSON outputs for Prelims angle and
   Quick quiz.

4. **Update UI rendering.** For each chip: parse response into structured UI
   components; add headers showing metadata (GS paper, static topic, pattern);
   show word counts and exam-mode timers; add rubric badges for Model answers.

5. **Extend tests.** Update `scripts/test-upsc-coach.js` to validate new `meta`
   usage, response schemas for Prelims angle and Quick quiz, and that
   word-limit-enforcing prompts do not exceed the Worker query cap.

6. **Manual QA.** Test on all UPSC pages with: highlighted text + no highlight;
   both modes (Study, Exam); all chips. Confirm Cloudflare deployment via the
   existing Pages/Workers integration.

---

## 7. Constraints & Non-Goals

- Do **NOT** change the underlying UPSC ETL or source registry logic; this spec
  concerns only the coach widget and page-level metadata use.
- Do **NOT** remove retry/backoff or the quiz never-stop logic.
- Do **NOT** alter non-UPSC pages or ServiceNow CSA quiz / interviews content.
- Do **NOT** hard-code any real UPSC questions; generate in UPSC style without
  copying copyrighted content verbatim.

---

## 8. Acceptance Checklist

Claude Code / Cursor can consider the task complete when, on any UPSC page, the
widget:

- [ ] Shows GS paper, static topic, and pattern tag in its header.
- [ ] Produces Prelims questions in statement-based or similar UPSC formats with
      options and explanations.
- [ ] Produces Mains POV outputs with directive word and 3–4 dimensions.
- [ ] Produces Model answers with visible IBC structure, correct word limits, and
      at least one value-addition anchor.
- [ ] Offers Quick quiz that alternates Prelims and Mains prompts, with basic
      metrics.
- [ ] Supports Study and Exam modes with appropriate behaviour differences.
- [ ] All new behaviour is covered by tests and passes in `upsc-publish.yml`.

---

## 9. Reference Notes

Bracketed `[cite:NN]` markers throughout Section 2 and Section 4 refer to the
external UPSC answer-writing guides the author compiled these constraints from.
They are retained as provenance for the ground-truth rules; they are not links in
this repo.
