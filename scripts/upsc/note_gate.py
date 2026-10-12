#!/usr/bin/env python3
"""Deterministic gate for edition notes. An empty reason list means publish.

The gate never edits a note. It answers one question per rule: is every
number traceable to the evidence, does every section cite, are the codes
canonical, is the prose free of filler, and is the practice block usable.
"""

import json
from pathlib import Path
import re
import sys
from typing import Any, Iterable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.models import SYLLABUS_CODES


BANNED_PHRASES: tuple[str, ...] = (
    "in today's rapidly", "rapidly evolving", "plays a pivotal role", "pivotal",
    "it is worth noting", "it is important to note", "delve", "landscape",
    "multifaceted", "in conclusion", "a testament to", "navigating",
    "robust framework", "holistic", "game-changer", "paradigm shift", "tapestry",
    "underscores", "in the realm of",
)
WORD_RANGES = {"news": (450, 900), "explained": (450, 900), "editorial": (800, 1300)}
REQUIRED = ("title", "deck", "oneLine", "subject", "codes", "whyInNews", "sections",
            "keyNumbers", "back2basics", "practice", "sources")
NUMBER_RE = re.compile(
    r"(?<!\d)(?<!\d\.)(\d+(?:,\d{2,3})*(?:\.\d+)?)(?:\s*[-–—/]\s*(\d{2,4})(?![\d,]))?"
)


def _canonical(raw: str) -> str:
    value = raw.replace(",", "")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value.lstrip("0") or "0"


def normalise_numbers(text: str) -> set[str]:
    """Comparable number tokens: ₹/%/commas dropped, ranges kept whole and split."""
    found: set[str] = set()
    for match in NUMBER_RE.finditer(str(text or "")):
        first = _canonical(match.group(1))
        parts = [first]
        if match.group(2):
            second = _canonical(match.group(2))
            parts.append(second)
            found.add(f"{first}-{second}")
        for part in parts:
            if not re.fullmatch(r"\d", part):
                found.add(part)
    return found


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def _rows(value: Any) -> list[dict[str, Any]]:
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def body_text(note: dict[str, Any]) -> str:
    """Reader-facing factual prose, excluding question headings and practice."""
    parts: list[str] = [str(note.get(key) or "") for key in ("title", "deck", "oneLine")]
    why = note.get("whyInNews")
    parts.append(str(why.get("text") or "") if isinstance(why, dict) else "")
    for section in _rows(note.get("sections")):
        for row in _rows(section.get("body")):
            parts.extend([str(row.get("label") or ""), str(row.get("text") or "")])
    for row in _rows(note.get("keyNumbers")):
        parts.extend([str(row.get("figure") or ""), str(row.get("meaning") or "")])
    basics = note.get("back2basics")
    if isinstance(basics, dict):
        parts.extend([str(basics.get("concept") or ""), str(basics.get("text") or "")])
    for row in _rows(note.get("wayForward")):
        parts.extend([str(row.get("label") or ""), str(row.get("text") or "")])
    parts.append(str(note.get("misconception") or ""))
    return " ".join(part for part in parts if part).strip()


def word_count(note: dict[str, Any]) -> int:
    headings = " ".join(str(row.get("heading") or "") for row in _rows(note.get("sections")))
    return len((body_text(note) + " " + headings).split())


def _missing(note: dict[str, Any]) -> list[str]:
    reasons = [f"missing:{field}" for field in REQUIRED if not note.get(field) and note.get(field) != []]
    reasons += [f"missing:{field}" for field in ("sections", "sources", "codes") if note.get(field) == []]
    why = note.get("whyInNews")
    if note.get("whyInNews") and not (isinstance(why, dict) and str(why.get("text") or "").strip()):
        reasons.append("missing:whyInNews")
    basics = note.get("back2basics")
    if basics and not (isinstance(basics, dict) and str(basics.get("text") or "").strip()):
        reasons.append("missing:back2basics")
    practice = note.get("practice") if isinstance(note.get("practice"), dict) else {}
    if note.get("practice"):
        for field in ("mcq", "mains"):
            if not isinstance(practice.get(field), dict):
                reasons.append(f"missing:practice.{field}")
        if isinstance(practice.get("mains"), dict) and not str(practice["mains"].get("question") or "").strip():
            reasons.append("missing:practice.mains")
        faq = _rows(practice.get("faq"))
        if len(faq) != 3 or not all(str(row.get("q") or "").strip() and str(row.get("a") or "").strip() for row in faq):
            reasons.append("missing:practice.faq")
    return list(dict.fromkeys(reasons))


def _codes(note: dict[str, Any]) -> list[str]:
    codes = note.get("codes")
    if not isinstance(codes, list) or not codes:
        return []
    reasons = [f"bad-code:{code}" for code in codes if code not in SYLLABUS_CODES]
    if len(codes) > 3:
        reasons.append("bad-code:count")
    return reasons


