"""Find questions whose stem says 'Choose two/three/four' but the marked correct
set has a different cardinality. This is a strong indicator of mis-marked
multi-select answers in the CSA bank.
"""
import json
import re

WORD2NUM = {
    "two": 2, "2": 2,
    "three": 3, "3": 3,
    "four": 4, "4": 4,
    "five": 5, "5": 5,
    "six": 6, "6": 6,
}

PAT = re.compile(r"choose\s+(two|three|four|five|six|\d+)", re.I)


def main():
    with open("quiz-questions.json", encoding="utf-8") as f:
        csa = json.load(f)["csa"]
    bad = []
    for q in csa:
        text = q.get("q", "")
        m = PAT.search(text)
        if not m:
            continue
        requested = WORD2NUM.get(m.group(1).lower())
        if not requested:
            continue
        marked = len(q.get("correct") or [])
        if marked != requested:
            bad.append({
                "id": q["id"],
                "topic": q.get("topic"),
                "requested": requested,
                "marked": marked,
                "q": text[:200],
                "options": q.get("options"),
                "correct": q.get("correct"),
            })
    print(f"choose-N mismatches: {len(bad)} / {len(csa)} total")
    for b in bad[:40]:
        print("-", b["id"], "req", b["requested"], "marked", b["marked"], "|", b["q"][:80])
    with open("/tmp/choose_n_mismatch.json", "w") as f:
        json.dump(bad, f, indent=2)


if __name__ == "__main__":
    main()
