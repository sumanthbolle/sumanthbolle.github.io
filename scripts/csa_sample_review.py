"""Print a random-but-deterministic sample of CSA questions for hand review."""
import json
import random
from collections import defaultdict


def main(seed=1, per_topic=6):
    random.seed(seed)
    with open("quiz-questions.json", encoding="utf-8") as f:
        csa = json.load(f)["csa"]
    by_topic = defaultdict(list)
    for q in csa:
        by_topic[q.get("topic", "?")].append(q)
    sample = []
    for t in sorted(by_topic):
        bucket = by_topic[t]
        random.shuffle(bucket)
        sample.extend(bucket[:per_topic])

    for q in sample:
        opts = q.get("options") or []
        correct = q.get("correct") or []
        print("=" * 78)
        print(f"[{q.get('topic','?')}] {q['id']}")
        print("Q:", q["q"])
        for i, o in enumerate(opts):
            mk = "  <CORRECT>" if i in correct else ""
            print(f"  {i}: {o}{mk}")
        expl = q.get("explanation") or ""
        if "not provided" not in expl.lower():
            print("EXPL:", expl[:280])
        print()


if __name__ == "__main__":
    main()