def _numbers(note: dict[str, Any], evidence_text: str) -> list[str]:
    evidence = normalise_numbers(evidence_text)
    body = normalise_numbers(body_text(note))
    unsupported = {
        number for number in body - evidence
        # A range is supported when each end is, e.g. "2025-26" against "2025 to 26".
        if not ("-" in number and set(number.split("-")) <= evidence | set("0123456789"))
    }
    reasons = [f"unsupported-number:{number}" for number in sorted(unsupported)]
    practice = note.get("practice") if isinstance(note.get("practice"), dict) else {}
    faq_text = " ".join(_strings(_rows(practice.get("faq"))))
    reasons += [f"faq-number-not-in-body:{number}" for number in sorted(normalise_numbers(faq_text) - body)]
    return reasons


def _banned(note: dict[str, Any]) -> list[str]:
    text = " ".join(_strings(note)).lower().replace("’", "'")
    return [f"banned:{phrase}" for phrase in BANNED_PHRASES if phrase in text]


def _valid_refs(refs: Any, count: int) -> bool:
    if not isinstance(refs, list) or not refs:
        return False
    return all(isinstance(ref, int) and not isinstance(ref, bool) and 1 <= ref <= count for ref in refs)


def _sourcing(note: dict[str, Any]) -> list[str]:
    count = len(_rows(note.get("sources")))
    reasons: list[str] = []
    why = note.get("whyInNews")
    if isinstance(why, dict) and why.get("text") and not _valid_refs(why.get("sources"), count):
        reasons.append("section-without-source:whyInNews")
    for index, section in enumerate(_rows(note.get("sections"))):
        if not _valid_refs(section.get("sources"), count):
            reasons.append(f"section-without-source:{index}")
    if any(not _valid_refs([row.get("source")], count) for row in _rows(note.get("keyNumbers"))):
        reasons.append("section-without-source:keyNumbers")
    if any(not _valid_refs([row.get("source")], count) for row in _rows(note.get("wayForward"))):
        reasons.append("section-without-source:wayForward")
    return reasons


def _headings(note: dict[str, Any]) -> list[str]:
    return [
        f"heading-not-question:{index}"
        for index, section in enumerate(_rows(note.get("sections")))
        if not str(section.get("heading") or "").strip().endswith("?")
    ]


def _length(note: dict[str, Any]) -> list[str]:
    low, high = WORD_RANGES.get(str(note.get("kind") or "news"), WORD_RANGES["news"])
    words = word_count(note)
    return [] if low <= words <= high else [f"length:{words}"]


def _mcq(note: dict[str, Any]) -> list[str]:
    practice = note.get("practice") if isinstance(note.get("practice"), dict) else {}
    mcq = practice.get("mcq")
    if not isinstance(mcq, dict):
        return []
    options = mcq.get("options")
    answer = mcq.get("answer")
    ok = (
        str(mcq.get("stem") or "").strip()
        and isinstance(options, list) and len(options) == 4
        and all(isinstance(option, str) and option.strip() for option in options)
        and len({option.strip().lower() for option in options}) == 4
        and isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer <= 3
        and str(mcq.get("trap") or "").strip()
    )
    return [] if ok else ["bad-mcq"]


def _pyq(note: dict[str, Any], pyq_ids: set[str]) -> list[str]:
    practice = note.get("practice") if isinstance(note.get("practice"), dict) else {}
    pyq = practice.get("pyq")
    if not pyq:
        return []
    return [] if isinstance(pyq, dict) and pyq.get("id") in pyq_ids else ["pyq-not-in-bank"]


def _discovery(note: dict[str, Any]) -> list[str]:
    if str(note.get("kind") or "news") == "editorial":
        return []
    if any(row.get("kind") == "discovery" for row in _rows(note.get("sources"))):
        return ["discovery-source-on-news"]
    return []


def check_note(note: dict[str, Any], evidence_text: str, pyq_ids: set[str]) -> list[str]:
    if not isinstance(note, dict):
        return ["missing:note"]
    reasons: list[str] = []
    for check in (
        _missing(note), _codes(note), _numbers(note, evidence_text), _banned(note),
        _sourcing(note), _headings(note), _length(note), _pyq(note, set(pyq_ids)),
        _discovery(note), _mcq(note),
    ):
        reasons.extend(check)
    return list(dict.fromkeys(reasons))


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: note_gate.py <note.json> <evidence.txt>", file=sys.stderr)
        return 2
    note = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    evidence = Path(sys.argv[2]).read_text(encoding="utf-8")
    bank = json.loads((Path(__file__).resolve().parents[2] / "data/upsc/pyq-bank.json").read_text(encoding="utf-8"))
    reasons = check_note(note, evidence, {row["id"] for row in bank.get("questions", [])})
    print(json.dumps({"pass": not reasons, "reasons": reasons}, indent=2))
    return 0 if not reasons else 1


if __name__ == "__main__":
    raise SystemExit(main())
