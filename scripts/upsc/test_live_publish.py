import io
import urllib.error
import unittest

from scripts.upsc.live_publish import check_worker_auth, exit_status


def probe(status):
    calls = []

    def opener(request, timeout=20):
        calls.append(request)
        raise urllib.error.HTTPError(request.full_url, status, "probe", {}, io.BytesIO(b"{}"))
    return opener, calls


class WorkerAuthTests(unittest.TestCase):
    def test_missing_configuration_names_the_secret_and_the_fix(self):
        with self.assertRaisesRegex(ValueError, "UPSC_PUBLISH_TOKEN.*Deploy Summaverick Worker"):
            check_worker_auth("https://worker.example/upsc/enrich", "", probe(422)[0])

    def test_matching_token_is_accepted_without_a_model_call(self):
        opener, calls = probe(422)
        check_worker_auth("https://worker.example/upsc/enrich", "token", opener)
        self.assertEqual(calls[0].full_url, "https://worker.example/upsc/enrich")
        self.assertEqual(calls[0].headers["Authorization"], "Bearer token")
        self.assertEqual(calls[0].data, b"{}")

    def test_rejected_token_explains_secret_drift(self):
        for status in (401, 403):
            with self.assertRaisesRegex(ValueError, "rejected UPSC_PUBLISH_TOKEN.*Deploy Summaverick Worker"):
                check_worker_auth("https://worker.example/upsc/enrich", "stale", probe(status)[0])


class ExitStatusTests(unittest.TestCase):
    def test_per_note_provider_failures_are_warnings(self):
        code, warnings = exit_status({"failures": {"src_1": "Provider timed out"}})
        self.assertEqual(code, 0)
        self.assertEqual(warnings, ["src_1: Provider timed out"])

    def test_live_feed_failure_fails_the_run(self):
        code, _ = exit_status({"failures": {"live-feed": "Live publication failed"}})
        self.assertEqual(code, 2)

    def test_clean_run_succeeds(self):
        self.assertEqual(exit_status({"failures": {}}), (0, []))


if __name__ == "__main__":
    unittest.main()
