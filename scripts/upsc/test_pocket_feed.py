import copy
import json
import re
from pathlib import Path
import tempfile
import unittest

from scripts.upsc.live_publish import release_updates
from scripts.upsc.pocket_feed import build_pocket_feed, canonical_json
from scripts.upsc.publish import _all_current_records, _write_json, publish
from scripts.upsc.test_publish import (FIXTURE_REGISTRY, NOW, EnrichmentResponse,
                                      fixture_bytes, fixture_opener)
from scripts.upsc.verify import apply_verification, note_digest, parse_verification


def note_for(source):
    return {
        "sourceId": source["id"], "sourceContentHash": source["contentHash"],
        "sourceUrl": source["sourceUrl"], "anchor": "Fiscal federalism", "codes": ["GS2.2"],
        "papers": ["GS2"], "use": "Compare how fiscal powers are coordinated.",
        "priority": 80, "editorialStatus": "source-backed",
        "whyInNews": "The official release describes a policy update.",
        "staticDefinition": "Fiscal federalism is the distribution of public finances across levels of government.",
        "officialFacts": [{"text": source["officialSummary"], "verification": "source-backed", "evidenceUrl": source["sourceUrl"]}],
    }


def checked(note, source, now=NOW):
    note = copy.deepcopy(note)
    note["verification"] = {"verificationVersion": 2, "agrees": True, "confidence": 0.91, "flagged_claims": [],
        "checkedAt": now, "sourceContentHash": source["contentHash"], "noteContentHash": note_digest(note)}
    return note


class PocketFeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        publish(FIXTURE_REGISTRY, self.root, fixture_opener(), NOW)
        self.records, _ = _all_current_records(self.root)
        self.source = next(row for row in self.records.values() if row["publisherId"] == "pib")

    def save(self, note):
        _write_json(self.root / "notes" / (note["sourceId"] + ".json"), note)

    def test_canonical_revision_ignores_key_order_and_integral_float_spelling(self):
        self.assertEqual(canonical_json({"b": 1, "a": 1.0}), '{"a":1,"b":1}')
        self.assertEqual(canonical_json({"x": "₹100", "a": {"b": 0.91, "a": 1}}),
                         canonical_json({"a": {"a": 1.0, "b": 0.91}, "x": "₹100"}))

    def test_only_current_verified_substantive_notes_enter_the_feed(self):
        note = checked(note_for(self.source), self.source)
        self.save(note)
        feed = build_pocket_feed(self.root, NOW)
        self.assertEqual(len(feed["articles"]), 1)
        article = feed["articles"][0]
        self.assertEqual(article["id"], "news-" + self.source["id"])
        self.assertEqual(article["sections"][1]["paragraphs"], [self.source["officialSummary"]])
        self.assertEqual(article["sources"][0]["url"], self.source["sourceUrl"])
        for variant in [
            {**note, "verification": {}}, {**note, "editorialStatus": "draft"},
            {**note, "priority": 40}, {**note, "sourceContentHash": "old"},
            {**note, "sourceUrl": "https://other.example/"},
            {**note, "whyInNews": "Text edited after its verification"},
            {**note, "verification": {**note["verification"], "flagged_claims": ["Unsupported"]}},
        ]:
            with self.subTest(variant=variant):
                self.save(variant)
                self.assertEqual(build_pocket_feed(self.root, NOW)["articles"], [])

    def test_expired_or_future_notes_do_not_enter_live_news(self):
        self.save(checked(note_for(self.source), self.source))
        self.assertEqual(build_pocket_feed(self.root, "2026-09-10T05:00:00Z")["articles"], [])
        self.assertEqual(build_pocket_feed(self.root, "2026-08-17T05:00:00Z")["articles"], [])

    def test_undated_feed_detection_date_is_stable_between_polls(self):
        registry = json.loads(FIXTURE_REGISTRY.read_text())
        registry = [row for row in registry if row["id"] == "pib"]
        registry[0]["datePolicy"] = "fetched-at"
        path = self.root / "undated-registry.json"
        _write_json(path, registry)
        mapping = json.loads((Path(__file__).with_name("fixtures") / "opener-map.json").read_text())
        url = next(url for url, row in mapping.items() if row["sourceId"] == "pib")
        xml = re.sub(rb"<pubDate>.*?</pubDate>", b"", fixture_bytes(mapping[url]["file"]))
        output = self.root / "undated"
        first = publish(path, output, fixture_opener(overrides={url: xml}), NOW)
        second = publish(path, output, fixture_opener(overrides={url: xml}), "2026-08-18T05:05:00Z")
        self.assertGreater(first["newRecords"], 0)
        self.assertEqual(second["updatedRecords"], 0)
        rows, _ = _all_current_records(output)
        self.assertTrue(all(row["publishedAt"] == NOW for row in rows.values()))
        self.assertTrue(all(row["datePolicy"] == "fetched-at" for row in rows.values()))

    def test_verification_outage_or_missing_configuration_holds_notes(self):
        def failure(request, timeout=55):
            raise OSError("Verifier offline")
        for opener, endpoint in [(failure, "https://worker.example/upsc/verify"), (None, "")]:
            published, held, stats = apply_verification([note_for(self.source)], self.records,
                endpoint, "token", opener, NOW)
            self.assertEqual(published, [])
            self.assertEqual(len(held), 1)
            self.assertEqual(stats["skipped"], 1)
            self.assertEqual(stats["checked"], 0)
        with self.assertRaises(ValueError):
            parse_verification({"success": True, "verificationVersion": 2, "data": {"agrees": True, "confidence": float("nan"), "flagged_claims": []}})
        # An old deployed verifier checks only tagging, not the complete note.
        with self.assertRaises(ValueError):
            parse_verification({"success": True, "data": {"agrees": True, "confidence": 0.99, "flagged_claims": []}})

    def worker(self, calls, disagree=False):
        def opener(request, timeout=55):
            payload = json.loads(request.data)
            calls.append((request.full_url, payload))
            if request.full_url.endswith("/upsc/enrich"):
                return EnrichmentResponse({"success": True, "data": note_for(payload)})
            if request.full_url.endswith("/upsc/verify"):
                return EnrichmentResponse({"success": True, "verificationVersion": 2, "data": {"agrees": not disagree,
                    "confidence": 0.9, "flagged_claims": ["Wrong topic"] if disagree else []}})
            self.assertTrue(request.full_url.endswith("/upsc/pocket/publish"))
            self.assertEqual(request.headers["Authorization"], "Bearer token")
            return EnrichmentResponse({"success": True})
        return opener

    def test_each_passing_note_is_pushed_before_the_next_enrichment(self):
        calls = []
        result = release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich",
            "token", fixture_opener(), self.worker(calls), NOW, max_records=3)
        self.assertGreaterEqual(result["released"], 2)
        stages = [url.rsplit("/", 1)[-1] for url, _ in calls]
        self.assertEqual(stages[:4], ["publish", "enrich", "verify", "publish"])
        self.assertEqual(stages[4], "enrich")
        snapshots = [payload for url, payload in calls if url.endswith("/publish")]
        self.assertEqual([len(row["articles"]) for row in snapshots], list(range(len(snapshots))))
        self.assertEqual(len(set(row["generatedAt"] for row in snapshots)), len(snapshots))
        before = len(calls)
        result2 = release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich",
            "token", fixture_opener(), self.worker(calls), "2026-08-18T05:05:00Z", max_records=3)
        prior_ids = {payload["id"] for url, payload in calls[:before] if url.endswith("/enrich")}
        self.assertTrue(all(payload["id"] not in prior_ids for url, payload in calls[before:] if url.endswith("/enrich")))
        self.assertEqual(result["failures"], {})

    def test_failed_verification_never_reaches_public_snapshot_and_retries_back_off(self):
        calls = []
        first = release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich",
            "token", fixture_opener(), self.worker(calls, disagree=True), NOW, max_records=1)
        self.assertEqual(first["released"], 0)
        self.assertEqual(first["held"], 1)
        self.assertEqual(build_pocket_feed(self.root, NOW)["articles"], [])
        rejected_id = next(payload["id"] for url, payload in calls if url.endswith("/enrich"))
        later = []
        release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich",
            "token", fixture_opener(), self.worker(later), "2026-08-18T05:05:00Z", max_records=1)
        self.assertTrue(all(payload["id"] != rejected_id for url, payload in later if url.endswith("/enrich")))

    def test_verified_but_incomplete_notes_are_not_counted_as_released(self):
        calls = []
        normal = self.worker(calls)
        def incomplete(request, timeout=55):
            if request.full_url.endswith("/enrich"):
                note = note_for(json.loads(request.data))
                note["staticDefinition"] = ""
                return EnrichmentResponse({"success": True, "data": note})
            return normal(request, timeout)
        result = release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich",
            "token", fixture_opener(), incomplete, NOW, max_records=1)
        self.assertEqual(result["verified"], 1)
        self.assertEqual(result["released"], 0)
        self.assertEqual(result["excluded"], 1)
        self.assertEqual(build_pocket_feed(self.root, NOW)["articles"], [])

    def test_source_correction_withdraws_old_note_before_regeneration(self):
        self.save(checked(note_for(self.source), self.source))
        _write_json(self.root / "pocket-feed.json", build_pocket_feed(self.root, NOW))
        mapping = json.loads((Path(__file__).with_name("fixtures") / "opener-map.json").read_text())
        url = next(url for url, row in mapping.items() if row["sourceId"] == "pib")
        corrected = fixture_bytes(mapping[url]["file"]).replace(b"Official concise summary.", b"Official corrected summary.")
        calls = []
        release_updates(FIXTURE_REGISTRY, self.root, "https://worker.example/upsc/enrich", "token",
            fixture_opener(overrides={url: corrected}), self.worker(calls), "2026-08-18T05:05:00Z", max_records=0)
        self.assertEqual(calls[0][1]["articles"], [])


if __name__ == "__main__":
    unittest.main()
