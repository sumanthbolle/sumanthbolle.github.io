import json
import ast
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.publish import build_indexes, publish


FIXTURES = Path(__file__).with_name("fixtures")
FIXTURE_REGISTRY = FIXTURES / "source-registry.json"
FAILURE_REGISTRY = FIXTURES / "source-registry-with-failure.json"
NOW = "2026-08-18T05:00:00Z"


class FixtureResponse:
    def __init__(self, body, final_url, content_type):
        self._body = body
        self._url = final_url
        self.headers = {"Content-Type": content_type}

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


def fixture_bytes(name):
    return (FIXTURES / name).read_bytes()


def fixture_opener(fail_ids=(), overrides=None):
    mapping = json.loads((FIXTURES / "opener-map.json").read_text(encoding="utf-8"))
    overrides = overrides or {}

    def open_fixture(request, timeout=20):
        url = request.full_url
        item = mapping[url]
        if item["sourceId"] in fail_ids:
            raise OSError("fixture adapter failure")
        return FixtureResponse(
            overrides.get(url, fixture_bytes(item["file"])),
            item.get("finalUrl", url),
            item["contentType"],
        )

    return open_fixture


class PublisherTests(unittest.TestCase):
    def test_publisher_source_parses_as_python_39(self):
        for name in ("models.py", "adapters.py", "publish.py"):
            source = (Path(__file__).with_name(name)).read_text(encoding="utf-8")
            ast.parse(source, filename=name, feature_version=(3, 9))

    def test_cli_runs_directly_from_repository_root(self):
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run([
                sys.executable, "scripts/upsc/publish.py", "ingest",
                "--registry", str(FIXTURE_REGISTRY), "--output", directory,
                "--fixtures", str(FIXTURES), "--now", NOW,
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((Path(directory) / "coverage.json").is_file())

    def test_second_run_is_idempotent_and_builds_source_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = publish(FIXTURE_REGISTRY, root, fixture_opener(), NOW)
            second = publish(FIXTURE_REGISTRY, root, fixture_opener(), NOW)
            index = build_indexes(root, NOW)
            self.assertGreater(first["newRecords"], 0)
            self.assertEqual(second["newRecords"], 0)
            self.assertEqual(second["totalRecords"], first["totalRecords"])
            self.assertEqual(len(index["records"]), first["totalRecords"])
            self.assertTrue((root / "feed/2026/08/18.json").is_file())

    def test_one_adapter_failure_keeps_other_records_and_reports_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            report = publish(
                FAILURE_REGISTRY, Path(directory),
                fixture_opener(("broken",)), NOW,
            )
            self.assertEqual(report["sources"]["pib"]["status"], "ok")
            self.assertEqual(report["sources"]["broken"]["status"], "error")
            self.assertGreater(report["totalRecords"], 0)

    def test_content_correction_preserves_superseded_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publish(FIXTURE_REGISTRY, root, fixture_opener(), NOW)
            mapping = json.loads(
                (FIXTURES / "opener-map.json").read_text(encoding="utf-8")
            )
            pib_url = next(
                url for url, item in mapping.items() if item["sourceId"] == "pib"
            )
            corrected = fixture_bytes(mapping[pib_url]["file"]).replace(
                b"Official concise summary.", b"Official corrected summary."
            )
            report = publish(
                FIXTURE_REGISTRY, root,
                fixture_opener(overrides={pib_url: corrected}),
                "2026-08-18T06:00:00Z",
            )
            self.assertEqual(report["updatedRecords"], 1)
            self.assertEqual(len(list((root / "history").glob("*/*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
