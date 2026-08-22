# UPSC Today — Website Enhancement Specification
## A free, source-first, time-efficient UPSC learning system

**Target:** `https://sumanthbolle.com/upsc`  
**Purpose:** Product + UX + content architecture handover for implementation  
**Benchmark sources reviewed:** InsightsIAS current-affairs ecosystem, Drishti IAS current-affairs ecosystem, UPSC official examination/PYQ pages, and the current UPSC Today / Pattern Atlas / Revision / Mains / Quiz pages on sumanthbolle.com.  
**Date:** 22 August 2026

---

# 1. Product Direction

Do **not** turn UPSC Today into another coaching-site content dump.

The opportunity is to build a free UPSC product that does one thing better than large coaching portals:

> **Convert a large amount of current information into a small amount of exam-usable understanding and long-term recall.**

The core loop should be:

**Discover → Understand → Connect to static → Link to PYQ → Test → Revisit → Reuse in Mains**

The website should optimize for:
- **clarity per minute**, not words per article;
- **exam relevance**, not news volume;
- **retention**, not page views;
- **primary-source trust**, not coaching-source dependence;
- **progressive depth**, so users can stop after 60 seconds or continue for 15 minutes;
- **static-current integration**, so current affairs improve the entire GS syllabus rather than becoming a separate subject.

A successful session should leave the user knowing:
1. What happened?
2. Why is UPSC likely to care about the underlying topic?
3. What static concept does it belong to?
4. What are the 3–7 facts worth remembering?
5. What are the main dimensions of the issue?
6. Has UPSC asked something similar before?
7. Can I answer one MCQ and outline one Mains response?
8. When will this come back for revision?

---

# 2. What the Benchmark Sites Do Well

## 2.1 InsightsIAS — strengths worth adopting

InsightsIAS is strong at **exam segmentation and structured editorial packaging**.

Useful patterns:
- Daily current-affairs editions.
- Separation of **Prelims-focused current affairs** and **Mains/editorial analysis**.
- Filtering by subjects such as polity, economy, environment, history, IR, science & tech, schemes, bills, species, geography and mapping.
- Daily content split by GS paper.
- Topic structure frequently follows:
  - context,
  - what it is,
  - how it works,
  - arguments,
  - challenges,
  - way forward,
  - conclusion.
- Separate “Prelims in Focus” items.
- Mapping / places in news.
- Mains enrichment.
- Answer-writing prompts.
- Mind maps.
- Weekly/monthly compilations.
- PYQ repositories.

### What not to copy
- Long pages that force the learner to scan a large volume every day.
- Repetitive coaching-template headings where every issue becomes “significance / challenges / way forward.”
- Navigation density.
- Treating the article as the final learning unit.

### What UPSC Today should improve
For every topic, show the **minimum useful answer first**, then let the user expand.

---

## 2.2 Drishti IAS — strengths worth adopting

Drishti is particularly good at **declaring examination relevance before the article begins**.

Useful patterns:
- “For Prelims” keyword list.
- “For Mains” issue framing.
- Read-time labels.
- “Why in News?”
- Strong taxonomy and tags.
- Summary blocks.
- Daily current-affairs pages.
- Daily MCQs.
- Weekly revision MCQs.
- Monthly current-affairs consolidation.
- Monthly editorial consolidation.
- “To The Point” short-format explainers.
- Mind maps.
- Government scheme sections.
- Important institutions.
- Learning through maps.
- Reports and summaries.
- PYQs embedded below relevant topics.
- A Mains practice question directly attached to the topic.

### What not to copy
- Multiple parallel content products that make the user decide what to read.
- Long archive structures that grow indefinitely.
- Content duplication between daily article, editorial, TTP, monthly PDF and quiz.

### What UPSC Today should improve
Generate **one canonical Topic Packet** and derive all other formats—daily brief, revision card, quiz, Mains drill and monthly dossier—from the same structured object.

---

# 3. Existing UPSC Today Strengths — Keep These

The current site already contains product ideas that are more interesting than a conventional current-affairs portal:

- Official-source filtering.
- GS1 / GS2 / GS3 / GS4 / Essay mapping.
- “Revisit today.”
- 7-day catch-up.
- Revision queue.
- Due recall.
- Cloze facts.
- Prelims traps.
- 10-second answer skeletons.
- User notes.
- Markdown export.
- Mains drills.
- Statement-based Prelims quiz.
- Pattern Atlas.
- Static anchors.
- Directive verbs.
- Trigger types.
- Linked anchors.
- Verification fields.
- Weak-anchor tracking.
- Spaced recall.

These should become the **center of the experience**, not secondary utilities.

The new experience should feel like:

> **A personal UPSC study desk backed by an editorial engine.**

---

# 4. Primary Product Differentiator

## “One topic, every exam use”

A single topic should never be stored as only an article.

It should be a structured knowledge object capable of rendering into:

- 60-second brief
- 5-minute explainer
- 15-minute deep dive
- Prelims fact card
- Mains argument card
- PYQ bridge
- revision flashcard
- cloze test
- statement MCQ
- 10-second answer skeleton
- weekly dossier entry
- monthly revision entry
- related-static-topic page
- search result
- timeline item

This eliminates duplication and lets the user switch learning modes without leaving the topic.

---

# 5. Recommended Information Architecture

Replace a “news portal” mental model with a “study system” mental model.

## Primary navigation

### 1. Today
The smallest possible list of genuinely important items.

### 2. Catch Up
7-day and 30-day recovery mode.

### 3. Topics
Static-current knowledge graph organized by GS paper and anchor.

### 4. Patterns
Existing Pattern Atlas.

### 5. Practice
Prelims + Mains in one practice hub.

### 6. Revision
Spaced-repetition queue and weakness dashboard.

### 7. Sources
Transparent primary-source archive.

---

# 6. Homepage / Today Redesign

The `/upsc` page should answer one question immediately:

> **What is worth my time today?**

## Section A — Today in 15 minutes

Hero block:

**UPSC Today — 22 Aug 2026**  
`4 essential topics · 9 min reading · 6 min recall`

Actions:
- Start 15-minute session
- Prelims mode
- Mains mode
- 7-day catch-up

