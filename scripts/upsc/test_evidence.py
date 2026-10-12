import socket
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.evidence import MAX_EVIDENCE_CHARS, extract_text, fetch_evidence


FIXTURES = Path(__file__).with_name("fixtures")
RECORD = {
    "id": "src_pib", "title": "Cabinet approves expansion",
    "sourceUrl": "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=1",
    "publisherId": "pib",
}


class FakeResponse:
    def __init__(self, body, content_type="text/html; charset=utf-8", url=RECORD["sourceUrl"]):
        self._body = body
        self._url = url
        self.headers = {"Content-Type": content_type}

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def page():
    return (FIXTURES / "pib-release.html").read_bytes()


class ExtractTextTests(unittest.TestCase):
    def test_keeps_body_paragraphs_and_drops_chrome(self):
        text = extract_text(page().decode("utf-8"))
        self.assertIn("outlay of ₹11,440 crore for 2025-26 to 2030-31.", text)
        self.assertIn("117 key performance indicators", text)
        self.assertIn("about 1.7 crore farmers", text)
        for junk in ("MENU SCRIPT TEXT", "MENU LINK", "BREADCRUMB TEXT", "SHARE TEXT",
                     "FOOTER TEXT", "NOSCRIPT TEXT", "Press Information Bureau Government",
                     ".menu{"):
            self.assertNotIn(junk, text)
        self.assertNotIn("  ", text)

    def test_unclosed_tags_do_not_swallow_text(self):
        text = extract_text("<div><p>First para<p>Second para<li>item</div><nav>x</nav><p>tail")
        self.assertEqual(text, "First para Second para item tail")

    def test_text_is_capped(self):
        text = extract_text("<p>" + ("word " * 10000) + "</p>")
        self.assertLessEqual(len(text), MAX_EVIDENCE_CHARS)
        self.assertEqual(MAX_EVIDENCE_CHARS, 16000)


class FetchEvidenceTests(unittest.TestCase):
    def test_html_page_returns_text(self):
        result = fetch_evidence(RECORD, lambda request, timeout=20: FakeResponse(page()))
        self.assertTrue(result["ok"])
        self.assertEqual(result["reason"], "")
        self.assertEqual(result["url"], RECORD["sourceUrl"])
        self.assertIn("36 existing schemes", result["text"])

    def test_403_falls_back_to_curl_opener(self):
        calls = []

        def blocked(request, timeout=20):
            calls.append("urllib")
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)

        def curl(request, timeout=20):
            calls.append("curl")
            return FakeResponse(page())

        result = fetch_evidence(RECORD, blocked, fallback=curl)
        self.assertEqual(calls, ["urllib", "curl"])
        self.assertTrue(result["ok"])

    def test_403_on_both_paths_reports_reason(self):
        def blocked(request, timeout=20):
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)

        result = fetch_evidence(RECORD, blocked, fallback=blocked)
        self.assertEqual((result["ok"], result["reason"], result["text"]), (False, "http-403", ""))

    def test_timeout_reports_reason(self):
        def slow(request, timeout=20):
            raise socket.timeout("timed out")

        self.assertEqual(fetch_evidence(RECORD, slow)["reason"], "timeout")

        def slow_url(request, timeout=20):
            raise urllib.error.URLError(socket.timeout("timed out"))

        self.assertEqual(fetch_evidence(RECORD, slow_url)["reason"], "timeout")

    def test_pdf_is_rejected(self):
        result = fetch_evidence(
            RECORD, lambda request, timeout=20: FakeResponse(b"%PDF-1.4", "application/pdf"),
        )
        self.assertEqual((result["ok"], result["reason"]), (False, "unsupported-content"))

    def test_thin_page_is_rejected(self):
        result = fetch_evidence(
            RECORD, lambda request, timeout=20: FakeResponse(b"<html><p>Too short.</p></html>"),
        )
        self.assertEqual((result["ok"], result["reason"]), (False, "thin-evidence"))

    def test_record_without_http_url_is_rejected(self):
        result = fetch_evidence({"sourceUrl": "javascript:alert(1)"}, lambda *a, **k: None)
        self.assertEqual((result["ok"], result["reason"]), (False, "bad-url"))


if __name__ == "__main__":
    unittest.main()
