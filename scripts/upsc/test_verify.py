import ast
import json
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.test_publish import EnrichmentResponse, fixture_source_record
from scripts.upsc.verify import (
    CONFIDENCE_FLOOR,
    apply_verification,
    parse_verification,
    record_verification_stats,
    review_issue_payload,
    should_publish,
    write_review_queue,
)


NOW = "2026-08-19T13:07:06Z"


def exam_note(source, anchor="fiscal federalism"):
    return {
        "sourceId": source["id"],
        "sourceContentHash": source["contentHash"],
        "sourceUrl": source["sourceUrl"],
        "anchor": anchor,
        "codes": ["GS2.2"],
        "use": "Use as a fiscal coordination example.",
        "editorialStatus": "source-backed",
    }


class VerificationTests(unittest.TestCase):
    def test_verify_parses_as_python_39(self):
        source = Path(__file__).with_name("verify.py").read_text(encoding="utf-8")
        ast.parse(source, filename="verify.py", feature_version=(3, 9))

    def test_wrong_static_topic_is_held_not_published(self):
        source = fixture_source_record()
        note = exam_note(source, "climate governance")
        calls = []

        def opener(request, timeout=55):
            calls.append(request.full_url)
            return EnrichmentResponse({
                "success": True,
                "data": {
                    "agrees": False,
                    "confidence": 0.4,
                    "flagged_claims": ["static topic is climate rather than fiscal federalism"],
                },
            })

        published, held, stats = apply_verification(
            [note], {source["id"]: source},
            "https://worker.example/upsc/verify", "token", opener, NOW,
        )
        self.assertEqual(published, [])
        self.assertEqual(len(held), 1)
        self.assertEqual(held[0]["sourceId"], source["id"])
        self.assertFalse(should_publish(held[0]["verification"]))
        self.assertEqual(stats["disagreed"], 1)
        self.assertIn("/upsc/verify", calls[0])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_review_queue(root, held, now=NOW)
            queue = json.loads((root / "needs-review.json").read_text(encoding="utf-8"))
            self.assertEqual(queue["itemCount"], 1)
            self.assertEqual(queue["items"][0]["sourceId"], source["id"])
            self.assertNotIn(source["id"] + ".json", [path.name for path in root.glob("notes/*.json")])

    def test_correct_tagging_publishes_through_the_existing_path(self):
        source = fixture_source_record()
        note = exam_note(source)

        def opener(request, timeout=55):
            return EnrichmentResponse({
                "success": True,
                "data": {"agrees": True, "confidence": 0.91, "flagged_claims": []},
            })

        published, held, stats = apply_verification(
            [note], {source["id"]: source},
            "https://worker.example/upsc/verify", "token", opener, NOW,
        )
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]["anchor"], "fiscal federalism")
        self.assertEqual(held, [])
        self.assertEqual(stats["agreed"], 1)
        self.assertTrue(should_publish(parse_verification({
            "success": True, "data": {"agrees": True, "confidence": 0.91, "flagged_claims": []},
        })))

    def test_low_confidence_agreement_is_still_held(self):
        result = parse_verification({
            "success": True,
            "data": {"agrees": True, "confidence": 0.55, "flagged_claims": ["thin evidence"]},
        })
        self.assertFalse(should_publish(result))
        self.assertLess(result["confidence"], CONFIDENCE_FLOOR)

    def test_issue_payload_and_stats_are_recorded(self):
        payload = review_issue_payload("src_pib", {
            "agrees": False, "confidence": 0.2, "flagged_claims": ["wrong paper"],
        }, NOW)
        self.assertEqual(payload["title"], "Needs review: src_pib verification disagreed")
        self.assertEqual(payload["labels"], ["upsc-needs-review"])
        self.assertIn("wrong paper", payload["body"])
        with tempfile.TemporaryDirectory() as directory:
            stats = record_verification_stats(
                Path(directory),
                {"agreed": 3, "disagreed": 1, "skipped": 0, "checked": 4},
                NOW,
            )
            self.assertEqual(stats["totals"]["disagreed"], 1)
            self.assertEqual(stats["runs"][-1]["checkedAt"], NOW)


if __name__ == "__main__":
    unittest.main()
