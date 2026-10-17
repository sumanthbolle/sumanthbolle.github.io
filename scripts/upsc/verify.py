#!/usr/bin/env python3
"""Second-pass verification of enriched UPSC notes before they are published."""

from __future__ import annotations

import argparse
import json
import math
from hashlib import sha256
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
UNAVAILABLE_TITLE_PREFIX = "Verification unavailable:"
UNAVAILABLE_CLAIM = "Verification was unavailable; retry before publishing"
STATUS_DISAGREED = "disagreed"
STATUS_UNAVAILABLE = "unavailable"


def _error_text(error: Exception) -> str:
    """Short reason for the queue row; the HTTP body of a Worker error is the useful part."""
    try:
        import urllib.error
        if isinstance(error, urllib.error.HTTPError):
            body = ""
            try:
                body = error.read(600).decode("utf-8", "replace")
            except Exception:
                body = ""
            try:
                parsed = json.loads(body) if body else {}
                body = str(parsed.get("error") or body) if isinstance(parsed, dict) else body
            except ValueError:
                pass
            return f"HTTP {error.code}: {body}".strip()[:240]
        if isinstance(error, urllib.error.URLError):
            return f"network error: {error.reason}"[:240]
    except ImportError:
        pass
    return (str(error) or error.__class__.__name__)[:240]


def held_status(row: Mapping[str, Any]) -> str:
    """Rows written before the status field existed carry the sentinel claim instead."""
    status = str(row.get("status") or "")
    if status in (STATUS_DISAGREED, STATUS_UNAVAILABLE):
        return status
    verification = row.get("verification") if isinstance(row.get("verification"), Mapping) else {}
    if list(verification.get("flagged_claims") or []) == [UNAVAILABLE_CLAIM]:
        return STATUS_UNAVAILABLE
    return STATUS_DISAGREED


def note_digest(note):
    content = {key: value for key, value in note.items() if key != "verification"}
    return sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def parse_verification(payload: Mapping[str, Any]) -> dict[str, Any]:
    if payload.get("verificationVersion") != 2:
        raise ValueError("The Worker must support complete-note verification version 2")
    data = payload.get("data") if payload.get("success") is True else None
    if not isinstance(data, dict):
        raise ValueError(str(payload.get("error") or "verification rejected")[:240])
    try:
        value = data.get("confidence")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("verification confidence must be a number")
        confidence = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("verification confidence must be a number") from error
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("verification confidence must be between zero and one")
    flagged = data.get("flagged_claims")
    if not isinstance(flagged, list) or not all(isinstance(row, str) for row in flagged):
        raise ValueError("verification must include a list of flagged claims")
    claims = [row[:240] for row in flagged]
    return {
        "agrees": data.get("agrees") is True,
        "confidence": confidence,
        "flagged_claims": [row for row in claims if row],
        "verificationVersion": 2,
    }


def should_publish(result: Mapping[str, Any]) -> bool:
    try:
        confidence = float(result.get("confidence"))
        return (result.get("agrees") is True and math.isfinite(confidence)
                and CONFIDENCE_FLOOR <= confidence <= 1 and result.get("flagged_claims") == [])
    except (ValueError, TypeError):
        return False


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
    """Split notes into publishable vs held; missing or failed checks never publish."""
    published: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    agreed = 0
    disagreed = 0
    skipped = 0
    for note in notes:
        unavailable = False
        error_text = ""
        source_id = str(note.get("sourceId") or "")
        source = sources.get(source_id) or {}
        try:
            if not endpoint or not token or opener is None:
                raise ValueError("Verification is not configured")
            result = verify_note(source, note, endpoint, token, opener)
        except Exception as error:
            unavailable = True
            skipped += 1
            error_text = _error_text(error)
            close = getattr(error, "close", None)
            if callable(close):
                close()
            result = {"agrees": False, "confidence": 0, "flagged_claims": [UNAVAILABLE_CLAIM]}
        row = {
            "sourceId": source_id,
            "anchor": note.get("anchor"),
            "codes": note.get("codes", []),
            "checkedAt": now,
            "status": STATUS_UNAVAILABLE if unavailable else STATUS_DISAGREED,
            "error": error_text,
            "verification": result,
            "note": dict(note),
            "issue": review_issue_payload(source_id, result, now),
        }
        if should_publish(result):
            agreed += 1
            published.append({**note, "verification": {
                **result, "checkedAt": now,
                "sourceContentHash": source.get("contentHash"),
                "noteContentHash": note_digest(note),
            }})
        else:
            if not unavailable:
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
        str(row.get("sourceId")): {**row, "status": held_status(row)} for row in rows
        if isinstance(row, dict) and row.get("sourceId")
    }
    for source_id in published_ids or []:
        by_id.pop(str(source_id), None)
    latest = now
    for item in held:
        if isinstance(item, dict) and item.get("sourceId"):
            by_id[str(item["sourceId"])] = {**item, "status": held_status(item)}
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


