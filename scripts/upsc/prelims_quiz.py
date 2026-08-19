#!/usr/bin/env python3
"""Build UPSC Prelims statement-based MCQs from published Pattern Atlas anchors."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.publish import _read_json, _write_json


TRAP_TYPES = (
    "numerical-threshold",
    "exception",
    "only-qualifier",
    "date",
)
TWO_OPTIONS = ("1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2")
THREE_OPTIONS = (
    "1 and 2 only",
    "2 and 3 only",
    "1 and 3 only",
    "1, 2 and 3",
)
YEAR_RE = re.compile(r"\b(1[89]\d{2}|20\d{2})\b")
NUMBER_RE = re.compile(r"\b(\d{1,4})(?:\.\d+)?\b")


def _clean(value: Any, limit: int = 360) -> str:
    return " ".join(str(value or "").split())[:limit].strip()


def _facts(anchor: Mapping[str, Any]) -> list[str]:
    facts: list[str] = []
    for key in ("static_core", "verify"):
        for row in anchor.get(key) or []:
            text = _clean(row)
            if text and text not in facts:
                facts.append(text)
    angle = _clean(anchor.get("prelims_angle"), 280)
    if angle:
        facts.append(angle)
    if len(facts) == 1:
        facts.append("The statement above is an official-syllabus formulation of the same concept.")
    return facts[:5]


def choose_trap_type(text: str, index: int) -> str:
    if YEAR_RE.search(text):
        return "date"
    if NUMBER_RE.search(text):
        return "numerical-threshold"
    return TRAP_TYPES[(index % 2) + 1]  # exception or only-qualifier


def apply_trap(text: str, trap_type: str) -> str:
    if trap_type == "date":
        mutated, count = YEAR_RE.subn(
            lambda match: str(int(match.group(1)) - 1), text, count=1
        )
        if count:
            return mutated
    if trap_type == "numerical-threshold":
        def bump(match: re.Match[str]) -> str:
            raw = match.group(1)
            return str(int(raw) + 1)
        mutated, count = NUMBER_RE.subn(bump, text, count=1)
        if count:
            return mutated
    if trap_type == "only-qualifier":
        if not re.search(r"\bonly\b", text, re.I):
            return "Only " + text[:1].lower() + text[1:] if text else text
    if trap_type == "exception":
        if "except" not in text.lower():
            return text.rstrip(".") + ", except where a later statute provides otherwise."
    return "Only " + text if text else text


def _truth_pattern(index: int, count: int) -> tuple[bool, ...]:
    if count == 2:
        patterns = ((True, False), (False, True), (True, True), (False, False))
        return patterns[index % 4]
    if count == 3:
        patterns = (
            (True, True, False),
            (False, True, True),
            (True, False, True),
            (True, True, True),
        )
        return patterns[index % 4]
    flags = [True] * count
    flags[index % count] = False
    return tuple(flags)


def _options_for(count: int) -> tuple[str, ...]:
    if count == 2:
        return TWO_OPTIONS
    if count == 3:
        return THREE_OPTIONS
    return TWO_OPTIONS


def _correct_option(truths: Sequence[bool]) -> str:
    if len(truths) == 2:
        if truths == (True, False):
            return "1 only"
        if truths == (False, True):
            return "2 only"
        if truths == (True, True):
            return "Both 1 and 2"
        return "Neither 1 nor 2"
    if len(truths) == 3:
        if truths == (True, True, False):
            return "1 and 2 only"
        if truths == (False, True, True):
            return "2 and 3 only"
        if truths == (True, False, True):
            return "1 and 3 only"
        if truths == (True, True, True):
            return "1, 2 and 3"
    true_indexes = [str(i + 1) for i, flag in enumerate(truths) if flag]
    if not true_indexes:
        return "Neither 1 nor 2"
    if len(true_indexes) == len(truths):
        return "1, 2 and 3" if len(truths) == 3 else "Both 1 and 2"
    return " and ".join(true_indexes) + " only"


def _explanation(anchor: Mapping[str, Any], trap_type: str, statements: Sequence[str]) -> str:
    traps = [_clean(row, 220) for row in (anchor.get("traps") or [])]
    traps = [row for row in traps if row]
    hook = traps[0] if traps else _clean(anchor.get("prelims_angle"), 220)
    topic = _clean(anchor.get("anchor"), 120) or "this topic"
    trap_label = {
        "numerical-threshold": "a numerical threshold that looks official but is shifted",
        "exception": "an exception qualifier that is not in the standing formulation",
        "only-qualifier": "an 'only' limiter that makes a true statement too narrow",
        "date": "a date/year distractor that is one cycle off",
    }[trap_type]
    detail = hook or "Check the static core against the official text before committing the fact."
    return (
        f"{topic}: {detail} This item plants {trap_label}. "
        f"Compare each statement with the standing anchor rather than the news cycle."
    )[:600]


def build_question(anchor: Mapping[str, Any], index: int = 0) -> dict[str, Any]:
    facts = _facts(anchor)
    if len(facts) < 2:
        raise ValueError("anchor needs at least two Prelims facts")
    count = 3 if len(facts) >= 3 and index % 5 == 0 else 2
    count = max(2, min(5, count))
    base = facts[:count]
    trap_type = choose_trap_type(" ".join(base), index)
    if trap_type not in TRAP_TYPES:
        trap_type = "only-qualifier"
    truths = _truth_pattern(index, count)
    statements: list[str] = []
    for fact, is_true in zip(base, truths):
        statements.append(fact if is_true else apply_trap(fact, trap_type))
    options = list(_options_for(count))
    correct = _correct_option(truths)
    if correct not in options:
        options = list(TWO_OPTIONS)
        statements = statements[:2]
        truths = truths[:2]
        correct = _correct_option(truths)
        trap_type = choose_trap_type(statements[0], index) if statements else "only-qualifier"
    question = {
        "anchor_id": _clean(anchor.get("id"), 80),
        "statements": statements,
        "question_stem": "Which of the statements given above is/are correct?",
        "options": options,
        "correct_option": correct,
        "trap_type": trap_type,
        "explanation": _explanation(anchor, trap_type, statements),
    }
    return validate_question(question)


def validate_question(item: Mapping[str, Any]) -> dict[str, Any]:
    statements = [ _clean(row, 360) for row in (item.get("statements") or []) ]
    statements = [row for row in statements if row]
    options = [ _clean(row, 80) for row in (item.get("options") or []) ]
    options = [row for row in options if row]
    trap_type = _clean(item.get("trap_type"), 40)
    explanation = _clean(item.get("explanation"), 600)
    correct = _clean(item.get("correct_option"), 80)
    if not (2 <= len(statements) <= 5):
        raise ValueError("Prelims item must have 2-5 statements")
    if len(options) < 4 or correct not in options:
        raise ValueError("Prelims item needs a valid option set")
    if trap_type not in TRAP_TYPES:
        raise ValueError("Prelims item needs a recognised trap_type")
    if not explanation:
        raise ValueError("Prelims item needs an explanation")
    return {
        "anchor_id": _clean(item.get("anchor_id"), 80),
        "statements": statements,
        "question_stem": _clean(item.get("question_stem"), 160)
        or "Which of the statements given above is/are correct?",
        "options": options,
        "correct_option": correct,
        "trap_type": trap_type,
        "explanation": explanation,
    }


def generate_quiz(
    anchors: Sequence[Mapping[str, Any]],
    now: str,
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for index, anchor in enumerate(anchors):
        if not isinstance(anchor, Mapping) or not anchor.get("id"):
            continue
        try:
            items.append(build_question(anchor, index))
        except ValueError:
            continue
    return {
        "generatedAt": now,
        "itemCount": len(items),
        "trapTypes": list(TRAP_TYPES),
        "items": items,
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
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    payload = generate_quiz(load_anchors(args.patterns), now)
    _write_json(args.output / "prelims-quiz.json", payload)
    print(json.dumps({
        "generatedAt": payload["generatedAt"],
        "itemCount": payload["itemCount"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
