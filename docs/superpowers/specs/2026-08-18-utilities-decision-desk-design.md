# Decision Desk utilities redesign

**Status:** Proposed for implementation

**Date:** 2026-08-18

**Scope:** Shared navigation, the utilities information architecture, the utilities visual system, SkyFare, Metals, Loan Cost Checker, and the relationship between Utilities and UPSC.

## Product decision

The current Utilities collection will become **Decision Desk**: a small suite of trustworthy tools for decisions that are difficult to evaluate from raw numbers alone.

The user-facing navigation label will be **Tools** because it is shorter and clearer than “Utilities.” “Decision Desk” is the product promise and the title of the tools index, not another competing navigation label.

The suite has one north-star promise:

> Reach a trustworthy decision in under one minute.

### Product principles

1. **Outcome before feature count.** A new capability earns space only when it improves the primary decision.
2. **Credibility before cleverness.** Source, freshness, assumptions, and limitations are more valuable than persuasive language.
3. **Answer before explanation.** Show the conclusion first and let the visitor inspect the reasoning.
4. **Progressive disclosure.** Essential inputs and results stay visible; expert controls and detail open on demand.
5. **Privacy by default.** Keep personal financial and study inputs on the device unless an existing function requires transmission.
6. **Retention through utility.** Recent work, comparison, and revision create repeat value; streaks, prompts, and engagement tricks do not.

The suite will contain three products:

1. **SkyFare** — choose the best-value itinerary, not merely the cheapest ticket.
2. **Metal Quote Check** — decide whether a gold or silver quote is fair.
3. **Loan Cost Checker** — compare the real cost and affordability of borrowing offers.

UPSC Today is a learning publication, not a decision utility. It will move to the **Learn** section. Pattern Atlas will remain available at its existing URL but will be presented as a mode within UPSC Today rather than as a separate global product.

## Goals

- Fix the unreliable desktop dropdown and make the navigation dependable with mouse, keyboard, touch, and assistive technology.
- Give the three tools a coherent purpose, interaction model, trust model, and visual language.
- Put the primary user decision above secondary capabilities on every page.
- Reduce explanatory and AI-styled interface copy. The result, source, and next action should teach the user how the page works.
- Consolidate shared CSS and interaction behavior without rewriting the static site in a framework.
- Preserve existing URLs and the useful calculation, search, price, source, and UPSC content already present.
- Establish privacy-safe product measures so future changes can be judged by user outcomes.

## Non-goals

- Rebuilding the site in React, Vue, or another framework.
- Replacing the flight, metals, loan, or UPSC data pipelines.
- Adding accounts, cloud synchronization, payments, or a database.
- Claiming that a calculated result is financial advice, a guaranteed market price, or a guaranteed flight recommendation.
- Creating AI-generated explanations or conversational assistants.
- Expanding the suite with new tools before the three current tools meet the success criteria.

## Current gaps

### Navigation

The menu is separated from its trigger by an external top margin. Moving the pointer from the trigger into the menu crosses a dead area, and the current `mouseleave` handler closes the menu immediately. The trigger is also substantially smaller than an appropriate pointer target.

The current `role="menu"` and `role="menuitem"` semantics imply application-menu keyboard behavior that is not fully implemented. The links are navigation links and should use ordinary link semantics inside a disclosure.

### Product structure

- Five unrelated entries are presented as equal utilities.
- “Anchor,” “UPSC Today,” and “Pattern Atlas” compete as names for one learning product.
- Cross-links do not consistently list the same products.
- There is no tools index explaining the three decisions the suite helps a visitor make.
- Page introductions describe capabilities before giving the visitor something useful to do.

### Visual system

The current shared utility stylesheet provides a header and cross-link cards, but the individual pages still duplicate typography, tokens, navigation, forms, panels, and responsive behavior. This produces visible drift in spacing, density, colour, page width, and mobile behavior.

The redesign should feel authored and functional: no floating guides, decorative glows, oversized marketing introductions, excessive pills, ornamental cards, or instructions that restate visible controls.

## Information architecture

### Global navigation

The shared desktop navigation order will be:

`Home · ServiceNow · Blog · Learn · Tools · Summaverick · Contact`

- **Learn** links to `upsc.html`.
- **Tools** is a disclosure containing:
  - All tools — `utilities.html`
  - SkyFare — `flights.html`
  - Metal Quote Check — `metals.html`
  - Loan Cost Checker — `save-yourself.html`
- UPSC and Pattern Atlas will not appear in the Tools disclosure.
- The mobile menu will use the same order and labels.

The implementation will update pages that already contain the shared utility dropdown. It will not attempt a site-wide navigation rewrite of unrelated legacy pages in this change. A structural test will prevent the updated page set from drifting.

