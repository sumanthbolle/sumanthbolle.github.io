# UPSC reading review and editorial direction

Reviewed 10 October 2026 against the local checkout. The live domain was inaccessible through the environment proxy, so the deployed page was not verified. Design references: the repository's gstack visual hierarchy and accessibility rubric, UI/UX Pro Max editorial guidance, and ponytail's preference for native HTML and small implementations.

## What needed changing

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

The existing GitHub Actions schedules still refresh official records. They do **not** author or publish new Pocket reads automatically. Add original articles to `data/upsc-pocket-reads.json`, placing the latest first. The file is outside the generated `data/upsc/` publication tree so the official-source publisher will not overwrite it.

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
