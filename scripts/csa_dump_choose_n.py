"""Dump every Choose-N question with its options so we can fix correct[]."""
import json

with open("quiz-questions.json", encoding="utf-8") as f:
    csa = json.load(f)["csa"]

with open("/tmp/choose_n_mismatch.json") as f:
    bad = json.load(f)

ids = {b["id"]: b for b in bad}

for q in csa:
    if q["id"] not in ids:
        continue
    b = ids[q["id"]]
    print("=" * 78)
    print(f"{q['id']}  topic={q.get('topic')}  req={b['requested']} marked={b['marked']}")
    print("Q:", q["q"].replace("\n", " ").strip())
    for i, o in enumerate(q.get("options") or []):
        mk = "  <CURRENT_CORRECT>" if i in (q.get("correct") or []) else ""
        print(f"  {i}: {o}{mk}")
    print()
