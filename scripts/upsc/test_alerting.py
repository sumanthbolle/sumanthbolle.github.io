import ast
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.alerting import (
    HEALTH_LABEL,
    failing_sources,
    issue_payload,
    reconcile_alerts,
)


FIXTURES = Path(__file__).with_name("fixtures")
NOW = "2026-08-19T13:07:06Z"
PREVIOUS = "2026-08-18T13:07:06Z"


def health_report(unhealthy=("mea",), checked_at=NOW):
    sources = {
        "pib": {
            "sourceId": "pib", "status": "ok", "error": "",
            "checkedAt": checked_at, "latestPublishedAt": checked_at,
        },
        "mea": {
            "sourceId": "mea", "status": "ok", "error": "",
            "checkedAt": checked_at, "latestPublishedAt": PREVIOUS,
        },
        "rbi": {
            "sourceId": "rbi", "status": "ok", "error": "",
            "checkedAt": checked_at, "latestPublishedAt": checked_at,
        },
    }
    for source_id in unhealthy:
        sources[source_id] = {
            "sourceId": source_id,
            "status": "error",
            "error": "HTTP Error 403: Forbidden",
            "checkedAt": checked_at,
            "latestPublishedAt": "",
        }
    healthy_count = sum(1 for row in sources.values() if row["status"] == "ok")
    return {
        "checkedAt": checked_at,
        "healthy": healthy_count > 0,
        "healthyCount": healthy_count,
        "sourceCount": len(sources),
        "sources": sources,
    }


class SourceHealthAlertTests(unittest.TestCase):
    def test_alerting_parses_as_python_39(self):
        source = Path(__file__).with_name("alerting.py").read_text(encoding="utf-8")
        ast.parse(source, filename="alerting.py", feature_version=(3, 9))

    def test_unhealthy_source_forms_one_create_payload(self):
        previous = health_report(unhealthy=(), checked_at=PREVIOUS)
        current = health_report()
        failed = failing_sources(current)
        self.assertEqual([row["sourceId"] for row in failed], ["mea"])

        plan = reconcile_alerts(current, [], previous)
        self.assertEqual(len(plan["create"]), 1)
        self.assertEqual(plan["update"], [])
        self.assertEqual(plan["close"], [])
        payload = plan["create"][0]
        self.assertEqual(payload["title"], "Source health: mea failing since 2026-08-19")
        self.assertEqual(payload["labels"], [HEALTH_LABEL])
        self.assertIn("HTTP Error 403: Forbidden", payload["body"])
        self.assertIn(PREVIOUS, payload["body"])
        self.assertIn("Last successful timestamp", payload["body"])
        self.assertEqual(payload["lastSuccessfulAt"], PREVIOUS)

        formed = issue_payload(
            "mea", "HTTP Error 403: Forbidden", "2026-08-19",
            PREVIOUS, NOW, 2, 3,
        )
        self.assertEqual(formed["title"], payload["title"])
        self.assertEqual(formed["labels"], payload["labels"])

    def test_repeated_failure_does_not_open_a_duplicate_issue(self):
        current = health_report()
        open_issues = [{
            "number": 88,
            "title": "Source health: mea failing since 2026-08-12",
            "labels": [{"name": HEALTH_LABEL}],
        }]
        plan = reconcile_alerts(current, open_issues, health_report())
        self.assertEqual(plan["create"], [])
        self.assertEqual(len(plan["update"]), 1)
        self.assertEqual(plan["update"][0]["number"], 88)
        self.assertEqual(
            plan["update"][0]["title"],
            "Source health: mea failing since 2026-08-12",
        )
        self.assertEqual(plan["close"], [])

    def test_healthy_run_closes_the_matching_issue(self):
        current = health_report(unhealthy=())
        open_issues = [{
            "number": 88,
            "title": "Source health: mea failing since 2026-08-12",
            "labels": [HEALTH_LABEL],
        }]
        plan = reconcile_alerts(current, open_issues, health_report())
        self.assertEqual(plan["create"], [])
        self.assertEqual(plan["update"], [])
        self.assertEqual(len(plan["close"]), 1)
        self.assertEqual(plan["close"][0]["number"], 88)
        self.assertEqual(plan["close"][0]["sourceId"], "mea")
        self.assertIn("reported healthy", plan["close"][0]["comment"])

    def test_pull_requests_with_the_label_are_ignored(self):
        current = health_report()
        plan = reconcile_alerts(current, [{
            "number": 12,
            "title": "Source health: mea failing since 2026-08-12",
            "labels": [HEALTH_LABEL],
            "pull_request": {"url": "https://example.invalid"},
        }], None)
        self.assertEqual(len(plan["create"]), 1)
        self.assertEqual(plan["close"], [])

    def test_cli_reconcile_writes_create_plan_for_fixture_health(self):
        fixture = json.loads(
            (FIXTURES / "source-health-unhealthy.json").read_text(encoding="utf-8")
        )
        previous = health_report(unhealthy=(), checked_at=PREVIOUS)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            health_path = root / "source-health.json"
            previous_path = root / "previous.json"
            issues_path = root / "issues.json"
            health_path.write_text(json.dumps(fixture), encoding="utf-8")
            previous_path.write_text(json.dumps(previous), encoding="utf-8")
            issues_path.write_text("[]", encoding="utf-8")
            completed = subprocess.run([
                sys.executable, "scripts/upsc/alerting.py", "reconcile",
                "--health", str(health_path),
                "--previous", str(previous_path),
                "--open-issues", str(issues_path),
            ], cwd=Path(__file__).parents[2], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            plan = json.loads(completed.stdout)
            self.assertEqual(len(plan["create"]), 1)
            self.assertEqual(plan["create"][0]["sourceId"], "mea")
            self.assertEqual(plan["create"][0]["labels"], [HEALTH_LABEL])


if __name__ == "__main__":
    unittest.main()
