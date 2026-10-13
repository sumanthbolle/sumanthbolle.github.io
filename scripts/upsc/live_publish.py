"""Poll official sources and release each passing Pocket note without a daily cap."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.enrich import _existing_notes, enrich_records, post_worker, sibling_endpoint
from scripts.upsc.pocket_feed import build_pocket_feed, eligible, instant, pocket_article
from scripts.upsc.publish import _all_current_records, _read_json, _write_json, publish
from scripts.upsc.verify import apply_verification, note_digest, record_verification_stats, should_publish, write_review_queue


SECRET_FIX = ("Set the repository secret UPSC_PUBLISH_TOKEN, then run the 'Deploy Summaverick Worker' "
    "workflow so the Worker receives the same value")


def check_worker_auth(endpoint, token, opener, timeout=20):
    """Fail fast when the publisher and Worker do not share UPSC_PUBLISH_TOKEN.

    An empty body is rejected by validation (422) after the bearer check, so
    this costs no model call.
    """
    if not endpoint or not token:
        raise ValueError("UPSC_ENRICH_ENDPOINT and UPSC_PUBLISH_TOKEN are required. " + SECRET_FIX)
    request = urllib.request.Request(endpoint, data=b"{}", method="POST", headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json",
        "User-Agent": "Anchor-UPSC-Publisher/1.0"})
    try:
        with opener(request, timeout=timeout):
            return
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
    if status in (401, 403):
        raise ValueError("The Worker rejected UPSC_PUBLISH_TOKEN (HTTP %d); the secrets are out of sync. %s"
            % (status, SECRET_FIX))


def exit_status(result):
    """Only a failed live feed fails the run; one note's provider error retries after backoff."""
    failures = result.get("failures") or {}
    warnings = ["%s: %s" % (key, value) for key, value in failures.items() if key != "live-feed"]
    return (2 if "live-feed" in failures else 0), warnings


def release_updates(registry, output, endpoint, token, source_opener, worker_opener, now, max_records=3, live_feed=True):
    if not endpoint or not token:
        raise ValueError("UPSC_ENRICH_ENDPOINT and UPSC_PUBLISH_TOKEN are required")
    clock = instant(now)
    if clock is None:
        raise ValueError("A timezone-aware timestamp is required")
    ingested = publish(registry, output, source_opener, now)
    if not any(row["status"] == "ok" for row in ingested["sources"].values()):
        raise ValueError("No official source passed its source contract; keep the last good feed")
    records, _ = _all_current_records(output)
    existing = _existing_notes(output)
    state = _read_json(output / "pocket-processing.json", {})
    failures = {}
    changed = bool(ingested["newRecords"] or ingested["updatedRecords"])
    generation = 0

    def sync():
        nonlocal changed, generation
        stamp = (clock + timedelta(milliseconds=generation)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        generation += 1
        feed = build_pocket_feed(output, stamp)
        old = _read_json(output / "pocket-feed.json", {})
        if feed["revision"] != old.get("revision"):
            changed = True
            _write_json(output / "pocket-feed.json", feed)
        if not live_feed:
            # Static-only: readers fall back to the committed snapshot.
            return
        try:
            result = post_worker(sibling_endpoint(endpoint, "/upsc/pocket/publish"), token, feed, worker_opener)
            if result.get("success") is not True:
                raise ValueError("The live feed rejected its verified snapshot")
            failures.pop("live-feed", None)
        except Exception:
            failures["live-feed"] = "Live publication failed; the verified static snapshot is retained"

    # Withdraw superseded notes before processing a correction.
    sync()
    candidates = []
    for source in sorted(records.values(), key=lambda row: row.get("publishedAt", ""), reverse=True):
        published = instant(source.get("publishedAt"))
        if not published or not clock - timedelta(days=14) <= published <= clock:
            continue
        note = existing.get(source["id"]) or {}
        check = note.get("verification") or {}
        if (note.get("sourceContentHash") == source["contentHash"] and isinstance(check, dict)
                and check.get("sourceContentHash") == source["contentHash"] and should_publish(check)):
            if check.get("verificationVersion") == 2 and check.get("noteContentHash") == note_digest(note):
                # Low-priority items stay in the archive; complete current notes need no new model call.
                if int(note.get("priority") or 0) < 60 or (eligible(note, source, clock) and pocket_article(note, source)):
                    continue
        previous = state.get(source["id"]) or {}
        retry = instant(previous.get("retryAfter"))
        if previous.get("contentHash") == source["contentHash"] and retry and retry > clock:
            continue
        candidates.append(source)
    released = verified = excluded = held_count = 0
    for source in candidates[:max_records]:
        excluded_current = False
        notes, failed = enrich_records([source], endpoint, token, worker_opener)
        failures.update(failed)
        passing, held, stats = apply_verification(notes, {source["id"]: source},
            sibling_endpoint(endpoint, "/upsc/verify"), token, worker_opener, now)
        write_review_queue(output, held, [note["sourceId"] for note in passing], now)
        if notes:
            record_verification_stats(output, stats, now)
        for note in passing:
            _write_json(output / "notes" / (note["sourceId"] + ".json"), note)
            verified += 1
            if eligible(note, source, clock) and pocket_article(note, source):
                released += 1
            else:
                excluded += 1
                excluded_current = True
            changed = True
            # Deliver a passed note now, before the next record or archive build.
            sync()
        held_count += len(held)
        state[source["id"]] = {"contentHash": source["contentHash"], "checkedAt": now,
            "retryAfter": (clock + timedelta(minutes=360 if excluded_current else 15)).isoformat().replace("+00:00", "Z")}
    # Processing backoff is persisted even when a provider failed.
    if candidates[:max_records]:
        changed = True
        _write_json(output / "pocket-processing.json", state)
    return {"changed": changed, "released": released, "verified": verified, "excluded": excluded, "held": held_count,
            "attempted": len(candidates[:max_records]), "ingested": ingested, "failures": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=Path("data/upsc/source-registry.json"))
    parser.add_argument("--output", type=Path, default=Path("data/upsc"))
    parser.add_argument("--max-records", type=int, default=3)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--no-live-feed", action="store_true",
        help="write only the static pocket-feed.json; skip the push to the deployed Worker's KV feed")
    args = parser.parse_args()
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        check_worker_auth(os.environ.get("UPSC_ENRICH_ENDPOINT", ""), os.environ.get("UPSC_PUBLISH_TOKEN", ""),
            urllib.request.urlopen)
        result = release_updates(args.registry, args.output, os.environ.get("UPSC_ENRICH_ENDPOINT", ""),
            os.environ.get("UPSC_PUBLISH_TOKEN", ""), urllib.request.urlopen, urllib.request.urlopen,
            now, max(1, min(10, args.max_records)), live_feed=not args.no_live_feed)
    except Exception as error:
        print("::error::" + str(error), file=sys.stderr)
        return 2
    if args.report:
        _write_json(args.report, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    code, warnings = exit_status(result)
    for warning in warnings:
        print("::warning::Will retry after backoff: " + warning)
    if code:
        print("::error::" + result["failures"]["live-feed"], file=sys.stderr)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
