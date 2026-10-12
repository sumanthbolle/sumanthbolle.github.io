# UPSC reading review and editorial direction

Reviewed 10 October 2026 against the local checkout. The live domain was inaccessible through the environment proxy, so the deployed page was not verified. Design references: the repository's gstack visual hierarchy and accessibility rubric, UI/UX Pro Max editorial guidance, and ponytail's preference for native HTML and small implementations.

## What needed changing

Update on 12 October: fresh text/HTML samples from CivilsDaily, InsightsIAS and Drishti became accessible. The [benchmark and implementation record](upsc-editorial-benchmark-plan.md) records exact URLs, writing comparisons and remaining visual-review limits.

The five evergreen bodies now develop sustained illustrations and practical misconceptions, with applied answers, section source links and relevant Pattern Atlas links. Stable IDs and original dates remain intact. Most source URLs still lead to institutional indexes with document locators, rather than exact retrieved documents.

Pocket articles now use a native Browse disclosure, compact metadata and shorter decks. Fixed-nav flow space is preserved without the large masthead. Routine feed status stays in the page; correction warnings alone are sticky and included in measured scroll clearance. The `/` shortcut opens Browse and focuses search. Library shelves contain recommendations, remaining latest updates and remaining fundamentals without duplicate articles.

In the local 390 × 844 Finance Commission check, the first body paragraph moved from approximately 681px to 491px after direct-link scrolling, retaining 19px prose. This is a local layout observation. A direct understanding-check action opens the source-aware widget; real provider retrieval still requires deployment validation.

- The first reading flow repeated topics as priority cards, a lead article and subject-grouped official updates.
- A floating assistant interrupted the publication and made the page feel like a tool.
- Source-only records offered five-minute explainers and deep dives despite having no published exam notes. Many summaries repeated their headlines.
- Long sections could be hidden by scroll-reveal styling. Mobile sources contained text that could exceed the viewport.
- ServiceNow articles provide a better writing model: a concrete situation, a plain explanation, practical distinctions and source links.

## The new reading experience

Pocket reads lead the page. Five initial explainers cover the Finance Commission, monetary transmission, wetlands, legislative commencement and GDP. They are evergreen articles of roughly 300 words, with displayed reading times calculated from their content. They have their own URLs, dates, sources, a takeaway, and a question. They do not claim human authorship or independent editorial review.

The existing daily official-update feed remains separate and keeps its original sources. The Study desk is collapsed initially; revision, practice, search and the complete source archive remain available. Source-only study records offer a brief and a direct source link rather than an empty explainer. No existing publication data or revision storage keys were replaced.

The page uses warm neutrals, one green accent, a narrow article measure, Newsreader for prose and Public Sans for navigation. Fonts are self-hosted from Fontsource 5.3.0 and retain their licenses in `assets/fonts/`. Shared study-page code and navigation remain in place; no framework or runtime dependency was added.

## Publishing a daily pocket article

The existing official-source schedules refresh records rather than authoring Pocket reads. The separate daily Pocket workflow now releases one approved queued article around 07:00 Singapore time; it does not generate or approve text. Its initial queue is empty. See [daily Pocket publishing and source research](upsc-pocket-publishing.md) for the approval workflow and activation requirements. The library remains outside the generated `data/upsc/` tree.

Aim for one useful article per day, 250–400 words:

1. Choose one syllabus concept or one documented development.
2. Begin with a concrete situation or a direct question.
3. Explain the mechanism in two or three short sections.
4. End with one takeaway and one recall question.
5. Link the specific official document supporting the article wherever available. Check its current legal or factual status before publication.

Use a stable `id`, an honest `publishedOn` date, `subject`, `paper`, `anchor`, and syllabus `codes` from the mapping in `api/upsc.js`. Each section has a `heading` and plain-text `paragraphs`. Keep `excerpt` to one or two sentences; `sources` contain a descriptive label and an HTTPS URL. Text is escaped when rendered.

Do not add a daily date to an unchanged evergreen article. Do not promise a read duration longer than the content supports, exam predictions, fabricated question links, or a human byline for automated work. Remove process terms such as “generated,” “topper note,” “packet” and “retrieval” from ordinary article copy. Use them only where they explain an actual study function.

## Validation

### Article-body repair

The first reading release depended on `AnchorRender.safeHttpUrl`, a new export from an existing, unversioned script. A browser retaining the earlier renderer could build the article library but fail while building an article's source links. The library had already been hidden, leaving an empty reader. This failure was reproduced with the older renderer interface in Chromium.

