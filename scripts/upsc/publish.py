#!/usr/bin/env python3
"""Idempotent official-source publisher for the Anchor UPSC study tool."""

import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
import sys
import tempfile
from typing import Any, Callable, Optional
import unicodedata

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.adapters import fetch_source
from scripts.upsc.models import load_registry, normalize_source_record, validate_exam_note


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


def _slug(value: Any, fallback: str = "item") -> str:
    ascii_text = unicodedata.normalize("NFKD", str(value or "")).encode(
        "ascii", "ignore"
    ).decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return (slug or fallback)[:100].rstrip("-")


def _current_notes(
    output_root: Path,
    records: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for path in sorted((output_root / "notes").glob("*.json")):
        payload = _read_json(path, {})
        if not isinstance(payload, dict):
            continue
        try:
            note = validate_exam_note(payload)
        except ValueError:
            continue
        source = records.get(note["sourceId"])
        if not source:
            continue
        if note["sourceContentHash"] != source.get("contentHash"):
            continue
        if note.get("sourceUrl") != source.get("sourceUrl"):
            continue
        notes.append(note)
    return notes


def _exam_summary(note: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceId": note["sourceId"],
        "sourceContentHash": note["sourceContentHash"],
        "sourceUrl": source.get("sourceUrl"),
        "title": note.get("sourceTitle") or source.get("title"),
        "publisherName": note.get("publisherName") or source.get("publisherName"),
        "publishedAt": note.get("publishedAt") or source.get("publishedAt"),
        "anchor": note.get("anchor"),
        "codes": note.get("codes", []),
        "papers": note.get("papers", []),
        "whyInNews": note.get("whyInNews", ""),
        "use": note.get("use", ""),
        "recallCard": note.get("recallCard", ""),
        "priority": int(note.get("priority") or 0),
        "priorityProvisional": note.get("priorityProvisional") is True,
        "editorialStatus": note.get("editorialStatus", "draft"),
        "notePath": f"data/upsc/notes/{note['sourceId']}.json",
    }


def _iso_week(value: str) -> str:
    parsed = date.fromisoformat(value[:10])
    iso = parsed.isocalendar()
    return f"{iso[0]:04d}-W{iso[1]:02d}"


def _dedupe_dicts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []
    for row in rows:
        key = (str(row.get("kind") or ""), str(row.get("label") or "").lower())
        if key in seen or not key[1]:
            continue
        seen.add(key)
        result.append(row)
    return result


def _build_syllabus_index(
    notes: list[dict[str, Any]],
    records: dict[str, dict[str, Any]],
    generated_at: str,
) -> dict[str, Any]:
    codes: dict[str, dict[str, Any]] = {}
    for note in sorted(
        notes,
        key=lambda row: records[row["sourceId"]].get("publishedAt", ""),
        reverse=True,
    ):
        anchor_key = _slug(note.get("anchor"), "anchor")
        practice_ids = [
            f"{note['sourceId']}:practice:{index + 1}"
            for index, _ in enumerate(note.get("mainsPractice", []))
        ]
        for code in note.get("codes", []):
            code_row = codes.setdefault(code, {"anchors": {}})
            anchor = code_row["anchors"].setdefault(anchor_key, {
                "anchor": note.get("anchor", ""),
                "staticDefinition": "",
                "noteIds": [],
                "reusableAnchors": [],
                "sourceIds": [],
                "practiceIds": [],
                "monthlySyntheses": [],
            })
            if not anchor["staticDefinition"] and note.get("staticDefinition"):
                anchor["staticDefinition"] = note["staticDefinition"]
            anchor["noteIds"].append(note["sourceId"])
            anchor["sourceIds"].append(note["sourceId"])
            anchor["practiceIds"].extend(practice_ids)
            anchor["reusableAnchors"] = _dedupe_dicts(
                anchor["reusableAnchors"] + list(note.get("reusableAnchors", []))
            )

    for code_row in codes.values():
        for anchor in code_row["anchors"].values():
            by_month: dict[str, list[dict[str, Any]]] = {}
            for note_id in anchor["noteIds"]:
                note = next(row for row in notes if row["sourceId"] == note_id)
                month = records[note_id].get("publishedAt", "")[:7]
                by_month.setdefault(month, []).append(note)
            for month, month_notes in sorted(by_month.items(), reverse=True):
                if len(month_notes) >= 3:
                    anchor["monthlySyntheses"].append({
                        "month": month,
                        "noteIds": [row["sourceId"] for row in month_notes],
                        "uses": [row.get("use", "")[:360] for row in month_notes if row.get("use")],
                    })
    return {"generatedAt": generated_at, "codes": codes}


def _build_archive_index(
    notes: list[dict[str, Any]],
    records: dict[str, dict[str, Any]],
    generated_at: str,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "generatedAt": generated_at,
        "notes": [], "days": {}, "months": {}, "codes": {}, "anchors": {},
    }
    for note in notes:
        source = records[note["sourceId"]]
        published = str(source.get("publishedAt") or "")[:10]
        month = published[:7]
        anchor_slug = _slug(note.get("anchor"), "anchor")
        title_slug = _slug(note.get("sourceTitle") or source.get("title"), "note")
        status = note.get("editorialStatus", "draft")
        path = f"upsc-study/notes/{note['sourceId']}/{title_slug}.html"
        row = {
            "sourceId": note["sourceId"], "title": note.get("sourceTitle") or source.get("title"),
            "path": path, "date": published, "month": month,
            "codes": note.get("codes", []), "anchor": note.get("anchor", ""),
            "anchorSlug": anchor_slug, "status": status,
        }
        result["notes"].append(row)
        result["days"].setdefault(published, []).append(note["sourceId"])
        result["months"].setdefault(month, []).append(note["sourceId"])
        for code in note.get("codes", []):
            result["codes"].setdefault(code, []).append(note["sourceId"])
        anchor_row = result["anchors"].setdefault(anchor_slug, {
            "anchor": note.get("anchor", ""), "noteIds": [],
        })
        anchor_row["noteIds"].append(note["sourceId"])
    return result


def build_indexes(output_root: Path, now: Optional[str] = None) -> dict[str, Any]:
    generated_at = now or datetime.now(timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    records, _ = _all_current_records(output_root)
    ordered = sorted(
        records.values(), key=lambda row: (row.get("publishedAt", ""), row["id"]),
        reverse=True,
    )
    current_notes = _current_notes(output_root, records)
    notes_by_source = {note["sourceId"]: note for note in current_notes}
    compact = []
    for row in ordered:
        compact_row = {
            key: row.get(key) for key in (
                "id", "title", "publisherId", "publisherName", "publishedAt",
                "sourceUrl", "officialSummary", "sourceType", "jurisdiction",
                "sourceVerified", "editorialState",
            )
        }
        note = notes_by_source.get(row["id"])
        compact_row.update({
            "codes": note.get("codes", []) if note else [],
            "priority": int(note.get("priority") or 0) if note else 0,
            "editorialState": note.get("editorialStatus", "source-only") if note else "source-only",
        })
        compact.append(compact_row)
    payload = {
        "generatedAt": generated_at,
        "records": compact,
    }
    _write_json(output_root / "source-index.json", payload)
    ordered_notes = sorted(
        current_notes,
        key=lambda note: (
            int(note.get("priority") or 0),
            records[note["sourceId"]].get("publishedAt", ""),
        ),
        reverse=True,
    )
    exam = {
        "generatedAt": generated_at,
        "notes": [_exam_summary(note, records[note["sourceId"]]) for note in ordered_notes],
    }
    daily: dict[str, list[str]] = {}
    weekly: dict[str, list[str]] = {}
    for note in ordered_notes:
        published = records[note["sourceId"]].get("publishedAt", "")[:10]
        if not published:
            continue
        daily.setdefault(published, []).append(note["sourceId"])
        try:
            weekly.setdefault(_iso_week(published), []).append(note["sourceId"])
        except ValueError:
            continue
    syllabus = _build_syllabus_index(ordered_notes, records, generated_at)
    archive = _build_archive_index(ordered_notes, records, generated_at)
    _write_json(output_root / "exam-index.json", exam)
    _write_json(output_root / "exam-daily-index.json", {"generatedAt": generated_at, "days": daily})
    _write_json(output_root / "exam-weekly-index.json", {"generatedAt": generated_at, "weeks": weekly})
    _write_json(output_root / "syllabus-index.json", syllabus)
    _write_json(output_root / "archive-index.json", archive)
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
