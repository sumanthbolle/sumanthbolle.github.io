import json
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.publish import build_indexes, build_static_pages


NOW = "2026-08-18T05:00:00Z"


class StaticPageTests(unittest.TestCase):
    def test_builds_source_backed_note_and_archive_pages_without_javascript(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "data"
            site = Path(directory) / "upsc-study"
            source = {
                "id": "src_pib", "title": "Cabinet approves fiscal policy",
                "publisherId": "pib", "publisherName": "Press Information Bureau",
                "publishedAt": "2026-08-18T04:00:00Z", "fetchedAt": NOW,
                "sourceUrl": "https://pib.gov.in/release/1",
                "canonicalUrl": "https://pib.gov.in/release/1",
                "officialSummary": "Cabinet approved the fiscal policy.",
                "sourceType": "release", "jurisdiction": "IN",
                "sourceVerified": True, "contentHash": "hash_current",
                "editorialState": "source-only",
            }
            feed = root / "feed/2026/08/18.json"
            feed.parent.mkdir(parents=True)
            feed.write_text(json.dumps([source]), encoding="utf-8")
            note = {
                "sourceId": "src_pib", "sourceContentHash": "hash_current",
                "sourceUrl": source["sourceUrl"], "sourceTitle": source["title"],
                "publisherName": source["publisherName"],
                "publishedAt": source["publishedAt"], "anchor": "fiscal federalism",
                "codes": ["GS2.2", "GS3.2"], "use": "Use as a fiscal coordination example.",
                "whyInNews": "A policy decision changed fiscal coordination.",
                "staticDefinition": "Fiscal federalism divides financial powers.",
                "background": ["A constitutional division shapes public finance."],
                "reusableAnchors": [{"kind": "constitutional", "label": "Finance Commission"}],
                "officialFacts": [{
                    "text": source["officialSummary"], "evidenceUrl": source["sourceUrl"],
                    "evidenceLocator": "officialSummary", "verification": "source-backed",
                }],
                "analysis": [{"claim": "Coordination quality affects implementation.", "label": "analysis"}],
                "indiaImplications": ["Implementation affects Union-state coordination."],
                "wayForward": ["Use transparent intergovernmental consultation."],
                "prelimsTraps": ["Do not confuse grants with tax devolution."],
                "mainsPractice": [{"stem": "Examine fiscal federalism in India."}],
                "recallCard": "Recall institution, instrument, implication and reform.",
                "priority": 80, "priorityProvisional": True,
                "editorialStatus": "source-backed",
            }
            notes = root / "notes"
            notes.mkdir()
            (notes / "src_pib.json").write_text(json.dumps(note), encoding="utf-8")
            build_indexes(root, NOW)

            report = build_static_pages(root, site, "https://sumanthbolle.com", NOW)

            page = site / "notes/src_pib/cabinet-approves-fiscal-policy.html"
            self.assertTrue(page.is_file())
            markup = page.read_text(encoding="utf-8")
            self.assertIn('<link rel="canonical" href="https://sumanthbolle.com/upsc-study/notes/src_pib/cabinet-approves-fiscal-policy.html">', markup)
            self.assertIn('"@type":"LearningResource"', markup)
            self.assertIn("Official source", markup)
            self.assertIn("Official facts", markup)
            self.assertIn("Analysis — not an official claim", markup)
            self.assertNotIn("<script src=", markup)
            self.assertTrue((site / "daily/2026-08-18.html").is_file())
            self.assertTrue((site / "monthly/2026-08.html").is_file())
            self.assertTrue((site / "syllabus/gs2-2.html").is_file())
            self.assertTrue((site / "anchors/fiscal-federalism.html").is_file())
            self.assertEqual(report["notePages"], 1)
            self.assertTrue((site / ".upsc-generated").is_file())

    def test_refuses_to_replace_unmarked_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "data"
            root.mkdir()
            (root / "archive-index.json").write_text("{}", encoding="utf-8")
            site = Path(directory) / "upsc-study"
            site.mkdir()
            (site / "owned.html").write_text("user file", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "generated marker"):
                build_static_pages(root, site, "https://sumanthbolle.com", NOW)


if __name__ == "__main__":
    unittest.main()
