#!/usr/bin/env python3
"""Resurface official UPSC anchors for 7-day and 30-day spaced revision."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import random
import sys
from typing import Any, Iterable, Mapping, Optional, Sequence

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.publish import _read_json, _write_json


DEFAULT_LIMIT = 5
DEFAULT_TOLERANCE_DAYS = 1
DEFAULT_WINDOWS = (7, 30)


def _parse_day(value: Any) -> Optional[date]:
    text = str(value or "").strip()
    if len(text) < 10:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def matching_window(
    item_day: date,
    today: date,
    windows: Sequence[int] = DEFAULT_WINDOWS,
    tolerance_days: int = DEFAULT_TOLERANCE_DAYS,
) -> Optional[int]:
    """Return the revision window (e.g. 7 or 30) when the item falls inside ±tolerance."""
    age = (today - item_day).days
    if age < 0:
        return None
    for window in windows:
        if abs(age - int(window)) <= tolerance_days:
            return int(window)
    return None


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def item_score(item: Mapping[str, Any]) -> int:
    score = _as_int(item.get("priority"))
    if item.get("hard") is True:
        score += 1000
    band = str(item.get("band") or "").strip().lower()
    if band in ("perennial", "high"):
        score += 100
    return score


def _candidate(
    item_id: str,
    title: str,
    day: str,
    **fields: Any,
) -> Optional[dict[str, Any]]:
    if not item_id or not _parse_day(day):
        return None
    row = {
        "id": item_id,
        "title": title or item_id,
        "date": day[:10],
        "anchor": str(fields.get("anchor") or ""),
        "path": str(fields.get("path") or ""),
        "codes": list(fields.get("codes") or []),
        "status": str(fields.get("status") or ""),
        "priority": _as_int(fields.get("priority")),
        "hard": fields.get("hard") is True,
        "band": str(fields.get("band") or ""),
        "sourceUrl": str(fields.get("sourceUrl") or ""),
        "origin": str(fields.get("origin") or "archive"),
    }
    return row


def _exam_lookup(output_root: Path) -> dict[str, dict[str, Any]]:
    payload = _read_json(output_root / "exam-index.json", {})
    notes = payload.get("notes") if isinstance(payload, dict) else []
    lookup: dict[str, dict[str, Any]] = {}
    if not isinstance(notes, list):
        return lookup
    for note in notes:
        if isinstance(note, dict) and note.get("sourceId"):
            lookup[str(note["sourceId"])] = note
    return lookup


def collect_candidates(output_root: Path) -> list[dict[str, Any]]:
    """Load revisitable items from archive-index, then source-index, then history/."""
    exam = _exam_lookup(output_root)
    found: dict[str, dict[str, Any]] = {}

    archive = _read_json(output_root / "archive-index.json", {})
    notes = archive.get("notes") if isinstance(archive, dict) else []
    if isinstance(notes, list):
        for note in notes:
            if not isinstance(note, dict):
                continue
            exam_note = exam.get(str(note.get("sourceId") or ""), {})
            item = _candidate(
                str(note.get("sourceId") or ""),
                str(note.get("title") or exam_note.get("title") or ""),
                str(note.get("date") or ""),
                anchor=note.get("anchor") or exam_note.get("anchor") or "",
                path=note.get("path") or "",
                codes=note.get("codes") or exam_note.get("codes") or [],
                status=note.get("status") or "",
                priority=exam_note.get("priority") or note.get("priority"),
                hard=note.get("hard") or exam_note.get("hard"),
                band=note.get("band") or exam_note.get("band"),
                sourceUrl=exam_note.get("sourceUrl") or note.get("sourceUrl"),
                origin="archive",
            )
            if item:
                found[item["id"]] = item

    source_index = _read_json(output_root / "source-index.json", {})
    records = source_index.get("records") if isinstance(source_index, dict) else []
    if isinstance(records, list):
        for record in records:
            if not isinstance(record, dict):
                continue
            item_id = str(record.get("id") or "")
            if item_id in found:
                continue
            exam_note = exam.get(item_id, {})
            item = _candidate(
                item_id,
                str(record.get("title") or ""),
                str(record.get("publishedAt") or ""),
                anchor=exam_note.get("anchor") or "",
                path="",
                codes=record.get("codes") or exam_note.get("codes") or [],
                status=record.get("editorialState") or "",
                priority=record.get("priority") or exam_note.get("priority"),
                hard=record.get("hard"),
                sourceUrl=record.get("sourceUrl"),
                origin="source-index",
            )
            if item:
                found[item["id"]] = item

    history_root = output_root / "history"
    if history_root.is_dir():
        for path in sorted(history_root.glob("*/*.json")):
            payload = _read_json(path, {})
            if not isinstance(payload, dict):
                continue
            item_id = str(payload.get("id") or path.parent.name)
            if item_id in found:
                continue
            item = _candidate(
                item_id,
                str(payload.get("title") or ""),
                str(payload.get("publishedAt") or ""),
                sourceUrl=payload.get("sourceUrl"),
                origin="history",
            )
            if item:
                found[item["id"]] = item

    return list(found.values())


def select_revision_items(
    candidates: Iterable[Mapping[str, Any]],
    today: date,
    limit: int = DEFAULT_LIMIT,
    windows: Sequence[int] = DEFAULT_WINDOWS,
    tolerance_days: int = DEFAULT_TOLERANCE_DAYS,
    rng: Optional[random.Random] = None,
) -> list[dict[str, Any]]:
    """Keep only items inside the 7/30-day windows, then cap at ``limit``."""
    matched: list[dict[str, Any]] = []
    for raw in candidates:
        item_day = _parse_day(raw.get("date"))
        if item_day is None:
            continue
        window = matching_window(item_day, today, windows, tolerance_days)
        if window is None:
            continue
        item = dict(raw)
        item["windowDays"] = window
        matched.append(item)

    ranked = sorted(
        matched,
        key=lambda item: (-item_score(item), int(item["windowDays"]), str(item.get("id") or "")),
    )
    if limit < 0:
        limit = 0
    if len(ranked) <= limit:
        return ranked
    scored = [item for item in ranked if item_score(item) > 0]
    if len(scored) >= limit:
        return scored[:limit]
    remaining = [item for item in ranked if item_score(item) <= 0]
    picker = rng or random.Random(today.isoformat())
    picker.shuffle(remaining)
    return (scored + remaining)[:limit]


def build_revision_queue(
    output_root: Path,
    now: str,
    limit: int = DEFAULT_LIMIT,
    windows: Sequence[int] = DEFAULT_WINDOWS,
    tolerance_days: int = DEFAULT_TOLERANCE_DAYS,
) -> dict[str, Any]:
    today = _parse_day(now) or datetime.now(timezone.utc).date()
    items = select_revision_items(
        collect_candidates(output_root),
        today,
        limit=limit,
        windows=windows,
        tolerance_days=tolerance_days,
        rng=random.Random(today.isoformat()),
    )
    window_meta = {}
    for window in windows:
        target = today - timedelta(days=int(window))
        window_meta[str(window)] = {
            "target": target.isoformat(),
            "toleranceDays": tolerance_days,
            "matched": sum(1 for item in items if item["windowDays"] == window),
        }
    return {
        "generatedAt": now,
        "today": today.isoformat(),
        "limit": limit,
        "toleranceDays": tolerance_days,
        "windows": window_meta,
        "itemCount": len(items),
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--now")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--tolerance-days", type=int, default=DEFAULT_TOLERANCE_DAYS)
    parser.add_argument("--windows", default="7,30")
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    windows = tuple(
        int(part) for part in str(args.windows).split(",") if part.strip()
    ) or DEFAULT_WINDOWS
    queue = build_revision_queue(
        args.output,
        now,
        limit=max(0, args.limit),
        windows=windows,
        tolerance_days=max(0, args.tolerance_days),
    )
    _write_json(args.output / "revision-queue.json", queue)
    print(json.dumps({
        "generatedAt": queue["generatedAt"],
        "today": queue["today"],
        "itemCount": queue["itemCount"],
        "windows": queue["windows"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
