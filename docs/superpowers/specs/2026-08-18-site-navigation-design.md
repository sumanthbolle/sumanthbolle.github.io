# Site navigation consolidation

**Status:** Approved direction, pending implementation-plan review

**Date:** 2026-08-18

## Purpose

Consolidate the site into a small, predictable navigation without changing page content or behavior. ServiceNow, Blog, Interviews, and UPSC become learning destinations under **Learn**. SkyFare, Metals, and Save Yourself remain decision utilities under **Tools**.

This is a navigation-only release. The broader Decision Desk page redesign remains documented separately and is not part of this implementation.

## Scope

The release may change only:

- the primary desktop navigation markup in pages that already use the shared dropdown;
- the corresponding mobile navigation markup;
- `assets/css/nav-utilities.css`;
- `assets/js/shared/nav-utilities.js`;
- navigation-specific validation or test scripts.

The existing shared asset filenames remain unchanged to avoid editing page loading behavior or introducing a migration unrelated to navigation.

The release must not change:

- homepage hero, About, statistics, certifications, previews, or contact content;
- page headings, mastheads, forms, calculators, articles, questions, results, or footers;
- metadata, structured data, content JSON, APIs, storage, service workers, workflows, or data refresh behavior;
- page-specific JavaScript or CSS outside the primary navigation;
- existing URLs.

## Pages in scope

The following 13 pages already use the shared dropdown assets and receive the same navigation structure:

- `index.html`
- `servicenow.html`
- `blog.html`
- `interviews.html`
- `tutorials.html`
- `quiz.html`
- `technical-terms-quiz.html`
- `upsc.html`
- `upsc-patterns.html`
- `flights.html`
- `metals.html`
- `save-yourself.html`
- `summaverick.html`

No other page is added to scope solely to make the navigation universal.

## Information architecture

The brand remains the Home link. The desktop navigation contains four visible destinations:

`Learn · Tools · Summaverick · About`

- **Learn** is a disclosure.
- **Tools** is a disclosure.
- **Summaverick** is a direct link to `summaverick.html`.
- **About** links to `#about` on the homepage and `index.html#about` elsewhere.
- Contact remains available in the existing homepage content; it is not moved or rewritten in this release.

### Learn disclosure

The Learn disclosure contains exactly:

1. **ServiceNow Central** — `servicenow.html`
2. **Articles & Tutorials** — `blog.html`
3. **Interview Prep** — `interviews.html`
4. **UPSC Today** — `upsc.html`

Existing internal navigation continues to expose Tutorials, quizzes, and Pattern Atlas. They are modes or supporting resources within a learning destination, not additional global-navigation entries.

The Learn trigger is active on:

- `servicenow.html`
- `blog.html`
- `interviews.html`
- `tutorials.html`
- `quiz.html`
- `technical-terms-quiz.html`
- `upsc.html`
- `upsc-patterns.html`

The current destination link receives `aria-current="page"` only when that exact destination appears in the disclosure. Supporting pages such as `tutorials.html` activate Learn without incorrectly marking Articles & Tutorials as the current page.

### Tools disclosure

The Tools disclosure contains exactly:

1. **SkyFare** — `flights.html`
2. **Metals** — `metals.html`
3. **Save Yourself** — `save-yourself.html`

The current page link receives `aria-current="page"`, and the Tools trigger is active on all three pages.

The product labels remain unchanged in this navigation-only release so navigation does not contradict the current page titles.

### Mobile order

The mobile navigation contains:

1. Home
2. Learn label and its four links
3. Tools label and its three links
4. Summaverick
5. About

There are no nested mobile disclosures. All destination links are visible when the existing mobile menu opens.

## Desktop disclosure behavior

Both disclosures use the same controller and interaction rules.

- Click toggles the selected disclosure.
- Opening one disclosure closes the other.
- Accurate hover pointers may open a disclosure on pointer entry.
- The trigger and panel have a continuous hit region with no dead space.
- Pointer exit starts a 180 ms close delay; re-entry cancels it.
- Clicking outside closes all disclosures.
- `Escape` closes an open disclosure and returns focus to its trigger.
- Tab follows normal document order through buttons and links.
- Focus leaving the disclosure closes it after the destination can receive activation.
- Triggers expose `aria-expanded` and `aria-controls`.
- Panels contain ordinary navigation links. `role="menu"` and `role="menuitem"` are removed because these are site links, not application-menu commands.
- Trigger targets are at least 44 CSS px high and show a visible keyboard-focus indicator.
- `prefers-reduced-motion` removes nonessential menu animation.