### URL compatibility

Existing URLs remain canonical:

- `flights.html`
- `metals.html`
- `save-yourself.html`
- `upsc.html`
- `upsc-patterns.html`

`utilities.html` is new. Renamed products change visible labels and metadata where appropriate, not their URLs. This avoids redirects and preserves existing bookmarks.

### UPSC internal navigation

UPSC becomes one learning product with an internal mode switch:

`Today · Subjects · Revision · Pattern Atlas · Sources`

`upsc-patterns.html` supplies the Pattern Atlas mode and links back into the other UPSC modes. Its header, metadata, and breadcrumb identify it as **UPSC · Pattern Atlas**. The floating Guide is removed; concise contextual help appears only beside the control or result it explains.

## Shared interaction architecture

### Tools disclosure

The navigation is a disclosure containing ordinary links, not an ARIA application menu.

- Click or tap toggles the disclosure on every device.
- On devices that support accurate hover, pointer entry may open it as an enhancement.
- The trigger and panel share a continuous hit area; there is no physical hover gap.
- Pointer exit starts a 180 ms close delay. Re-entry cancels the pending close.
- `Escape` closes the disclosure and restores focus to its trigger.
- Clicking outside closes it.
- Tab follows normal document order through the trigger and links.
- Opening one disclosure closes any other shared-nav disclosure.
- The trigger uses `aria-expanded` and `aria-controls`. The panel uses the `hidden` state when closed.
- The trigger has a minimum 44 px height and a clearly visible focus indicator.
- With JavaScript unavailable, the Tools label remains a normal link to `utilities.html`; the individual tools remain reachable from that page.

The behavior will live in a small shared controller rather than page-specific handlers. Timer state, focus restoration, and outside-click handling must be testable independently from page markup.

### Mobile navigation

- The existing mobile menu button remains the only top-level mobile disclosure trigger.
- Tools are displayed as a labelled group inside the expanded mobile navigation; there is no nested hover behavior.
- Targets are at least 44×44 CSS px with at least 8 px separation where controls sit side by side.
- Opening the mobile menu prevents background interaction, keeps focus within the open navigation, and returns focus when closed.

## Shared visual system

The direction is a restrained Swiss-editorial hybrid: strong grid, neutral canvas, compact functional controls, clear type hierarchy, and editorial typography only where long-form reading benefits from it.

### Foundations

- **UI type:** Public Sans or the existing equivalent sans-serif stack.
- **Editorial type:** Newsreader, restricted to UPSC article headlines, reading text, and occasional product titles.
- **Body text:** 16 px minimum, 1.5 line height.
- **Canvas:** warm neutral white; white elevated surfaces only when separation is necessary.
- **Primary action:** one consistent blue.
- **Semantic colours:** green for favourable, amber for caution, red for material risk. Every state also uses text or an icon; colour never carries meaning alone.
- **Borders:** quiet neutral rules instead of layered shadows.
- **Corners:** modest and consistent; controls and cards do not use unrelated radii.
- **Motion:** 120–200 ms for state feedback, with `prefers-reduced-motion` support. No ornamental scroll animation.
- **Layout:** mobile-first, a shared maximum content width, and a consistent spacing scale.

### Shared components

The three decision tools share:

- site navigation and mobile navigation;
- product masthead;
- labelled input fields and inline validation;
- primary and secondary buttons;
- decision summary;
- comparison rows;
- source/freshness/method strip;
- empty, loading, partial-data, stale-data, and error states;
- disclosure for advanced controls;
- recent local activity;
- related-tool links and footer.

UPSC shares the site navigation, tokens, focus behavior, and trust primitives but retains an editorial reading layout. It does not inherit calculator-style result cards.

### Page composition

Each decision tool follows the same reading order:

1. Compact product name and one-sentence purpose.
2. Essential inputs.
3. One primary action.
4. Primary answer.
5. Reasons and comparison.
6. Source, freshness, and method.
7. Optional advanced detail.
8. Related tools.

The first useful control must appear within the initial desktop viewport and near the top of the mobile page. Introductory copy is limited to one short sentence unless a legal or safety qualification is necessary.

### Copy rules

- Use concrete nouns and verbs: “Compare offers,” “Check this quote,” and “See best value.”
- State what the result means before explaining how the page calculated it.
- Do not use “AI-powered,” “smart,” “effortless,” “revolutionary,” “unlock,” or similar promotional language.
- Do not address the visitor as if an assistant is coaching them through visible navigation.
- Do not add welcome messages, motivational filler, fictional testimonials, or first-person interface narration.
- Keep helper text beside the field or result it clarifies. Do not create a separate guide for information that fits in context.
- Financial and price language remains factual and conditional; it does not tell a visitor what they must buy, borrow, or avoid.

