import json
import ast
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.enrich import enrich_records
from scripts.upsc.publish import build_indexes, check_sources, publish


FIXTURES = Path(__file__).with_name("fixtures")
FIXTURE_REGISTRY = FIXTURES / "source-registry.json"
FAILURE_REGISTRY = FIXTURES / "source-registry-with-failure.json"
BAD_REGISTRY = FIXTURES / "source-registry-bad.json"
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


def fixture_source_record():
    return {
        "id": "src_pib", "title": "Cabinet approves policy",
        "publisherId": "pib", "publishedAt": "2026-08-18T04:00:00Z",
        "sourceUrl": "https://pib.gov.in/release/1",
        "officialSummary": "Cabinet approved the fiscal policy.",
        "contentHash": "sha256_fixture_content", "sourceVerified": True,
    }


def failing_enrichment_opener():
    def open_failure(request, timeout=55):
        raise urllib.error.HTTPError(
            request.full_url, 503, "Service Unavailable", {}, None
        )
    return open_failure


class EnrichmentResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class PublisherTests(unittest.TestCase):
    def test_publisher_source_parses_as_python_39(self):
        for name in ("models.py", "adapters.py", "publish.py", "enrich.py", "revision.py"):
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

    def test_source_check_reports_contract_and_freshness_per_source(self):
        report = check_sources(FIXTURE_REGISTRY, fixture_opener(), NOW)
        self.assertTrue(report["healthy"])
        self.assertEqual(report["healthyCount"], len(report["sources"]))
        source = report["sources"]["pib"]
        self.assertEqual(source["status"], "ok")
        self.assertEqual(source["finalHost"], "pib.gov.in")
        self.assertEqual(source["contentType"], "application/rss+xml")
        self.assertEqual(source["latestPublishedAt"], "2026-08-18T04:00:00Z")
        self.assertIn(source["freshness"], ("fresh", "aging", "stale", "fetch-time"))

    def test_source_check_isolates_login_html_and_off_host_redirects(self):
        report = check_sources(BAD_REGISTRY, fixture_opener(), NOW)
        self.assertFalse(report["healthy"])
        self.assertEqual(report["healthyCount"], 0)
        self.assertEqual(report["sources"]["login-html"]["status"], "error")
        self.assertIn("content type", report["sources"]["login-html"]["error"])
        self.assertEqual(report["sources"]["off-host"]["status"], "error")
        self.assertIn("reviewed host", report["sources"]["off-host"]["error"])

    def test_source_check_cli_default_and_strict_exit_policies(self):
        command = [
            sys.executable, "scripts/upsc/publish.py", "check-sources",
            "--registry", str(FAILURE_REGISTRY), "--fixtures", str(FIXTURES),
            "--now", NOW,
        ]
        default = subprocess.run(
            command, cwd=Path(__file__).parents[2], capture_output=True, text=True
        )
        strict = subprocess.run(
            command + ["--strict"], cwd=Path(__file__).parents[2],
            capture_output=True, text=True,
        )
        quorum = subprocess.run(
            command + ["--min-healthy", "2"], cwd=Path(__file__).parents[2],
            capture_output=True, text=True,
        )
        none_healthy = subprocess.run([
            sys.executable, "scripts/upsc/publish.py", "check-sources",
            "--registry", str(BAD_REGISTRY), "--fixtures", str(FIXTURES),
            "--now", NOW,
        ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
        self.assertEqual(default.returncode, 0, default.stderr)
        self.assertEqual(strict.returncode, 1, strict.stderr)
        self.assertEqual(quorum.returncode, 1, quorum.stderr)
        self.assertEqual(none_healthy.returncode, 1, none_healthy.stderr)

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

    def test_enrichment_failure_keeps_source_record_and_omits_exam_note(self):
        source = fixture_source_record()
        notes, failures = enrich_records(
            [source], "https://worker.example/upsc/enrich", "token",
            failing_enrichment_opener(),
        )
        self.assertEqual(notes, [])
        self.assertEqual(failures[source["id"]], "HTTP 503")
        self.assertTrue(source["sourceVerified"])

    def test_enrichment_accepts_only_source_bound_worker_note(self):
        source = fixture_source_record()
        worker_note = {
            "sourceId": source["id"],
            "sourceContentHash": source["contentHash"],
            "sourceUrl": source["sourceUrl"],
            "anchor": "fiscal federalism", "codes": ["GS2.2"],
            "use": "Use as a fiscal coordination example.",
            "editorialStatus": "source-backed",
        }

        def opener(request, timeout=55):
            self.assertEqual(request.get_header("Authorization"), "Bearer token")
            self.assertEqual(timeout, 55)
            return EnrichmentResponse({"success": True, "data": worker_note})

        notes, failures = enrich_records(
            [source], "https://worker.example/upsc/enrich", "token", opener
        )
        self.assertEqual(failures, {})
        self.assertEqual(notes[0]["sourceId"], source["id"])
        self.assertEqual(notes[0]["sourceContentHash"], source["contentHash"])

        skipped, failures = enrich_records(
            [source], "https://worker.example/upsc/enrich", "token", opener,
            {source["id"]: notes[0]},
        )
        self.assertEqual(skipped, [])
        self.assertEqual(failures, {})

    def test_indexes_join_current_exam_notes_and_build_navigation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publish(FIXTURE_REGISTRY, root, fixture_opener(), NOW)
            source = next(
                row for row in json.loads(
                    (root / "feed/2026/08/18.json").read_text(encoding="utf-8")
                ) if row["publisherId"] == "pib"
            )
            note = {
                "sourceId": source["id"],
                "sourceContentHash": source["contentHash"],
                "sourceUrl": source["sourceUrl"],
                "sourceTitle": source["title"],
                "publisherName": source["publisherName"],
                "publishedAt": source["publishedAt"],
                "anchor": "fiscal federalism", "codes": ["GS2.2", "GS3.2"],
                "papers": ["GS2", "GS3"], "whyInNews": "Policy trigger.",
                "staticDefinition": "Division of fiscal powers.",
                "reusableAnchors": [{"kind": "constitutional", "label": "Finance Commission"}],
                "officialFacts": [{
                    "text": source["officialSummary"],
                    "evidenceUrl": source["sourceUrl"],
                    "evidenceLocator": "officialSummary",
                    "verification": "source-backed",
                }],
                "mainsPractice": [{"stem": "Examine fiscal federalism."}],
                "use": "Use as a current fiscal coordination example.",
                "recallCard": "Recall fiscal coordination.",
                "priority": 78, "priorityProvisional": True,
                "editorialStatus": "source-backed",
            }
            (root / "notes").mkdir()
            (root / "notes" / f"{source['id']}.json").write_text(
                json.dumps(note), encoding="utf-8"
            )

            build_indexes(root, NOW)
            source_index = json.loads((root / "source-index.json").read_text())
            mapped = next(row for row in source_index["records"] if row["id"] == source["id"])
            exam = json.loads((root / "exam-index.json").read_text())
            syllabus = json.loads((root / "syllabus-index.json").read_text())
            archive = json.loads((root / "archive-index.json").read_text())

            self.assertEqual(mapped["codes"], ["GS2.2", "GS3.2"])
            self.assertEqual(mapped["editorialState"], "source-backed")
            self.assertEqual(exam["notes"][0]["sourceId"], source["id"])
            anchor = syllabus["codes"]["GS2.2"]["anchors"]["fiscal-federalism"]
            self.assertEqual(anchor["noteIds"], [source["id"]])
            self.assertEqual(archive["notes"][0]["status"], "source-backed")
            self.assertTrue(archive["notes"][0]["path"].startswith("upsc-study/notes/"))

    def test_stale_note_is_excluded_but_source_remains_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publish(FIXTURE_REGISTRY, root, fixture_opener(), NOW)
            source = json.loads(
                (root / "feed/2026/08/18.json").read_text(encoding="utf-8")
            )[0]
            stale = {
                "sourceId": source["id"], "sourceContentHash": "stale-hash",
                "sourceUrl": source["sourceUrl"], "anchor": "climate governance",
                "codes": ["GS3.5"], "use": "Use line", "priority": 75,
                "editorialStatus": "source-backed",
            }
            (root / "notes").mkdir()
            (root / "notes" / f"{source['id']}.json").write_text(
                json.dumps(stale), encoding="utf-8"
            )

            build_indexes(root, NOW)
            source_index = json.loads((root / "source-index.json").read_text())
            exam = json.loads((root / "exam-index.json").read_text())
            visible = next(row for row in source_index["records"] if row["id"] == source["id"])
            self.assertEqual(exam["notes"], [])
            self.assertEqual(visible["codes"], [])
            self.assertEqual(visible["editorialState"], "source-only")


if __name__ == "__main__":
    unittest.main()
