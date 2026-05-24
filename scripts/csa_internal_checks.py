"""Cheap internal-consistency checks for the CSA question bank.

Flags questions that are likely wrong before we spend any doc-lookup budget:
 - duplicate question text (same canonical q)
 - duplicate options within a single question
 - empty / missing options or correct[]
 - correct[] indexes out of range
 - explanation that clearly contradicts the marked option
   (heuristic: explanation contains exactly one option text verbatim and it is
    NOT one of the options the question marks correct)
 - question text or option includes obvious garbage tokens (e.g. "hint:" filler,
   "ANSWER:", "C.", "Correct:", html entities, raw "&amp;" / "&nbsp;").

Outputs a json report.
"""
import json
import re
import sys
from collections import defaultdict


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def load_csa():
    with open("quiz-questions.json", encoding="utf-8") as f:
        return json.load(f)["csa"]


def check_structure(q, report):
    qid = q["id"]
    opts = q.get("options") or []
    correct = q.get("correct") or []
    if not opts:
        report.append({"id": qid, "kind": "no_options"})
    if not correct:
        report.append({"id": qid, "kind": "no_correct"})
    for c in correct:
        if not isinstance(c, int) or c < 0 or c >= len(opts):
            report.append({"id": qid, "kind": "correct_out_of_range", "correct": correct, "n_opts": len(opts)})
    seen = set()
    for i, o in enumerate(opts):
        n = normalize(o)
        if not n:
            report.append({"id": qid, "kind": "empty_option", "index": i})
        if n in seen:
            report.append({"id": qid, "kind": "duplicate_option", "text": o})
        seen.add(n)


GARBAGE_PATTERNS = [
    (re.compile(r"\bhint\s*:", re.I), "hint_filler"),
    (re.compile(r"\banswer\s*:", re.I), "answer_filler"),
    (re.compile(r"\bcorrect\s*:", re.I), "correct_filler"),
    (re.compile(r"&(?:amp|nbsp|lt|gt|quot|apos);"), "html_entity"),
    (re.compile(r"^[A-D][\.\)]\s"), "letter_prefix"),
]


def check_garbage(q, report):
    qid = q["id"]
    blobs = [("q", q.get("q", ""))]
    for i, o in enumerate(q.get("options") or []):
        blobs.append((f"opt[{i}]", o or ""))
    blobs.append(("explanation", q.get("explanation", "")))
    for label, text in blobs:
        for pat, name in GARBAGE_PATTERNS:
            if pat.search(text or ""):
                report.append({"id": qid, "kind": "garbage_token", "where": label, "pattern": name, "snippet": (text or "")[:120]})


def check_explanation_matches(q, report):
    """If the explanation mentions exactly one of the option strings verbatim and that
    option is NOT marked correct, that is highly suspicious."""
    qid = q["id"]
    opts = q.get("options") or []
    correct = set(q.get("correct") or [])
    expl = normalize(q.get("explanation") or "")
    if not expl or not opts:
        return
    hits = []
    for i, o in enumerate(opts):
        n = normalize(o)
        if len(n) < 4:
            continue
        if n in expl:
            hits.append((i, o))
    if len(hits) == 1:
        idx, txt = hits[0]
        if idx not in correct and len(correct) == 1:
            report.append({
                "id": qid,
                "kind": "explanation_points_elsewhere",
                "marked_correct": list(correct),
                "explanation_mentions": idx,
                "option_text": txt,
                "q": q.get("q", "")[:160],
                "explanation": q.get("explanation", "")[:240],
            })


def check_duplicate_questions(csa, report):
    seen = defaultdict(list)
    for q in csa:
        seen[normalize(q.get("q", ""))].append(q["id"])
    for key, ids in seen.items():
        if len(ids) > 1:
            report.append({"kind": "duplicate_question", "ids": ids, "q": key[:200]})


def main():
    csa = load_csa()
    report = []
    for q in csa:
        check_structure(q, report)
        check_garbage(q, report)
        check_explanation_matches(q, report)
    check_duplicate_questions(csa, report)

    by_kind = defaultdict(int)
    for r in report:
        by_kind[r["kind"]] += 1

    print("Total CSA questions:", len(csa))
    print("Findings by kind:")
    for k, n in sorted(by_kind.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {n}")

    out = {"summary": dict(by_kind), "findings": report}
    with open("/tmp/csa_internal_report.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("Wrote /tmp/csa_internal_report.json")


if __name__ == "__main__":
    main()
