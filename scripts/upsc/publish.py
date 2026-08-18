#!/usr/bin/env python3
"""Idempotent official-source publisher for the Anchor UPSC study tool."""

import argparse
from datetime import date, datetime, timezone
from html import escape
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from typing import Any, Callable, Optional
import unicodedata
from urllib.parse import urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.adapters import fetch_source, fetch_source_details
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
            normalized = [normalize_source_record(
                config,
                {**row, "publishedAt": row.get("publishedAt") or now}
                if config.date_policy == "fetched-at" else row,
                now,
            ) for row in raw_rows]
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


def check_sources(
    registry_path: Path,
    opener: Callable[..., Any],
    now: str,
) -> dict[str, Any]:
    """Probe every enabled source while keeping failures isolated."""
    checked = datetime.fromisoformat(now.replace("Z", "+00:00"))
    sources: dict[str, dict[str, Any]] = {}
    healthy_count = 0
    for config in (row for row in load_registry(registry_path) if row.enabled):
        row: dict[str, Any] = {
            "sourceId": config.id,
            "status": "error",
            "finalHost": "",
            "contentType": "",
            "checkedAt": now,
            "latestPublishedAt": "",
            "ageHours": None,
            "freshness": "unknown",
            "datePolicy": config.date_policy,
            "error": "",
        }
        try:
            records, details = fetch_source_details(config, opener)
            row["finalHost"] = urlsplit(details["finalUrl"]).hostname or ""
            row["contentType"] = str(details["contentType"]).split(";", 1)[0]
            latest = max(record.get("publishedAt") or now for record in records)
            published = datetime.fromisoformat(latest.replace("Z", "+00:00"))
            age_hours = max(0.0, (checked - published).total_seconds() / 3600)
            row.update({
                "status": "ok", "latestPublishedAt": latest,
                "ageHours": round(age_hours, 1),
                "freshness": (
                    "fetch-time" if config.date_policy == "fetched-at" else
                    "fresh" if age_hours <= 72 else
                    "aging" if age_hours <= 168 else "stale"
                ),
            })
            healthy_count += 1
        except Exception as error:  # isolated network/parser boundary
            row["error"] = str(error)[:500]
        sources[config.id] = row
    return {
        "checkedAt": now,
        "healthy": healthy_count > 0,
        "healthyCount": healthy_count,
        "sourceCount": len(sources),
        "sources": sources,
    }


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


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(text)
        temporary = Path(handle.name)
    temporary.replace(path)


def _prepare_generated_directory(site_root: Path) -> None:
    resolved = site_root.resolve()
    if resolved.name != "upsc-study" or resolved == Path(resolved.anchor):
        raise ValueError("static output must be an exact upsc-study directory")
    marker = resolved / ".upsc-generated"
    if resolved.exists() and any(resolved.iterdir()) and not marker.is_file():
        raise ValueError("refusing to replace directory without generated marker")
    resolved.mkdir(parents=True, exist_ok=True)
    if marker.is_file():
        for child in tuple(resolved.iterdir()):
            if child.is_symlink() or child.is_file():
                child.unlink()
            elif child.is_dir():
                shutil.rmtree(child)
    marker.write_text(
        "Generated by scripts/upsc/publish.py build-pages. Do not edit.\n",
        encoding="utf-8",
    )


def _display_value(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("text", "claim", "stem", "label", "point", "title"):
            if value.get(key):
                return str(value[key]).strip()
        return ""
    return str(value or "").strip()


def _section(title: str, value: Any, css_class: str = "") -> str:
    values = value if isinstance(value, list) else [value]
    rows = [_display_value(item) for item in values]
    rows = [row for row in rows if row]
    body = (
        "<ul>" + "".join(f"<li>{escape(row)}</li>" for row in rows) + "</ul>"
        if len(rows) > 1 else
        f"<p>{escape(rows[0])}</p>" if rows else
        '<p class="awaiting">Awaiting a reviewed note.</p>'
    )
    class_attr = f' class="{escape(css_class, quote=True)}"' if css_class else ""
    return f"<section{class_attr}><h2>{escape(title)}</h2>{body}</section>"


def _page_shell(
    title: str,
    description: str,
    canonical: str,
    body: str,
    generated_at: str,
    learning_resource: Optional[dict[str, Any]] = None,
) -> str:
    structured = ""
    if learning_resource:
        json_ld = json.dumps(
            learning_resource, ensure_ascii=False, separators=(",", ":")
        ).replace("</", "<\\/")
        structured = f'<script type="application/ld+json">{json_ld}</script>'
    return f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description, quote=True)}">
