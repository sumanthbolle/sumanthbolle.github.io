# UPSC Today: editorial benchmark and improvement plan

Prepared and updated 12 October 2026. Includes the benchmark, improvement plan and implementation status for the review branch.

## Direction

Build a publication that makes a difficult idea understandable in a few minutes, gives the reader the exact evidence behind it, and helps them apply it later. The strongest starting point is already in your ServiceNow writing: a recognisable problem, an explanation of the mechanism, a worked situation, and the mistake to avoid.

Retain the UPSC site's paper colours, green accent and editorial typography. Invest first in the quality of each explanation and the quietness of the reader. More headings, cards and daily articles will not by themselves improve learning.

## Evidence and limits

| Evidence | What this review can establish |
| --- | --- |
| Repository `origin/main` and review branch `improve/upsc-source-reading`, baseline commit `1cbff4054d120f117e7ff98ad26c411b7af07501`, plus the subsequent implementation diff | Actual article text, source links, rendering, publication rules and the difference between existing and proposed work. |
| Local Chromium at 390 × 844 and 1440 × 1000 | The current branch's reader presentation at those sizes. These are local observations, not production measurements. |
| Five Pocket explainers and four selected ServiceNow articles from `data/posts.json` | Specific writing strengths, repeated patterns and opportunities for deeper explanation. |
| [Existing benchmark specification](upsc-today-enhancement-spec.md), dated 22 August 2026 | Previously recorded InsightsIAS and Drishti packaging patterns. It is historical research, not a new inspection of their articles. |
| CivilsDaily, InsightsIAS, Drishti and the deployed blog | Access was initially blocked. After the environment update, the homepages and the article samples listed below returned HTTP 200 and their downloaded text/HTML was reviewed. |

The requested website access now works through curl. Additional primary-source domains and `api.github.com` were saved additively in the configuration draft. Draft persistence alone does not prove those later additions are active.

The fresh comparison covers article prose and HTML structure. Remote Chromium navigation failed certificate validation in this environment; TLS verification was retained. Current competitor screenshots and interactive mobile behaviour were therefore not established. Local Chromium checks establish this branch's visual and interaction behaviour separately.

The review branch is also not proof of deployment. Its worked examples, richer reader and dynamic-feed implementation must not be described as already live on `sumanthbolle.com`.

## What the competitors can teach us

| Site | Available evidence about framing and presentation | Useful direction for your blog | Further inspection required |
| --- | --- | --- | --- |
| **CivilsDaily** | Three current samples use a specific news lead, question headings, brief labelled bullets, consequences, challenges, a closing judgement and attached practice/PYQ material. The voice is explanatory and occasionally conversational; analogies and explicit misconceptions make institutional processes approachable. | Borrow the question → mechanism → consequence sequence and the attention to what a development does not establish. Keep the short explanations; avoid repeating a takeaway under every section and again in the conclusion. | Validate live mobile layout and the provenance of any facts/PYQs before using them as learning material. |
| **InsightsIAS** | The HPV and Election Commission samples open with source/subject/context, then densely labelled facts and features. The longer UAPA sample adds history, legal provisions, successes/failures, reforms and answer-writing practice. The tone is formal and assertive. Many visual subheadings use bold paragraphs rather than semantic heading elements. | Borrow clear topic organisation and fast scanning. Use proper heading levels, fewer bold fragments and paragraphs that connect facts causally. | Validate current mobile presentation and primary-document access; some sampled source links lead to newspaper reporting. |
| **Drishti IAS** | The sampled daily page uses tags, explicit Prelims/Mains framing, Why in News, question headings, definitions, measures, conclusions, FAQs and PYQs. The nuclear editorial develops applications → barriers → measures at much greater length. The tone is formal and reference-oriented; the editorial opening uses broader promotional language. | Borrow relevance and progressive depth, while keeping the Pocket article's explanation visible before optional reference material. | Validate live mobile layout and reduce duplication when adopting summary/FAQ/practice patterns. |
| **Your UPSC blog** | Five short explainers use schools, loans, rainwater, legal commencement and bread prices. The branch adds illustrations, comparisons and revealable answers. | Make everyday explanation and precise primary evidence the publication's identity. | Establish whether the first real incoming news articles meet that standard after deployment. |

