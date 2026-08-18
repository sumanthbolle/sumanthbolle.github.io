#!/usr/bin/env python3
"""Idempotent official-source publisher for the Anchor UPSC study tool."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
from typing import Any, Callable, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.adapters import fetch_source
from scripts.upsc.models import load_registry, normalize_source_record


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(text)
        temporary = Path(handle.name)
    temporary.replace(path)


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _all_current_records(output_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Path]]:
    records: dict[str, dict[str, Any]] = {}
    paths: dict[str, Path] = {}
    for path in sorted((output_root / "feed").glob("*/*/*.json")):
        payload = _read_json(path, [])
        if not isinstance(payload, list):
            continue
        for row in payload:
            if isinstance(row, dict) and row.get("id"):
                records[row["id"]] = row
                paths[row["id"]] = path
    return records, paths


def _partition_path(output_root: Path, published_at: str) -> Path:
    date = published_at[:10]
    year, month, day = date.split("-")
    return output_root / "feed" / year / month / f"{day}.json"


def _merge_partition(path: Path, record: dict[str, Any], remove_id: str = "") -> None:
    rows = _read_json(path, [])
    if not isinstance(rows, list):
        rows = []
    by_id = {
        row["id"]: row for row in rows
        if isinstance(row, dict) and row.get("id") and row.get("id") != remove_id
    }
    if record:
        by_id[record["id"]] = record
    ordered = sorted(
        by_id.values(), key=lambda row: (row.get("publishedAt", ""), row["id"]),
        reverse=True,
    )
    _write_json(path, ordered)


def publish(
    registry_path: Path,
    output_root: Path,
    opener: Callable[..., Any],
    now: str,
) -> dict[str, Any]:
    configs = [config for config in load_registry(registry_path) if config.enabled]
    existing, existing_paths = _all_current_records(output_root)
    report: dict[str, Any] = {
        "generatedAt": now,
        "newRecords": 0,
        "updatedRecords": 0,
        "totalRecords": len(existing),
        "sources": {},
    }
    for config in configs:
        source_report = {
            "status": "ok", "fetchedAt": now, "recordCount": 0, "error": "",
        }
        try:
            raw_rows = fetch_source(config, opener)
            normalized = [normalize_source_record(config, row, now) for row in raw_rows]
            source_report["recordCount"] = len(normalized)
            for record in normalized:
                previous = existing.get(record["id"])
                if previous is None:
                    _merge_partition(_partition_path(output_root, record["publishedAt"]), record)
                    existing[record["id"]] = record
                    existing_paths[record["id"]] = _partition_path(
                        output_root, record["publishedAt"]
                    )
                    report["newRecords"] += 1
                    continue
                if previous.get("contentHash") == record.get("contentHash"):
                    continue
                history_path = (
                    output_root / "history" / record["id"]
                    / f"{previous.get('contentHash', 'unknown')}.json"
                )
                if not history_path.exists():
                    _write_json(history_path, previous)
                old_path = existing_paths[record["id"]]
                new_path = _partition_path(output_root, record["publishedAt"])
                if old_path != new_path:
                    _merge_partition(old_path, {}, remove_id=record["id"])
                _merge_partition(new_path, record)
                existing[record["id"]] = record
                existing_paths[record["id"]] = new_path
                report["updatedRecords"] += 1
        except Exception as error:  # isolated adapter boundary
            source_report.update({"status": "error", "error": str(error)[:500]})
        report["sources"][config.id] = source_report
    report["totalRecords"] = len(existing)
    _write_json(output_root / "coverage.json", report)
    return report


def build_indexes(output_root: Path, now: Optional[str] = None) -> dict[str, Any]:
    records, _ = _all_current_records(output_root)
    ordered = sorted(
        records.values(), key=lambda row: (row.get("publishedAt", ""), row["id"]),
        reverse=True,
    )
    compact = []
    for row in ordered:
        compact.append({
            key: row.get(key) for key in (
                "id", "title", "publisherId", "publisherName", "publishedAt",
                "sourceUrl", "officialSummary", "sourceType", "jurisdiction",
                "sourceVerified", "editorialState",
            )
        } | {"codes": [], "priority": 0})
    payload = {
        "generatedAt": now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "records": compact,
    }
    _write_json(output_root / "source-index.json", payload)
    return payload


class _FixtureResponse:
    def __init__(self, body: bytes, url: str, content_type: str) -> None:
        self.body = body
        self.url = url
        self.headers = {"Content-Type": content_type}

    def read(self, limit: int = -1) -> bytes:
        return self.body if limit < 0 else self.body[:limit]

    def geturl(self) -> str:
        return self.url

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


def _fixture_opener(fixtures: Path):
    mapping = _read_json(fixtures / "opener-map.json", {})

    def open_fixture(request, timeout=20):
        item = mapping[request.full_url]
        return _FixtureResponse(
            (fixtures / item["file"]).read_bytes(),
            item.get("finalUrl", request.full_url),
            item["contentType"],
        )

    return open_fixture


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    ingest = subparsers.add_parser("ingest")
    ingest.add_argument("--registry", type=Path, required=True)
    ingest.add_argument("--output", type=Path, required=True)
    ingest.add_argument("--fixtures", type=Path)
    ingest.add_argument("--now")
    indexes = subparsers.add_parser("build-indexes")
    indexes.add_argument("--output", type=Path, required=True)
    indexes.add_argument("--now")
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    if args.command == "ingest":
        opener = _fixture_opener(args.fixtures) if args.fixtures else __import__(
            "urllib.request", fromlist=["urlopen"]
        ).urlopen
        print(json.dumps(publish(args.registry, args.output, opener, now), indent=2))
    else:
        print(json.dumps(build_indexes(args.output, now), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