Do not show a giant article list above this block.

---

## Section B — Priority stack

Limit to:
- **3 Must Know**
- **3 Useful**
- everything else under **Low Priority / Skipped**

Each card:

```text
[Must Know] [GS2] [Polity] [4 min]

Topic title
One-line explanation of what changed.

Why UPSC cares:
Federalism → fiscal devolution → Finance Commission

Static anchor:
Fiscal federalism

Prelims: 3 facts
Mains: 2 dimensions
PYQ: 2 related

[60 sec] [5 min] [Deep dive] [Save]
```

### Priority should be editorially explicit

Show:
- `Must Know`
- `Useful`
- `Background`
- `Skip`

This is a major differentiator.

A UPSC aspirant does not need another service afraid to say that a news item is low value.

---

# 7. The Canonical “Topic Packet”

Every important topic should render from one schema.

## 7.1 Header

Display:
- Topic
- Date
- GS paper(s)
- syllabus code(s)
- subject
- current trigger type
- static anchor
- priority
- estimated read time
- source confidence
- last reviewed

Example:

```text
GS2 · Federalism · GS2.2
Static anchor: Fiscal federalism
Trigger: Report
Priority: Must Know
Read: 5 min
Source status: Primary verified
Reviewed: 22 Aug 2026
```

---

## 7.2 60-second layer — “Know this first”

Always visible.

### What happened
Maximum 2 sentences.

### Why it matters
Maximum 3 bullets.

### Remember these
3–5 high-value facts only.

### UPSC link
- Prelims: one line
- Mains: one line
- Essay/Ethics: only if genuinely relevant

At this point, the user should already be allowed to mark:
- Understood
- Save for revision
- Test me

---

## 7.3 5-minute layer — “Understand it”

Expandable.

### 1. Static anchor
Explain the underlying concept as though the news event did not exist.

### 2. How it works
Use steps, flow or causal chain.

### 3. What changed
Clearly distinguish:
- old position,
- new development,
- unresolved question.

### 4. Key dimensions
Only relevant dimensions.

Possible dimensions:
- Constitutional
- Governance
- Economic
- Social
- Environmental
- Technological
- International
- Ethical
- Federal
- Judicial
- Administrative

### 5. Debate matrix

Use a compact two-column or three-column format:

| Position A | Tension | Position B |
|---|---|---|
| State autonomy | vs | National uniformity |
| Growth | vs | Regulation |
| Welfare targeting | vs | Exclusion risk |

Do not write 800 words when a matrix communicates the argument better.

---

## 7.4 15-minute layer — “Master it”

Use only for high-value topics.

Include:
- historical background,
- institutional architecture,
- constitutional/statutory basis,
- timeline,
- data with source/year,
- stakeholder map,
- international comparison where useful,
- court judgments,
- committees/reports,
- counterarguments,
- implementation constraints,
- reasoned way forward.

This is where comprehensive understanding belongs.

It should **not** be the default view.

---

# 8. Add a “Static ↔ Current” Bridge

This should be one of the signature features.

For every current-affairs topic:

```text
CURRENT TRIGGER
      ↓
STATIC ANCHOR
      ↓
PAST UPSC QUESTION PATTERN
      ↓
WHAT TO REVISE
      ↓
HOW TO USE IN AN ANSWER
```

Example structure:

```text
Current:
A new Finance Commission recommendation

Static:
Fiscal federalism

Revise:
Articles 268–281
Divisible pool
Finance Commission
GST Council
Vertical vs horizontal devolution

PYQ pattern:
Centre–State financial relations

Possible Mains use:
“Examine whether fiscal centralisation weakens cooperative federalism.”
```

The user should never finish a current-affairs article without knowing **which static chapter it belongs to**.

---

# 9. PYQ Bridge — Make It First-Class

Both benchmark sites use PYQs, but UPSC Today can integrate them much more deeply.

For each Topic Packet show:

## PYQ proximity

### Direct
Questions substantially about the same static anchor.

### Adjacent
Questions that use the same institution, concept or debate.

### Pattern
Questions with the same directive + dimension.

Example:

```text
Related UPSC patterns
2023 · GS2 · 15 marks · Examine
2019 · GS2 · 10 marks · Discuss
2017 · Prelims · 2-statement MCQ
```

For copyrighted question text or where reproduction is undesirable, store:
- year,
- paper,
- theme,
- directive,
- short paraphrase,
- official UPSC source link.

### Add “Why this PYQ is linked”
One sentence.

This prevents fake associations.

---

# 10. “Prelims Vault” Inside Every Topic

A learner should not need a separate article to extract prelims facts.

Use a dedicated block:

## Prelims Vault

### Must remember
5 facts maximum.

### Confusing pairs
Example:
- constitutional vs statutory
- ministry vs regulator
- treaty vs organisation
- headquarters vs secretariat
- national park vs biosphere reserve

### Statement traps
Generate 2–4 likely misconception statements.

Example:
- “X is a constitutional body.” → false
- “Y is administered by Ministry A.” → verify

### Numbers that matter
Show only numbers with:
- source,
- year/date,
- verification status.

### Map
For place-based topics.

### Timeline
For history, legislation, treaties and institutional evolution.

### “Do not memorize”
Explicitly mark low-value statistics.

This is extremely useful for reducing overload.

---

# 11. “Mains Kit” Inside Every Topic

## Mains Kit

### 10-second skeleton
A 4–6 node outline.

### Opening line
Prefer:
- constitutional anchor,
- definition,
- recent report,
- factual context.

Avoid generic motivational introductions.

### Dimensions
3–6 only.

### Evidence bank
Maximum:
- 2 data points,
- 2 examples,
- 1 committee/report,
- 1 judgment/article if relevant.

### Counter-view
At least one serious counterargument where the issue is contested.

### Way forward
Tie every recommendation to a previously identified problem.

Bad:
- increase awareness,
- improve coordination,
- use technology.

Better:
- specify **which institution changes what process and why**.

### Closing line
One-sentence synthesis.

### Practice
- one 10-marker
- one 15-marker only for major topics