The fresh samples support a useful balance: exam organisation helps discovery; a concrete explanation helps understanding. Use their organisation where it helps the learner, and write an original explanation rather than reproducing their text or forcing every issue through the same eight headings.

### Matched-topic comparison: CERVAVAC

CivilsDaily devotes a section to the meaning of WHO prequalification, how it is obtained, what it enables and its limits. It then connects the institutional distinction to procurement and programme choices. InsightsIAS supplies a shorter inventory of vaccine identity, strains, features and significance. The first helps a reader explain a mechanism; the second helps a reader scan a fact sheet.

For your blog, combine a short identity block with an explained distinction and an application question. Trace any current claim to WHO or another relevant primary document rather than treating either coaching article as factual authority. This benchmark assesses their framing; it does not authenticate their reported figures or PYQ labels.

The local site already has Pattern Atlas, revision and practice. Connecting a good article to those tools is more useful than adding another parallel content product or PDF archive.

## Your writing: what works and what needs more depth

At baseline, the five Pocket bodies had three sections, six paragraphs and 221–246 whitespace-separated words, excluding titles, decks, source annotations and learning aids. The revised bodies have roughly 260–275 words, with useful illustrations, comparisons and applied answers in addition. Displayed reading time includes more than the body; these counts are not competitor comparisons.

| Article | Strongest feature | Next editorial improvement |
| --- | --- | --- |
| **Who decides how tax money reaches the states?** | School funding makes fiscal federalism tangible; vertical and horizontal sharing are distinguished. | Carry one numerical situation through the explanation, including the denominator trap. Link the exact constitutional provision and, when discussing a real award, the relevant dated recommendation and implementation evidence. |
| **The repo rate changed. Why hasn't your loan?** | It separates policy rates, contractual benchmarks and reset timing. | Distinguish an evergreen explanation from a dated rate decision. If reporting a decision, identify the exact statement, effective date and applicable lending guidance. Follow one borrower through the reset instead of repeating the definition in several formats. |
| **A wetland is more than a place on a list** | It shifts attention from memorising names to water flows, ecology and pressures. | Add one documented site case with a dated Ramsar Information Sheet and evidence of the pressure being discussed. Preserve the difference between a hypothetical road example and an observed ecological change. |
| **A Bill passed. Is the new rule in force?** | Passage, assent and commencement are explained as separate stages. | Walk through a real Act and its commencement notification when verified. Show the relevant sections and date; distinguish the legal position from a general analogy. |
| **When GDP grows, how much is just higher prices?** | Bread prices introduce nominal versus real measures without jargon. | Link an exact national-accounts release and identify period, price basis and revision status when using actual data. State what the illustration simplifies; a fixed basket example is not a full national-accounts calculation. |

The main weakness is repetition rather than incomprehensibility. The distinction, comparison table, takeaway and exam advice can repeat the same point. Use one of those spaces for a consequence, a boundary case or a misconception that the reader has not already encountered.

Institutional landing pages are useful further reading, but they make verification laborious. The branch's source annotations improve navigation; exact documents and claim-level references remain the next step. A recognised official host does not by itself verify a claim.

### What to borrow from your ServiceNow articles

The sample was deliberate rather than a review of all 52 articles:

- **Now SDK and Fluent, article 97:** starts with two development paths, explains the mechanism, demonstrates it, compares choices and identifies gotchas. Borrow the path from question to decision and its specific official references.
- **CSDM outage walkthrough, article 93:** follows one outage through server, application and business-service consequences. Borrow the sustained scenario; use it to connect a UPSC concept to its practical effect.
- **Conditions and Query Building, article 92:** explains the same underlying query through different representations and a comparison. Borrow that method for distinctions such as policy rate/benchmark/borrower rate or nominal/real measures.
- **Client Scripts Freezing Browsers, article 68:** opens with a recognisable failure and connects diagnosis to corrective action. Borrow the problem–mechanism–consequence sequence.

These articles vary in quality. First-person experience, precise impact percentages and “production-tested” assurances should appear only when substantiated. Conversational authority should come from a clear explanation, not an invented personal story.

