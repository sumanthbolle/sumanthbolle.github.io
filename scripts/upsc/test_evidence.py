import socket
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.evidence import MAX_EVIDENCE_CHARS, extract_text, fetch_evidence, is_official_url, official_links


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


class OfficialLinkTests(unittest.TestCase):
    def test_official_hosts(self):
        registry = {"news.un.org", "consilium.europa.eu"}
        for url in ("https://pib.gov.in/PressReleaseIframePage.aspx?PRID=1", "https://www.mospi.gov.in/press/cpi",
                    "https://main.sci.gov.in/judgment/1", "https://www.rbi.org.in/x.aspx?id=1",
                    "https://prsindia.org/bills/x", "https://egazette.nic.in/WriteReadData/x.pdf",
                    "https://news.un.org/en/story/1"):
            self.assertTrue(is_official_url(url, registry), url)
        for url in ("https://www.thehindu.com/x", "https://notgov.in.example.com/x", "https://pib.gov.in/",
                    "https://www.mospi.gov.in", "javascript:alert(1)", "https://evilgov.in/x"):
            self.assertFalse(is_official_url(url, registry), url)

    def test_article_links_skip_chrome_and_keep_body_official_links(self):
        url = "https://www.thehindu.com/news/national/x/article1.ece"
        result = fetch_evidence({"sourceUrl": url}, lambda request, timeout=20: FakeResponse(
            (FIXTURES / "hindu-article.html").read_bytes(), url=url), fallback=None)
        self.assertTrue(result["ok"])
        self.assertEqual(result["title"], "Dhan-Dhaanya scheme expands to 100 more districts - The Hindu")
        self.assertIn("https://www.thehindu.com/news/national/related-story/article9.ece", result["links"])
        self.assertNotIn("https://pib.gov.in/allRel.aspx", result["links"])
        self.assertEqual(official_links(result["links"], set()), [
            "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2322443",
            "https://main.sci.gov.in/judgment/2026/123",
        ])


class SafetyTests(unittest.TestCase):
    def test_official_link_redirected_off_the_allowlist_is_rejected(self):
        link = {"sourceUrl": "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=1"}
        redirected = lambda request, timeout=20: FakeResponse(page(), url="https://tracker.example.com/landing")
        result = fetch_evidence(link, redirected, fallback=None, allowed_hosts=set())
        self.assertEqual((result["ok"], result["reason"]), (False, "redirect-off-allowlist"))
        same_host = lambda request, timeout=20: FakeResponse(page(), url="https://www.pib.gov.in/PressReleasePage.aspx?PRID=1")
        ok = fetch_evidence(link, same_host, fallback=None, allowed_hosts=set())
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["url"], "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1")

    def test_private_and_link_local_addresses_are_never_fetched(self):
        calls = []

        def opener(request, timeout=20):
            calls.append(request.full_url)
            return FakeResponse(page())

        for url in ("http://169.254.169.254/latest/meta-data/", "http://127.0.0.1/x", "http://[::1]/x", "http://10.0.0.5/x"):
            result = fetch_evidence({"sourceUrl": url}, opener, fallback=None)
            self.assertEqual((result["ok"], result["reason"]), (False, "blocked-address"), url)
        internal = fetch_evidence({"sourceUrl": "https://intranet.gov.in/x"}, opener, fallback=None,
                                  resolver=lambda host: ["192.168.1.10"])
        self.assertEqual(internal["reason"], "blocked-address")
        public = fetch_evidence({"sourceUrl": "https://pib.gov.in/x"}, opener, fallback=None,
                                resolver=lambda host: ["164.100.117.97"])
        self.assertTrue(public["ok"])
        self.assertEqual(calls, ["https://pib.gov.in/x"])

    def test_redirect_into_a_private_address_is_rejected(self):
        redirected = lambda request, timeout=20: FakeResponse(page(), url="http://127.0.0.1/admin")
        result = fetch_evidence(RECORD, redirected, fallback=None)
        self.assertEqual(result["reason"], "blocked-address")


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
