# UPSC Today editions: runbook

How the twice-daily editions are produced, how to run one by hand, and what to do when one is late. Design: [`docs/superpowers/specs/2026-10-13-upsc-daily-editions-design.md`](superpowers/specs/2026-10-13-upsc-daily-editions-design.md).

## Schedule

| Run (UTC) | IST | Slot | Window covered (IST) |
|---|---|---|---|
| 00:15 | 05:45 | AM | 18:00 previous day → 06:00 |
| 00:45 | 06:15 | AM retry | same; adds only missing topics |
| 12:15 | 17:45 | PM | 06:00 → 18:00 |
| 12:45 | 18:15 | PM retry | same |

GitHub can start scheduled runs late. The retry exists for that. Every run is idempotent by edition id (`2026-10-13-am`).

## Secrets and variables

| Name | Needed for | Status on 13 Oct 2026 |
|---|---|---|
| `OPENAI_API_KEY` | writing notes | present |
| `GEMINI_API_KEY` | fallback writer | present |
| `UPSC_EDITION_MODEL` (variable, optional) | model override | unset → `gpt-4.1-mini` |
| `UPSC_PUBLISH_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Worker live strip and Summaverick brief contract deploy | **missing** |

Without a working LLM key, notes are held as `llm-unavailable`, the edition is marked `partial`, and quick facts are still published.

## Run by hand

Locally (no keys needed for a dry run):

```bash
python3 scripts/upsc/edition.py --slot am --date 2026-10-13 --dry-run
```

On GitHub: Actions → **Publish UPSC daily edition** → Run workflow → choose `slot`, tick `dry_run` to build without committing.

## Reading the output

- `data/upsc/editions/YYYY/MM/DD-am.json` and `-pm.json`: the edition. `held[]` lists topics that did not publish and why.
- `data/upsc/editions/index.json`: newest editions first, with counts.
- `upsc-study/notes/<slug>/index.html`: static note pages (in the sitemap).

Common held reasons:

| Reason | Meaning | Action |
|---|---|---|
| `evidence-unavailable, http-403` | The official site refused the download | Usually EU Council; nothing to do unless it is an important topic |
| `evidence-unavailable, thin-evidence` | Source text under 200 characters (for example a reposted tweet) | Becomes a quick fact if ranked Useful |
| `llm-unavailable` | No key, quota or provider error | Check the key and provider status |
| `unsupported-number:<n>` | The writer used a figure not in the source, twice | Working as intended; inspect if it repeats for one topic |
| `banned:<phrase>` | AI filler survived a rewrite | Working as intended |

## When an edition is late

If a slot is not closed by 07:00 or 19:00 IST, the retry run opens a GitHub issue labelled `upsc-edition-late`. The Today desk keeps showing the latest closed edition. The issue closes itself when a later run closes the slot.

## Approving the voice

Voice samples live in `data/upsc/editions/samples/`. Merging the pull request that introduced editions is the owner's sign-off that the samples' voice and structure are right; the schedule starts after that merge.
