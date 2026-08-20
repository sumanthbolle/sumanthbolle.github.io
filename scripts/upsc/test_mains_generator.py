import ast
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from scripts.upsc.mains_config import DIRECTIVES
from scripts.upsc.mains_generator import (
    build_local_drill,
    directive_for,
    generate_drills,
    gs_paper_for_anchor,
    validate_drill,
)
from scripts.upsc.test_publish import EnrichmentResponse, fixture_source_record


FIXTURES = Path(__file__).with_name("fixtures")
NOW = "2026-08-19T12:00:00Z"


def fixture_anchor():
    return json.loads((FIXTURES / "mains-anchor.json").read_text(encoding="utf-8"))


class MainsGeneratorTests(unittest.TestCase):
    def test_mains_modules_parse_as_python_39(self):
        for name in ("mains_generator.py", "mains_config.py", "enrich.py"):
            source = Path(__file__).with_name(name).read_text(encoding="utf-8")
            ast.parse(source, filename=name, feature_version=(3, 9))

    def test_fixture_anchor_produces_schema_with_approved_directive_and_paper(self):
        drill = build_local_drill(fixture_anchor(), date(2026, 8, 19), 0)
        self.assertEqual(drill["anchor_id"], "fiscal-federalism")
        self.assertEqual(drill["gs_paper"], "GS2")
        self.assertIn(drill["directive_word"], DIRECTIVES)
        self.assertTrue(drill["question"])
        self.assertEqual(drill["word_limit"], 250)
        self.assertEqual(drill["time_budget_minutes"], 12)
        self.assertGreaterEqual(len(drill["dimension_skeleton"]), 1)
        self.assertIn("value_addition_anchor", drill["dimension_skeleton"][0])
        self.assertIn("fiscal-federalism", drill["source_anchor_ref"])
        validate_drill(drill)

    def test_gs_paper_mapping_is_driven_by_config_not_hardcoded_topics(self):
        self.assertEqual(gs_paper_for_anchor({"id": "x", "anchor": "Ethics in public life"}), "GS4")
        self.assertEqual(gs_paper_for_anchor({"id": "x", "anchor": "Internal security doctrine"}), "GS3")
        self.assertEqual(gs_paper_for_anchor({"id": "x", "anchor": "Indian society and caste"}), "GS1")
        self.assertEqual(gs_paper_for_anchor({"codes": ["GS3.5"], "anchor": "mystery"}), "GS3")

    def test_all_eight_directives_appear_in_a_rolling_two_week_window(self):
        start = date(2026, 8, 19)
        seen = {
            directive_for(start + timedelta(days=offset), 0)
            for offset in range(14)
        }
        self.assertEqual(seen, set(DIRECTIVES))

    def test_generate_drills_uses_shared_worker_client_and_keeps_local_fallback(self):
        anchor = fixture_anchor()
        calls = []

        def opener(request, timeout=55):
            calls.append((request.full_url, request.get_header("Authorization"), timeout))
            return EnrichmentResponse({
                "success": True,
                "data": {
                    "question": "Critically Examine the working of fiscal federalism in India.",
                    "dimension_skeleton": [{
                        "dimension": "Constitutional design",
                        "value_addition_anchor": "Article 280",
                    }],
                    "word_limit": 250,
                    "time_budget_minutes": 12,
                },
            })

        payload = generate_drills(
            [anchor], NOW,
            endpoint="https://worker.example/upsc/enrich",
            token="token",
            opener=opener,
            llm_limit=1,
        )
        self.assertEqual(payload["itemCount"], 1)
        self.assertEqual(payload["llmUsed"], 1)
        self.assertEqual(calls[0][0], "https://worker.example/upsc/mains")
        self.assertEqual(calls[0][1], "Bearer token")
        self.assertEqual(payload["drills"][0]["question"].split()[0], "Critically")

        def failing_opener(request, timeout=55):
            raise OSError("worker down")

        fallback = generate_drills(
            [anchor], NOW,
            endpoint="https://worker.example/upsc/enrich",
            token="token",
            opener=failing_opener,
            llm_limit=1,
        )
        self.assertEqual(fallback["llmUsed"], 0)
        self.assertEqual(fallback["drills"][0]["anchor_id"], "fiscal-federalism")

    def test_cli_writes_mains_drills_json(self):
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run([
                sys.executable, "scripts/upsc/mains_generator.py",
                "--patterns", str(FIXTURES / "mains-patterns.json"),
                "--output", directory,
                "--now", NOW,
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            payload = json.loads((Path(directory) / "mains-drills.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["itemCount"], 1)
            self.assertEqual(payload["drills"][0]["anchor_id"], "fiscal-federalism")

    def test_mains_page_follows_upsc_html_theme_conventions(self):
        page = Path(__file__).parents[2] / "mains.html"
        markup = page.read_text(encoding="utf-8")
        self.assertIn('data-theme="light"', markup)
        self.assertIn("assets/css/upsc.css", markup)
        self.assertIn("data/upsc/mains-drills.json", markup)
        css = (Path(__file__).parents[2] / "assets/css/upsc.css").read_text(encoding="utf-8")
        self.assertIn(".an-entry > .an-entry__body:only-child", css)
        self.assertIn("class=\"an-entry__body\"", markup)


class ExistingEnrichmentClientStillWorks(unittest.TestCase):
    def test_enrichment_fixture_record_still_round_trips(self):
        source = fixture_source_record()
        self.assertTrue(source["sourceVerified"])


if __name__ == "__main__":
    unittest.main()
