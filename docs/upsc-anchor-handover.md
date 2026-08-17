# Anchor — UPSC study tool (handover)

**Page:** [`upsc.html`](../upsc.html) → `https://sumanthbolle.com/upsc`
**Grouping:** Utilities (fourth entry, alongside SkyFare, Metals, Save Yourself)
**Retrieval:** Perplexity Sonar via the shared Worker — `GET /upsc/brief`, `POST /upsc/topic`
**Storage:** browser `localStorage` only. No account, no sync, no server copy.

---

## What it is

A UPSC Civil Services current-affairs and notes tool built on one idea: **the
skill is discarding**. Consumption feels like progress; retrieval is what
produces marks. So the page is designed to throw away most of what it reads,
compress what survives into one usable line, and then make you retrieve it on a
schedule.

The name is the rule: **no static anchor, no entry**. If you cannot name the
concept that outlives the news event, there is nothing to revise.

## Provenance

The method is the `upsc-strategy-engine` skill, implemented as a web tool:

| Skill rule | Where it lives here |
|---|---|
| Cycle detection → BUILD / CONVERGE / COMPRESS / LOCK | `assets/js/upsc/store.js` → `AnchorCycle.compute` |
| Examinability filter (two of four tests) | Prompted in `api/upsc.js`, then **re-enforced server-side** in `normalizeUpscBrief` |
| Compression format (anchor / codes / what / why / debate / use) | Brief schema, the notes composer, and the Markdown export |
| Probability score for triage + treatment bands | `scoreItem` / `scoreBand` in `api/upsc.js` |
| Verification gate (primary source, or unverified) | `isPrimarySource` host allowlist; amber vs green in the UI |
| Spaced repetition at day 1, 3, 7, 21, 60 then monthly | `AnchorStore.review`, Revise view |
| Retrieval, not rereading | Revise shows the **title only** until you press Reveal; a miss resets to day 1 |
| Discard log | Returned by the brief and rendered under it |
| Anchor clustering at month end | Weekly clusters, plus grouping in the export |
| Honesty guardrails | “What this tool will not do”, provisional scoring labels, UPSC precedence stated |

## Structure

```
upsc.html                     markup, JSON-LD, SBHelpGuide steps
assets/css/upsc.css           tokens + chrome + page (self-contained, like the other pages)
assets/js/upsc/store.js       cycle mode, notes, retrieval schedule, Markdown export
assets/js/upsc/render.js      HTML builders (brief entry, note, lookup, revise card)
assets/js/upsc/app.js         wiring: views, filters, search, retrieval, export
api/upsc.js                   prompts, schemas, normalisation, scoring, verification gate
api/worker.js                 route dispatch, Sonar call, Cache API, CORS
```

Four views in one workspace, switched by the command bar: **Brief** (daily or
weekly), **Lookup** (any concept → one screen), **Notes** (saved + your own),
**Revise** (today's retrieval queue). The right rail carries session status and
keeps the four-test filter visible while you work.

## Design decisions worth keeping

- **Notebook, not cards.** Entries are ruled rows with a margin score, the way a
  topper's register looks. No card mosaic, no icon-in-circle grid, no gradients.
- **One highlighter.** The amber wash is reserved for the `Use in an answer`
  line and the mark-losing trap. Blue stays the interactive accent. Two accents,
  both already in the site palette.
- **No new fonts.** The existing utility-page serif carries the display and
  reading voice; the system sans carries chrome only. Nothing is fetched.
- **Retrieval is explicit.** The brief loads on a button press, never on page
  load: it costs an API call, it takes ~20 s, and an aspirant in LOCK mode
  should not be handed new material automatically.
- **Depth is capped by prompt.** Points are one line each; the lookup returns
  4–6 of them and stops. Over-reading is the failure mode being designed against.

## Known limits

- **Scores are provisional.** The anchor-frequency term is an editorial estimate
  from the 20-year recurring-theme table, not a tagged PYQ corpus. Loading a
  real corpus (see the skill's `pyq-pattern-decoder.md` §7) would replace
  `ANCHOR_WEIGHTS` in `api/upsc.js` and let the `recency_gap` term stop being
  neutral. Until then the UI and the API both say the score is provisional.
- **Gate B is manual.** The Worker can only assert gate A (a primary-source
  host). Two-model agreement is left to the aspirant, as it should be.
- **The brief is not stored.** It lives in memory for the session; the Worker's
  edge cache is what makes a revisit cheap.
- **`assets/css/upsc.css` repeats the nav, footer and button chrome** that
  `save-yourself.css` also carries. That duplication is the extraction target
  named in Priority 4 of the site review — when the shared `tokens.css` /
  `nav.css` split happens, this page should move onto it first.

## If you extend it

Reasonable next steps, in order of value:

1. **Load a PYQ corpus** so scores stop being provisional (the highest-value
   change by a wide margin).
2. **Answer evaluation** against the rubric in the skill's
   `answer-writing-formats.md` §8 — a `POST /upsc/evaluate` route returning a
   per-criterion breakdown and exactly three fixes. Route it to a model chosen
   for rubric stability, not to whatever is already wired.
3. **Intersection matrix** once the corpus exists: top anchors × live triggers,
   presented as a writing list and labelled as prioritisation, not prediction.

Do not add: a second news source, streaks, badges, or anything that rewards
time spent rather than items retrieved.
