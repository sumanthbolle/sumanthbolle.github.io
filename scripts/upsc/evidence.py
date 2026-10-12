#!/usr/bin/env python3
"""Fetch the official page behind a source record and reduce it to body text.

Stored records carry only a title and a short official summary. A note needs
the release itself, so the edition builder fetches it here. Failures are
returned as reasons, never raised: one blocked ministry page holds one note.
"""

import gzip
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import socket
import sys
from typing import Any, Callable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.adapters import LISTING_ACCEPT, MAX_PAYLOAD_BYTES, USER_AGENT, curl_open


MAX_EVIDENCE_CHARS = 16000
MIN_EVIDENCE_CHARS = 200
SKIP_TAGS = {
    "script", "style", "nav", "header", "footer", "noscript", "head", "title",
    "svg", "button", "select", "iframe", "template", "aside",
}
CHROME_RE = re.compile(
    r"(^|\s)(menu|nav|navbar|breadcrumbs?|footer\w*|header|social|share|sidebar|skip\w*|"
    r"cookie\w*|banner|accordion\w*|archives?|submenu\w*|sr-only|social-share)(\s|$)",
    re.I,
)
KEEP_TAGS = {"html", "body", "main", "article", "form"}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "param", "source", "track", "wbr",
}
HTML_TYPES = ("text/html", "application/xhtml+xml")


class _BodyText(HTMLParser):
    """Collect visible text, skipping page chrome by tag or by class/id."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_tag = ""
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if tag in VOID_TAGS:
            return
        if self.skip_depth:
            if tag == self.skip_tag:
                self.skip_depth += 1
            return
        values = {key: value or "" for key, value in attrs}
        marker = values.get("class", "") + " " + values.get("id", "")
        if tag in SKIP_TAGS or values.get("role") in ("navigation", "banner") or (
            tag not in KEEP_TAGS and CHROME_RE.search(marker)
        ):
            self.skip_tag, self.skip_depth = tag, 1

    def handle_endtag(self, tag: str) -> None:
        if self.skip_depth and tag.lower() == self.skip_tag:
            self.skip_depth -= 1
            if not self.skip_depth:
                self.skip_tag = ""

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def extract_text(html: str) -> str:
    parser = _BodyText()
    try:
        parser.feed(str(html or ""))
        parser.close()
    except (AssertionError, ValueError):
        pass
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    return text[:MAX_EVIDENCE_CHARS].rstrip()


def _result(ok: bool, url: str, text: str = "", reason: str = "") -> dict[str, Any]:
    return {"ok": ok, "text": text, "url": url, "reason": reason}


def _request(url: str) -> Request:
    parts = urlsplit(url)
    return Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": LISTING_ACCEPT,
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip",
        "Referer": f"{parts.scheme}://{parts.netloc}/",
    })


def _read(url: str, opener: Callable[..., Any]) -> tuple[bytes, str, str]:
    with opener(_request(url), timeout=25) as response:
        body = response.read(MAX_PAYLOAD_BYTES + 1)
        content_type = str(response.headers.get("Content-Type", "") or "")
        encoding = str(response.headers.get("Content-Encoding", "") or "")
        final_url = response.geturl() or url
    if len(body) > MAX_PAYLOAD_BYTES:
        raise ValueError("payload-too-large")
    if encoding.lower().startswith("gzip"):
        with gzip.GzipFile(fileobj=io.BytesIO(body)) as compressed:
            body = compressed.read(MAX_PAYLOAD_BYTES + 1)
    return body, content_type, final_url


def _is_timeout(error: BaseException) -> bool:
    if isinstance(error, (socket.timeout, TimeoutError)):
        return True
    return isinstance(error, URLError) and isinstance(error.reason, (socket.timeout, TimeoutError))


def _failure_reason(error: BaseException) -> str:
    if isinstance(error, HTTPError):
        return f"http-{error.code}"
    if _is_timeout(error):
        return "timeout"
    if isinstance(error, (URLError, OSError)):
        return "network-error"
    return "fetch-error"


def _decode(body: bytes, content_type: str) -> str:
    match = re.search(r"charset=([\w-]+)", content_type, re.I)
    try:
        return body.decode(match.group(1) if match else "utf-8", errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def fetch_evidence(
    record: dict[str, Any],
    opener: Callable[..., Any],
    fallback: Optional[Callable[..., Any]] = curl_open,
) -> dict[str, Any]:
    """Return {"ok", "text", "url", "reason"} for the record's official page."""
    url = str(record.get("sourceUrl") or record.get("canonicalUrl") or "")
    if urlsplit(url).scheme not in ("http", "https") or not urlsplit(url).hostname:
        return _result(False, url, reason="bad-url")
    try:
        try:
            body, content_type, final_url = _read(url, opener)
        except HTTPError as error:
            error.close()
            if error.code != 403 or fallback is None:
                raise
            body, content_type, final_url = _read(url, fallback)
    except FileNotFoundError:  # curl missing on this machine
        return _result(False, url, reason="http-403")
    except Exception as error:  # network boundary: a reason, never a crash
        if isinstance(error, HTTPError):
            error.close()
        return _result(False, url, reason=_failure_reason(error))
    mime = content_type.split(";", 1)[0].strip().lower()
    if mime not in HTML_TYPES:
        return _result(False, final_url, reason="unsupported-content")
    text = extract_text(_decode(body, content_type))
    if len(text) < MIN_EVIDENCE_CHARS:
        return _result(False, final_url, text=text, reason="thin-evidence")
    return _result(True, final_url, text=text)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: evidence.py <official-url>", file=sys.stderr)
        return 2
    print(json.dumps(fetch_evidence({"sourceUrl": sys.argv[1]}, urlopen), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