## Editorial standard for the next articles

### Three reading depths, one underlying topic

| Format | Reader's purpose | Editorial shape |
| --- | --- | --- |
| **Latest update** | Understand the new development quickly. | A concise, dated account of what changed, who announced it and what is still uncertain, linked to the exact source. Around 80–150 words when sufficient. |
| **Pocket read** | Understand one important mechanism and apply it. | Usually 350–550 words across the explanation and useful learning aids; one sustained example, two or three meaningful facts, one distinction or limitation and an applied question. Shorter is fine when it resolves the question. |
| **Go deeper** | Examine law, data, debate or exam application. | Optional primary documents, a useful chart/map/timeline, a real PYQ with explanation, or a Mains exercise. Do not make this material compulsory reading. |

These are guides, not padding quotas or automatic read-time promises. A news update can arrive once its own checks pass; a deeper explanation must satisfy the stronger editorial and factual requirements. Keep source-only records in the existing source archive rather than presenting them as completed Pocket articles.

### Write an explanation, not a template

1. **Start with the precise change or a recognisable situation.** News needs an actor, event and date. Evergreen articles can start with the everyday puzzle they answer.
2. **Explain the mechanism.** Show the links in the chain and define technical terms at the point of use.
3. **Add evidence that changes understanding.** Choose a dated figure, legal condition, institutional role or documented case. Identify period, unit, denominator and scope where relevant.
4. **Resolve one likely mistake.** Explain why two similar concepts differ or where an otherwise useful analogy stops working.
5. **Ask the reader to apply it.** Reveal a reasoned answer, including why a tempting alternative fails.

Use headings that convey the point of that particular article: “The next reset date matters” is stronger than a universal “Significance”. Some stories need a timeline; others need a map, legal extract or two-column comparison. Choose the form after identifying the question.

### Tone

Use short, direct sentences, concrete institutions and active verbs. Expand unfamiliar abbreviations once. Vary the opening and sentence rhythm naturally. Explain a trade-off only when evidence supports the competing effects.

Cut ceremonial language such as “in today's rapidly evolving landscape”, unsupported superlatives, generic conclusions and repeated “For Prelims / For Mains” instructions. Keep a small syllabus/practice link where it is useful rather than reciting exam advice throughout the article.

A human reading experience comes from selection, specificity and judgement. Do not add a human byline, personal experience or “editor reviewed” label unless it is true. Automated source checking and human review remain distinct statuses.

### Evidence visible at the point of use

Important claims should open the document that supports them, not just an organisation's homepage. A compact source reference should identify document title, issuer, publication date and the relevant section, table or paragraph. Separate supporting evidence from optional further reading.

For laws, check assent, commencement and the applicable provision. For data, include the reporting period, basis and whether it is provisional or revised. For environmental sites, check the record's date. For current monetary decisions, link the actual statement. Label hypothetical numbers where the example appears.

If a document cannot be retrieved or the evidence does not support a stronger statement, keep the narrower claim or hold the article. A short verified explanation is preferable to a complete-looking unsupported one.

### Example: make an existing good explanation more useful

**Two tax shares that sound alike**

> Imagine a divisible tax pool of ₹100. Suppose the states collectively receive ₹40, and State A receives ₹6. These figures are illustrative.
>
> Vertical sharing decides the ₹40 that goes to the states together. Horizontal sharing divides that amount among individual states. State A therefore receives 15% of the states' pool, but 6% of the original pool. Both percentages can be correct: their denominators differ.
>
> Now suppose the states' pool rises to ₹50 while State A still receives ₹6. Its share of the states' pool falls to 12%, although the rupee amount is unchanged.
>
> **Check your understanding:** If a headline says a state's “share fell”, what two things must you establish before concluding that its funding fell?
>
> **Answer:** Which pool the percentage refers to, and the actual amount received. Compare the same period and basis before drawing a conclusion.

Attach the verified constitutional text, including Article 280(3)(a), for the distinction between Union–state distribution and allocation among states. This example explains a concept; it makes no claim about a current Finance Commission award or a particular state's finances.

