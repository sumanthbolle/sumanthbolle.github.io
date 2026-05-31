#!/usr/bin/env python3
"""Validate the SNAF checklist quiz pack: structural integrity, correct-answer
mapping, topic validity, and cross-file consistency. Exits non-zero on failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
QFILES = [REPO_ROOT / "quiz-questions.json", REPO_ROOT / "data/quiz/questions.json"]
CFILES = [REPO_ROOT / "quiz-categories.json", REPO_ROOT / "data/quiz/categories.json"]
SOURCE_SET = "snaf_checklist"
CATEGORY = "csa"

errors: list[str] = []


def err(msg):
    errors.append(msg)


def main():
    cats = json.load(open(CFILES[0]))
    valid_topics = {t["id"] for t in cats[CATEGORY]["topics"]}

    # Mode registered with correct sourceSet
    for cf in CFILES:
        c = json.load(open(cf))
        modes = [m for m in c[CATEGORY]["modes"] if m.get("id") == "snaf-pack"]
        if not modes:
            err(f"{cf.name}: snaf-pack mode missing")
        elif modes[0].get("sourceSet") != SOURCE_SET:
            err(f"{cf.name}: snaf-pack sourceSet mismatch -> {modes[0].get('sourceSet')}")

    packs = {}
    for qf in QFILES:
        data = json.load(open(qf))
        pack = [q for q in data[CATEGORY] if q.get("sourceSet") == SOURCE_SET]
        packs[qf.name] = pack

        seen = set()
        for q in pack:
            qid = q.get("id", "<no-id>")
            # unique id
            if qid in seen:
                err(f"{qf.name}: duplicate id {qid}")
            seen.add(qid)
            # required fields
            for f in ("q", "options", "correct", "explanation", "topic", "type"):
                if not q.get(f):
                    err(f"{qf.name}/{qid}: missing/empty field '{f}'")
            opts = q.get("options", [])
            # options non-empty + unique
            if len(opts) < 2:
                err(f"{qf.name}/{qid}: needs >=2 options")
            if any(not str(o).strip() for o in opts):
                err(f"{qf.name}/{qid}: empty option text")
            if len(set(opts)) != len(opts):
                err(f"{qf.name}/{qid}: duplicate option text")
            # correct indices in range, sorted, unique
            cor = q.get("correct", [])
            if not isinstance(cor, list) or not cor:
                err(f"{qf.name}/{qid}: correct must be non-empty list")
            else:
                if any((not isinstance(c, int)) or c < 0 or c >= len(opts) for c in cor):
                    err(f"{qf.name}/{qid}: correct index out of range {cor}")
                if len(set(cor)) != len(cor):
                    err(f"{qf.name}/{qid}: duplicate correct index {cor}")
            # multi flag consistency
            if len(cor) > 1 and q.get("multi") != len(cor):
                err(f"{qf.name}/{qid}: multi flag ({q.get('multi')}) != #correct ({len(cor)})")
            if len(cor) == 1 and "multi" in q:
                err(f"{qf.name}/{qid}: single-answer question should not set multi")
            # topic valid
            if q.get("topic") not in valid_topics:
                err(f"{qf.name}/{qid}: invalid topic '{q.get('topic')}'")

        # ensure ids cover csa-snaf-001..NNN with no gaps
        nums = sorted(int(q["id"].split("-")[-1]) for q in pack if q["id"].startswith("csa-snaf-"))
        expected = list(range(1, len(nums) + 1))
        if nums != expected:
            err(f"{qf.name}: id numbering not contiguous from 001 ({nums[:3]}...{nums[-3:]})")

    # cross-file: both packs identical
    names = list(packs)
    if json.dumps(packs[names[0]], sort_keys=True) != json.dumps(packs[names[1]], sort_keys=True):
        err("root and data/quiz SNAF packs differ")

    n = len(packs[names[0]])
    if errors:
        print(f"VALIDATION FAILED ({len(errors)} issue(s)):")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print(f"VALIDATION PASSED: {n} SNAF questions, all mappings valid, files in sync.")
    # quick breakdown
    from collections import Counter
    pack = packs[names[0]]
    print("  By topic:", dict(Counter(q["topic"] for q in pack)))
    print("  By difficulty:", dict(Counter(q["difficulty"] for q in pack)))
    print("  Multi-select:", sum(1 for q in pack if len(q["correct"]) > 1))


if __name__ == "__main__":
    main()