## Tools index

`utilities.html` is a job-based index, not a marketing landing page.

Its heading is **Decision Desk** with the line “Three tools for decisions worth checking twice.” It presents three large text links:

- **Plan a trip** — compare the value of flight options.
- **Check a metal quote** — test price, purity, weight, and premium.
- **Compare a loan** — see the real cost before signing.

Each entry states the expected input and result in one sentence. A compact trust note explains that sources and calculation methods are shown with results and that entered values remain on the device unless an existing search API requires transmission. No testimonials, feature carousel, floating assistant, or generic productivity claims are included.

## Product flows

### SkyFare

**Core job:** choose the itinerary that offers the best trade-off, rather than search every possible travel preference at once.

The initial form contains origin, destination, dates, trip type, and travellers. Cabin and a single “More options” disclosure contain secondary filters. Search is visible without scrolling on common desktop viewports and remains easy to reach on mobile.

Results lead with a ranked recommendation:

- price;
- duration;
- stops;
- departure/arrival practicality;
- baggage or fare-detail certainty when available;
- Value Score and a short, deterministic explanation of the score.

The cheapest, fastest, and best-value alternatives are clearly labelled. Provider/source and retrieval time appear adjacent to results. Destination content is secondary and never delays or visually competes with the flight decision. The floating Guide is removed.

### Metal Quote Check

**Core job:** determine whether a dealer or jeweller quote is reasonable.

The first task is a quote check containing metal, purity, weight, quoted amount, currency, and optional making charges/taxes. The primary result states:

- reference metal value;
- included premium or discount;
- expected cost range based on the displayed assumptions;
- a plain status: competitive, review charges, or materially above reference.

Spot prices and recent movement remain available as context below the decision. Holdings, alerts, history, and seller information are secondary sections. Alerts are not promoted unless the existing implementation can reliably notify the user beyond the current browser session.

Every result names the price source, timestamp, currency conversion source when applicable, purity assumption, and whether taxes or making charges are included.

### Loan Cost Checker

**Core job:** compare borrowing offers using real cost and affordability.

The opening view supports one offer and provides an obvious “Add another offer” action for comparison of up to three. Each offer accepts amount received, repayment amount or rate, term, frequency, compulsory fees, and rate type when relevant.

The leading result shows:

- periodic payment;
- total repayment;
- total borrowing cost;
- effective annual cost when calculable;
- payment-to-income ratio when income is supplied;
- the least-cost offer and the trade-off that could make another offer preferable.

Repayment schedules and export remain available below the comparison. “Save first” projections and generic moralising advice are removed from the primary journey. Risk notices are factual, tied to entered data, and explain their calculation. The product title changes to **Loan Cost Checker**; the existing URL remains unchanged.

### UPSC Today and Pattern Atlas

UPSC retains its daily official-source publication, subject browsing, revision queue, and source desk. Pattern Atlas becomes the Patterns mode in the internal UPSC navigation.

Both pages remove the floating Guide and long navigation instructions. A reader lands directly on the lead topic or selected mode. Source identity, publication date, syllabus mapping, and revision actions remain visible where they support study decisions.

## Trust, data, and privacy

Every calculated or retrieved answer includes a compact trust strip containing the applicable fields:

- source name;
- retrieved or updated time;
- calculation method;
- assumptions;
- stale or partial-data warning.

Links go to the original provider or official source when available. The interface must distinguish reference data from the visitor’s entered quote or offer.

Financial inputs and locally saved comparisons remain in browser storage. Analytics must never include routes, loan values, income, dealer quotes, saved notes, or free-text input. Existing external APIs receive only the parameters required for their current function.

## Error and edge states

- Validation appears beside the affected field and describes how to fix it.
- A form never loses entered values after a recoverable error.
- When live data fails, the page identifies what is unavailable and whether a cached value is being shown.
- Stale prices and flight results display their timestamp before the user relies on them.
- A partial result remains usable when nonessential enrichment fails.
- Empty states suggest one specific next action instead of displaying generic help.
- Calculation errors do not silently fall back to invented values.
- Unsupported or incomparable loan structures are labelled as such rather than force-ranked.

## Accessibility requirements

- All functionality works without hover.
- Interactive targets are at least 44×44 CSS px.
- Keyboard focus is visible and is not obscured by sticky elements.
- Forms have persistent labels, associated error messages, and appropriate input modes.
- Result changes use a restrained live region; large result sections do not repeatedly interrupt screen readers.
- Heading order follows the visual hierarchy.
- Text contrast meets WCAG AA; semantic status never depends on colour alone.
- Motion respects `prefers-reduced-motion`.
- Pages support zoom to 200% and reflow without horizontal scrolling at 320 CSS px.