### Evaluate my outline
Future enhancement: allow the learner to type only a skeleton and compare it with the expected dimensions.

---

# 12. Add “Explain Like I’m New to UPSC”

Many current-affairs sites assume the user knows the static syllabus.

Add a toggle:

`New to topic` / `Revision mode`

## New to topic
Explain:
- what the institution is,
- where it sits,
- why it exists,
- basic vocabulary,
- one simple example.

## Revision mode
Show:
- trigger,
- delta/change,
- facts,
- traps,
- question.

This allows the same website to serve beginners and repeat candidates without duplicating content.

---

# 13. Build Topic Types, Not Just Subject Tags

Subject tags are necessary but insufficient.

Add `content_type`.

Recommended types:

- `CURRENT_EVENT`
- `EDITORIAL_DEBATE`
- `BILL_OR_ACT`
- `JUDGMENT`
- `SCHEME`
- `REPORT_OR_INDEX`
- `INSTITUTION`
- `INTERNATIONAL_ORGANISATION`
- `TREATY_OR_GROUPING`
- `SPECIES`
- `PLACE_IN_NEWS`
- `SCI_TECH_CONCEPT`
- `ECONOMIC_CONCEPT`
- `HISTORY_LINK`
- `ART_CULTURE`
- `DATA_RELEASE`
- `COMMITTEE`
- `PERSON_IN_NEWS`

Each type should have a tailored template.

---

# 14. Specialized Templates

## 14.1 Bill / Act

Show:
- problem the law addresses,
- current legal position,
- proposed change,
- key provisions,
- constitutional basis,
- federal implications,
- rights implications,
- implementation challenge,
- related judgments,
- Prelims traps,
- Mains debate.

---

## 14.2 Judgment

Show:
- court + bench/date,
- question before the court,
- constitutional/statutory provisions,
- holding,
- reasoning,
- what changed,
- what did **not** change,
- precedent,
- implications,
- dissent if important,
- related PYQs.

Never reduce a judgment to a headline.

---

## 14.3 Government Scheme

Show:
- ministry,
- launch year,
- objective,
- target group,
- funding pattern,
- implementing agency,
- central sector / centrally sponsored,
- eligibility,
- latest change,
- overlaps with other schemes,
- evaluation findings,
- common Prelims traps.

---

## 14.4 Report / Index

Show:
- publisher,
- frequency,
- methodology,
- what it measures,
- India-specific finding,
- trend, not just rank,
- limitations,
- related policy,
- common confusion with similar indices.

---

## 14.5 Institution

Show:
- constitutional / statutory / executive / treaty-based,
- founding instrument,
- composition,
- appointment,
- tenure,
- removal,
- functions,
- independence safeguards,
- reporting relationship,
- recent trigger.

---

## 14.6 International grouping / treaty

Show:
- members,
- founded,
- headquarters/secretariat if relevant,
- mandate,
- legal nature,
- India’s status,
- recent change,
- map,
- similar bodies comparison.

---

## 14.7 Place in News

Show:
- map first,
- country/state,
- bordering regions,
- nearby water body,
- river/mountain/pass,
- geopolitical/environmental relevance,
- 3 Prelims statements.

---

## 14.8 History / Culture

Show:
- chronology,
- period,
- geography,
- major actors,
- causes,
- development,
- consequence,
- primary source / inscription / text where relevant,
- current trigger,
- common chronology traps.

---

# 15. Replace “More Reading” with Progressive Disclosure

Default page density should be low.

Use these levels:

### Layer 0 — Scan
15–20 seconds.

### Layer 1 — 60 sec
Core understanding.

### Layer 2 — 5 min
Exam-ready explanation.

### Layer 3 — Deep dive
Optional comprehensive analysis.

### Layer 4 — Practice
Recall without reading.

A user should be able to collapse every topic after Layer 1.

---

# 16. Add a “Why Should I Care?” Relevance Meter

Do not use pseudo-prediction.

Show a transparent editorial score.

## Suggested priority score

```text
priority_score =
0.25 * syllabus_fit +
0.20 * primary_source_weight +
0.20 * pyq_proximity +
0.15 * anchor_recurrence +
0.10 * conceptual_depth +
0.10 * recency
```

Each component 0–100.

Convert to:
- 80–100 → Must Know
- 60–79 → Useful
- 40–59 → Background
- <40 → Skip / archive only

### Important
This is **study priority**, not probability of appearing in the exam.

Label this everywhere.

---

# 17. Strengthen Pattern Atlas Integration

Pattern Atlas should become the static backbone of the product.

For each anchor page:

```text
Anchor: Fiscal federalism

Static core
Common UPSC verbs
Typical traps
Answer skeleton
PYQ themes
Current triggers this month
Current triggers this year
Related reports
Related judgments
Related schemes
Revision status
Weakness score
```

Current-affairs cards should link into anchor pages.

Anchor pages should link back to current triggers.

This creates a real knowledge graph instead of isolated articles.

---

# 18. “Repeated This Week” Should Become a Signal

The current homepage already has “Anchors that repeated this week.”

Make it prominent.

Example:

## Themes gaining weight this week

```text
Fiscal federalism · 4 triggers
AI governance · 3 triggers
Indian Ocean security · 3 triggers
Urban flooding · 2 triggers
```

Clicking an anchor should show:
- why it repeated,
- all triggers,
- what was actually new,
- one merged revision note.

Do **not** make the learner read four repetitive articles on the same concept.

---

# 19. Merge Repetitive News into “Evolving Stories”

Create a `story_cluster_id`.

Examples:
- India–China relations
- Data protection
- Monetary policy
- Delimitation
- Climate finance
- Semiconductor policy
- Space programme

An evolving story page should include:
- one static explainer,
- chronological updates,
- “what changed since last update,”
- current status,
- open questions,
- PYQ bridge.

This solves current-affairs repetition.

---

# 20. Daily Session Design

Create a guided flow.

## 15-minute Daily Session

### Minute 0–2
Scan top 3.

### Minute 2–9
Read 60-sec / 5-min layers.

### Minute 9–12
3 Prelims questions.

### Minute 12–14
Reconstruct one Mains skeleton.

