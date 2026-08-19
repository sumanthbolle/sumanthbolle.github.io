#!/usr/bin/env python3
"""Open, update, or close GitHub issues when official UPSC sources fail health checks.

The publisher overwrites ``data/upsc/source-health.json`` on every run. This
module turns that snapshot into a deterministic issue plan so a broken feed
cannot fail silently, and so a later healthy probe closes the matching issue.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


HEALTH_LABEL = "upsc-source-health"
TITLE_PATTERN = re.compile(
    r"^Source health:\s+(\S+)\s+failing since\s+(\d{4}-\d{2}-\d{2})\s*$"
)


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _date_only(value: Any) -> str:
    text = str(value or "").strip()
    return text[:10] if len(text) >= 10 else ""


def _source_rows(health: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    sources = health.get("sources") if isinstance(health, Mapping) else None
    if not isinstance(sources, dict):
        return {}
    rows: dict[str, dict[str, Any]] = {}
    for source_id, row in sources.items():
        if isinstance(source_id, str) and isinstance(row, dict):
            rows[source_id] = row
    return rows


def failing_sources(health: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return enabled-source rows whose latest probe did not report status ok."""
    failed: list[dict[str, Any]] = []
    for source_id, row in _source_rows(health).items():
        if str(row.get("status") or "") == "ok":
            continue
        failed.append({
            "sourceId": str(row.get("sourceId") or source_id),
            "status": str(row.get("status") or "error"),
            "error": str(row.get("error") or "unknown error")[:500],
            "checkedAt": str(row.get("checkedAt") or health.get("checkedAt") or ""),
            "latestPublishedAt": str(row.get("latestPublishedAt") or ""),
        })
    return sorted(failed, key=lambda row: row["sourceId"])


def parse_health_issue_title(title: Any) -> Optional[tuple[str, str]]:
    match = TITLE_PATTERN.match(str(title or "").strip())
    if not match:
        return None
    return match.group(1), match.group(2)


def issue_title(source_id: str, failing_since: str) -> str:
    return f"Source health: {source_id} failing since {failing_since}"


def last_successful_timestamp(
    source_id: str,
    previous_health: Optional[Mapping[str, Any]] = None,
) -> str:
    previous = _source_rows(previous_health or {})
    row = previous.get(source_id, {})
    if str(row.get("status") or "") == "ok":
        return str(row.get("checkedAt") or row.get("latestPublishedAt") or "")
    return str(
        row.get("lastHealthyAt")
        or row.get("latestPublishedAt")
        or ""
    ) or "unknown"


def failing_since_date(
    source_id: str,
    health: Mapping[str, Any],
    previous_health: Optional[Mapping[str, Any]] = None,
    existing_title: str = "",
) -> str:
    parsed = parse_health_issue_title(existing_title)
    if parsed and parsed[0] == source_id:
        return parsed[1]
    previous_row = _source_rows(previous_health or {}).get(source_id, {})
    if str(previous_row.get("status") or "") != "ok":
        previous_date = _date_only(
            previous_row.get("checkedAt") or previous_row.get("failingSince")
        )
        if previous_date:
            return previous_date
    return _date_only(health.get("checkedAt")) or _date_only(
        _source_rows(health).get(source_id, {}).get("checkedAt")
    )


def issue_body(
    source_id: str,
    error: str,
    last_successful_at: str,
    checked_at: str,
    healthy_count: int,
    source_count: int,
) -> str:
    return (
        f"Official source `{source_id}` failed the publisher health probe.\n\n"
        f"- **Error:** {error or 'unknown error'}\n"
        f"- **Last successful timestamp:** {last_successful_at or 'unknown'}\n"
        f"- **Failed check:** {checked_at or 'unknown'}\n"
        f"- **Healthy sources this run:** {healthy_count}/{source_count}\n\n"
        "Inspect `data/upsc/source-health.json` and the latest `coverage.json`. "
        "Do not delete the last valid feed partitions. This issue is opened "
        f"with the `{HEALTH_LABEL}` label and will close automatically once "
        "the source reports healthy again.\n"
    )


