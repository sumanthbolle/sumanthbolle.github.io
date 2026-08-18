"""Canonical contracts for official UPSC source records and exam notes."""

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from typing import Any, Mapping
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


EDITORIAL_STATES = ("source-only", "draft", "source-backed", "reviewed")
ADAPTERS = ("rss", "atom", "json-feed", "listing")
ENDPOINT_FIELDS = ("feedUrl", "apiUrl", "listingUrl")
TIERS = ("indian-primary", "international-institution")

SYLLABUS_CODES = {
    *(f"GS1.{number}" for number in range(1, 10)),
    *(f"GS2.{number}" for number in range(1, 11)),
    *(f"GS3.{number}" for number in range(1, 10)),
    *(f"GS4.{number}" for number in range(1, 8)),
    "ESSAY.A", "ESSAY.B",
}


@dataclass(frozen=True)
class SourceConfig:
    id: str
    name: str
    country: str
    tier: str
    hosts: tuple[str, ...]
    adapter: str
    endpoint: str
    enabled: bool
    link_class: str


class _TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(value: Any, limit: int) -> str:
    parser = _TextParser()
    parser.feed(str(value or ""))
    parser.close()
    text = unescape(" ".join(parser.parts))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _clean(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _host_matches(hostname: str, reviewed: str) -> bool:
    host = hostname.lower().rstrip(".")
    allowed = reviewed.lower().rstrip(".")
    host_without_www = host[4:] if host.startswith("www.") else host
    allowed_without_www = allowed[4:] if allowed.startswith("www.") else allowed
    return (
        host_without_www == allowed_without_www
        or host_without_www.endswith("." + allowed_without_www)
    )


def validate_final_url(config: SourceConfig, value: str) -> str:
    raw = str(value or "").strip()
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("source URL must use HTTP(S)")
    if parts.username or parts.password:
        raise ValueError("source URL credentials are not allowed")
    if not any(_host_matches(parts.hostname, host) for host in config.hosts):
        raise ValueError("source URL must use a reviewed host")
    return raw


def canonical_url(config: SourceConfig, value: str) -> str:
    raw = validate_final_url(config, value)
    parts = urlsplit(raw)
    hostname = (parts.hostname or "").lower()
    port = parts.port
    default_port = (parts.scheme == "https" and port == 443) or (
        parts.scheme == "http" and port == 80
    )
    netloc = hostname if port is None or default_port else f"{hostname}:{port}"
    query = sorted(
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_")
    )
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(query), ""))


def _iso_utc(value: Any, field: str) -> str:
    raw = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field} must be ISO-8601") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    parsed = parsed.astimezone(timezone.utc).replace(microsecond=0)
    return parsed.isoformat().replace("+00:00", "Z")


def load_registry(path: Path) -> list[SourceConfig]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid source registry: {error}") from error
    if not isinstance(payload, list):
        raise ValueError("source registry must be an array")

    seen: set[str] = set()
    configs: list[SourceConfig] = []
    for row in payload:
        if not isinstance(row, dict):
            raise ValueError("source registry rows must be objects")
        source_id = _clean(row.get("id"), 64).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", source_id):
            raise ValueError("source id must be stable lowercase text")
        if source_id in seen:
            raise ValueError(f"duplicate source id: {source_id}")
        seen.add(source_id)

        adapter = _clean(row.get("adapter"), 32)
        if adapter not in ADAPTERS:
            raise ValueError(f"unsupported adapter for {source_id}")
        tier = _clean(row.get("tier"), 40)
        if tier not in TIERS:
            raise ValueError(f"unsupported source tier for {source_id}")
        hosts = tuple(
            dict.fromkeys(
                _clean(host, 255).lower().rstrip(".")
                for host in row.get("hosts", [])
                if _clean(host, 255)
            )
        )
        if not hosts:
            raise ValueError(f"source {source_id} requires reviewed hosts")
        endpoint_values = [row.get(field) for field in ENDPOINT_FIELDS if row.get(field)]
        if len(endpoint_values) != 1:
            raise ValueError(f"source {source_id} requires exactly one endpoint")
        link_class = _clean(row.get("linkClass"), 80)
        if adapter == "listing" and not link_class:
            raise ValueError(f"listing source {source_id} requires linkClass")

        config = SourceConfig(
            id=source_id,
            name=_clean(row.get("name"), 120),
            country=_clean(row.get("country"), 12).upper(),
            tier=tier,
            hosts=hosts,
            adapter=adapter,
            endpoint=str(endpoint_values[0]).strip(),
            enabled=row.get("enabled") is True,
            link_class=link_class if adapter == "listing" else "",
        )
        if not config.name or not config.country:
            raise ValueError(f"source {source_id} requires name and country")
        validate_final_url(config, config.endpoint)
        configs.append(config)
    return configs


def normalize_source_record(
    config: SourceConfig,
    raw: Mapping[str, Any],
    fetched_at: str,
) -> dict[str, Any]:
    title = _plain_text(raw.get("title"), 240)
    summary = _plain_text(raw.get("summary"), 2000)
    if not title:
        raise ValueError("source title is required")
    canonical = canonical_url(config, str(raw.get("url") or ""))
    published = _iso_utc(raw.get("publishedAt"), "publishedAt")
    fetched = _iso_utc(fetched_at, "fetchedAt")
    source_type = _clean(raw.get("sourceType"), 40) or "official-update"
    identity = sha256(canonical.encode("utf-8")).hexdigest()
    content = {
        "title": title,
        "canonicalUrl": canonical,
        "publishedAt": published,
        "officialSummary": summary,
        "sourceType": source_type,
    }
    content_hash = sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return {
        "id": "src_" + identity,
        "title": title,
        "publisherId": config.id,
        "publisherName": config.name,
        "publishedAt": published,
        "fetchedAt": fetched,
        "sourceUrl": canonical,
        "canonicalUrl": canonical,
        "officialSummary": summary,
        "sourceType": source_type,
        "jurisdiction": config.country,
        "sourceVerified": True,
        "contentHash": content_hash,
        "editorialState": "source-only",
    }


def _paper_for(code: str) -> str:
    return "ESSAY" if code.startswith("ESSAY.") else code.split(".", 1)[0]


def validate_exam_note(note: Mapping[str, Any]) -> dict[str, Any]:
    source_id = _clean(note.get("sourceId"), 80)
    source_hash = _clean(note.get("sourceContentHash"), 80)
    anchor = _clean(note.get("anchor"), 100)
    use = _clean(note.get("use"), 360)
    if not source_id:
        raise ValueError("sourceId is required")
    if not source_hash:
        raise ValueError("sourceContentHash is required")
    if not anchor:
        raise ValueError("static anchor is required")
    if not use:
        raise ValueError("use line is required")
    codes = list(dict.fromkeys(
        _clean(code, 20).upper() for code in note.get("codes", [])
    ))
    if not 1 <= len(codes) <= 3 or any(code not in SYLLABUS_CODES for code in codes):
        raise ValueError("one to three canonical syllabus codes are required")
    status = _clean(note.get("editorialStatus"), 24) or "draft"
    if status not in EDITORIAL_STATES[1:]:
        raise ValueError("invalid exam-note editorial status")
    result = dict(note)
    result.update({
        "sourceId": source_id,
        "sourceContentHash": source_hash,
        "anchor": anchor,
        "codes": codes,
        "papers": list(dict.fromkeys(_paper_for(code) for code in codes)),
        "use": use,
        "editorialStatus": status,
    })
    return result