### Minute 14–15
Save weak items.

At the end:

```text
Today complete
3 topics understood
3/4 MCQs correct
1 weak anchor added to revision
Next recall: tomorrow
```

No login should be required initially.

Store progress locally.

Optional account sync can be a later feature.

---

# 21. Catch-Up Mode

The biggest current-affairs anxiety is missing days.

Turn the existing 7-day feature into a proper recovery product.

## 7-day Catch Up

Instead of 7 daily pages:

```text
This week in 25 minutes

7 Must Know
11 Useful
38 discarded

Most repeated anchors
1. Fiscal federalism
2. AI regulation
3. India–Indian Ocean

Prelims fact pack
15 facts

Mains pack
5 debates

Test
10 MCQs
2 skeletons
```

## 30-day Catch Up

Same logic:
- merge duplicates,
- retain only durable developments,
- show trendlines,
- create one monthly test.

---

# 22. Revision Engine

Keep the existing recall idea and make it central.

Recommended intervals:
- Same day: optional quick recall
- Day 1
- Day 3
- Day 7
- Day 21
- Day 60

For high-volatility factual items, expire or revalidate before resurfacing.

## Revision modes

### Recognition
MCQ.

### Retrieval
Cloze.

### Reconstruction
10-second Mains skeleton.

### Discrimination
Prelims trap.

### Connection
“What static anchor does this event belong to?”

### Update
“What changed since you last revised this topic?”

This last mode is especially valuable for current affairs.

---

# 23. Weakness Dashboard

Do not show vanity metrics like total articles read.

Show:
- Due today
- Weak anchors
- Repeated MCQ trap types
- GS papers neglected
- Topics saved but never revised
- Mains directive verbs user struggles with
- Stale facts requiring revalidation

Example:

```text
Weak this week
Federalism       2 misses
Environment      1 miss
International orgs 3 “only” qualifier errors

Directive weakness
Critically examine → weak
Discuss → secure
```

---

# 24. Prelims Quiz Improvements

The current statement-MCQ direction is good.

Add:
- trap taxonomy,
- confidence-before-answer,
- explanation-first review,
- source link,
- “why other options are wrong,”
- related anchor,
- next recall date.

## Trap taxonomy

- absolute qualifier
- only / all / necessarily
- constitutional vs statutory
- ministry mismatch
- location mismatch
- chronology
- number/date
- membership
- report publisher
- scheme funding
- legal exception
- similar institution confusion

After 20 questions:

```text
Your errors are not random.
62% come from institution/status confusion.
```

That is much more useful than a score.

---

# 25. Mains Practice Improvements

The current Mains drills have a strong base.

Add:

## Step 1 — Directive decoding
Before writing:
- Discuss
- Examine
- Critically examine
- Evaluate
- Comment
- Analyse

Show in one line what the directive demands.

## Step 2 — 60-second skeleton
User must outline before seeing model dimensions.

## Step 3 — Dimension comparison
Show:
- expected core dimensions,
- optional enrichment,
- irrelevant tangents.

## Step 4 — Evidence
Ask user to add:
- one article/judgment,
- one example/data point.

## Step 5 — Self-check

Checklist:
- answered the directive?
- defined scope?
- balanced?
- used evidence?
- concluded from analysis?

Avoid full AI-written 250-word answers as the default.
The product should train construction, not encourage passive reading.

---

# 26. Mind Maps — Use Interactive Concept Maps, Not Decorative Images

Both benchmark sites expose mind maps.

UPSC Today should implement them as structured HTML/SVG or graph data.

Example:

```text
Fiscal federalism
├── Constitutional basis
│   ├── Articles
│   └── Finance Commission
├── Revenue
│   ├── Tax sharing
│   ├── Grants
│   └── Cesses
├── Institutions
│   ├── Finance Commission
│   └── GST Council
├── Tensions
│   ├── vertical imbalance
│   └── horizontal imbalance
└── Current triggers
```

Benefits:
- searchable,
- accessible,
- mobile friendly,
- clickable,
- reusable in revision,
- not dependent on generated images.

---

# 27. Add Causal Chains and Timelines

Many UPSC topics are easier to remember as causality.

## Causal chain component

```text
Oil price shock
→ import bill rises
→ inflation pressure
→ subsidy burden
→ fiscal pressure
→ policy trade-off
```

## Timeline component

```text
1950 → institution created
1992 → constitutional amendment
2017 → policy reform
2024 → court judgment
2026 → current trigger
```

Use structured visual components instead of paragraphs.

---

# 28. Editorials — Convert Opinion into Debate Maps

Do not merely summarize newspaper editorials.

For an editorial topic:

## Claim
What is the author arguing?

## Evidence
What supports the claim?

## Assumptions
What must be true for the argument to hold?

## Counter-view
What would a serious critic say?

## Constitutional / policy constraints
What limits both positions?

## UPSC use
Which Mains dimensions can be safely used?

## Do not reproduce
Do not copy newspaper prose.

The goal is to teach **argument structure**, not recreate the editorial.

---

# 29. Source Policy — Make Trust Visible

A free site can beat larger sites by being more transparent.

## Source hierarchy

### Tier 1 — Controlling / primary
- UPSC
- Constitution / statute / rules / Gazette
- Supreme Court / High Courts
- Parliament
- Ministry / department
- regulator
- constitutional body

### Tier 2 — Primary institutional data
- RBI
- CAG
- NITI Aayog
- NSO
- Election Commission
- Finance Commission
- UN agencies
- World Bank / IMF where directly relevant
- official reports and datasets

### Tier 3 — High-quality secondary reporting
Use for:
- context,
- controversy,
- reactions,
- interpretation.

### Tier 4 — Coaching / tertiary
Use only to benchmark coverage or discover a topic.
Never use as the final factual authority when a primary source is available.

---

# 30. Source Strip on Every Topic

At bottom of Topic Packet:

```text
Sources
✓ Gazette / Ministry — primary
✓ RBI report — primary
○ Indian Express — context
○ The Hindu — debate

Verified facts: 12
Opinion statements: 3
Open/contested: 1
Last checked: 22 Aug 2026
```

