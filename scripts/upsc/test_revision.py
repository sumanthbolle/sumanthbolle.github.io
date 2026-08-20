import ast
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.upsc.revision import (
    build_revision_queue,
    matching_window,
    select_revision_items,
)


TODAY = date(2026, 8, 19)
NOW = "2026-08-19T19:30:00Z"


def archive_note(source_id, day, title="", **fields):
    row = {
        "sourceId": source_id,
        "title": title or source_id,
        "path": f"upsc-study/notes/{source_id}/note.html",
        "date": day,
        "month": day[:7],
        "codes": fields.get("codes", ["GS2.2"]),
        "anchor": fields.get("anchor", "fiscal federalism"),
        "anchorSlug": "fiscal-federalism",
        "status": "source-backed",
    }
    row.update(fields)
    return row


class RevisionWindowTests(unittest.TestCase):
    def test_revision_parses_as_python_39(self):
        source = Path(__file__).with_name("revision.py").read_text(encoding="utf-8")
        ast.parse(source, filename="revision.py", feature_version=(3, 9))

    def test_matching_window_accepts_exact_and_plus_minus_one_day(self):
        self.assertEqual(matching_window(date(2026, 8, 12), TODAY), 7)
        self.assertEqual(matching_window(date(2026, 8, 11), TODAY), 7)
        self.assertEqual(matching_window(date(2026, 8, 13), TODAY), 7)
        self.assertEqual(matching_window(date(2026, 7, 20), TODAY), 30)
        self.assertEqual(matching_window(date(2026, 7, 19), TODAY), 30)
        self.assertEqual(matching_window(date(2026, 7, 21), TODAY), 30)

    def test_matching_window_rejects_dates_outside_tolerance(self):
        self.assertIsNone(matching_window(date(2026, 8, 19), TODAY))
        self.assertIsNone(matching_window(date(2026, 8, 10), TODAY))
        self.assertIsNone(matching_window(date(2026, 8, 1), TODAY))
        self.assertIsNone(matching_window(date(2026, 7, 22), TODAY))
        self.assertIsNone(matching_window(date(2026, 6, 1), TODAY))
        self.assertIsNone(matching_window(date(2026, 8, 20), TODAY))

    def test_selects_exactly_the_7_and_30_day_fixture_anchors(self):
        candidates = [
            {"id": "in-7", "date": "2026-08-12", "title": "Seven day", "priority": 0},
            {"id": "in-7-edge", "date": "2026-08-11", "title": "Seven plus one", "priority": 0},
            {"id": "in-30", "date": "2026-07-20", "title": "Thirty day", "priority": 0},
            {"id": "in-30-edge", "date": "2026-07-21", "title": "Thirty minus one", "priority": 0},
            {"id": "out-today", "date": "2026-08-19", "title": "Today", "priority": 99},
            {"id": "out-mid", "date": "2026-08-01", "title": "Eighteen days", "priority": 99},
            {"id": "out-old", "date": "2026-06-01", "title": "Too old", "priority": 99},
            {"id": "out-9", "date": "2026-08-10", "title": "Nine days", "priority": 99},
        ]
        selected = select_revision_items(candidates, TODAY, limit=10)
        self.assertEqual(
            {item["id"] for item in selected},
            {"in-7", "in-7-edge", "in-30", "in-30-edge"},
        )
        self.assertTrue(all(item["windowDays"] in (7, 30) for item in selected))

    def test_high_value_items_are_kept_when_the_queue_is_capped(self):
        candidates = [
            {"id": "hard-7", "date": "2026-08-12", "hard": True, "priority": 10},
            {"id": "plain-7", "date": "2026-08-13", "priority": 0},
            {"id": "priority-30", "date": "2026-07-20", "priority": 80},
        ]
        selected = select_revision_items(candidates, TODAY, limit=2)
        self.assertEqual([item["id"] for item in selected], ["hard-7", "priority-30"])

    def test_cli_writes_queue_from_archive_index_and_ignores_out_of_window(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = {
                "generatedAt": NOW,
                "notes": [
                    archive_note("src_seven", "2026-08-12", "Cabinet 7-day"),
                    archive_note("src_thirty", "2026-07-20", "RBI 30-day"),
                    archive_note("src_today", "2026-08-19", "Should not appear"),
                    archive_note("src_mid", "2026-08-01", "Should not appear either"),
                ],
                "days": {},
                "months": {},
                "codes": {},
                "anchors": {},
            }
            (root / "archive-index.json").write_text(json.dumps(archive), encoding="utf-8")
            completed = subprocess.run([
                sys.executable, "scripts/upsc/revision.py",
                "--output", str(root), "--now", NOW, "--limit", "5",
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            queue = json.loads((root / "revision-queue.json").read_text(encoding="utf-8"))
            self.assertEqual(queue["today"], "2026-08-19")
            self.assertEqual(
                {item["id"] for item in queue["items"]},
                {"src_seven", "src_thirty"},
            )
            self.assertEqual(queue["windows"]["7"]["target"], "2026-08-12")
            self.assertEqual(queue["windows"]["30"]["target"], "2026-07-20")

    def test_build_queue_joins_exam_priority_from_output_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "archive-index.json").write_text(json.dumps({
                "notes": [
                    archive_note("src_hard", "2026-08-12"),
                    archive_note("src_plain", "2026-07-20"),
                ],
            }), encoding="utf-8")
            (root / "exam-index.json").write_text(json.dumps({
                "notes": [
                    {"sourceId": "src_hard", "priority": 90, "hard": True},
                    {"sourceId": "src_plain", "priority": 10},
                ],
            }), encoding="utf-8")
            queue = build_revision_queue(root, NOW, limit=1)
            self.assertEqual([item["id"] for item in queue["items"]], ["src_hard"])


class RevisionPageTests(unittest.TestCase):
    def test_revision_page_follows_upsc_html_theme_conventions(self):
        page = Path(__file__).parents[2] / "revision.html"
        markup = page.read_text(encoding="utf-8")
        self.assertIn('data-theme="light"', markup)
        self.assertIn("assets/css/upsc.css", markup)
        self.assertIn("assets/css/utility-chrome.css", markup)
        self.assertIn("data/upsc/revision-queue.json", markup)
        self.assertIn("Revisit Today", markup)
        css = (Path(__file__).parents[2] / "assets/css/upsc.css").read_text(encoding="utf-8")
        self.assertIn(".an-entry > .an-entry__body:only-child", css)
        self.assertIn("class=\"an-entry__body\"", markup)
        self.assertNotIn("an-entry__margin", markup)


if __name__ == "__main__":
    unittest.main()