## Improve incoming news before increasing volume

At baseline, the news formatter took the original release title, repeated `whyInNews` in the deck and opening section, then added fixed sections. Its question came from a fact cloze. The implementation now supports a source-checked `pocketRead` object with a factual headline, distinct deck, descriptive prose sections, optional illustrative example and applied question/answer. Older checked notes retain a shorter fallback without repeating the deck as the first paragraph.

At inspection, there were **3,283 source records, zero enriched-note JSON files and zero published Pocket news articles** in the checkout. That demonstrates an archive, not the quality or operation of a live Pocket publication.

The next editorial changes should be:

- Write a shorter, source-supported headline while preserving the original release title in the source reference. Check the new headline as a claim.
- Give the deck and opening different jobs. The deck states the useful question or consequence; the opening establishes the actual development.
- Select evidence rather than pasting a list of facts. Explain how each fact connects to the concept.
- Support an applied question with a reasoned answer, not only a missing-word recall task. Examples and comparisons should be optional and useful.
- Preserve source/note binding and verify the exact published additions. A verified upstream note is not automatically verification of a subsequently rewritten headline, example or answer.
- Keep short factual updates and developed explainers distinguishable. Do not delay every passed update until tomorrow's curated edition.

The dynamic publication path, five-minute ingestion schedule, per-note release and 30-second visible-page checks are already implemented on the branch. Activation and live-provider validation remain pending. Do not promise instantaneous delivery: GitHub scheduling, the three-record processing batch, verification, backlog and KV propagation can add delay. Measure discovery-to-publication latency under real load before making a freshness promise; review backlog handling if that target is missed.

The separate approved evergreen queue has a daily schedule and is initially empty. It does not cap current news at one article per day.

## Make the presentation quieter and more responsive

### Retain the visual identity

Keep Newsreader for article prose, Public Sans for controls, warm backgrounds and restrained green. The branch already has a 660px reading measure, 20px desktop and 19px mobile body text, generous line spacing and optional larger text. Responsive shared styles, whole-row article links and the original blank-body repair are existing work, not proposed replacements.

### Reduce the space before the body

At baseline, the first prose paragraph began at approximately **681px on a 390 × 844 phone** and **579px on a 1440 × 1000 desktop**, after direct-link scrolling. An update row overlapped the first title line. After the compact-header changes, the first paragraph began at approximately **491px on the phone** and **496px on desktop**. These are local observations, not production or Core Web Vitals measurements.

Use a compact article header with a clear back link, title, short deck and quiet date/source metadata. Keep full tabs and search on the library; provide access from the article without making their expanded controls consume the reading area. Place Ask Summaverick and text-size options in a small accessible tool area.

Keep correction and withdrawal warnings prominent. Routine refresh status should be quieter. Recalculate the article's scroll clearance when a sticky update row appears or changes height so it cannot cover the title. Account for mobile keyboards and the actual visible viewport.

A useful design target is for meaningful article prose to begin within the initial direct-link viewport on a 390 × 844 phone, including representative long titles. Verify this rather than achieving it by shrinking text.

### Organise the library around reading

Show a small selection of three to five recommended reads, then a clearly accessible continuously updating latest stream. This is a presentation choice, not a daily publishing cap. Keep evergreen fundamentals visible in their own shelf so a busy news day does not bury them.

Use subject, title, concise deck, honest date and calculated reading time. Avoid decorative gradients, excessive boxed panels, internal verification totals and repetitive slogans. Do not restore “Must Know / Useful / discarded” aggregate counts or explanatory masthead taglines that the owner already asked to remove.

Reuse the existing Topics, Catch up, Sources and Revision tools. Give all article types the same prose measure, spacing and source treatment, while retaining the different evidence available for source briefs and developed notes. Do not offer an empty deep dive.

## Connect reading to existing study tools

At the end of a Pocket article, offer one applied recall question, then an optional real PYQ or Mains task. A PYQ must show paper, year, exact question provenance and why the connection is useful. Newly written questions must be labelled practice. Save the concept and its source to the existing revision store without replacing the user's notes.

