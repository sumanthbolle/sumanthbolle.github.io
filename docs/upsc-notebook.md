# Prelims 2027 notebook

The Notebook tab on `upsc.html` (`upsc.html?view=notebook`) publishes what the Prelims 2027 study coordinator writes: morning briefs, evening check-ins, Sunday weekly reviews, a running current-affairs note per month, deadline alarms and every version of the plan. The coordinator is a set of scheduled Claude tasks; before 16 October 2026 they sent chat messages, now they write here.

`upsc-notebook.html` is the public "about" page for the notebook.

## Lock (private notebook)

The repository is public, so privacy comes from encryption, not access control. Once the lock is set up:

- Every entry under `posts/`, the schedule and every log file is an envelope written by `assets/js/upsc/notebook-crypto.js`: a fresh AES-256-GCM key per file, wrapped with the notebook's RSA-OAEP (3072, SHA-256) public key. File names keep their date and category (`2026-10-17-morning-brief.md.enc`); everything else is unreadable without the private key.
- `keys/public.jwk` is public; anyone, including the scheduled tasks, can encrypt. `keys/private.enc` is the private key wrapped with the passphrase (PBKDF2-SHA256, 600k iterations, AES-256-GCM). The page unwraps it on the device and keeps the key in memory and `sessionStorage` for the tab.
- The scheduled tasks read the private key from the private Project doc `upsc/notebook-private-key.md` (a one-line JWK) when they need to read the log or an entry. They never commit it, print it, or keep it beyond the run. The index build fails if a plain `private.jwk` is ever committed.
- The public Notebook tab shows only "N entries, private" and a passphrase prompt.

One-time setup, done in the page (Notebook tab, "Lock the notebook"): create a fine-grained GitHub token (this repository only, Contents: read and write), choose a passphrase of twelve or more characters, submit. The browser generates the key pair, commits the keys, re-commits every existing entry encrypted and deletes the plaintext, then shows the private JWK once; paste it into the Project doc named above. There is no passphrase reset: a lost passphrase means the entries are unreadable, including by the coordinator.

`scripts/upsc/notebook-crypto.js` is the command-line side (`keygen`, `encrypt`, `decrypt`, `wrap`, `unwrap`, `is-encrypted`).

## Progress tracker

`?view=notebook&tab=progress` shows exam preparedness computed by `assets/js/upsc/notebook-metrics.js` from the log files (`log/YYYY-MM-DD.json[.enc]`, one per day, written by the page through the contents API with the GitHub token) against `schedule.json[.enc]` (the Build-phase unit schedule, re-cut dates included). It is meant to be severe: missing data scores zero; three planned days without a log caps the score at 25; a projected total under 500 hours caps it at 50; a projected GS-I below the cutoff band caps it at 60; a timed CSAT under 66 caps it at 70. Components and weights: hours against plan to date 25, days logged 15, syllabus coverage 20, PYQ rolling accuracy 15, CSAT 10, projected GS-I 15. The projection assumes you attempt only what you have covered and applies the one-third penalty at your rolling accuracy; once mocks exist they carry 70% of it.

Log entry shape:

```json
{"date":"2026-10-17","hours":2,"units":["polity-ch1-2"],"pyq":{"attempted":10,"correct":7},
 "csat":{"attempted":80,"correct":48,"timed":true},"mock":{"gsScore":96},
 "revisionDone":true,"caDone":true,"note":"","savedAt":"…"}
```

The nightly check-in reads these (decrypting with the Project-doc key) before it looks at the plan doc's Daily log, so a day logged in the page counts.

## Files

| Path | What |
|---|---|
| `data/upsc/notebook/posts/YYYY-MM-DD-<slug>.md` | One Markdown file per entry. The scheduled tasks only ever add or update these. |
| `data/upsc/notebook/index.json` | Generated. Built by `scripts/upsc/notebook-index.js`; read by the page. Do not edit by hand. |
| `assets/js/upsc/notebook.js` | List, filters, Markdown reader, lock and unlock, setup, GitHub writes, Progress view. Owns the `post`, `cat` and `tab` URL params under `view=notebook`. |
| `assets/js/upsc/notebook-crypto.js` | Envelope format and key handling, shared by the page and `scripts/upsc/notebook-crypto.js`. |
| `assets/js/upsc/notebook-metrics.js` | Readiness metrics; pure, tested. |
| `data/upsc/notebook/schedule.json[.enc]` | Build-phase unit schedule the tracker measures against. |
| `data/upsc/notebook/log/` | One JSON (or `.json.enc`) per logged day. |
| `data/upsc/notebook/keys/` | `public.jwk` and passphrase-wrapped `private.enc`. Never a plain private key. |
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

When `keys/public.jwk` exists the task encrypts before the PUT:

```sh
gh api repos/sumanthbolle/sumanthbolle.github.io/contents/scripts/upsc/notebook-crypto.js --jq .content | base64 -d > nbc.js
gh api repos/sumanthbolle/sumanthbolle.github.io/contents/assets/js/upsc/notebook-crypto.js --jq .content | base64 -d > notebook-crypto.js
# nbc.js requires ../../assets/js/upsc/notebook-crypto.js, so place both as that layout, e.g. w/scripts/upsc/nbc.js and w/assets/js/upsc/notebook-crypto.js
gh api repos/sumanthbolle/sumanthbolle.github.io/contents/data/upsc/notebook/keys/public.jwk --jq .content | base64 -d > public.jwk
node w/scripts/upsc/nbc.js encrypt --public public.jwk --in post.md --out post.md.enc
```

and the file name gets `.enc`. To read the log or an entry, the task fetches the one-line JWK from the Project doc `upsc/notebook-private-key.md` into a temp file, runs `decrypt --private`, and deletes the file. The key is never echoed, logged, committed or sent anywhere.

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
