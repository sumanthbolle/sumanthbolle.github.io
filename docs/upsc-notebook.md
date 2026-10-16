# Prelims 2027 notebook

The Notebook tab on `upsc.html` (`upsc.html?view=notebook`) publishes what the Prelims 2027 study coordinator writes: morning briefs, evening check-ins, Sunday weekly reviews, a running current-affairs note per month, deadline alarms and every version of the plan. The coordinator is a set of scheduled Claude tasks; before 16 October 2026 they sent chat messages, now they write here.

`upsc-notebook.html` is the public "about" page for the notebook.

## Files

| Path | What |
|---|---|
| `data/upsc/notebook/posts/YYYY-MM-DD-<slug>.md` | One Markdown file per entry. The scheduled tasks only ever add or update these. |
| `data/upsc/notebook/index.json` | Generated. Built by `scripts/upsc/notebook-index.js`; read by the page. Do not edit by hand. |
| `assets/js/upsc/notebook.js` | List, filters, Markdown reader. Owns the `post` and `cat` URL params under `view=notebook`. |
| `assets/css/upsc-notebook.css` | Notebook-only styles; the list and reader reuse the Pocket reads classes. |
| `.github/workflows/upsc-notebook.yml` | Rebuilds the index on every push under `posts/`, every six hours as a safety net, and on manual dispatch. |
| `scripts/test-upsc-notebook.js` | Validates every post, the index, the renderer and the page wiring. Runs in `upsc-tests.yml`. |

## Post format

```markdown
---
title: Day 12, Friday 16 October
date: 2026-10-16
time: "06:24"
category: morning-brief
summary: One sentence that reads well in the list.
week: 2
phase: BUILD
days_to_go: 219
tags: [polity, current-affairs]
---

Body in Markdown. Headings start at ## (the title is the h2 on the page).
```

Rules the index builder enforces:

- File name `YYYY-MM-DD-<slug>.md`, lower-case slug. The `date` in the frontmatter must match the file name.
- `title`, `date`, `category` and `summary` are required. `time` is `HH:MM` Singapore time. `week`, `days_to_go` are integers. `tags` is a `[list]`. `updated` is a date, used when an existing entry is corrected or a running note is extended.
- `category` is one of `morning-brief`, `nightly-checkin`, `weekly-review`, `current-affairs`, `deadline-alert`, `plan`.
- The body needs at least 20 words.

A malformed post is skipped by the index with a message in the workflow log, and `scripts/test-upsc-notebook.js` fails CI so it does not vanish silently.

Slugs the scheduled tasks use: `morning-brief`, `nightly-checkin`, `weekly-review`, `plan-recut`, and for alarms `notification-day`, `apply-now`, `final-application-alarm`, `admit-card-travel`. The current-affairs note for a month is `YYYY-MM-01-current-affairs.md` and is updated in place.

Markdown supported by the reader: `##` to `####` headings, paragraphs, `**bold**`, `*italic*`, inline code, fenced code, links, bullet and numbered lists, tables with a header row, blockquotes, horizontal rules. Raw HTML is escaped, and only `http(s)`, relative and `mailto:` links are kept.

## How a scheduled task publishes

The tasks run in a fresh cloud session with `gh` available. They write through the contents API so they never need a local clone and never conflict with the other bots that commit to this repository:

```sh
# new file
gh api -X PUT repos/sumanthbolle/sumanthbolle.github.io/contents/data/upsc/notebook/posts/2026-10-16-morning-brief.md \
  -f message="notebook: 2026-10-16 morning brief" \
  -f content="$(base64 -w0 post.md)"

# existing file (the monthly current-affairs note): fetch the sha first
sha=$(gh api repos/sumanthbolle/sumanthbolle.github.io/contents/data/upsc/notebook/posts/2026-10-01-current-affairs.md --jq .sha)
gh api -X PUT repos/sumanthbolle/sumanthbolle.github.io/contents/data/upsc/notebook/posts/2026-10-01-current-affairs.md \
  -f message="notebook: 2026-10-16 current affairs" -f content="$(base64 -w0 note.md)" -f sha="$sha"
```

The push fires `upsc-notebook.yml`, which rebuilds `index.json` and commits it. GitHub Pages then redeploys. If the task cannot write to the repository it falls back to sending the entry as a chat message so nothing is lost.

## Writing rules for entries

Plain English, written to Sumanth in the second person. Short sentences, specific numbers and chapter names, sentence-case headings, no emoji, no bold-label bullet lists, no sign-offs or chat phrasing, no filler about motivation. A day that is not logged is reported as not logged. A current-affairs item that no primary source confirms is marked unverified.

## Local check

```sh
node scripts/upsc/notebook-index.js
node scripts/test-upsc-notebook.js
python3 -m http.server 8002   # then open http://127.0.0.1:8002/upsc.html?view=notebook
```