## Performance requirements

- The shared shell does not introduce a framework runtime or third-party UI library.
- Page-specific JavaScript loads only on the page that needs it.
- Existing large inline styles and scripts are split only where the redesign touches them; unrelated site files are not refactored.
- The tools index and shared navigation work before remote data finishes loading.
- Layout reserves space for asynchronous result regions to avoid major content shifts.
- Images below the initial viewport are lazy-loaded, and decorative media is removed when it does not support the decision.

## Measurement

The first release adds privacy-safe events with no input payloads:

- `tool_viewed`
- `tool_started`
- `result_received`
- `result_failed`
- `comparison_added`
- `source_opened`
- `result_exported`

The product measures:

- **Activation:** percentage of tool visits that reach a first result.
- **Time to answer:** median time from first interaction to result.
- **Decision completion:** percentage of results followed by comparison, source opening, or export.
- **Reliability:** failed and no-result rates by tool.
- **Retention:** anonymous 7-day and 30-day return rates when a privacy-safe analytics mechanism is available.

If no compliant analytics provider is already configured, the interface work ships without adding one; event hooks remain inert until a separate analytics decision is approved.

## Code boundaries

The implementation will converge on the following responsibilities:

- `assets/css/tool-tokens.css` — shared colour, type, spacing, radius, shadow, and motion tokens.
- `assets/css/site-nav.css` — global desktop/mobile navigation and disclosure presentation.
- `assets/css/tool-shell.css` — tool masthead, forms, results, trust strip, state panels, and related links.
- Page-specific stylesheets — only layouts or visuals unique to SkyFare, Metal Quote Check, Loan Cost Checker, or UPSC.
- `assets/js/shared/site-nav.js` — disclosure and mobile-navigation behavior.
- Page-specific modules — existing domain logic and rendering, without global-navigation responsibilities.

The exact migration may retain current filenames temporarily to keep commits reviewable. At completion, each shared responsibility has one authoritative implementation and pages do not redefine shared navigation or tool-shell rules inline.

## Testing strategy

### Automated behavior tests

- The disclosure stays open while the pointer crosses from trigger to panel.
- Delayed close is cancelled when the pointer re-enters.
- Click/tap toggles reliably on hover and non-hover devices.
- Escape closes and restores focus.
- Outside click closes.
- Tab order reaches every tool link without custom menu-key behavior.
- Mobile navigation opens, contains the correct three-tool group, and restores focus when closed.
- Updated pages contain the canonical navigation order and no legacy Anchor/Pattern Atlas entries under Tools.

Navigation logic should expose a small testable controller rather than requiring tests to inspect source text. Timing tests use controllable timers.

### Domain regression tests

Existing flight, metal, loan, and UPSC calculations/data parsing remain covered by their current validation scripts. New tests focus on the changed primary flows: quote composition, multi-offer comparison, result ranking, stale-data presentation, and Pattern Atlas integration links.

### Browser verification

The following viewports are checked on every redesigned page:

- 375×812
- 768×1024
- 1024×768
- 1440×900

Verification covers mouse, keyboard, touch-sized targets, 200% zoom, reduced motion, light/dark themes if retained, loading, errors, empty results, long currency values, and long source names.

## Delivery sequence

1. Repair and test shared navigation behavior.
2. Establish tokens, shared navigation, tool shell, and `utilities.html`.
3. Move UPSC out of Tools and integrate Pattern Atlas into UPSC navigation.
4. Redesign Metal Quote Check around quote fairness.
5. Redesign Loan Cost Checker around offer comparison.
6. Redesign SkyFare around a compact search and Value Score results.
7. Remove obsolete CSS, floating guides, inconsistent cross-links, and duplicated shared rules.
8. Complete responsive, accessibility, performance, and live-data verification.

Each step must leave the site deployable. Shared foundations land before page-specific redesigns so later work consumes the same components rather than recreating them.

## Acceptance criteria

- The Tools dropdown can be entered from its trigger without closing and remains fully operable by click, touch, keyboard, and screen reader.
- Tools contains exactly the index, SkyFare, Metal Quote Check, and Loan Cost Checker.
- UPSC is reached through Learn; Pattern Atlas is visibly part of UPSC.
- `utilities.html` presents the three user jobs without instructional or AI-assistant copy.
- Each tool exposes its primary input and action near the top of the page and leads its results with one decision.
- Every live or calculated result identifies source/freshness/method as applicable.
- SkyFare, Metals, and Loan Cost Checker use the shared visual foundations and components.
- Floating Guide interfaces are absent from the redesigned tool and UPSC pages.
- Existing public URLs and core calculations/searches continue to work.
- Navigation, changed domain flows, responsive layouts, and accessibility checks pass before release.