Ask Summaverick already captures article context and has source-reading work on the branch. Finish deployment and verify it against real documents before describing direct retrieval as live. Useful actions are:

- “Explain this step”: clarify a specific mechanism in the current article.
- “Check this claim”: open and cite the actual supporting document, with its date and limits.
- “Test my understanding”: ask one applied question, wait for the learner's answer, then explain the result with evidence.

Keep downloaded source evidence distinguishable from a provider's citation list. If retrieval fails or a PDF is not supported, say so and offer the actual source link. Never make the widget a substitute for an intelligible article.

## Priorities and completion criteria

| Priority | Work | Completion evidence |
| --- | --- | --- |
| **P0 — trust and access** | Apply research-domain access; complete the live benchmark sample. Activate and validate the already-built publication/source-reading path through the existing deployment process. Investigate the observed title overlap. | Accessible benchmark URLs recorded; a real source → checked note → public feed → visible article traced with timestamps; real widget retrieval verified; title remains readable as update status changes. |
| **P1 — editorial pilot** | Refine the five evergreen articles and produce five source-supported news examples across polity, economy, environment, governance and science/IR as suitable verified stories become available. Establish exact citations and applied questions. | Ten articles read as explanations rather than repeated templates. Each important claim is traceable; illustrations and practice are labelled honestly. Compare the same topics with competitor samples before finalising voice. |
| **P2 — reader and library** | Compact article chrome; separate recommended reads, latest updates and fundamentals; carry the shared layout through Must Know and subpages. | Representative articles checked at 320, 390, 768 and 1440px, light/dark, long titles, long source links, keyboard-open and corrected/withdrawn states. No horizontal page overflow or hidden body; native navigation and focus work. |
| **P3 — recall and depth** | Connect articles to the existing revision, Pattern Atlas and verified PYQs. Add source-based widget practice. | A learner can read, answer, inspect evidence and save a concept without losing their place or existing notes. |
| **Later — distribution** | Consider crawlable canonical Pocket pages and an optional weekly consolidation using the same topic data. | Useful for sharing/search without duplicating or contradicting the canonical article. No new CMS or framework is needed solely for this plan. |

The first implementation should be the editorial pilot and compact reader, rather than another broad dashboard redesign. Activation work is a prerequisite already identified in the branch, not a reason to reimplement the feed.

### How to judge whether it is better

Use the same topic and task when comparing sites. Ask a small group of learners to explain the mechanism, answer an applied question and locate the supporting source. Compare accuracy, time and what they remember later. Do not use page length or a subjective “9/10” as proof of superiority.

Acceptance targets:

- After 60 seconds, the reader can state the question or development and its underlying concept.
- After the Pocket read, they can explain the causal chain, identify one common mistake and answer one application question.
- A supporting primary document is reachable in at most two actions from the relevant claim.
- Controls retain at least 44px touch targets, visible keyboard focus and sufficient text contrast. Motion respects reduced-motion preferences.
- Navigation, body visibility, loading/error states, history and saved revision state remain reliable.
- Track Core Web Vitals against LCP ≤ 2.5s, INP ≤ 200ms and CLS ≤ 0.1. These are targets, not measurements from this review.
- Feed latency and retrieval success are measured in production before making public performance claims.

## Implementation status

Completed on the review branch:

- Rewritten five evergreen bodies, shorter decks, sustained hypothetical examples and applied answers; original IDs and publication dates preserved.
- Section source links and existing document-reading locators, plus links to relevant existing Pattern Atlas concepts. Most evergreen URLs still lead to institutional indexes; exact document links remain an editorial follow-up.
- A native Browse disclosure on Pocket article pages; full navigation/search remains available, including the `/` shortcut. Other subpages retain their usual navigation.
- Compact metadata and title/deck spacing, quiet routine refresh status, and prominent correction/withdrawal warnings. Measured navigation and warning heights determine scroll clearance; fixed-nav space remains reserved without the masthead.
- Recommended, latest and fundamentals shelves with every article represented once. Search covers the full edition. Recommendations follow existing article order rather than claiming human curation.
- Pocket news prose included in complete-note verification and its content hash, with original release titles retained in references. Practice and illustrations cannot be edited after checking without invalidating publication eligibility.
- A direct understanding-check action opens Summaverick with article/source context and waits for a learner response. Stale practice changes trigger the same correction hold as stale article facts.

