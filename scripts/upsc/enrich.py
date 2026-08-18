#!/usr/bin/env python3
"""Enrich normalized official UPSC records through the private Worker route."""

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Callable, Iterable, Mapping, Optional
import urllib.error
import urllib.request
from urllib.parse import urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.models import validate_exam_note
from scripts.upsc.publish import _all_current_records, _read_json, _write_json


MAX_RESPONSE_BYTES = 2 * 1024 * 1024


def _failure_text(error: Exception) -> str:
    if isinstance(error, urllib.error.HTTPError):
        return f"HTTP {error.code}"
    if isinstance(error, urllib.error.URLError):
        return f"network error: {error.reason}"[:240]
    return str(error)[:240] or error.__class__.__name__


def _valid_endpoint(endpoint: str) -> str:
    parts = urlsplit(str(endpoint or "").strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("enrichment endpoint must use HTTP(S)")
    return parts.geturl()


def _decode_note(response: Any, source: Mapping[str, Any]) -> dict[str, Any]:
    body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("enrichment response exceeded 2 MiB")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid enrichment JSON") from error
    if not isinstance(payload, dict):
        raise ValueError("invalid enrichment response")
    note = payload.get("data")
    if payload.get("success") is not True or not isinstance(note, dict):
        raise ValueError(str(payload.get("error") or "enrichment rejected")[:240])
    normalized = validate_exam_note(note)
    if normalized["sourceId"] != source.get("id"):
        raise ValueError("enrichment changed sourceId")
    if normalized["sourceContentHash"] != source.get("contentHash"):
        raise ValueError("enrichment used a stale source hash")
    if normalized.get("sourceUrl") != source.get("sourceUrl"):
        raise ValueError("enrichment changed sourceUrl")
    return normalized


def enrich_records(
    records: Iterable[Mapping[str, Any]],
    endpoint: str,
    token: str,
    opener: Callable[..., Any],
    existing_notes: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Return newly enriched notes and per-record failures without mutating records."""
    url = _valid_endpoint(endpoint)
    bearer = str(token or "")
    if not bearer:
        raise ValueError("enrichment token is required")
    existing = existing_notes or {}
    notes: list[dict[str, Any]] = []
    failures: dict[str, str] = {}

    for source in records:
        source_id = str(source.get("id") or "")
        if not source_id:
            continue
        current = existing.get(source_id)
        if current and current.get("sourceContentHash") == source.get("contentHash"):
            continue
        request = urllib.request.Request(
            url,
            data=json.dumps(source, ensure_ascii=False).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Authorization": "Bearer " + bearer,
                "Content-Type": "application/json",
                "User-Agent": "Anchor-UPSC-Publisher/1.0",
            },
            method="POST",
        )
        try:
            with opener(request, timeout=55) as response:
                notes.append(_decode_note(response, source))
        except Exception as error:  # one bad record never blocks the publication
            failures[source_id] = _failure_text(error)
            close = getattr(error, "close", None)
            if callable(close):
                close()
    return notes, failures


def _existing_notes(output_root: Path) -> dict[str, dict[str, Any]]:
    notes: dict[str, dict[str, Any]] = {}
    for path in sorted((output_root / "notes").glob("*.json")):
        payload = _read_json(path, {})
        if isinstance(payload, dict) and payload.get("sourceId"):
            notes[payload["sourceId"]] = payload
    return notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    records, _ = _all_current_records(args.output)
    notes, failures = enrich_records(
        records.values(), args.endpoint, args.token, urllib.request.urlopen,
        _existing_notes(args.output),
    )
    for note in notes:
        _write_json(args.output / "notes" / f"{note['sourceId']}.json", note)
    print(json.dumps({
        "enriched": len(notes),
        "failed": len(failures),
        "failures": failures,
    }, indent=2, sort_keys=True))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
