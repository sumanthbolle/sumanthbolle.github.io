"""Small, reviewed adapters for official RSS, Atom, JSON Feed, and listings."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import json
import re
from typing import Any, Callable, Optional
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from scripts.upsc.models import SourceConfig, validate_final_url


MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)


def _iso_date(value: str) -> str:
    raw = str(value or "").strip()
    parsed = None
    parsers = (
        lambda text: parsedate_to_datetime(text),
        lambda text: datetime.fromisoformat(text.replace("Z", "+00:00")),
    )
    for parser in parsers:
        try:
            parsed = parser(raw)
            break
        except (TypeError, ValueError):
            continue
    if parsed is None:
        for date_format in (
            "%d %B, %Y", "%d %b, %Y %z", "%d %b %Y %H:%M:%S %z",
            "%d %b %Y %z", "%d %b, %Y", "%d %b %Y",
        ):
            try:
                parsed = datetime.strptime(raw, date_format)
                break
            except ValueError:
                continue
    if parsed is None:
        raise ValueError("malformed or missing publication date")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _child_text(node: ET.Element, names: tuple[str, ...]) -> str:
    for name in names:
        for child in list(node):
            local = child.tag.rsplit("}", 1)[-1]
            if local == name and child.text:
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
            published = _child_text(node, ("pubDate", "published", "updated", "date"))
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
        if title and url and (published or config.date_policy == "fetched-at"):
            rows.append({
                "title": title,
                "url": url,
                "publishedAt": _iso_date(published) if published else "",
                "summary": summary or title,
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
        self.container_depth = 0
        self.date_parts: Optional[list[str]] = None
        self.latest_date = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        values = {key: value or "" for key, value in attrs}
        classes = values.get("class", "").split()
        opened_container = tag != "a" and self.config.link_class in classes
        if opened_container:
            self.container_depth = 1
        elif self.container_depth:
            self.container_depth += 1
        if tag == "span" and "date" in classes:
            self.date_parts = []
        if tag != "a" or not (
            self.config.link_class in classes or self.container_depth > 0
        ):
            return
        try:
            url = validate_final_url(
                self.config, urljoin(self.config.endpoint, values.get("href", ""))
            )
        except ValueError:
            return
        self.current = {
            "titleParts": [],
            "url": url,
            "publishedAt": values.get("data-published-at", "") or self.latest_date,
            "summary": values.get("data-summary", ""),
            "sourceType": values.get("data-source-type", "listing"),
        }

    def handle_data(self, data: str) -> None:
        if self.date_parts is not None:
            self.date_parts.append(data)
        if self.current is not None:
            self.current["titleParts"].append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "span" and self.date_parts is not None:
            self.latest_date = re.sub(r"\s+", " ", " ".join(self.date_parts)).strip()
            self.date_parts = None
        if tag == "a" and self.current is not None:
            title = re.sub(
                r"\s+", " ", " ".join(self.current.pop("titleParts"))
            ).strip()
            if title and self.current["publishedAt"]:
                try:
                    self.current["publishedAt"] = _iso_date(
                        self.current["publishedAt"]
                    )
                except ValueError:
                    self.current = None
                else:
                    self.current["title"] = title
                    if not self.current.get("summary"):
                        self.current["summary"] = title
                    self.rows.append(self.current)
            self.current = None
        if self.container_depth:
            self.container_depth -= 1


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
    rows, _ = fetch_source_details(config, opener)
    return rows


def fetch_source_details(
    config: SourceConfig,
    opener: Callable[..., Any] = urlopen,
) -> tuple[list[dict[str, str]], dict[str, str]]:
    request = Request(config.endpoint, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/feed+json, application/json, text/html;q=0.8, */*;q=0.5",
    })
    with opener(request, timeout=20) as response:
        final_url = response.geturl()
        validate_final_url(config, final_url)
        body = response.read(MAX_PAYLOAD_BYTES + 1)
        if len(body) > MAX_PAYLOAD_BYTES:
            raise ValueError("source payload exceeds 5 MiB")
        content_type = response.headers.get("Content-Type", "")
    rows = parse_payload(config, body, content_type)
    return rows, {"finalUrl": final_url, "contentType": content_type}