Link claims to sources where practical.

---

# 31. Confidence Labels

Every derived item should have:

- `verified`
- `provisional`
- `contested`
- `opinion`
- `stale_recheck_required`

Never allow the interface to make an editorial inference look like an official fact.

---

# 32. “What Changed?” Versioning

For recurring stories, save version history.

Example:

```text
Topic: Data Protection

Last revised: 03 Jun
New on 22 Aug:
+ Rule X notified
+ Ministry Y assigned
- Previous draft provision removed
```

The revision engine should show the **delta**, not repeat the whole article.

---

# 33. Avoid an “AI-Generated” Feel

Editorial rules:

1. No generic opening paragraph.
2. No repeated “significance / challenges / way forward” unless logically needed.
3. No six bullets that say the same thing differently.
4. Prefer concrete nouns and institutions.
5. Every statistic must include source + date.
6. Separate fact from interpretation.
7. Never manufacture balance where evidence is one-sided.
8. Use short sentences for factual explanation.
9. Use tables only for genuine comparison.
10. Use diagrams for systems and causality.
11. If a fact cannot be verified, exclude it or label it provisional.
12. Do not create “UPSC relevance” merely because a topic is trending.

---

# 34. Better Search

Search should understand UPSC intent.

A search for:

`federalism`

should return:

```text
STATIC ANCHORS
Fiscal federalism
Cooperative federalism
Inter-state relations

CURRENT TRIGGERS
Finance Commission update
GST Council dispute
Governor-state issue

PYQ THEMES
5 Mains
4 Prelims

PRACTICE
8 MCQs
3 Mains drills
```

Filters:
- Prelims / Mains
- GS paper
- subject
- year/month
- source
- content type
- static anchor
- priority
- reviewed only
- saved / weak / due

---

# 35. Subject Pages

Do not make subject pages simple article feeds.

Example `/upsc/topics/polity`

## Polity dashboard
- high-priority anchors
- current triggers this week
- most asked PYQ themes
- schemes / bills / judgments in motion
- due revision
- latest Prelims traps
- Mains debates
- recommended next anchor

---

# 36. Government Schemes Hub

Add a free, structured scheme database.

Filters:
- ministry
- sector
- beneficiary
- Central Sector / CSS
- active / closed / merged
- GS paper
- current update

Comparison mode:

```text
PM-X vs PM-Y
objective
beneficiary
funding
implementer
coverage
latest status
```

This is excellent for Prelims.

---

# 37. Institutions Hub

High value for both Prelims and Mains.

Categories:
- constitutional
- statutory
- executive
- regulatory
- judicial
- international

Each institution card should include status and common confusion.

Example:

```text
CARA
Statutory
Ministry: Women & Child Development
Core law: JJ Act
Trap: not a constitutional body
```

---

# 38. Reports & Indices Hub

Store structured metadata:

```json
{
  "title": "...",
  "publisher": "...",
  "frequency": "annual",
  "measures": ["..."],
  "methodology_summary": "...",
  "india_finding": "...",
  "latest_edition": "...",
  "related_anchors": ["..."],
  "confused_with": ["..."]
}
```

Add comparison:
- HDI vs MPI
- WEO vs Global Financial Stability Report
- NFHS vs PLFS vs HCES

---

# 39. Maps Hub

Useful categories:
- Places in news
- straits
- seas
- rivers
- passes
- protected areas
- Ramsar sites
- biosphere reserves
- conflict zones
- trade corridors

Map questions should become revision items.

Example:
“Which water body connects X and Y?”
“Place these from west to east.”

---

# 40. History Integration

Do not isolate history from current affairs.

Whenever a current issue has historical depth, add:

## Historical anchor
- origin
- key turning point
- continuity
- what changed
- why the history matters to the present issue

Example trigger types:
- anniversaries,
- constitutional debates,
- freedom movement references,
- cultural heritage,
- boundary disputes,
- institutions with colonial origin,
- social reform.

Add chronology quizzes for history-heavy anchors.

---

# 41. Monthly Dossier — Web First, PDF Optional

Benchmark sites rely heavily on monthly compilations.

UPSC Today should generate a cleaner version automatically from canonical Topic Packets.

## Monthly dossier

### Part 1 — 20 Must Know
### Part 2 — Prelims fact bank
### Part 3 — 10 Mains debates
### Part 4 — Schemes / reports / bills / judgments
### Part 5 — Maps
### Part 6 — Historical links
### Part 7 — PYQ connections
### Part 8 — 50-question test
### Part 9 — Weak-anchor review

Offer:
- web mode,
- print mode,
- Markdown download.

PDF can be added later.

---

# 42. Content Pipeline / Agent Architecture

Recommended pipeline:

```text
1. INGEST
2. NORMALIZE
3. DEDUPLICATE
4. CLASSIFY
5. MAP TO SYLLABUS
6. MAP TO STATIC ANCHOR
7. PRIORITIZE
8. EXTRACT CLAIMS
9. VERIFY
10. BUILD TOPIC PACKET
11. GENERATE PRACTICE
12. HUMAN / RULE REVIEW
13. PUBLISH
14. SCHEDULE REVISION
15. UPDATE STORY CLUSTER
```

---

# 43. Ingestion

Prefer official sources.

Potential source categories:
- UPSC
- PIB
- ministries
- Parliament
- PRS for legislative context
- RBI
- CAG
- ECI
- Supreme Court
- NITI
- NSO/MoSPI
- SEBI
- IRDAI
- TRAI
- ISRO
- DRDO
- IMD
- Ministry of Environment
- UN / IMF / World Bank / WHO / WTO etc.

Secondary press can be used to detect debates or surface developments, followed by primary-source verification.

---

# 44. Deduplication

Use:
- normalized title,
- named entities,
- event date,
- semantic similarity,
- static anchor,
- story cluster.

Merge items when they describe the same underlying development.

Do not publish:
- PIB version,
- ministry version,
- newspaper version,
as three separate topics.

---

# 45. Syllabus Mapping

Every Topic Packet must map to:
- stage,
- paper,
- syllabus code,
- subject,
- anchor.

Allow max 3 primary syllabus codes.
Avoid tagging everything to everything.