def issue_payload(
    source_id: str,
    error: str,
    failing_since: str,
    last_successful_at: str,
    checked_at: str,
    healthy_count: int,
    source_count: int,
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "title": issue_title(source_id, failing_since),
        "labels": [HEALTH_LABEL],
        "body": issue_body(
            source_id, error, last_successful_at, checked_at,
            healthy_count, source_count,
        ),
        "failingSince": failing_since,
        "lastSuccessfulAt": last_successful_at or "unknown",
        "error": error,
    }


def _issue_number(issue: Mapping[str, Any]) -> Optional[int]:
    raw = issue.get("number")
    try:
        number = int(raw)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _issue_source_id(issue: Mapping[str, Any]) -> Optional[str]:
    parsed = parse_health_issue_title(issue.get("title"))
    return parsed[0] if parsed else None


def _is_pull_request(issue: Mapping[str, Any]) -> bool:
    return bool(issue.get("pull_request"))


def _open_health_issues(issues: Iterable[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for issue in issues:
        if not isinstance(issue, Mapping) or _is_pull_request(issue):
            continue
        source_id = _issue_source_id(issue)
        number = _issue_number(issue)
        if not source_id or number is None:
            continue
        labels = issue.get("labels") or []
        names = {
            str(label.get("name") if isinstance(label, Mapping) else label)
            for label in labels
        }
        if names and HEALTH_LABEL not in names:
            continue
        found.setdefault(source_id, {
            "number": number,
            "title": str(issue.get("title") or ""),
            "sourceId": source_id,
        })
    return found


def needs_alert(health: Mapping[str, Any]) -> bool:
    try:
        healthy_count = int(health.get("healthyCount") or 0)
        source_count = int(health.get("sourceCount") or 0)
    except (TypeError, ValueError):
        return bool(failing_sources(health))
    return source_count > 0 and healthy_count < source_count


def reconcile_alerts(
    health: Mapping[str, Any],
    open_issues: Iterable[Mapping[str, Any]],
    previous_health: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Return create/update/close actions. Repeated failures do not open duplicates."""
    existing = _open_health_issues(open_issues)
    failed = {row["sourceId"]: row for row in failing_sources(health)}
    healthy_count = int(health.get("healthyCount") or 0)
    source_count = int(health.get("sourceCount") or len(_source_rows(health)))
    checked_at = str(health.get("checkedAt") or "")

    create: list[dict[str, Any]] = []
    update: list[dict[str, Any]] = []
    close: list[dict[str, Any]] = []

    if needs_alert(health):
        for source_id, row in failed.items():
            payload = issue_payload(
                source_id,
                row["error"],
                failing_since_date(
                    source_id, health, previous_health,
                    existing.get(source_id, {}).get("title", ""),
                ),
                last_successful_timestamp(source_id, previous_health),
                row["checkedAt"] or checked_at,
                healthy_count,
                source_count,
            )
            current = existing.get(source_id)
            if current is None:
                create.append(payload)
                continue
            payload["number"] = current["number"]
            update.append(payload)

    for source_id, issue in existing.items():
        if source_id in failed:
            continue
        close.append({
            "number": issue["number"],
            "sourceId": source_id,
            "title": issue["title"],
            "comment": (
                f"Source `{source_id}` reported healthy at "
                f"{checked_at or 'this run'}. Closing the alert."
            ),
        })

    return {
        "checkedAt": checked_at,
        "healthyCount": healthy_count,
        "sourceCount": source_count,
        "failing": sorted(failed),
        "create": create,
        "update": update,
        "close": close,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("reconcile",))
    parser.add_argument("--health", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--open-issues", type=Path)
    args = parser.parse_args()
    health = _read_json(args.health, {})
    if not isinstance(health, dict):
        raise SystemExit("source health payload must be a JSON object")
    previous = _read_json(args.previous, {}) if args.previous else {}
    if not isinstance(previous, dict):
        previous = {}
    issues = _read_json(args.open_issues, []) if args.open_issues else []
    if not isinstance(issues, list):
        issues = []
    plan = reconcile_alerts(health, issues, previous)
    json.dump(plan, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
