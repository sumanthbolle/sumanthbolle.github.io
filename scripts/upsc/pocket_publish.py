"""Publish at most one approved Pocket read per Singapore calendar day."""
import argparse
from datetime import date, datetime
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

if __package__:
    from .models import SYLLABUS_CODES
else:
    from models import SYLLABUS_CODES


def validate_article(article):
    if not isinstance(article, dict) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(article.get("id", ""))):
        raise ValueError("Article needs a stable lowercase id")
    for key in ["title", "subject", "paper", "kind", "excerpt", "anchor", "takeaway", "question", "recallAnswer"]:
        if not isinstance(article.get(key), str) or not article[key].strip():
            raise ValueError(f"Missing {key}")
    sections = article.get("sections", [])
    if not isinstance(sections, list) or len(sections) < 2:
        raise ValueError("Article needs at least two substantive sections")
    paragraphs = []
    for section in sections:
        if not isinstance(section, dict) or not isinstance(section.get("heading"), str) or not section["heading"].strip() or not isinstance(section.get("paragraphs"), list) or not section["paragraphs"]:
            raise ValueError("Each section needs a heading and paragraphs")
        if not all(isinstance(row, str) and row.strip() for row in section["paragraphs"]):
            raise ValueError("Paragraphs must be plain text")
        paragraphs.extend(section["paragraphs"])
    if not 200 <= len(" ".join(paragraphs).split()) <= 450:
        raise ValueError("Keep the main article between 200 and 450 words")
    if not isinstance(article.get("codes"), list) or not article["codes"] or not all(isinstance(code, str) and code in SYLLABUS_CODES for code in article["codes"]):
        raise ValueError("Article needs valid syllabus codes")
    example = article.get("example")
    if not isinstance(example, dict) or not all(isinstance(example.get(key), str) and example[key].strip() for key in ["heading", "text"]):
        raise ValueError("Add a worked example, labelled as an illustration")
    comparison = article.get("comparison")
    if comparison is not None:
        if not isinstance(comparison, dict) or not isinstance(comparison.get("heading"), str) or not isinstance(comparison.get("rows"), list) or not comparison["rows"]:
            raise ValueError("Comparison needs a heading and rows")
        for row in [comparison.get("columns")] + comparison["rows"]:
            if not isinstance(row, list) or len(row) != 2 or not all(isinstance(cell, str) and cell.strip() for cell in row):
                raise ValueError("Comparison needs two text columns per row")
    sources = article.get("sources", [])
    if not isinstance(sources, list) or not sources:
        raise ValueError("Article needs primary-source references")
    for source in sources:
        if not isinstance(source, dict) or not isinstance(source.get("url"), str):
            raise ValueError("Source needs a URL")
        url = urlparse(source.get("url", ""))
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("Sources must use HTTPS URLs")
        if not all(isinstance(source.get(key), str) and source[key].strip() for key in ["label", "note"]):
            raise ValueError("Each source needs a label and a precise reading locator")


def publish_one(library_path, queue_path, today):
    date.fromisoformat(today)
    library = json.loads(library_path.read_text())
    queue = json.loads(queue_path.read_text())
    articles = library["articles"]
    if any(article.get("publishedOn") == today for article in articles):
        return "A Pocket read is already published for this date"
    ready = []
    for item in queue["entries"]:
        if item.get("status") != "approved":
            continue
        approved = date.fromisoformat(item.get("approvedOn", ""))
        scheduled = date.fromisoformat(item.get("publishOn", ""))
        if approved <= date.fromisoformat(today) and scheduled <= date.fromisoformat(today):
            ready.append(item)
    if not ready:
        return "No approved Pocket reads are due; existing articles remain available"
    item = min(ready, key=lambda row: (row["publishOn"], row["approvedOn"]))
    article = dict(item["article"])
    validate_article(article)
    if any(row["id"] == article["id"] for row in articles):
        raise ValueError("This id is already published; edit it without creating a fresh publication date")
    article["publishedOn"] = today
    article.pop("updatedOn", None)
    articles.insert(0, article)
    item.update(status="published", publishedOn=today, articleId=article["id"])
    del item["article"]
    for path, payload in [(library_path, library), (queue_path, queue)]:
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(path)
    return f"Published {article['id']} on {today}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, default=Path("data/upsc-pocket-reads.json"))
    parser.add_argument("--queue", type=Path, default=Path("data/upsc-pocket-queue.json"))
    parser.add_argument("--date", default=datetime.now(ZoneInfo("Asia/Singapore")).date().isoformat())
    args = parser.parse_args()
    print(publish_one(args.library, args.queue, args.date))
