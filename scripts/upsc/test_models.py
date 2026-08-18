import json
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.models import (
    SourceConfig,
    load_registry,
    normalize_source_record,
    validate_exam_note,
    validate_final_url,
)


class SourceContractTests(unittest.TestCase):
    def test_registry_rejects_duplicate_ids(self):
        payload = [
            {
                "id": "pib", "name": "PIB", "country": "IN",
                "tier": "indian-primary", "hosts": ["pib.gov.in"],
                "adapter": "rss", "feedUrl": "https://pib.gov.in/feed.xml",
                "enabled": True,
            },
            {
                "id": "pib", "name": "Duplicate", "country": "IN",
                "tier": "indian-primary", "hosts": ["pib.gov.in"],
                "adapter": "rss", "feedUrl": "https://pib.gov.in/other.xml",
                "enabled": True,
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate source id"):
                load_registry(path)

    def test_registry_requires_one_reviewed_endpoint(self):
        payload = [{
            "id": "pib", "name": "PIB", "country": "IN",
            "tier": "indian-primary", "hosts": ["pib.gov.in"],
            "adapter": "rss", "enabled": True,
        }]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exactly one endpoint"):
                load_registry(path)

    def test_final_url_must_be_http_and_match_reviewed_host(self):
        config = SourceConfig(
            id="pib", name="PIB", country="IN", tier="indian-primary",
            hosts=("pib.gov.in",), adapter="rss",
            endpoint="https://pib.gov.in/feed.xml", enabled=True,
            link_class="",
        )
        self.assertEqual(
            validate_final_url(config, "https://www.pib.gov.in/release/1"),
            "https://www.pib.gov.in/release/1",
        )
        with self.assertRaisesRegex(ValueError, "reviewed host"):
            validate_final_url(config, "https://example.com/release/1")
        with self.assertRaisesRegex(ValueError, "HTTP"):
            validate_final_url(config, "javascript:alert(1)")

    def test_source_record_is_deterministic_plain_text(self):
        config = SourceConfig(
            id="pib", name="PIB", country="IN", tier="indian-primary",
            hosts=("pib.gov.in",), adapter="rss",
            endpoint="https://pib.gov.in/feed.xml", enabled=True,
            link_class="",
        )
        record = normalize_source_record(config, {
            "title": "  Cabinet <b>approves</b> policy  ",
            "url": "https://pib.gov.in/release/1",
            "publishedAt": "2026-08-18T04:00:00Z",
            "summary": "<p>Official &amp; concise.</p>",
            "sourceType": "release",
        }, "2026-08-18T05:00:00Z")
        self.assertEqual(record["title"], "Cabinet approves policy")
        self.assertEqual(record["officialSummary"], "Official & concise.")
        self.assertEqual(record["publisherId"], "pib")
        self.assertTrue(record["id"].startswith("src_"))
        self.assertTrue(record["sourceVerified"])

    def test_canonical_url_and_date_fail_closed(self):
        config = SourceConfig(
            id="pib", name="PIB", country="IN", tier="indian-primary",
            hosts=("pib.gov.in",), adapter="rss",
            endpoint="https://pib.gov.in/feed.xml", enabled=True,
            link_class="",
        )
        record = normalize_source_record(config, {
            "title": "Policy",
            "url": "https://PIB.gov.in:443/release/1?utm_source=x&a=2#top",
            "publishedAt": "2026-08-18T04:00:00+00:00",
            "summary": "Summary",
        }, "2026-08-18T05:00:00Z")
        self.assertEqual(
            record["canonicalUrl"], "https://pib.gov.in/release/1?a=2"
        )
        self.assertEqual(record["publishedAt"], "2026-08-18T04:00:00Z")
        with self.assertRaisesRegex(ValueError, "publishedAt"):
            normalize_source_record(config, {
                "title": "Policy", "url": "https://pib.gov.in/release/2",
                "publishedAt": "not-a-date", "summary": "Summary",
            }, "2026-08-18T05:00:00Z")

    def test_exam_note_requires_anchor_codes_source_hash_and_use(self):
        with self.assertRaisesRegex(ValueError, "static anchor"):
            validate_exam_note({
                "sourceId": "src_1", "sourceContentHash": "hash_1",
                "anchor": "", "codes": ["GS2.2"], "use": "Use line",
            })
        note = validate_exam_note({
            "sourceId": "src_1", "sourceContentHash": "hash_1",
            "anchor": "fiscal federalism", "codes": ["GS2.2", "GS3.2"],
            "use": "Use line", "officialFacts": [],
            "editorialStatus": "draft",
        })
        self.assertEqual(note["papers"], ["GS2", "GS3"])


if __name__ == "__main__":
    unittest.main()