No news articles were invented to fill the ten-article pilot. The five developed news examples still require actual verified sources and a working publication path. After PR #184 merged and Cloudflare's native builds succeeded, a real source request downloaded the RBI MPC resolution and answered its meeting dates/rate decision consistently with the document. That exact dated release is now linked from the repo-rate explainer, with a separate factual example and clearly hypothetical loan figures. This establishes one live retrieval check, not blanket answer accuracy.

The public feed still reported `Pocket feed storage is not configured`. A narrow follow-up declares the KV binding for Wrangler's supported automatic provisioning and makes manual deployments preserve the actual active namespace. A real verified news item must pass through the private publisher before the feed can be described as live. See [deployment status](upsc-pocket-publishing.md).

## Fresh benchmark references and remaining visual review

Downloaded successfully on 12 October 2026, alongside all three homepages and the live UPSC page:

- CivilsDaily: [RTI implementation gaps](https://www.civilsdaily.com/news/the-gaps-in-the-implementation-of-the-rti-act/), [CERVAVAC prequalification](https://www.civilsdaily.com/news/who-prequalifies-serum-institutes-quadrivalent-hpv-vaccine-cervavac/), [hospital bills](https://www.civilsdaily.com/news/whats-inflating-your-hospital-bill/).
- InsightsIAS: [12 October daily edition](https://www.insightsonindia.com/2026/10/12/upesc-current-affairs-12-october-2026/), [CERVAVAC](https://www.insightsonindia.com/2026/10/12/cervavac-indias-first-indigenous-hpv-vaccine-receives-who-prequalification/), [Election Commission](https://www.insightsonindia.com/2026/10/12/election-commission-of-india-evolution-and-constitutional-powers/), [UAPA reform](https://www.insightsonindia.com/2026/10/12/why-uapa-demands-urgent-reform/).
- Drishti: [12 October daily analysis](https://www.drishtiias.com/current-affairs-news-analysis-editorials/news-analysis/12-10-2026), including separation of powers, and [12 October editorial](https://www.drishtiias.com/current-affairs-news-analysis-editorials/news-editorials/12-10-2026), covering nuclear energy.

The CivilsDaily samples were approximately 770–850 words including learning aids; the InsightsIAS HPV sample was about 324 words and its UAPA sample about 1,156. Its daily edition was about 5,200 words across topics. Drishti's separation-of-powers topic was about 1,460 words and the nuclear editorial about 3,288. Counts use extracted article-content text and are approximate, not reading-time or quality scores. A short concept article should not inherit the length of a full daily edition or reference editorial.

The remaining research is visual and interactive: inspect current mobile article views with a browser that trusts the environment's normal certificate chain. Do not disable certificate verification to obtain screenshots. Include the matched HPV pair already read.

Record exact URLs and access dates. For every article, examine the headline's promise, the first two paragraphs, explanation of the mechanism, evidence and dating, paragraph/heading density, treatment of uncertainty, transitions, examples, practice and source access. Compare tone from actual passages, with only short attributed quotations when needed. Separate article prose from advertisements and navigation when counting words.

On phones, inspect how soon prose appears, how tools and promotions affect reading, table overflow, source-link targets, sticky bars, keyboard behaviour and back navigation. A cached text result can support a prose review but cannot establish a current visual layout.

Update the visual comparison before claiming a complete mobile audit of CivilsDaily, InsightsIAS and Drishti.

## Local references

- [Pocket article data](../data/upsc-pocket-reads.json)
- [ServiceNow articles](../data/posts.json)
- [Pocket news projection](../scripts/upsc/pocket_feed.py)
- [Reader renderer](../assets/js/upsc/reading.js) and [shared reading CSS](../assets/css/upsc-reading.css)
- [Reading work already implemented](upsc-reading-review.md)
- [Publication and deployment status](upsc-pocket-publishing.md)
- [Existing previews and fixture qualifications](upsc-preview/README.md)
- [Flagship product constraints](upsc-today-flagship.md)
