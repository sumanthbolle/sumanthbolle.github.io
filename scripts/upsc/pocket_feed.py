"""Project current, evidence-cleared UPSC notes into short news reads."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from typing import Any

from scripts.upsc.publish import _all_current_records, _current_notes
from scripts.upsc.verify import note_digest, should_publish


def instant(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else None
    except (ValueError, TypeError):
        return None


def canonical_json(value):
    def normalize(row):
        if isinstance(row, float) and row.is_integer():
            return int(row)
        if isinstance(row, list):
            return [normalize(item) for item in row]
        if isinstance(row, dict):
            return {key: normalize(item) for key, item in row.items()}
        return row
    return json.dumps(normalize(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def eligible(note, source, now):
    check = note.get("verification") or {}
    if not isinstance(check, dict):
        return False
    published = instant(source.get("publishedAt"))
    checked = instant(check.get("checkedAt"))
    return bool(
        isinstance(check, dict) and should_publish(check)
        and check.get("verificationVersion") == 2
        and check.get("noteContentHash") == note_digest(note)
        and check.get("sourceContentHash") == source.get("contentHash")
        and note.get("sourceContentHash") == source.get("contentHash")
        and note.get("sourceUrl") == source.get("sourceUrl")
        and source.get("sourceVerified") is True
        and note.get("editorialStatus") in ("source-backed", "reviewed")
        and int(note.get("priority") or 0) >= 60
        and published and now - timedelta(days=14) <= published <= now
        and checked and checked <= now + timedelta(minutes=1)
    )


def pocket_article(note, source):
    facts = [row for row in note.get("officialFacts", []) if isinstance(row, dict)
             and row.get("verification") == "source-backed"
             and row.get("evidenceUrl") == source["sourceUrl"]
             and row.get("text")]
    if not facts or not note.get("staticDefinition") or not note.get("whyInNews"):
        return None
    sections = [
        {"heading": "What the source says", "paragraphs": [row["text"] for row in facts]},
        {"heading": note["anchor"], "paragraphs": [note["staticDefinition"]] + list(note.get("background") or [])[:2]},
    ]
    implications = list(note.get("indiaImplications") or [])[:2]
    if implications:
        sections.append({"heading": "What it means for India", "paragraphs": implications})
    codes = note["codes"]
    paper = ", ".join(note["papers"])
    subject = {"GS1": "Society", "GS2": "Polity & governance", "GS3": "Economy & environment",
               "GS4": "Ethics", "ESSAY": "Ideas"}.get(note["papers"][0], "Current affairs")
    cloze = next((row.get("cloze") for row in facts if isinstance(row.get("cloze"), dict)
                  and row["cloze"].get("prompt") and row["cloze"].get("answer")), None)
    reading = note.get("pocketRead") or {}
    if reading:
        # Only the checked note can supply prose: eligible() binds every field to
        # the exact note hash. Never rewrite the headline or answer after checking.
        text = lambda value, limit: isinstance(value, str) and bool(value.strip()) and len(value) <= limit
        rows = reading.get("sections") if isinstance(reading, dict) else None
        question = reading.get("question") if isinstance(reading, dict) else None
        if (not isinstance(reading, dict) or not text(reading.get("title"), 120) or not text(reading.get("excerpt"), 240)
            or not isinstance(rows, list) or not 2 <= len(rows) <= 4
            or not all(isinstance(row, dict) and text(row.get("heading"), 100)
                and isinstance(row.get("paragraphs"), list) and 1 <= len(row["paragraphs"]) <= 3
                and all(text(p, 900) for p in row["paragraphs"]) for row in rows)
            or not isinstance(question, dict) or not text(question.get("prompt"), 360)
            or not text(question.get("answer"), 700)):
            return None
        example = reading.get("example")
        if example is not None and (not isinstance(example, dict) or not text(example.get("heading"), 100) or not text(example.get("text"), 900)):
            return None
        sections = [{"heading": row["heading"], "paragraphs": row["paragraphs"]} for row in rows]
    sections[0]["sourceRefs"] = [0]
    article = {
        "id": "news-" + source["id"], "sourceId": source["id"],
        "sourceContentHash": source["contentHash"], "verification": note["verification"],
        "title": reading.get("title") or source["title"], "kind": "News brief", "subject": subject,
        "paper": paper, "codes": codes, "anchor": note["anchor"],
        "excerpt": reading.get("excerpt") or note["whyInNews"], "sections": sections,
        "publishedOn": source["publishedAt"][:10], "publishedAt": source["publishedAt"],
        "publicationDateKind": "detected" if source.get("datePolicy") == "fetched-at" else "published",
        "takeaway": note.get("recallCard") or note["use"],
        "question": reading["question"]["prompt"] if reading else (cloze["prompt"] if cloze else ""),
        "recallAnswer": reading["question"]["answer"] if reading else (cloze["answer"] if cloze else ""),
        "sources": [{"label": source.get("publisherName") or "Official source", "url": source["sourceUrl"],
                     "note": source["title"] + ". " + ("Listed " if source.get("datePolicy") == "fetched-at" else "Published ") + source["publishedAt"][:10] + "."}],
    }
    if reading.get("example"):
        article["example"] = reading["example"]
    return article


def build_pocket_feed(output_root, now):
    clock = instant(now)
    if clock is None:
        raise ValueError("A timezone-aware timestamp is required")
    records, _ = _all_current_records(output_root)
    articles: list[dict[str, Any]] = []
    for note in _current_notes(output_root, records):
        source = records[note["sourceId"]]
        if eligible(note, source, clock):
            article = pocket_article(note, source)
            if article:
                articles.append(article)
    articles.sort(key=lambda row: (row["publishedAt"], row["id"]), reverse=True)
    articles = articles[:100]
    revision = sha256(canonical_json(articles).encode()).hexdigest()
    return {"version": 1, "generatedAt": now, "revision": revision, "articles": articles}
