#!/usr/bin/env python3
"""Build Mains answer-writing drills from published Pattern Atlas anchors."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, Optional, Sequence

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.enrich import post_worker, sibling_endpoint
from scripts.upsc.mains_config import (
    DEFAULT_TIME_BUDGET_MINUTES,
    DEFAULT_WORD_LIMIT,
    DIRECTIVES,
    GS_PAPER_BY_TOPIC,
    GS_PAPERS,
)
from scripts.upsc.publish import _read_json, _write_json


DIRECTIVE_EPOCH = date(2026, 1, 1)


def _clean(value: Any, limit: int = 400) -> str:
    return " ".join(str(value or "").split())[:limit].strip()


def gs_paper_for_anchor(
    anchor: Mapping[str, Any],
    mapping: Mapping[str, str] = GS_PAPER_BY_TOPIC,
) -> str:
    papers = [
        str(paper).upper() for paper in (anchor.get("papers") or [])
        if str(paper).upper() in GS_PAPERS
    ]
    if papers:
        return papers[0]
    for code in anchor.get("codes") or []:
        prefix = str(code).upper().split(".", 1)[0]
        if prefix in GS_PAPERS:
            return prefix
    haystack = " ".join([
        _clean(anchor.get("anchor"), 180),
        _clean(anchor.get("id"), 80),
        " ".join(_clean(alias, 80) for alias in (anchor.get("aliases") or [])),
    ]).lower()
    for keyword, paper in mapping.items():
        if keyword in haystack:
            return paper
    return "GS2"


def directive_for(today: date, index: int = 0) -> str:
    """Rotate the eight directives so all appear in any rolling 14-day window."""
    offset = (today - DIRECTIVE_EPOCH).days + int(index)
    return DIRECTIVES[offset % len(DIRECTIVES)]


def _value_addition(anchor: Mapping[str, Any]) -> str:
    for row in anchor.get("static_core") or []:
        text = _clean(row, 180)
        if text:
            return text
    for row in anchor.get("verify") or []:
        text = _clean(row, 180)
        if text:
            return text
    return _clean(anchor.get("anchor"), 120) or "syllabus anchor"


def dimension_skeleton(anchor: Mapping[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    value = _value_addition(anchor)
    for line in anchor.get("skeleton") or []:
        dimension = _clean(line, 220)
        if dimension:
            rows.append({"dimension": dimension, "value_addition_anchor": value})
    if not rows:
        rows.append({
            "dimension": "Define the static concept, then apply the current trigger.",
            "value_addition_anchor": value,
        })
    return rows[:6]


def _local_question(anchor: Mapping[str, Any], directive: str) -> str:
    topic = _clean(anchor.get("anchor"), 160) or "this topic"
    stems = [
        _clean(row.get("stem") if isinstance(row, dict) else row, 320)
        for row in (anchor.get("stems") or [])
    ]
    stems = [stem for stem in stems if stem]
    if stems:
        return stems[0] if directive.lower() in stems[0].lower() else (
            f"{directive} {topic} in the light of recent official developments."
        )
    return f"{directive} {topic} in the Indian context."


def validate_drill(drill: Mapping[str, Any]) -> dict[str, Any]:
    anchor_id = _clean(drill.get("anchor_id"), 80)
    question = _clean(drill.get("question"), 400)
    directive = _clean(drill.get("directive_word"), 40)
    paper = str(drill.get("gs_paper") or "").upper()
    skeleton = drill.get("dimension_skeleton")
    if not anchor_id or not question:
        raise ValueError("mains drill requires anchor_id and question")
    if directive not in DIRECTIVES:
        raise ValueError("mains drill used an unknown directive word")
    if paper not in GS_PAPERS:
        raise ValueError("mains drill used an unknown GS paper")
    if not isinstance(skeleton, list) or not skeleton:
        raise ValueError("mains drill requires a dimension skeleton")
    dimensions = []
    for row in skeleton:
        if not isinstance(row, dict):
            continue
        dimension = _clean(row.get("dimension"), 220)
        addition = _clean(row.get("value_addition_anchor"), 180)
        if dimension:
            dimensions.append({
                "dimension": dimension,
                "value_addition_anchor": addition or _clean(anchor_id, 80),
            })
    if not dimensions:
        raise ValueError("mains drill skeleton had no dimensions")
    try:
        word_limit = int(drill.get("word_limit") or DEFAULT_WORD_LIMIT)
        time_budget = int(drill.get("time_budget_minutes") or DEFAULT_TIME_BUDGET_MINUTES)
    except (TypeError, ValueError) as error:
        raise ValueError("mains drill word/time budget must be integers") from error
    return {
        "anchor_id": anchor_id,
        "gs_paper": paper,
        "directive_word": directive,
        "question": question,
        "word_limit": max(100, min(word_limit, 400)),
        "time_budget_minutes": max(7, min(time_budget, 20)),
        "dimension_skeleton": dimensions,
        "source_anchor_ref": _clean(
            drill.get("source_anchor_ref"), 240
        ) or f"upsc-patterns.html?anchor={anchor_id}",
    }


def build_local_drill(
    anchor: Mapping[str, Any],
    today: date,
    index: int = 0,
) -> dict[str, Any]:
    directive = directive_for(today, index)
    anchor_id = _clean(anchor.get("id"), 80)
    return validate_drill({
        "anchor_id": anchor_id,
        "gs_paper": gs_paper_for_anchor(anchor),
        "directive_word": directive,
        "question": _local_question(anchor, directive),
        "word_limit": DEFAULT_WORD_LIMIT,
        "time_budget_minutes": DEFAULT_TIME_BUDGET_MINUTES,
        "dimension_skeleton": dimension_skeleton(anchor),
        "source_anchor_ref": f"upsc-patterns.html?anchor={anchor_id}",
    })


def _worker_overlay(
    drill: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    data = payload.get("data") if payload.get("success") is True else None
    if not isinstance(data, dict):
        raise ValueError(str(payload.get("error") or "mains generation rejected")[:240])
    merged = dict(drill)
    if data.get("question"):
        merged["question"] = data.get("question")
    if data.get("dimension_skeleton"):
        merged["dimension_skeleton"] = data.get("dimension_skeleton")
    if data.get("word_limit"):
        merged["word_limit"] = data.get("word_limit")
    if data.get("time_budget_minutes"):
        merged["time_budget_minutes"] = data.get("time_budget_minutes")
    return validate_drill(merged)


def generate_drills(
    anchors: Sequence[Mapping[str, Any]],
    now: str,
    endpoint: str = "",
    token: str = "",
    opener: Optional[Callable[..., Any]] = None,
    llm_limit: int = 5,
) -> dict[str, Any]:
    today = date.fromisoformat(now[:10]) if len(now) >= 10 else datetime.now(timezone.utc).date()
    drills: list[dict[str, Any]] = []
    llm_used = 0
    mains_url = sibling_endpoint(endpoint, "/upsc/mains") if endpoint else ""
    for index, anchor in enumerate(anchors):
        if not isinstance(anchor, Mapping) or not anchor.get("id"):
            continue
        drill = build_local_drill(anchor, today, index)
        if mains_url and token and opener and llm_used < max(0, llm_limit):
            try:
                drill = _worker_overlay(drill, post_worker(
                    mains_url, token,
                    {
                        "anchor": dict(anchor),
                        "directive_word": drill["directive_word"],
                        "gs_paper": drill["gs_paper"],
                        "word_limit": drill["word_limit"],
                    },
                    opener,
                ))
                llm_used += 1
            except Exception:
                pass
        drills.append(drill)
    return {
        "generatedAt": now,
        "directiveWindowDays": 14,
        "directives": list(DIRECTIVES),
        "itemCount": len(drills),
        "llmUsed": llm_used,
        "drills": drills,
    }


def load_anchors(patterns_path: Path) -> list[dict[str, Any]]:
    payload = _read_json(patterns_path, {})
    rows = payload.get("anchors") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict) and row.get("id")]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patterns", type=Path, default=Path("data/upsc-patterns.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--now")
    parser.add_argument("--endpoint", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--llm-limit", type=int, default=5)
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    opener = None
    if args.endpoint and args.token:
        opener = __import__("urllib.request", fromlist=["urlopen"]).urlopen
    payload = generate_drills(
        load_anchors(args.patterns),
        now,
        endpoint=args.endpoint,
        token=args.token,
        opener=opener,
        llm_limit=args.llm_limit,
    )
    _write_json(args.output / "mains-drills.json", payload)
    print(json.dumps({
        "generatedAt": payload["generatedAt"],
        "itemCount": payload["itemCount"],
        "llmUsed": payload["llmUsed"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