Suggested object:

```json
{
  "stage": ["PRELIMS", "MAINS"],
  "papers": ["GS2"],
  "syllabus_codes": ["GS2.2"],
  "subjects": ["Polity", "Federalism"],
  "anchor_ids": ["fiscal-federalism"]
}
```

---

# 46. Verification Gate

A topic should not publish as “reviewed” until:

- title reflects the actual development;
- date verified;
- primary source exists where expected;
- institutions/status verified;
- laws/articles verified;
- quantitative facts have source/year;
- current status checked;
- old versions are not presented as current;
- opinion is labeled;
- Mains framing is analytically defensible;
- MCQ answers are derivable from cited facts.

If any critical condition fails:
`status = held_for_verification`

The current site already has a concept of notes held for verification; make it a formal pipeline state.

---

# 47. Recommended Data Model

```json
{
  "id": "topic-slug",
  "title": "Human-readable title",
  "date": "2026-08-22",
  "status": "reviewed",
  "priority": "must_know",
  "priority_score": 86,
  "content_type": "REPORT_OR_INDEX",

  "stage": ["PRELIMS", "MAINS"],
  "papers": ["GS2", "GS3"],
  "syllabus_codes": ["GS2.2", "GS3.1"],
  "subjects": ["Federalism", "Economy"],

  "trigger": {
    "type": "REPORT",
    "summary": "What happened in 1–2 sentences"
  },

  "anchors": [
    {
      "id": "fiscal-federalism",
      "relationship": "primary"
    }
  ],

  "layers": {
    "scan": {
      "why_upsc": "One sentence",
      "remember": ["Fact 1", "Fact 2", "Fact 3"]
    },
    "brief": {
      "static_anchor": "...",
      "what_changed": "...",
      "how_it_works": ["...", "..."],
      "dimensions": [
        {
          "label": "Federal",
          "points": ["...", "..."]
        }
      ]
    },
    "deep_dive": {
      "background": "...",
      "timeline": [],
      "stakeholders": [],
      "arguments": [],
      "counterarguments": [],
      "way_forward": []
    }
  },

  "prelims": {
    "facts": [],
    "traps": [],
    "confusing_pairs": [],
    "numbers": [],
    "map_points": []
  },

  "mains": {
    "skeleton": [],
    "evidence": [],
    "counter_view": [],
    "questions": []
  },

  "pyq_links": [
    {
      "year": 2023,
      "paper": "GS2",
      "type": "adjacent",
      "theme": "Centre-State relations",
      "why_linked": "Tests the same static anchor"
    }
  ],

  "story_cluster_id": "fiscal-federalism-2026",

  "sources": [
    {
      "publisher": "Primary institution",
      "url": "https://...",
      "tier": 1,
      "accessed": "2026-08-22"
    }
  ],

  "claims": [
    {
      "text": "...",
      "status": "verified",
      "source_ids": ["..."]
    }
  ],

  "revision": {
    "eligible": true,
    "fact_expiry": null
  },

  "updated_at": "2026-08-22T00:00:00Z"
}
```

---

# 48. Practice Objects Should Be Derived

Do not store disconnected quiz content.

MCQ example schema:

```json
{
  "topic_id": "topic-slug",
  "anchor_id": "fiscal-federalism",
  "type": "statement",
  "trap_type": "constitutional_vs_statutory",
  "question": "...",
  "statements": ["...", "..."],
  "options": ["..."],
  "answer": "...",
  "explanation": "...",
  "source_claim_ids": ["claim-4", "claim-9"]
}
```

Mains drill:

```json
{
  "topic_id": "topic-slug",
  "anchor_id": "fiscal-federalism",
  "paper": "GS2",
  "marks": 15,
  "directive": "critically examine",
  "scope": "...",
  "question": "...",
  "expected_dimensions": ["...", "...", "..."]
}
```

---

# 49. Routes

Suggested:

```text
/upsc
/upsc/catch-up
/upsc/topics
/upsc/topics/:subject
/upsc/topic/:slug
/upsc/anchors/:slug
/upsc/patterns
/upsc/practice
/upsc/practice/prelims
/upsc/practice/mains
/upsc/revision
/upsc/schemes
/upsc/institutions
/upsc/reports
/upsc/maps
/upsc/sources
/upsc/archive
```

Backward-compatible redirects can preserve current routes.

---

# 50. Homepage Component Order

Recommended desktop/mobile order:

1. Today hero
2. 15-minute session CTA
3. Must Know
4. Due revision
5. Repeated anchors this week
6. Prelims quick test
7. Mains skeleton of the day
8. Useful / background topics
9. Source status
10. Archive

Do not show:
- giant filter panels,
- empty states,
- internal tooling,
above the primary daily flow.

---

# 51. UI Components

Build reusable components:

- `PriorityBadge`
- `PaperBadge`
- `SyllabusChip`
- `AnchorChip`
- `SourceTrustBadge`
- `ReadTime`
- `TopicCard`
- `LayerSwitcher`
- `RememberCard`
- `PrelimsVault`
- `MainsKit`
- `PYQBridge`
- `DebateMatrix`
- `CausalChain`
- `Timeline`
- `MapCard`
- `InstitutionCard`
- `SchemeCard`
- `ReportCard`
- `StoryDelta`
- `RecallButton`
- `ConfidenceLabel`
- `SourceStrip`
- `PracticeResult`
- `WeaknessPanel`

---

# 52. Visual Direction

Avoid a “coaching portal” aesthetic.

Recommended feel:
- editorial,
- calm,
- high information density only on demand,
- excellent typography,
- strong whitespace,
- low visual noise.

Use color functionally:
- GS paper tag
- priority
- verified/provisional state
- revision due/secure

Avoid:
- gradient-heavy AI UI,
- too many icon boxes,
- giant dashboard cards,
- celebratory gamification.

The site should feel closer to:
**a serious digital notebook + newspaper explainer + revision engine**.

---

# 53. Mobile-First Rules

Most study sessions will happen on phones.

Requirements:
- 60-second layer fully readable without horizontal scrolling.
- Tables collapse into comparison cards.
- Sticky bottom actions:
  - Save
  - Test
  - Revisit
