#!/usr/bin/env python3
"""Newspaper RSS discovery: which topics matter today, never what to cite.

Only headline, link and time are kept. Discovery items decide what gets a note;
the note itself is written from official records (see evidence.py).
"""

from datetime import datetime
import gzip
from html import unescape
import io
import json
from pathlib import Path
import re
import sys
from typing import Any, Callable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.adapters import FEED_ACCEPT, MAX_PAYLOAD_BYTES, USER_AGENT, _iso_date, curl_open
from scripts.upsc.publish import _read_json


TAG_RE = re.compile(r"<[^>]+>")


def load_feeds(path: Path) -> list[dict[str, str]]:
    payload = _read_json(Path(path), {})
    rows = payload.get("discovery") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    return [
        {key: str(row.get(key) or "") for key in ("id", "publisher", "section", "url")}
        for row in rows
        if isinstance(row, dict) and row.get("id") and str(row.get("url", "")).startswith("https://")
    ]


def _plain(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(TAG_RE.sub(" ", value or ""))).strip()


def _child(node: ET.Element, *names: str) -> str:
    for child in list(node):
        if child.tag.rsplit("}", 1)[-1] in names and child.text:
            return child.text.strip()
    return ""


def parse_rss(body: bytes, feed: dict[str, str]) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as error:
        raise ValueError("malformed RSS payload") from error
    if root.tag.rsplit("}", 1)[-1].lower() != "rss":
        raise ValueError("malformed RSS payload")
    rows: list[dict[str, str]] = []
    for node in root.iter("item"):
        title = _plain(_child(node, "title"))
        url = _child(node, "link", "guid")
        raw_date = _child(node, "pubDate", "date", "published", "updated")
        if not title or not url.startswith(("http://", "https://")) or not raw_date:
            continue
        try:
            published = _iso_date(raw_date)
        except ValueError:
            continue
        rows.append({
            "title": title[:300],
            "url": url,
            "publishedAt": published,
            "feedId": feed.get("id", ""),
            "publisher": feed.get("publisher", ""),
            "section": feed.get("section", ""),
        })
    return rows


def _read(feed: dict[str, str], opener: Callable[..., Any]) -> bytes:
    request = Request(feed["url"], headers={
        "User-Agent": USER_AGENT, "Accept": FEED_ACCEPT,
        "Accept-Language": "en-IN,en;q=0.9", "Accept-Encoding": "gzip",
    })
    with opener(request, timeout=20) as response:
        body = response.read(MAX_PAYLOAD_BYTES + 1)
        encoding = str(response.headers.get("Content-Encoding", "") or "")
    if len(body) > MAX_PAYLOAD_BYTES:
        raise ValueError("feed payload exceeds 5 MiB")
    if encoding.lower().startswith("gzip"):
        with gzip.GzipFile(fileobj=io.BytesIO(body)) as compressed:
            body = compressed.read(MAX_PAYLOAD_BYTES + 1)
    return body


def _error_text(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f"HTTP {error.code}"
    if isinstance(error, URLError):
        return f"network error: {error.reason}"[:240]
    return (str(error) or error.__class__.__name__)[:240]


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fetch_discovery(
    feeds: list[dict[str, str]],
    opener: Callable[..., Any],
    since_iso: str,
    until_iso: str,
    errors: Optional[list[dict[str, str]]] = None,
) -> list[dict[str, str]]:
    """Return in-window items from every feed; per-feed failures go to `errors`."""
    since, until = _parse_time(since_iso), _parse_time(until_iso)
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for feed in feeds:
        try:
            try:
                body = _read(feed, opener)
            except HTTPError as error:
                if error.code != 403 or opener is not urlopen:
                    raise
                body = _read(feed, curl_open)
            rows = parse_rss(body, feed)
        except Exception as error:  # one broken newspaper feed never stops the edition
            if errors is not None:
                errors.append({"feedId": feed.get("id", ""), "error": _error_text(error)})
            if isinstance(error, HTTPError):
                error.close()
            continue
        for row in rows:
            if row["url"] in seen or not since <= _parse_time(row["publishedAt"]) < until:
                continue
            seen.add(row["url"])
            items.append(row)
    return sorted(items, key=lambda row: (row["publishedAt"], row["url"]))


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feeds", type=Path, default=Path("data/upsc/discovery-feeds.json"))
    parser.add_argument("--since", required=True)
    parser.add_argument("--until", required=True)
    args = parser.parse_args()
    errors: list[dict[str, str]] = []
    items = fetch_discovery(load_feeds(args.feeds), urlopen, args.since, args.until, errors)
    print(json.dumps({"items": items, "errors": errors}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
