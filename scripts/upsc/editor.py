#!/usr/bin/env python3
"""Editor pass: one LLM call per edition that merges running stories and
judges UPSC relevance across every candidate cluster.

The deterministic score still orders stories inside a relevance band, and
every reply is validated strictly. When the call fails or the reply is not
usable, the edition falls back to deterministic selection and says so.
"""

import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, Optional
from urllib.request import urlopen

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.candidates import CODE_LABELS, candidate_from
from scripts.upsc.models import SYLLABUS_CODES
from scripts.upsc.writer import _parse, call_llm


EDITOR_PROMPT_PATH = Path(__file__).with_name("prompts") / "editor_system.txt"
RELEVANCE = ("must", "useful", "skip")
MAX_CLUSTERS = 200
MAX_HEADLINES = 6
MAX_RECORDS = 4
WHY_WORDS = 25


def _cluster_row(candidate: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": candidate["fingerprint"],
        "score": int(candidate.get("score") or 0),
        "carryOver": bool(candidate.get("carryOver")),
        "codesHint": list(candidate.get("codesHint") or []),
        "officialRecords": [
            {"title": str(row.get("title") or ""), "publisher": str(row.get("publisherName") or row.get("publisherId") or "")}
            for row in (candidate.get("records") or [])[:MAX_RECORDS]
        ],
        "headlines": [
            {"title": str(row.get("title") or ""), "publisher": str(row.get("publisher") or ""),
             "section": str(row.get("section") or "")}
            for row in (candidate.get("discovery") or [])[:MAX_HEADLINES]
        ],
    }


def build_editor_messages(candidates: list[dict[str, Any]], edition: Mapping[str, Any]) -> list[dict[str, str]]:
    ranked = sorted(candidates, key=lambda row: (-int(row.get("score") or 0), str(row.get("title") or "")))
    payload = {
        "edition": dict(edition),
        "allowedCodes": [{"code": code, "label": label} for code, label in CODE_LABELS.items()],
        "clusters": [_cluster_row(row) for row in ranked[:MAX_CLUSTERS]],
    }
    return [
        {"role": "system", "content": EDITOR_PROMPT_PATH.read_text(encoding="utf-8")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, indent=1)},
    ]


def _text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def parse_editor_response(raw: str, known_ids: set[str]) -> Optional[list[dict[str, Any]]]:
    """Validated stories, or None when the reply is not a usable JSON object.

    Unknown or repeated member ids are dropped (first assignment wins), codes
    are filtered to the canonical list, and stories left without members or
    with an unknown relevance are discarded.
    """
    parsed = _parse(raw)
    rows = parsed.get("stories") if isinstance(parsed, dict) else None
    if not isinstance(rows, list):
        return None
    assigned: set[str] = set()
    stories = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or row.get("upscRelevance") not in RELEVANCE:
            continue
        members = []
        for member in row.get("memberIds") or []:
            member = str(member)
            if member in known_ids and member not in assigned:
                assigned.add(member)
                members.append(member)
        if not members:
            continue
        codes = list(dict.fromkeys(str(code) for code in row.get("codes") or [] if str(code) in SYLLABUS_CODES))[:3]
        stories.append({
            "storyId": _text(row.get("storyId"), 80) or f"story-{index + 1}",
            "title": _text(row.get("title"), 200),
            "memberIds": members,
            "upscRelevance": row["upscRelevance"],
            "why": " ".join(str(row.get("why") or "").split()[:WHY_WORDS]),
            "codes": codes,
            "prelimsAngle": _text(row.get("prelimsAngle"), 300),
            "mainsAngle": _text(row.get("mainsAngle"), 300),
        })
    return stories


def apply_stories(
    stories: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    pyq_bank: Any = None,
    patterns: Any = None,
) -> list[dict[str, Any]]:
    """Merge each must/useful story's member clusters into one candidate.

    The best-scoring member supplies the lead title and fingerprint, so note ids
    stay stable when the editor groups the same clusters again. Returns musts
    then usefuls, each by score.
    """
    by_id = {row["fingerprint"]: row for row in candidates}
    merged = []
    for story in stories:
        if story["upscRelevance"] == "skip":
            continue
        members = [by_id[member] for member in story["memberIds"]]
        lead = max(members, key=lambda row: (int(row.get("score") or 0), str(row.get("title") or "")))
        candidate = candidate_from(
            lead["title"],
            [record for row in members for record in row.get("records") or []],
            [item for row in members for item in row.get("discovery") or []],
            pyq_bank=pyq_bank, patterns=patterns,
        )
        candidate["fingerprint"] = lead["fingerprint"]
        candidate["score"] = max(int(candidate["score"]), max(int(row.get("score") or 0) for row in members))
        candidate["band"] = story["upscRelevance"]
        candidate["memberIds"] = list(story["memberIds"])
        candidate["carryOver"] = all(row.get("carryOver") for row in members)
        if story["codes"]:
            candidate["codesHint"] = story["codes"]
        candidate["editor"] = {key: story[key] for key in ("storyId", "title", "why", "prelimsAngle", "mainsAngle")}
        merged.append(candidate)
    order = {"must": 0, "useful": 1}
    return sorted(merged, key=lambda row: (order[row["band"]], -int(row["score"]), row["title"]))


def run_editor(
    candidates: list[dict[str, Any]],
    edition: Mapping[str, Any],
    transport: Callable[..., Any] = urlopen,
    env: Optional[Mapping[str, str]] = None,
    fixture: Optional[Path] = None,
    pyq_bank: Any = None,
    patterns: Any = None,
) -> dict[str, Any]:
    """Return {"mode": llm|fixture|fallback, "reason", "stories": merged or None}."""
    def fallback(reason: str) -> dict[str, Any]:
        return {"mode": "fallback", "reason": reason, "stories": None, "raw": None}

    if not candidates:
        return fallback("no-candidates")
    if fixture is not None:
        mode, raw = "fixture", Path(fixture).read_text(encoding="utf-8")
    else:
        try:
            raw = call_llm(build_editor_messages(candidates, edition), transport, env)
        except RuntimeError as error:
            return fallback("llm-unavailable" if str(error) == "no-llm-key" else str(error)[:200])
        except Exception as error:  # transport boundary
            return fallback(str(error)[:200] or error.__class__.__name__)
        mode = "llm"
    stories = parse_editor_response(raw, {row["fingerprint"] for row in candidates})
    if stories is None:
        return fallback("invalid-editor-json")
    if not any(story["upscRelevance"] != "skip" for story in stories):
        return fallback("no-editor-stories")
    merged = apply_stories(stories, candidates, pyq_bank=pyq_bank, patterns=patterns)
    return {"mode": mode, "reason": "", "stories": merged, "raw": stories}