<link rel="canonical" href="{escape(canonical, quote=True)}">
<meta property="og:type" content="article"><meta property="og:title" content="{escape(title, quote=True)}">
<meta property="og:description" content="{escape(description, quote=True)}">
<meta property="og:url" content="{escape(canonical, quote=True)}">{structured}
<style>
:root{{--ink:#18221d;--muted:#59645f;--paper:#fbfaf5;--line:#d8d6c9;--green:#1f5b47;--amber:#f5dfa2}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 Georgia,serif}}
header,main,footer{{width:min(860px,calc(100% - 32px));margin:auto}}header{{padding:24px 0;border-bottom:1px solid var(--line)}}
nav a{{color:var(--green);font:700 14px/1.2 system-ui,sans-serif;text-decoration:none;margin-right:18px}}
h1{{font-size:clamp(2rem,7vw,4rem);line-height:1.02;margin:54px 0 14px}}h2{{font-size:1.2rem;margin:0 0 10px}}
.dek,.meta,.awaiting{{color:var(--muted)}}.meta{{font:600 13px/1.5 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase}}
section{{padding:25px 0;border-top:1px solid var(--line)}}section ul{{margin:0;padding-left:22px}}.answer-use{{background:var(--amber);padding:22px;margin:20px -22px;border:0}}
.official-facts{{border-left:4px solid var(--green);padding-left:20px}}.analysis{{border-left:4px solid #9b7130;padding-left:20px}}
a{{color:#125a78}}footer{{padding:35px 0 60px;border-top:1px solid var(--line);color:var(--muted);font:14px/1.5 system-ui,sans-serif}}
</style></head><body><header><nav><a href="/upsc">Open study desk</a><a href="/upsc-study/">Study archive</a></nav></header>
<main>{body}</main><footer>Generated {escape(generated_at)} from reviewed official-source records. UPSC notifications and syllabus remain controlling.</footer></body></html>'''


def _note_page(
    note: dict[str, Any],
    source: dict[str, Any],
    canonical: str,
    generated_at: str,
) -> str:
    title = str(note.get("sourceTitle") or source.get("title") or "UPSC study note")
    description = str(note.get("whyInNews") or note.get("use") or title)[:180]
    official_facts = [
        fact for fact in note.get("officialFacts", [])
        if isinstance(fact, dict)
        and fact.get("verification") == "source-backed"
        and fact.get("evidenceUrl") == source.get("sourceUrl")
    ]
    fact_text = [_display_value(fact) for fact in official_facts]
    analysis = note.get("analysis") or note.get("arguments") or []
    practice = note.get("mainsPractice") or []
    source_url = str(source.get("sourceUrl") or "")
    source_link = (
        f'<p><a href="{escape(source_url, quote=True)}" rel="noopener noreferrer">'
        f'Official source — {escape(str(source.get("publisherName") or "publisher"))}</a></p>'
    )
    body = (
        f'<p class="meta">{escape(str(note.get("editorialStatus") or ""))} · '
        f'{escape(str(source.get("publisherName") or ""))} · '
        f'{escape(str(source.get("publishedAt") or "")[:10])}</p>'
        f'<h1>{escape(title)}</h1><p class="dek">{escape(description)}</p>'
        + _section("Why in news", note.get("whyInNews"))
        + _section("Static anchor", note.get("staticDefinition") or note.get("anchor"))
        + _section("Background", note.get("background"))
        + _section("Reusable anchors", note.get("reusableAnchors"))
        + _section("Official facts", fact_text, "official-facts")
        + _section("Analysis — not an official claim", analysis, "analysis")
        + _section("India implications", note.get("indiaImplications"))
        + _section("Way forward", note.get("wayForward"))
        + _section("Prelims traps", note.get("prelimsTraps"))
        + _section("Mains practice", practice)
        + _section("Use in an answer", note.get("use"), "answer-use")
        + _section("Recall card", note.get("recallCard"))
        + f"<section><h2>Source trail</h2>{source_link}</section>"
    )
    resource = {
        "@context": "https://schema.org", "@type": "LearningResource",
        "name": title, "description": description, "url": canonical,
        "datePublished": str(source.get("publishedAt") or "")[:10],
        "dateModified": generated_at[:10], "inLanguage": "en-IN",
        "learningResourceType": "UPSC current-affairs study note",
        "educationalLevel": "Civil Services Examination",
        "isBasedOn": source_url,
        "provider": {"@type": "Organization", "name": source.get("publisherName")},
    }
    return _page_shell(title, description, canonical, body, generated_at, resource)


def _archive_page(
    title: str,
    description: str,
    rows: list[dict[str, Any]],
    canonical: str,
    generated_at: str,
) -> str:
    links = "".join(
        f'<li><a href="/{escape(str(row["path"]), quote=True)}">'
        f'{escape(str(row.get("title") or "Study note"))}</a>'
        f'<small> {escape(str(row.get("date") or ""))} · '
        f'{escape(", ".join(row.get("codes", [])))}</small></li>'
        for row in rows
    ) or '<li class="awaiting">No reviewed notes are published in this collection yet.</li>'
    body = (
        f"<h1>{escape(title)}</h1><p class=\"dek\">{escape(description)}</p>"
        f"<section><h2>Published notes</h2><ul>{links}</ul></section>"
    )
    return _page_shell(title, description, canonical, body, generated_at)


def build_static_pages(
    output_root: Path,
    site_root: Path,
    base_url: str,
    now: Optional[str] = None,
) -> dict[str, Any]:
    generated_at = now or datetime.now(timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    base = base_url.rstrip("/")
    base_parts = urlsplit(base)
    if base_parts.scheme not in ("http", "https") or not base_parts.hostname:
        raise ValueError("base URL must use HTTP(S)")
    _prepare_generated_directory(site_root)
    records, _ = _all_current_records(output_root)
    notes = _current_notes(output_root, records)
    note_by_id = {
        note["sourceId"]: note for note in notes
        if note.get("editorialStatus") in ("source-backed", "reviewed")
    }
    archive = _read_json(output_root / "archive-index.json", {})
    archive_rows = archive.get("notes", []) if isinstance(archive, dict) else []
    eligible_rows = [
        row for row in archive_rows
        if isinstance(row, dict)
        and row.get("sourceId") in note_by_id
        and row.get("status") in ("source-backed", "reviewed")
        and str(row.get("path") or "").startswith("upsc-study/")
        and ".." not in Path(str(row.get("path") or "")).parts
    ]
    rows_by_id = {row["sourceId"]: row for row in eligible_rows}
    for source_id, note in note_by_id.items():
        source = records[source_id]
        row = rows_by_id.get(source_id)
        if not row:
            continue
        local_path = str(row["path"])
        canonical = f"{base}/{local_path}"
        _write_text(site_root.parent / local_path, _note_page(
            note, source, canonical, generated_at
        ))

    collections: list[tuple[str, str, dict[str, list[str]]]] = [
        ("daily", "Daily UPSC notes", archive.get("days", {})),
        ("monthly", "Monthly UPSC notes", archive.get("months", {})),
        ("syllabus", "UPSC syllabus notes", archive.get("codes", {})),
    ]
    page_counts = {"daily": 0, "monthly": 0, "syllabus": 0, "anchors": 0}
    for folder, label, groups in collections:
        if not isinstance(groups, dict):
            continue
        for key, source_ids in groups.items():
            rows = [rows_by_id[item] for item in source_ids if item in rows_by_id]
            if not rows:
                continue
            filename = _slug(key, "index") + ".html"
            local_path = f"upsc-study/{folder}/{filename}"
            _write_text(site_root.parent / local_path, _archive_page(
                f"{label}: {key}",
                "Source-backed current affairs arranged for fast revision and answer use.",
                rows, f"{base}/{local_path}", generated_at,
            ))
            page_counts[folder] += 1
    anchors = archive.get("anchors", {}) if isinstance(archive, dict) else {}
    if isinstance(anchors, dict):
        for anchor_slug, anchor in anchors.items():
            if not isinstance(anchor, dict):
                continue
            rows = [
                rows_by_id[item] for item in anchor.get("noteIds", [])
                if item in rows_by_id
            ]
            if not rows:
                continue
            local_path = f"upsc-study/anchors/{_slug(anchor_slug)}.html"
            _write_text(site_root.parent / local_path, _archive_page(
                f"Anchor: {anchor.get('anchor') or anchor_slug}",
                "A durable static concept connected to verified current triggers.",
                rows, f"{base}/{local_path}", generated_at,
            ))
            page_counts["anchors"] += 1
    index_path = "upsc-study/index.html"
    _write_text(site_root / "index.html", _archive_page(
        "Anchor UPSC study archive",
        "Crawlable topper-style notes built only from reviewed official-source records.",
        eligible_rows, f"{base}/upsc-study/", generated_at,
    ))
    report = {
        "generatedAt": generated_at, "notePages": len(eligible_rows),
        **{f"{key}Pages": value for key, value in page_counts.items()},
    }
    _write_json(output_root / "publication-report.json", report)
    return report


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
    source_check = subparsers.add_parser("check-sources")
    source_check.add_argument("--registry", type=Path, required=True)
    source_check.add_argument("--fixtures", type=Path)
    source_check.add_argument("--now")
    source_check.add_argument("--strict", action="store_true")
    pages = subparsers.add_parser("build-pages")
    pages.add_argument("--output", type=Path, required=True)
    pages.add_argument("--site-root", type=Path, required=True)
    pages.add_argument("--base-url", default="https://sumanthbolle.com")
    pages.add_argument("--now")
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    if args.command in ("ingest", "check-sources"):
        opener = _fixture_opener(args.fixtures) if args.fixtures else __import__(
            "urllib.request", fromlist=["urlopen"]
        ).urlopen
        if args.command == "ingest":
            print(json.dumps(publish(args.registry, args.output, opener, now), indent=2))
        else:
            report = check_sources(args.registry, opener, now)
            print(json.dumps(report, indent=2))
            all_healthy = report["healthyCount"] == report["sourceCount"]
            return 0 if (all_healthy if args.strict else report["healthy"]) else 1
    elif args.command == "build-indexes":
        print(json.dumps(build_indexes(args.output, now), indent=2))
    else:
        print(json.dumps(build_static_pages(
            args.output, args.site_root, args.base_url, now
        ), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
