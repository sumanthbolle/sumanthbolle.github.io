"""Small, reviewed adapters for official RSS, Atom, JSON Feed, and listings.

Before adding a publisher, read docs/upsc-source-criteria.md — it documents
the live `tier` values (`indian-primary`, `international-institution`) and the
checklist for a registry change. Do not invent a new tier in JSON alone.
"""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import gzip
from html.parser import HTMLParser
from http.client import responses
import io
import json
import re
import subprocess
import tempfile
from typing import Any, Callable, Optional
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from scripts.upsc.models import SourceConfig, validate_final_url


MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)
FEED_ACCEPT = (
    "application/rss+xml, application/atom+xml, application/xml, text/xml, "
    "application/feed+json, application/json, text/html;q=0.8, */*;q=0.5"
)
LISTING_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"


def _origin(config: SourceConfig) -> str:
    parts = urlsplit(config.endpoint)
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme}://{parts.netloc}"


def listing_referer(config: SourceConfig) -> str:
    """Parent page that loads a listing endpoint. MEA fetches via jQuery AJAX."""
    origin = _origin(config)
    if not origin:
        return ""
    host = (urlsplit(config.endpoint).hostname or "").lower()
    if host == "mea.gov.in" or host.endswith(".mea.gov.in"):
        return origin + "/press-releases"
    return origin + "/"


def request_headers(config: SourceConfig) -> dict[str, str]:
    """Browser-like headers. Listing endpoints are HTML pages, not feeds."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Accept": LISTING_ACCEPT if config.adapter == "listing" else FEED_ACCEPT,
        "Connection": "keep-alive",
    }
    referer = listing_referer(config) if config.adapter == "listing" else (
        _origin(config) + "/" if _origin(config) else ""
    )
    if referer:
        headers["Referer"] = referer
    if config.adapter == "listing":
        headers["X-Requested-With"] = "XMLHttpRequest"
    return headers


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


class _CurlResponse:
    def __init__(self, body: bytes, url: str, content_type: str) -> None:
        self._body = body
        self._url = url
        self.headers = {"Content-Type": content_type}

    def read(self, limit: int = -1) -> bytes:
        return self._body if limit < 0 else self._body[:limit]

    def geturl(self) -> str:
        return self._url

    def __enter__(self) -> "_CurlResponse":
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        return False


def _curl_headers(request: Request) -> dict[str, str]:
    headers = {key: value for key, value in request.header_items()}
    headers.setdefault("User-Agent", USER_AGENT)
    return headers


def _run_curl(
    url: str,
    headers: dict[str, str],
    timeout: int,
    body_path: str,
    header_path: str,
    cookie_path: str,
    use_http2: bool,
) -> tuple[str, int, str]:
    command = [
        "curl", "-sS", "-L", "--compressed",
        "--max-redirs", "5",
        "--max-time", str(max(1, int(timeout))),
        "-A", headers.get("User-Agent", USER_AGENT),
        "-b", cookie_path,
        "-c", cookie_path,
        "-o", body_path,
        "-D", header_path,
        "-w", "%{url_effective}\n%{http_code}\n%{content_type}",
    ]
    if use_http2:
        command.append("--http2")
    for key, value in headers.items():
        if key.lower() in ("user-agent", "accept-encoding"):
            continue
        command.extend(["-H", f"{key}: {value}"])
    command.append(url)
    completed = subprocess.run(
        command, capture_output=True, text=True, check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "curl failed").strip()
        raise OSError(detail[:500] or "curl failed")
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        raise OSError("curl did not report a status code")
    content_type = lines[-1] if len(lines) >= 3 else ""
    try:
        status = int(lines[-2])
    except ValueError as error:
        raise OSError("curl reported a malformed status code") from error
    final_url = lines[-3] if len(lines) >= 3 else url
    return final_url, status, content_type


def curl_open(request: Request, timeout: int = 20) -> _CurlResponse:
    """Fetch with curl. GitHub Actions urllib is often 403'd by NIC bot filters."""
    url = request.full_url
    headers = _curl_headers(request)
    referer = headers.get("Referer") or headers.get("referer") or ""
    with tempfile.TemporaryDirectory() as directory:
        body_path = directory + "/body"
        header_path = directory + "/headers"
        cookie_path = directory + "/cookies"
        open(cookie_path, "wb").close()
        if referer and referer.rstrip("/") != url.rstrip("/"):
            try:
                _run_curl(
                    referer, headers, timeout,
                    directory + "/warmup", directory + "/warmup-headers",
                    cookie_path, True,
                )
            except OSError:
                pass
        try:
            final_url, status, content_type = _run_curl(
                url, headers, timeout, body_path, header_path, cookie_path, True,
            )
        except OSError:
            final_url, status, content_type = _run_curl(
                url, headers, timeout, body_path, header_path, cookie_path, False,
            )
        with open(body_path, "rb") as handle:
            body = handle.read(MAX_PAYLOAD_BYTES + 1)
    if status >= 400:
        reason = responses.get(status, "Error")
        raise HTTPError(final_url or url, status, reason, None, None)
    return _CurlResponse(body, final_url or url, content_type)


def _read_source_response(
    config: SourceConfig,
    opener: Callable[..., Any],
) -> tuple[list[dict[str, str]], dict[str, str]]:
    request = Request(config.endpoint, headers=request_headers(config))
    with opener(request, timeout=20) as response:
        final_url = response.geturl()
        validate_final_url(config, final_url)
        body = response.read(MAX_PAYLOAD_BYTES + 1)
        if len(body) > MAX_PAYLOAD_BYTES:
            raise ValueError("source payload exceeds 5 MiB")
        content_type = response.headers.get("Content-Type", "")
        content_encoding = str(response.headers.get("Content-Encoding", ""))
    if content_encoding.split(",", 1)[0].strip().lower() == "gzip":
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(body)) as compressed:
                body = compressed.read(MAX_PAYLOAD_BYTES + 1)
        except (EOFError, OSError) as error:
            raise ValueError("malformed gzip payload") from error
        if len(body) > MAX_PAYLOAD_BYTES:
            raise ValueError("source payload exceeds 5 MiB after decompression")
    rows = parse_payload(config, body, content_type)
    return rows, {"finalUrl": final_url, "contentType": content_type}


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
    try:
        return _read_source_response(config, opener)
    except HTTPError as error:
        if error.code != 403 or opener is not urlopen:
            raise
        try:
            return _read_source_response(config, curl_open)
        except FileNotFoundError:
            raise error
