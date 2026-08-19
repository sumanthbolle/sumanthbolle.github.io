#!/usr/bin/env python3
"""Attach related UPSC PYQs to Pattern Atlas anchors by exact topic tag."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any, Iterable, Mapping, Sequence

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.publish import _read_json, _write_json


def normalize_tag(value: Any) -> str:
    return " ".join(str(value or "").lower().replace("_", " ").replace("-", " ").split())


def anchor_tags(anchor: Mapping[str, Any]) -> set[str]:
    tags = {normalize_tag(anchor.get("anchor")), normalize_tag(anchor.get("id"))}
    for alias in anchor.get("aliases") or []:
        tags.add(normalize_tag(alias))
    for tag in anchor.get("tags") or []:
        tags.add(normalize_tag(tag))
    return {tag for tag in tags if tag}


def pyq_tags(entry: Mapping[str, Any]) -> set[str]:
    tags = {normalize_tag(tag) for tag in (entry.get("tags") or [])}
    return {tag for tag in tags if tag}


def compact_pyq(entry: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": str(entry.get("id") or ""),
        "year": int(entry.get("year") or 0) or None,
        "exam": str(entry.get("exam") or ""),
        "paper": str(entry.get("paper") or ""),
        "question": str(entry.get("question") or "").strip(),
        "source": str(entry.get("source") or ""),
        "tags": [str(tag) for tag in (entry.get("tags") or [])],
    }


def related_pyqs(
    anchor: Mapping[str, Any],
    bank: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Exact-tag match. Empty list when nothing matches — never an error."""
    wanted = anchor_tags(anchor)
    if not wanted:
        return []
    matched = []
    seen = set()
    for entry in bank:
        if not isinstance(entry, Mapping):
            continue
        if not (pyq_tags(entry) & wanted):
            continue
        row = compact_pyq(entry)
        if not row["id"] or row["id"] in seen or not row["question"]:
            continue
        seen.add(row["id"])
        matched.append(row)
    matched.sort(key=lambda row: (-(row["year"] or 0), row["id"]))
    return matched


def link_anchors(
    anchors: Iterable[Mapping[str, Any]],
    bank: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    links: dict[str, list[dict[str, Any]]] = {}
    for anchor in anchors:
        if not isinstance(anchor, Mapping) or not anchor.get("id"):
            continue
        links[str(anchor["id"])] = related_pyqs(anchor, bank)
    return links


def load_bank(path: Path) -> list[dict[str, Any]]:
    payload = _read_json(path, {})
    rows = payload.get("questions") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def load_anchors(path: Path) -> list[dict[str, Any]]:
    payload = _read_json(path, {})
    rows = payload.get("anchors") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def build_links(
    patterns_path: Path,
    bank_path: Path,
    now: str,
) -> dict[str, Any]:
    anchors = load_anchors(patterns_path)
    bank = load_bank(bank_path)
    by_anchor = link_anchors(anchors, bank)
    return {
        "generatedAt": now,
        "bankSize": len(bank),
        "anchorCount": len(by_anchor),
        "linkedCount": sum(1 for rows in by_anchor.values() if rows),
        "byAnchor": by_anchor,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patterns", type=Path, default=Path("data/upsc-patterns.json"))
    parser.add_argument("--bank", type=Path, default=Path("data/upsc/pyq-bank.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--now")
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    payload = build_links(args.patterns, args.bank, now)
    _write_json(args.output / "pyq-links.json", payload)
    print(json.dumps({
        "generatedAt": payload["generatedAt"],
        "linkedCount": payload["linkedCount"],
        "bankSize": payload["bankSize"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
