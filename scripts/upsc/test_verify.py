import ast
import json
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.test_publish import EnrichmentResponse, fixture_source_record
from scripts.upsc.verify import (
    CONFIDENCE_FLOOR,
    STATUS_DISAGREED,
    STATUS_UNAVAILABLE,
    UNAVAILABLE_CLAIM,
    UNAVAILABLE_TITLE_PREFIX,
    apply_verification,
    parse_verification,
    reconcile_review_issues,
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
                "success": True, "verificationVersion": 2,
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
                "success": True, "verificationVersion": 2,
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
            "success": True, "verificationVersion": 2, "data": {"agrees": True, "confidence": 0.91, "flagged_claims": []},
        })))

    def test_low_confidence_agreement_is_still_held(self):
        result = parse_verification({
            "success": True, "verificationVersion": 2,
            "data": {"agrees": True, "confidence": 0.55, "flagged_claims": ["thin evidence"]},
        })
        self.assertFalse(should_publish(result))
        self.assertLess(result["confidence"], CONFIDENCE_FLOOR)

    def test_unavailable_verifier_holds_with_the_reason_and_no_per_note_issue(self):
        import urllib.error
        source = fixture_source_record()
        note = exam_note(source)

        def opener(request, timeout=55):
            raise urllib.error.HTTPError(
                request.full_url, 422, "Unprocessable", None,
                __import__("io").BytesIO(
                    b'{"success":false,"error":"Provider response did not satisfy the verification contract."}'
                ),
            )

        published, held, stats = apply_verification(
            [note], {source["id"]: source},
            "https://worker.example/upsc/verify", "token", opener, NOW,
        )
        self.assertEqual(published, [])
        self.assertEqual(stats, {"agreed": 0, "disagreed": 0, "skipped": 1, "checked": 0})
        self.assertEqual(held[0]["status"], STATUS_UNAVAILABLE)
        self.assertIn("HTTP 422", held[0]["error"])
        self.assertIn("verification contract", held[0]["error"])
        self.assertEqual(held[0]["verification"]["flagged_claims"], [UNAVAILABLE_CLAIM])

        plan = reconcile_review_issues(held, [], NOW)
        self.assertEqual(len(plan["create"]), 1)
        self.assertTrue(plan["create"][0]["title"].startswith(UNAVAILABLE_TITLE_PREFIX))
        self.assertIn("1 enriched notes", plan["create"][0]["title"])
        self.assertIn(source["id"], plan["create"][0]["body"])
        self.assertIn("HTTP 422", plan["create"][0]["body"])
        self.assertEqual(plan["close"], [])

        # A second run with the shared issue already open updates it in place.
        plan = reconcile_review_issues(held, [
            {"number": 300, "title": plan["create"][0]["title"]},
        ], NOW)
        self.assertEqual(plan["create"], [])
        self.assertEqual(plan["update"][0]["number"], 300)

        # Once nothing is waiting, the shared issue closes.
        plan = reconcile_review_issues([], [
            {"number": 300, "title": f"{UNAVAILABLE_TITLE_PREFIX} 1 enriched notes waiting for a second-pass check"},
        ], NOW)
        self.assertEqual(plan["close"][0]["number"], 300)

    def test_legacy_unavailable_rows_close_their_per_note_issues(self):
        # Rows written before the status field existed: the sentinel claim marks them.
        legacy = {
            "sourceId": "src_old",
            "anchor": "old anchor",
            "checkedAt": NOW,
            "verification": {"agrees": False, "confidence": 0, "flagged_claims": [UNAVAILABLE_CLAIM]},
        }
        disagreed = {
            "sourceId": "src_bad",
            "anchor": "wrong anchor",
            "checkedAt": NOW,
            "status": STATUS_DISAGREED,
            "verification": {"agrees": False, "confidence": 0.3, "flagged_claims": ["wrong paper"]},
        }
        plan = reconcile_review_issues([legacy, disagreed], [
            {"number": 11, "title": "Needs review: src_old verification disagreed"},
            {"number": 12, "title": "Needs review: src_gone verification disagreed"},
        ], NOW)
        closed = {row["number"]: row["comment"] for row in plan["close"]}
        self.assertIn("never checked", closed[11])
        self.assertIn("passed verification", closed[12])
        created = [row["title"] for row in plan["create"]]
        self.assertIn("Needs review: src_bad verification disagreed", created)
        self.assertTrue(any(title.startswith(UNAVAILABLE_TITLE_PREFIX) for title in created))
        self.assertEqual(len(created), 2)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "needs-review.json").write_text(json.dumps({"items": [legacy]}), encoding="utf-8")
            write_review_queue(root, [disagreed], now=NOW)
            queue = json.loads((root / "needs-review.json").read_text(encoding="utf-8"))
            statuses = {row["sourceId"]: row["status"] for row in queue["items"]}
            self.assertEqual(statuses, {"src_old": STATUS_UNAVAILABLE, "src_bad": STATUS_DISAGREED})

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