def unavailable_issue_payload(rows: Sequence[Mapping[str, Any]], now: str) -> dict[str, Any]:
    """One issue for every note the verifier could not check, instead of one per note."""
    ordered = sorted(rows, key=lambda row: str(row.get("sourceId") or ""))
    reasons: dict[str, int] = {}
    for row in ordered:
        reason = str(row.get("error") or "no error recorded")
        reasons[reason] = reasons.get(reason, 0) + 1
    reason_lines = "\n".join(
        f"- {count} × {reason}" for reason, count in sorted(reasons.items(), key=lambda kv: -kv[1])
    )
    note_lines = "\n".join(
        f"- `{row.get('sourceId')}` — {str(row.get('anchor') or '').strip() or '(no anchor)'} "
        f"(last attempt {row.get('checkedAt') or 'unknown'})"
        for row in ordered
    )
    return {
        "title": f"{UNAVAILABLE_TITLE_PREFIX} {len(ordered)} enriched notes waiting for a second-pass check",
        "labels": [REVIEW_LABEL],
        "body": (
            "The second-pass verifier did not return a usable result for these notes, so they are "
            "held rather than published. This is a pipeline failure, not a factual disagreement; "
            "the publisher retries each note automatically on its next run.\n\n"
            f"- **notes held:** {len(ordered)}\n"
            f"- **last updated:** {now}\n\n"
            f"Failure reasons:\n{reason_lines}\n\n"
            f"Notes:\n{note_lines}\n\n"
            "The local Worker log in the run that held them shows the provider response. "
            "This issue closes itself once every note has either passed or been re-filed as a "
            "real disagreement (`data/upsc/needs-review.json`, `status`)."
        ),
    }


def reconcile_review_issues(
    held: Sequence[Mapping[str, Any]],
    open_issues: Iterable[Mapping[str, Any]],
    now: str = "",
) -> dict[str, Any]:
    """Per-note issues only for real disagreements; unavailable checks share one issue."""
    open_by_source: dict[str, int] = {}
    open_unavailable: Optional[int] = None
    for issue in open_issues:
        if not isinstance(issue, Mapping) or issue.get("pull_request"):
            continue
        title = str(issue.get("title") or "")
        try:
            number = int(issue.get("number"))
        except (TypeError, ValueError):
            continue
        if title.startswith(UNAVAILABLE_TITLE_PREFIX):
            if open_unavailable is None:
                open_unavailable = number
            continue
        if not title.startswith(TITLE_PREFIX):
            continue
        source_id = title[len(TITLE_PREFIX):].split(" verification disagreed", 1)[0].strip()
        open_by_source[source_id] = number
    create = []
    update = []
    close = []
    disagreed = {}
    unavailable = []
    for item in held:
        source_id = str(item.get("sourceId") or "")
        if not source_id:
            continue
        if held_status(item) == STATUS_UNAVAILABLE:
            unavailable.append(item)
        else:
            disagreed[source_id] = item
    for source_id, item in disagreed.items():
        if source_id in open_by_source:
            continue
        create.append(item.get("issue") or review_issue_payload(
            source_id, item.get("verification") or {}, str(item.get("checkedAt") or "")
        ))
    unavailable_ids = {str(item.get("sourceId")) for item in unavailable}
    for source_id, number in open_by_source.items():
        if source_id in disagreed:
            continue
        if source_id in unavailable_ids:
            comment = (
                f"Source `{source_id}` was never checked: the verifier was unavailable, so this "
                "was not a disagreement. It is tracked in the shared "
                f"\"{UNAVAILABLE_TITLE_PREFIX}\" issue and retried automatically."
            )
        else:
            comment = f"Source `{source_id}` passed verification. Closing the review hold."
        close.append({"number": number, "sourceId": source_id, "comment": comment})
    stamp = now or max((str(item.get("checkedAt") or "") for item in unavailable), default="")
    if unavailable:
        payload = unavailable_issue_payload(unavailable, stamp)
        if open_unavailable is None:
            create.append(payload)
        else:
            update.append({**payload, "number": open_unavailable})
    elif open_unavailable is not None:
        close.append({
            "number": open_unavailable,
            "sourceId": "",
            "comment": "Every held note has now been verified. Closing.",
        })
    return {"create": create, "close": close, "update": update}


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
    now = str(queue.get("generatedAt") or "") if isinstance(queue, dict) else ""
    json.dump(reconcile_review_issues(items, issues, now), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
