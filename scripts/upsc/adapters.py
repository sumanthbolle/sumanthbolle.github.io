"""Small, reviewed adapters for official RSS, Atom, JSON Feed, and listings."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import json
from typing import Any, Callable, Optional
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from scripts.upsc.models import SourceConfig, validate_final_url


MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
USER_AGENT = "Anchor-UPSC-Publisher/1.0 (+https://sumanthbolle.com/upsc)"


def _iso_date(value: str) -> str:
    raw = str(value or "").strip()
    try:
        if "," in raw:
            parsed = parsedate_to_datetime(raw)
        else:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError("malformed or missing publication date") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _child_text(node: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1]
        if local in names and child.text:
            return child.text.strip()
    return ""


def _parse_xml(config: SourceConfig, body: bytes) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as error:
        raise ValueError("malformed XML payload") from error
    root_name = root.tag.rsplit("}", 1)[-1].lower()
    rows: list[dict[str, str]] = []
    if config.adapter == "rss" and root_name != "rss":
        raise ValueError("malformed RSS payload")
    if config.adapter == "atom" and root_name != "feed":
        raise ValueError("malformed Atom payload")

    item_name = "item" if config.adapter == "rss" else "entry"
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != item_name:
            continue
        title = _child_text(node, ("title",))
        if config.adapter == "rss":
            url = _child_text(node, ("link", "guid"))
            published = _child_text(node, ("pubDate", "published", "date"))
            summary = _child_text(node, ("description", "summary", "content"))
            source_type = _child_text(node, ("category",)) or "release"
        else:
            url = ""
            for child in list(node):
                if child.tag.rsplit("}", 1)[-1] == "link":
                    rel = child.attrib.get("rel", "alternate")
                    if rel == "alternate" and child.attrib.get("href"):
                        url = child.attrib["href"]
                        break
            published = _child_text(node, ("published", "updated"))
            summary = _child_text(node, ("summary", "content"))
            source_type = "update"
            for child in list(node):
                if child.tag.rsplit("}", 1)[-1] == "category":
                    source_type = child.attrib.get("term", source_type)
                    break
        if title and url and published:
            rows.append({
                "title": title,
                "url": url,
                "publishedAt": _iso_date(published),
                "summary": summary,
                "sourceType": source_type,
            })
    if not rows:
        raise ValueError("malformed feed: no complete items")
    return rows


def _parse_json_feed(body: bytes) -> list[dict[str, str]]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("malformed JSON Feed payload") from error
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError("malformed JSON Feed payload")
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or item.get("external_url") or "").strip()
        published = item.get("date_published") or item.get("date_modified")
        if not title or not url or not published:
            continue
        tags = item.get("tags") if isinstance(item.get("tags"), list) else []
        rows.append({
            "title": title,
            "url": url,
            "publishedAt": _iso_date(str(published)),
            "summary": str(item.get("summary") or item.get("content_text") or ""),
            "sourceType": str(tags[0]) if tags else "update",
        })
    if not rows:
        raise ValueError("malformed JSON Feed: no complete items")
    return rows


class _ListingParser(HTMLParser):
    def __init__(self, config: SourceConfig) -> None:
        super().__init__(convert_charrefs=True)
        self.config = config
        self.current: Optional[dict[str, Any]] = None
        self.rows: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.lower() != "a":
            return
        values = {key: value or "" for key, value in attrs}
        classes = values.get("class", "").split()
        if self.config.link_class not in classes:
            return
        try:
            url = validate_final_url(self.config, values.get("href", ""))
        except ValueError:
            return
        self.current = {
            "titleParts": [],
            "url": url,
            "publishedAt": values.get("data-published-at", ""),
            "summary": values.get("data-summary", ""),
            "sourceType": values.get("data-source-type", "listing"),
        }

    def handle_data(self, data: str) -> None:
        if self.current is not None:
            self.current["titleParts"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self.current is None:
            return
        title = " ".join(self.current.pop("titleParts")).strip()
        if title and self.current["publishedAt"]:
            self.current["title"] = title
            self.current["publishedAt"] = _iso_date(self.current["publishedAt"])
            self.rows.append(self.current)
        self.current = None


def parse_payload(
    config: SourceConfig,
    body: bytes,
    content_type: str,
) -> list[dict[str, str]]:
    mime = str(content_type or "").split(";", 1)[0].strip().lower()
    if config.adapter in ("rss", "atom"):
        if mime not in ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml"):
            raise ValueError("unexpected feed content type")
        return _parse_xml(config, body)
    if config.adapter == "json-feed":
        if mime not in ("application/feed+json", "application/json"):
            raise ValueError("unexpected JSON Feed content type")
        return _parse_json_feed(body)
    if config.adapter == "listing":
        if mime != "text/html":
            raise ValueError("unexpected listing content type")
        parser = _ListingParser(config)
        try:
            parser.feed(body.decode("utf-8"))
            parser.close()
        except (UnicodeDecodeError, ValueError) as error:
            raise ValueError("malformed listing payload") from error
        if not parser.rows:
            raise ValueError("malformed listing: no reviewed links")
        return parser.rows
    raise ValueError("unsupported adapter")


def fetch_source(
    config: SourceConfig,
    opener: Callable[..., Any] = urlopen,
) -> list[dict[str, str]]:
    request = Request(config.endpoint, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/html;q=0.8",
    })
    with opener(request, timeout=20) as response:
        validate_final_url(config, response.geturl())
        body = response.read(MAX_PAYLOAD_BYTES + 1)
        if len(body) > MAX_PAYLOAD_BYTES:
            raise ValueError("source payload exceeds 5 MiB")
        content_type = response.headers.get("Content-Type", "")
    return parse_payload(config, body, content_type)