- Anchor/PYQ chips horizontally scroll only if necessary.
- Deep dive headings become collapsible.
- Keep line length comfortable.
- No sidebars on mobile.
- Topic progress preserved locally.

---

# 54. Read-Time as a Product Constraint

Every generated section should have a word/time budget.

Suggested:

| Layer | Target |
|---|---:|
| Scan | 40–70 words |
| 60 sec | 120–180 words |
| 5 min | 500–800 words |
| Deep dive | 1,200–2,000 only when justified |
| Prelims vault | ≤ 10 facts |
| Mains skeleton | 4–6 nodes |
| Revision card | ≤ 90 sec |

If the generated content exceeds the budget, the pipeline should compress it automatically.

---

# 55. “No Waste” Rules

The product should actively protect learner time.

1. Maximum 3 Must Know items/day unless there is exceptional news.
2. Merge similar items.
3. Hide low-priority articles by default.
4. Mark repeated facts as “already known.”
5. Do not restate the full static theory on every update.
6. Show only the delta for evolving stories.
7. Expire stale statistics.
8. One canonical explanation per static concept.
9. One click from current event to static anchor.
10. One click from static anchor to practice.

---

# 56. SEO Without Content Bloat

Each canonical Topic Packet can still be indexable.

Recommended page structure:
- clear title
- concise meta description
- date updated
- GS / subject metadata
- static anchor
- source transparency
- structured FAQ only when questions genuinely exist
- canonical URL
- OpenGraph summary

Do not generate hundreds of near-duplicate SEO pages.

Evergreen anchor pages should become the strongest indexed assets.

---

# 57. Accessibility

- semantic headings,
- keyboard navigation,
- focus states,
- sufficient contrast,
- no information communicated only by color,
- accessible diagrams,
- table labels,
- readable font scale,
- reduced motion support,
- print-friendly mode.

---

# 58. Privacy / Free-Site Architecture

The current product can remain useful without accounts.

Use local storage / IndexedDB for:
- saved topics,
- revision schedule,
- quiz history,
- weak anchors,
- stage preference,
- next paper date,
- UI preferences.

Optional future sync:
- anonymous export/import JSON,
- later account sync if needed.

Do not gate core learning behind registration.

---

# 59. Analytics — Measure Learning, Not Addiction

If analytics are used, prioritize:
- % users finishing 15-minute session,
- topics expanded from 60-sec to 5-min,
- quiz retry rate,
- revision completion,
- weak-anchor improvement,
- catch-up completion,
- search queries with no result.

Avoid optimizing:
- endless scrolling,
- session length for its own sake,
- notifications that create anxiety.

---

# 60. P0 — Highest-Impact Build

Implement first.

## P0.1 Topic Packet
Create the canonical schema and rendering page.

## P0.2 60-sec / 5-min / Deep-dive toggle
Progressive disclosure.

## P0.3 Static anchor bridge
Every topic maps to Pattern Atlas.

## P0.4 PYQ bridge
Link themes to official UPSC papers.

## P0.5 Prelims Vault
Facts + traps + quick MCQ.

## P0.6 Mains Kit
Skeleton + dimensions + question.

## P0.7 Today priority stack
Must Know / Useful / Background / Skip.

## P0.8 Revision action
Save to Day 1 / 3 / 7 / 21 / 60 queue.

## P0.9 Source strip
Visible trust + last reviewed.

## P0.10 7-day merged catch-up
Collapse repeated stories.

---

# 61. P1 — Strong Differentiators

- Evolving story clusters.
- Topic timelines.
- Causal chain component.
- Interactive mind maps.
- Scheme database.
- Institution database.
- Reports/indices database.
- Maps hub.
- Weakness dashboard.
- Monthly dossier.
- “New to topic / Revision mode.”
- Directive-verb coaching.
- Confidence-before-answer quiz.
- Versioned “what changed” view.

---

# 62. P2 — Advanced

- Personalized study session based on weak anchors.
- Automatic source monitoring.
- Topic-delta notifications.
- Optional cloud sync.
- Outline evaluator.
- Voice recall mode.
- Offline/PWA.
- Cross-device progress.
- User-created Topic Packets.
- Export to Anki-compatible format.
- “Ask this topic” grounded only in stored sources.

---

# 63. What Not to Build Yet

Avoid:
- generic chatbot on every page,
- AI-generated full Mains answers as the main feature,
- social feed,
- comments,
- paid-course funnels,
- streak obsession,
- news notifications for every event,
- huge PDF library,
- duplicate article variants,
- complex profile system,
- random “probability of UPSC question” scores.

These dilute the core value proposition.

---

# 64. Quality Bar / Acceptance Criteria

A topic is successful only if a learner can:

### After 60 seconds
Explain:
- what happened,
- why it matters,
- the static anchor.

### After 5 minutes
Explain:
- mechanism,
- key dimensions,
- core facts,
- one debate.

### After 15 minutes
Build:
- a defensible 10/15-mark outline.

### After practice
Identify:
- at least one Prelims trap,
- one PYQ relationship.

### After revision
Recall:
- the anchor without rereading the article.

---

# 65. Editorial Acceptance Checklist

Before publish:

- [ ] Is this genuinely relevant to the UPSC syllabus?
- [ ] Is the static anchor identified?
- [ ] Is the trigger distinct from the static theory?
- [ ] Are primary sources used where available?
- [ ] Are facts separated from opinion?
- [ ] Are all numbers dated and sourced?
- [ ] Is there any stale information?
- [ ] Can the 60-second layer stand alone?
- [ ] Is the Mains angle analytical rather than generic?
- [ ] Is the Prelims section selective?
- [ ] Is the PYQ relationship real and explained?
- [ ] Are duplicate stories merged?
- [ ] Does the topic deserve Must Know / Useful / Background / Skip?
- [ ] Is the revision object generated?
- [ ] Can an aspirant act on the page without opening another site?

---

# 66. Sample Topic Page Wireframe

