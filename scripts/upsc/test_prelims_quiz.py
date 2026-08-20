import ast
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.prelims_quiz import (
    TRAP_TYPES,
    TWO_OPTIONS,
    build_question,
    generate_quiz,
    validate_question,
)


FIXTURES = Path(__file__).with_name("fixtures")
NOW = "2026-08-19T12:00:00Z"


def fixture_anchor(**overrides):
    row = json.loads((FIXTURES / "prelims-anchor.json").read_text(encoding="utf-8"))
    row.update(overrides)
    return row


class PrelimsQuizTests(unittest.TestCase):
    def test_prelims_quiz_parses_as_python_39(self):
        source = Path(__file__).with_name("prelims_quiz.py").read_text(encoding="utf-8")
        ast.parse(source, filename="prelims_quiz.py", feature_version=(3, 9))

    def test_fixture_anchor_builds_valid_statement_mcq(self):
        item = build_question(fixture_anchor(), 0)
        self.assertEqual(item["anchor_id"], "fiscal-federalism")
        self.assertGreaterEqual(len(item["statements"]), 2)
        self.assertLessEqual(len(item["statements"]), 5)
        self.assertEqual(
            item["question_stem"],
            "Which of the statements given above is/are correct?",
        )
        self.assertGreaterEqual(len(item["options"]), 4)
        self.assertIn(item["correct_option"], item["options"])
        self.assertIn(item["trap_type"], TRAP_TYPES)
        self.assertTrue(item["explanation"])
        validate_question(item)

    def test_trap_types_cover_prelims_patterns(self):
        numbered = fixture_anchor(static_core=[
            "Article 280 constitutes the Finance Commission for five years",
            "Cesses sit outside the divisible pool",
        ])
        dated = fixture_anchor(static_core=[
            "The 15th Finance Commission award covers 2021 to 2026",
            "GST Council is a constitutional body",
        ], id="dated-anchor")
        seen = {
            build_question(numbered, 0)["trap_type"],
            build_question(dated, 1)["trap_type"],
            build_question(fixture_anchor(), 2)["trap_type"],
        }
        self.assertTrue(seen & set(TRAP_TYPES))
        self.assertIn(build_question(numbered, 0)["trap_type"], TRAP_TYPES)

    def test_two_statement_items_use_the_classic_option_set(self):
        item = build_question(fixture_anchor(), 1)
        if len(item["statements"]) == 2:
            self.assertEqual(tuple(item["options"]), TWO_OPTIONS)

    def test_cli_writes_prelims_quiz_json(self):
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run([
                sys.executable, "scripts/upsc/prelims_quiz.py",
                "--patterns", str(FIXTURES / "prelims-patterns.json"),
                "--output", directory,
                "--now", NOW,
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            payload = json.loads((Path(directory) / "prelims-quiz.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["itemCount"], 1)
            self.assertEqual(payload["items"][0]["anchor_id"], "fiscal-federalism")

    def test_quiz_page_is_namespaced_away_from_servicenow_quiz(self):
        root = Path(__file__).parents[2]
        page = (root / "upsc-quiz.html").read_text(encoding="utf-8")
        self.assertIn('data-theme="light"', page)
        self.assertIn("assets/css/upsc.css", page)
        self.assertIn("data/upsc/prelims-quiz.json", page)
        self.assertNotIn("quiz-questions.json", page)
        self.assertTrue((root / "quiz.html").is_file())
        css = (root / "assets/css/upsc.css").read_text(encoding="utf-8")
        self.assertIn(".an-entry > .an-entry__body:only-child", css)
        self.assertIn("class=\"an-entry__body\"", page)
        self.assertNotIn("an-entry__margin", page)

    def test_generate_quiz_skips_anchors_without_facts(self):
        payload = generate_quiz([{"id": "empty"}], NOW)
        self.assertEqual(payload["itemCount"], 0)


if __name__ == "__main__":
    unittest.main()