The reader validates its source URLs locally and builds article HTML before changing visibility. UPSC script and stylesheet URLs now include a coordinated cache version, which should be updated when shipping changes to these assets. Direct links focus and scroll to the article title after loading. Pocket reads and Study desk articles share the reading measure, heading sizes and mobile spacing.

The browser regression checks compare every rendered paragraph to the article data and verify visibility across mobile, tablet and desktop widths, including dark mode and the older renderer interface. They also check the extensionless `/upsc?article=...` route used by the production site. The local static server serves this route through a test interception; the deployed domain remains inaccessible from the environment.

Run `node scripts/test-upsc-reading.js` and the existing UPSC JavaScript checks. The new reading check is included in the publisher's CI workflow. Publisher fixtures run with `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/upsc -p 'test_*.py'`.

Browser checks should cover article links and reloads, back/forward navigation, keyboard focus, search and no-result states, saving and duplicate saves, existing revision notes, retry after an article-fetch failure, light/dark themes, and all tabs on narrow screens. New takeaways reuse the existing local revision store and do not silently mark themselves as verified.

With Playwright available and the static server running, `python3 scripts/test-upsc-reading-browser.py` checks search reset, article routes, focus, history and saving. Pass a different server origin as its first argument if needed.

### Topic navigation and responsive subpages

The Pocket read arrows were decorative spans outside the title links. Each article row now contains one native link around its title, excerpt and arrow, with its accessible name taken from the title. Arrow taps and keyboard Enter open the complete article; Ctrl-click and middle-click retain native new-tab behavior. Arrows remain visible on small screens.

All seven interactive UPSC pages load the shared reading stylesheet and local fonts. Tabs, subject links, filters and form controls wrap within the viewport, buttons and disclosures have a 44px minimum height, and long references can break without widening the page. Standalone guide, revision, Mains, quiz and review pages initialize their mobile navigation, existing theme controls and saved theme. Published archive pages stay JavaScript-free and follow the device colour preference.

The reader's scroll offset follows the measured sticky navigation height instead of fixed desktop/mobile constants. The generated note template shares the 660px reading width and uses safe margins for answer-use panels. Its data and publication eligibility rules are unchanged.

`python3 scripts/test-upsc-responsive-browser.py` checks eight UPSC routes at 320, 390, 768 and 1440px, light/dark themes, theme buttons, every Pocket read arrow, title clearance, all desk tabs, the note editor and Atlas drill. It also exercises the held-note renderer with long IDs and the real publication template with a populated answer panel; these fixtures are intercepted in the test browser and are never published.

### Rich reading and source questions

The original explanations now include clearly illustrative worked situations, two-column comparisons and revealable recall answers. Source annotations identify the legal article, report section or dated release to read; institutional landing pages remain labelled as further reading. Publication dates are retained, with an honest update date for these additions. Larger text is an optional local preference.

Ask Summaverick opens from the article rather than a floating control on the reading-room homepage. Each request captures the current article and its sources; article navigation clears history, cancels outstanding requests and closes the panel. Source-reading and understanding-check prompts use live research. The panel adjusts to the visible viewport, restores focus when closed, and separates directly downloaded documents from the research provider's citation list.

The Worker update downloads bounded allowlisted source text and preserves operators and Unicode in document content. Source data is not an instruction or proof that every claim is correct. PDFs and unavailable pages are reported honestly. Its dry-run bundle and request/retrieval tests passed; deploying this update requires Cloudflare access. Browser widget checks use deterministic responses and are not live-provider validation.

### Dynamic Pocket news

Pocket news now comes from current source-bound notes that pass the updated complete-note verification contract, literal-source facts, syllabus mapping and a substantive reading-content gate. Each passed note reaches the private Worker feed before the next record or archive build. The approved evergreen queue remains separate and does not limit news to one item daily.

The library checks every 30 seconds while visible and refreshes without reloading the page. An open article keeps its content and position until additions are loaded. Corrections or withdrawals trigger a sticky notice immediately, abort the widget work and disable stale save/ask actions. Canonical content hashes prevent false updates caused by JSON key ordering or fallback switching. Source outages preserve the last good snapshot with an honest date.

The new source schedule is every five minutes, with manual and trusted dispatch triggers. GitHub scheduling, a busy publisher, model verification and KV propagation can add latency; this is not a zero-latency source push stream. Deployment automation attaches persistent storage and synchronizes private publisher authentication. Credential values are still absent, so production deployment and live-provider verification remain outstanding. See [Pocket publishing and deployment](upsc-pocket-publishing.md).