CSS `:hover` and `:focus-within` provide a basic fallback. JavaScript enhances reliable click, outside-click, timer, and Escape behavior.

## Visual treatment

Only the navigation is restyled.

- Retain each page's existing colour tokens so the navigation remains compatible with its current theme.
- Use one compact panel style for Learn and Tools.
- Use quiet borders, modest corners, and restrained shadow.
- Avoid large cards, promotional copy, icons, badges, and decorative effects inside the menus.
- Each item contains a short name and one factual description.
- Panels align within the viewport and do not cause horizontal scrolling at 320 CSS px.

No page-body token, typography, spacing, colour, card, or responsive rule is changed.

## Isolation from page behavior

The shared navigation controller must initialize defensively:

- It operates only on elements marked with `data-nav-drop`.
- Missing triggers or panels are skipped without throwing.
- Timer and event state is local to each disclosure.
- Initialization does not query, replace, or mutate page content outside the primary navigation.
- It does not register generic handlers for every link or button on the page.
- It does not redefine existing mobile-menu behavior in this release.
- A failure in navigation enhancement must not prevent later page scripts from running.

The homepage currently renders About, statistics, certifications, and content previews through an inline script. That architecture is not changed in this release. Regression verification must prove those containers still populate after the navigation changes.

## Non-breakage safeguards

### Change-boundary check

For each in-scope HTML file, compare the completed version with `origin/main` after removing the primary desktop and mobile navigation region. Any remaining difference is out of scope and must be reverted before release.

The only expected non-HTML differences are the two shared navigation assets and navigation-specific tests.

### Structural validation

An automated navigation validator checks all 13 pages for:

- the same four desktop destinations and mobile ordering;
- exactly one Learn disclosure and one Tools disclosure;
- unique `aria-controls` targets;
- correct Learn and Tools item sets;
- correct active-parent and `aria-current` states;
- no legacy Utilities, Anchor, or Pattern Atlas entries in global navigation;
- inclusion of the shared CSS and JavaScript exactly once;
- valid internal navigation URLs.

### Interaction tests

Tests cover:

- click toggle;
- mutual exclusion between Learn and Tools;
- pointer crossing from trigger to panel without closure;
- delayed close and cancellation;
- outside click;
- Escape and focus restoration;
- natural Tab order;
- missing-element initialization without an exception.

Timing behavior uses controllable timers rather than real waits.

### Page regression checks

Each in-scope page is loaded with uncaught JavaScript errors treated as failures. Verification confirms its primary existing feature still initializes:

- Homepage: About, statistics, certifications, blog preview, and interview preview are nonempty.
- ServiceNow: the hub and its content/search initialization remain present.
- Blog: article listing and existing tabs initialize.
- Interviews: question list initializes.
- Tutorials and quizzes: existing content and controls initialize.
- UPSC and Pattern Atlas: their current datasets and views initialize.
- SkyFare: search form remains usable.
- Metals: price and quote controls remain present.
- Save Yourself: calculator inputs and result initialization remain present.
- Summaverick: its existing query interface remains present.

Browser checks cover 375×812, 768×1024, 1024×768, and 1440×900, including keyboard-only navigation and an accurate-hover pointer.

## Acceptance criteria

- Global navigation displays only Learn, Tools, Summaverick, and About beside the Home brand.
- Learn groups ServiceNow Central, Articles & Tutorials, Interview Prep, and UPSC Today.
- Tools groups SkyFare, Metals, and Save Yourself.
- Tutorials, quizzes, and Pattern Atlas remain reachable through their existing internal navigation.
- The hover dead zone is eliminated, and both disclosures work by mouse, keyboard, and touch/click.
- Mobile navigation exposes the same destinations without nested disclosures.
- No existing URL changes.
- No content outside primary navigation changes.
- The HTML change-boundary check reports no differences outside navigation.
- All 13 pages load without new console errors and retain their existing primary behavior.
- The homepage About and preview sections remain populated.