```text
┌─────────────────────────────────────────────────────┐
│ GS2 · Polity · 5 min          MUST KNOW             │
│ Fiscal Federalism: [current trigger title]          │
│ Static anchor: Fiscal federalism                    │
│ Source: Primary verified · updated 22 Aug           │
└─────────────────────────────────────────────────────┘

[60 sec] [5 min] [Deep dive]

WHAT HAPPENED
Two sentences.

WHY UPSC CARES
• Federal relations
• Finance Commission
• Fiscal autonomy

REMEMBER
1. ...
2. ...
3. ...

[Save] [Test me] [Revisit]

───────────────────────────────────────────────────────
STATIC ↔ CURRENT
Current trigger → Fiscal federalism → PYQ themes

HOW IT WORKS
[causal / institutional diagram]

WHAT CHANGED
Before | Now | Still unresolved

DEBATE
State autonomy | tension | national fiscal coordination

───────────────────────────────────────────────────────
PRELIMS VAULT
5 facts
2 traps
1 confusing pair
[Answer 3 MCQs]

───────────────────────────────────────────────────────
MAINS KIT
10-second skeleton
4 dimensions
2 evidence points
1 counter-view
[12-minute question]

───────────────────────────────────────────────────────
PYQ BRIDGE
2023 GS2 — adjacent
2019 GS2 — direct
2017 Prelims — related concept

───────────────────────────────────────────────────────
SOURCES
Primary source
Official report
Context article
Last verified
```

---

# 67. Migration of Current Features

## Current “Official sources”
Keep, but move it into:
- Sources page
- source drawer inside each Topic Packet

Do not make raw source records the first thing most users see.

## Current “Write a note yourself”
Keep.
Pre-fill:
- title
- static anchor
- syllabus code
when opened from a Topic Packet.

## Current Markdown export
Keep and expand:
- topic packet
- weekly catch-up
- revision queue
- monthly dossier

## Current Revisit Today
Promote into primary nav and homepage due-card.

## Current Mains drills
Integrate with Topic Packet and anchor pages.

## Current Prelims quiz
Integrate with Topic Packet and weakness tracking.

## Pattern Atlas
Promote as the static knowledge backbone.

---

# 68. Product Copy Suggestions

Replace generic labels.

### Instead of
“Latest articles”

Use:
**Worth your time today**

### Instead of
“Current affairs”

Use:
**Current triggers**

### Instead of
“Read more”

Use:
**Understand in 5 min**

### Instead of
“Deep dive”

Could use:
**Master the topic**

### Instead of
“Save”

Use:
**Add to revision**

### Instead of
“Quiz”

Use:
**Test recall**

### Instead of
“Related posts”

Use:
**Connect the syllabus**

---

# 69. Positioning Copy

Possible hero:

> **UPSC Today**
> Current affairs reduced to what the exam can actually use.

Sub-line:

> Understand the issue, connect it to the syllabus, test yourself, and see it again before you forget it.

Alternate:

> **Read less. Understand the static. Recall more.**

Avoid:
- “AI-powered UPSC”
- “revolutionary”
- “ultimate”
- “one-stop solution”
- “100% comprehensive”

The product should prove its value through structure.

---

# 70. Cursor / Coding-Agent Implementation Brief

Use the following as the top-level implementation instruction:

## Goal

Refactor the current UPSC Today experience into a source-first UPSC learning system where every important current-affairs item is a canonical Topic Packet connected to a static Pattern Atlas anchor, PYQ themes, Prelims practice, Mains practice and spaced revision.

## Non-negotiables

1. Preserve current UPSC data and Pattern Atlas.
2. Preserve existing local revision state where possible.
3. No paywall or login requirement.
4. Progressive disclosure:
   - Scan
   - 60 sec
   - 5 min
   - Deep dive
5. Every Topic Packet requires:
   - syllabus mapping,
   - static anchor,
   - priority,
   - source status,
   - Prelims Vault,
   - Mains Kit,
   - PYQ bridge.
6. Avoid duplicating content across pages.
7. Practice objects must reference source topic/claims.
8. Mobile first.
9. Accessible semantic HTML.
10. Do not add a generic chatbot.
11. Avoid AI-looking filler content.
12. Do not claim exam prediction.
13. Study-priority scores must be explained.
14. Use primary sources as factual authority.
15. Low-priority news must be allowed to remain unpublished or marked Skip.

## First implementation sequence

### Sprint 1
- create Topic Packet schema;
- render one fixture;
- add LayerSwitcher;
- add source status;
- map to Pattern Atlas.

### Sprint 2
- implement Today priority list;
- implement Prelims Vault;
- implement Mains Kit;
- implement PYQ bridge.

### Sprint 3
- integrate revision queue;
- add 7-day merged catch-up;
- add weak-anchor tracking.

### Sprint 4
- add story clusters;
- add timelines / causal chains;
- add monthly dossier.

---

# 71. Benchmark References Reviewed

The feature recommendations above were informed by publicly available structures and pages from:

- InsightsIAS current affairs: `https://www.insightsonindia.com/current-affairs-upsc/`
- InsightsIAS home/free initiatives: `https://www.insightsonindia.com/`
- InsightsIAS mind maps and PYQ resources.
- Drishti IAS current affairs/news/editorials: `https://www.drishtiias.com/current-affairs-news-analysis-editorials`
- Drishti IAS Daily Current Affairs Quiz.
- Drishti IAS To The Point.
- Drishti IAS Mind Map.
- Drishti Specials including reports, institutions and learning through maps.
- UPSC official examination and previous-question-paper pages.
- Current `https://sumanthbolle.com/upsc`
- Current Revisit Today, Mains drills, Prelims quiz and Pattern Atlas pages.
- Current `data/upsc-patterns.json`.

These sites should be treated as **product benchmarks**, not as content sources to reproduce.

---

# 72. Final Product Principle

The core question for every feature should be:

> **Does this help the aspirant understand, retrieve or apply something that matters to the exam in less time?**

If yes, build it.

If it only increases the amount of content visible on the site, do not.

The strongest version of UPSC Today is not the largest current-affairs site.

It is the site that lets a serious aspirant say:

> “I know what I need to read today, I understand where it fits, I have tested it, and I know when I will see it again.”
