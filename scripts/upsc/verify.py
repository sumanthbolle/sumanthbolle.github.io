#!/usr/bin/env python3
"""Second-pass verification of enriched UPSC notes before they are published."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Callable, Iterable, Mapping, Optional, Sequence

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.enrich import post_worker
from scripts.upsc.publish import _read_json, _write_json


CONFIDENCE_FLOOR = 0.7
REVIEW_LABEL = "upsc-needs-review"
TITLE_PREFIX = "Needs review:"


def parse_verification(payload: Mapping[str, Any]) -> dict[str, Any]:
    data = payload.get("data") if payload.get("success") is True else None
    if not isinstance(data, dict):
        raise ValueError(str(payload.get("error") or "verification rejected")[:240])
    try:
        confidence = float(data.get("confidence"))
    except (TypeError, ValueError) as error:
        raise ValueError("verification confidence must be a number") from error
    flagged = data.get("flagged_claims")
    claims = [str(row)[:240] for row in flagged] if isinstance(flagged, list) else []
    return {
        "agrees": data.get("agrees") is True,
        "confidence": max(0.0, min(1.0, confidence)),
        "flagged_claims": [row for row in claims if row],
    }


def should_publish(result: Mapping[str, Any]) -> bool:
    return result.get("agrees") is True and float(result.get("confidence") or 0) >= CONFIDENCE_FLOOR


def verify_note(
    source: Mapping[str, Any],
    note: Mapping[str, Any],
    endpoint: str,
    token: str,
    opener: Callable[..., Any],
) -> dict[str, Any]:
    payload = post_worker(
        endpoint, token,
        {
            "source": dict(source),
            "note": dict(note),
            "anchor": note.get("anchor"),
            "codes": note.get("codes"),
        },
        opener,
        timeout=55,
    )
    return parse_verification(payload)


def review_issue_payload(
    source_id: str,
    result: Mapping[str, Any],
    now: str,
) -> dict[str, Any]:
    flagged = result.get("flagged_claims") or []
    claims = "\n".join(f"- {row}" for row in flagged) or "- (none listed)"
    return {
        "sourceId": source_id,
        "title": f"{TITLE_PREFIX} {source_id} verification disagreed",
        "labels": [REVIEW_LABEL],
        "body": (
            f"Primary enrichment for `{source_id}` was held out of the publish path.\n\n"
            f"- **agrees:** {result.get('agrees')}\n"
            f"- **confidence:** {result.get('confidence')}\n"
            f"- **checked at:** {now}\n\n"
            f"Flagged claims:\n{claims}\n\n"
            "Inspect `data/upsc/needs-review.json`. The official source record stays visible."
        ),
    }


def apply_verification(
    notes: Sequence[Mapping[str, Any]],
    sources: Mapping[str, Mapping[str, Any]],
    endpoint: str,
    token: str,
    opener: Optional[Callable[..., Any]],
    now: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """Split notes into publishable vs held. A missing verifier skips the gate."""
    published: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    agreed = 0
    disagreed = 0
    skipped = 0
    if not endpoint or not token or opener is None:
        return [dict(note) for note in notes], [], {
            "agreed": 0, "disagreed": 0, "skipped": len(notes), "checked": 0,
        }
    for note in notes:
        source_id = str(note.get("sourceId") or "")
        source = sources.get(source_id) or {}
        try:
            result = verify_note(source, note, endpoint, token, opener)
        except Exception:
            skipped += 1
            published.append(dict(note))
            continue
        row = {
            "sourceId": source_id,
            "anchor": note.get("anchor"),
            "codes": note.get("codes", []),
            "checkedAt": now,
            "verification": result,
            "note": dict(note),
            "issue": review_issue_payload(source_id, result, now),
        }
        if should_publish(result):
            agreed += 1
            published.append(dict(note))
        else:
            disagreed += 1
            held.append(row)
    return published, held, {
        "agreed": agreed,
        "disagreed": disagreed,
        "skipped": skipped,
        "checked": agreed + disagreed,
    }


def write_review_queue(
    output_root: Path,
    held: Iterable[Mapping[str, Any]],
    published_ids: Optional[Iterable[str]] = None,
    now: str = "",
) -> list[dict[str, Any]]:
    existing = _read_json(output_root / "needs-review.json", {})
    rows = existing.get("items") if isinstance(existing, dict) else []
    if not isinstance(rows, list):
        rows = []
    by_id = {
        str(row.get("sourceId")): row for row in rows
        if isinstance(row, dict) and row.get("sourceId")
    }
    for source_id in published_ids or []:
        by_id.pop(str(source_id), None)
    latest = now
    for item in held:
        if isinstance(item, dict) and item.get("sourceId"):
            by_id[str(item["sourceId"])] = dict(item)
            latest = str(item.get("checkedAt") or latest)
    payload = {
        "generatedAt": latest or (existing.get("generatedAt") if isinstance(existing, dict) else ""),
        "itemCount": len(by_id),
        "items": [by_id[key] for key in sorted(by_id)],
    }
    _write_json(output_root / "needs-review.json", payload)
    return payload["items"]


def record_verification_stats(
    output_root: Path,
    batch: Mapping[str, Any],
    now: str,
) -> dict[str, Any]:
    previous = _read_json(output_root / "verification-stats.json", {})
    runs = previous.get("runs") if isinstance(previous, dict) else []
    if not isinstance(runs, list):
        runs = []
    run = {
        "checkedAt": now,
        "agreed": int(batch.get("agreed") or 0),
        "disagreed": int(batch.get("disagreed") or 0),
        "skipped": int(batch.get("skipped") or 0),
        "checked": int(batch.get("checked") or 0),
    }
    runs = (runs + [run])[-60:]
    totals = {
        "agreed": sum(int(row.get("agreed") or 0) for row in runs if isinstance(row, dict)),
        "disagreed": sum(int(row.get("disagreed") or 0) for row in runs if isinstance(row, dict)),
        "skipped": sum(int(row.get("skipped") or 0) for row in runs if isinstance(row, dict)),
    }
    payload = {
        "updatedAt": now,
        "totals": totals,
        "runs": runs,
    }
    _write_json(output_root / "verification-stats.json", payload)
    return payload


def reconcile_review_issues(
    held: Sequence[Mapping[str, Any]],
    open_issues: Iterable[Mapping[str, Any]],
) -> dict[str, Any]:
    open_by_source: dict[str, int] = {}
    for issue in open_issues:
        if not isinstance(issue, Mapping) or issue.get("pull_request"):
            continue
        title = str(issue.get("title") or "")
        if not title.startswith(TITLE_PREFIX):
            continue
        source_id = title[len(TITLE_PREFIX):].split(" verification disagreed", 1)[0].strip()
        try:
            open_by_source[source_id] = int(issue.get("number"))
        except (TypeError, ValueError):
            continue
    create = []
    close = []
    held_ids = {str(item.get("sourceId") or "") for item in held}
    for item in held:
        source_id = str(item.get("sourceId") or "")
        if not source_id or source_id in open_by_source:
            continue
        create.append(item.get("issue") or review_issue_payload(
            source_id, item.get("verification") or {}, str(item.get("checkedAt") or "")
        ))
    for source_id, number in open_by_source.items():
        if source_id not in held_ids:
            close.append({
                "number": number,
                "sourceId": source_id,
                "comment": f"Source `{source_id}` passed verification. Closing the review hold.",
            })
    return {"create": create, "close": close, "update": []}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("reconcile-issues",))
    parser.add_argument("--queue", type=Path, required=True)
    parser.add_argument("--open-issues", type=Path)
    args = parser.parse_args()
    queue = _read_json(args.queue, {})
    items = queue.get("items") if isinstance(queue, dict) else []
    if not isinstance(items, list):
        items = []
    issues = _read_json(args.open_issues, []) if args.open_issues else []
    if not isinstance(issues, list):
        issues = []
    json.dump(reconcile_review_issues(items, issues), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
