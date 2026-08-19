import ast
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.pyq_link import related_pyqs, build_links


FIXTURES = Path(__file__).with_name("fixtures")
NOW = "2026-08-19T12:00:00Z"


class PyqLinkTests(unittest.TestCase):
    def test_pyq_link_parses_as_python_39(self):
        source = Path(__file__).with_name("pyq_link.py").read_text(encoding="utf-8")
        ast.parse(source, filename="pyq_link.py", feature_version=(3, 9))

    def test_federalism_anchor_surfaces_matching_bank_entry(self):
        bank = json.loads((Path(__file__).parents[2] / "data/upsc/pyq-bank.json").read_text())["questions"]
        hits = related_pyqs({"id": "federalism", "anchor": "Federalism", "aliases": []}, bank)
        self.assertGreaterEqual(len(hits), 1)
        self.assertTrue(any("Federalism" in (row.get("tags") or []) for row in hits))

    def test_fiscal_federalism_atlas_anchor_also_matches(self):
        bank = json.loads((Path(__file__).parents[2] / "data/upsc/pyq-bank.json").read_text())["questions"]
        hits = related_pyqs({
            "id": "fiscal-federalism",
            "anchor": "Fiscal federalism",
            "aliases": ["finance commission", "tax devolution"],
        }, bank)
        self.assertGreaterEqual(len(hits), 1)

    def test_unknown_topic_returns_empty_list_not_error(self):
        self.assertEqual(related_pyqs({
            "id": "unmapped-anchor",
            "anchor": "A topic with no PYQ bank entry",
        }, [{"id": "x", "tags": ["Federalism"], "question": "Q"}]), [])

    def test_cli_writes_pyq_links_json(self):
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run([
                sys.executable, "scripts/upsc/pyq_link.py",
                "--patterns", str(FIXTURES / "pyq-patterns.json"),
                "--bank", str(Path(__file__).parents[2] / "data/upsc/pyq-bank.json"),
                "--output", directory,
                "--now", NOW,
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            payload = json.loads((Path(directory) / "pyq-links.json").read_text(encoding="utf-8"))
            self.assertGreaterEqual(len(payload["byAnchor"]["fiscal-federalism"]), 1)
            self.assertEqual(payload["byAnchor"]["unmapped-anchor"], [])

    def test_atlas_page_renders_seen_before(self):
        atlas = (Path(__file__).parents[2] / "assets/js/upsc/atlas.js").read_text(encoding="utf-8")
        self.assertIn("Seen before", atlas)
        self.assertIn("data/upsc/pyq-links.json", atlas)


if __name__ == "__main__":
    unittest.main()
