import gzip
import json
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request

from scripts.upsc import adapters as adapters_mod
from scripts.upsc.adapters import (
    FEED_ACCEPT, LISTING_ACCEPT, curl_open, fetch_source_details, listing_referer,
    parse_payload, request_headers,
)
from scripts.upsc.models import SourceConfig


FIXTURES = Path(__file__).with_name("fixtures")


def fixture_bytes(name):
    return (FIXTURES / name).read_bytes()


def source_config(adapter):
    settings = {
        "rss": ("pib", "pib.gov.in", "https://pib.gov.in/feed.xml", "", "IN"),
        "atom": ("un-news", "news.un.org", "https://news.un.org/feed.xml", "", "INT"),
        "json-feed": ("who", "who.int", "https://www.who.int/feed.json", "", "INT"),
        "listing": ("rbi", "rbi.org.in", "https://www.rbi.org.in/releases", "official-item", "IN"),
    }
    source_id, host, endpoint, link_class, country = settings[adapter]
    return SourceConfig(
        id=source_id, name=source_id, country=country,
        tier="indian-primary" if country == "IN" else "international-institution",
        hosts=(host,), adapter=adapter, endpoint=endpoint,
        enabled=True, link_class=link_class,
    )


class AdapterTests(unittest.TestCase):
    def test_rss_atom_and_json_feed_produce_common_rows(self):
        cases = (
            ("rss", "pib-rss.xml", "application/rss+xml", "Cabinet approves fiscal policy"),
            ("atom", "un-atom.xml", "application/atom+xml", "UN publishes climate update"),
            ("json-feed", "who-json-feed.json", "application/feed+json", "WHO issues health guidance"),
        )
        for adapter, fixture, content_type, expected_title in cases:
            with self.subTest(adapter=adapter):
                rows = parse_payload(
                    source_config(adapter), fixture_bytes(fixture), content_type
                )
                self.assertEqual(rows[0]["title"], expected_title)
                self.assertTrue(rows[0]["url"].startswith("https://"))
                self.assertTrue(rows[0]["publishedAt"].endswith("Z"))

    def test_listing_uses_reviewed_class_and_rejects_off_host_links(self):
        rows = parse_payload(
            source_config("listing"), fixture_bytes("official-listing.html"),
            "text/html; charset=utf-8",
        )
        self.assertEqual([row["title"] for row in rows], ["RBI releases policy statement"])
        self.assertEqual(rows[0]["url"], "https://www.rbi.org.in/release/1")

    def test_listing_supports_official_container_class_relative_links_and_visible_dates(self):
        config = SourceConfig(
            id="mea", name="Ministry of External Affairs", country="IN",
            tier="indian-primary", hosts=("mea.gov.in",), adapter="listing",
            endpoint=(
                "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData"
                "?publicationId=51&page=1&PageSize=20&SortBy=Latest&PLngId=1"
            ),
            enabled=True, link_class="pressTitle",
        )
        rows = parse_payload(
            config, fixture_bytes("mea-listing.html"), "text/html; charset=utf-8"
        )
        self.assertEqual(rows[0]["title"], "India and partner conclude consultations")
        self.assertEqual(
            rows[0]["url"],
            "https://www.mea.gov.in/press-releases?dtl/41684/consultations",
        )
        self.assertEqual(rows[0]["publishedAt"], "2026-08-17T00:00:00Z")

    def test_malformed_payload_fails_that_adapter(self):
        with self.assertRaisesRegex(ValueError, "malformed"):
            parse_payload(
                source_config("rss"), fixture_bytes("malformed.xml"),
                "application/rss+xml",
            )

    def test_rss_prefers_link_over_non_url_guid(self):
        body = b'''<?xml version="1.0"?><rss version="2.0"><channel><item>
          <guid>150192</guid><link>https://pib.gov.in/release/150192</link>
          <title>Official update</title><pubDate>2026-08-18T04:00:00Z</pubDate>
        </item></channel></rss>'''
        rows = parse_payload(source_config("rss"), body, "text/xml")
        self.assertEqual(rows[0]["url"], "https://pib.gov.in/release/150192")

    def test_fetch_decompresses_gzip_feed_sent_without_negotiation(self):
        compressed = gzip.compress(fixture_bytes("pib-rss.xml"))

        class GzipResponse:
            headers = {
                "Content-Type": "application/rss+xml; charset=utf-8",
                "Content-Encoding": "gzip",
            }

            def read(self, limit=-1):
                return compressed if limit < 0 else compressed[:limit]

            def geturl(self):
                return "https://pib.gov.in/feed.xml"

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

        rows, details = fetch_source_details(
            source_config("rss"), lambda request, timeout=20: GzipResponse()
        )

        self.assertEqual(rows[0]["title"], "Cabinet approves fiscal policy")
        self.assertEqual(details["contentType"], "application/rss+xml; charset=utf-8")

    def test_listing_fetch_asks_for_html_with_a_same_origin_referer(self):
        mea = SourceConfig(
            id="mea", name="Ministry of External Affairs", country="IN",
            tier="indian-primary", hosts=("mea.gov.in",), adapter="listing",
            endpoint=(
                "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData"
                "?publicationId=51&page=1&PageSize=20&SortBy=Latest&PLngId=1"
            ),
            enabled=True, link_class="pressTitle",
        )
        headers = request_headers(mea)
        self.assertEqual(headers["Accept"], LISTING_ACCEPT)
        self.assertEqual(headers["Referer"], "https://www.mea.gov.in/press-releases")
        self.assertEqual(listing_referer(mea), "https://www.mea.gov.in/press-releases")
        self.assertEqual(headers["X-Requested-With"], "XMLHttpRequest")
        self.assertIn("gzip", headers["Accept-Encoding"])
        self.assertIn("en-IN", headers["Accept-Language"])
        seen = {}

        class HtmlResponse:
            headers = {"Content-Type": "text/html; charset=utf-8"}

            def read(self, limit=-1):
                body = fixture_bytes("mea-listing.html")
                return body if limit < 0 else body[:limit]

            def geturl(self):
                return mea.endpoint

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

        def opener(request, timeout=20):
            seen["accept"] = request.get_header("Accept")
            seen["referer"] = request.get_header("Referer")
            seen["requested_with"] = request.get_header("X-requested-with")
            return HtmlResponse()

        rows, _ = fetch_source_details(mea, opener)
        self.assertEqual(rows[0]["title"], "India and partner conclude consultations")
        self.assertEqual(seen["accept"], LISTING_ACCEPT)
        self.assertEqual(seen["referer"], "https://www.mea.gov.in/press-releases")
        self.assertEqual(seen["requested_with"], "XMLHttpRequest")

    def test_feed_fetch_still_prefers_xml_accept(self):
        headers = request_headers(source_config("rss"))
        self.assertEqual(headers["Accept"], FEED_ACCEPT)
        self.assertEqual(headers["Referer"], "https://pib.gov.in/")
        self.assertNotIn("X-Requested-With", headers)
        self.assertIn("gzip", headers["Accept-Encoding"])

    def test_live_urlopen_forbidden_retries_with_curl(self):
        mea = SourceConfig(
            id="mea", name="Ministry of External Affairs", country="IN",
            tier="indian-primary", hosts=("mea.gov.in",), adapter="listing",
            endpoint=(
                "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData"
                "?publicationId=51&page=1&PageSize=20&SortBy=Latest&PLngId=1"
            ),
            enabled=True, link_class="pressTitle",
        )
        seen = {"urlopen": 0, "curl": 0}

        def forbidden(request, timeout=20):
            seen["urlopen"] += 1
            raise urllib.error.HTTPError(
                request.full_url, 403, "Forbidden", {}, None
            )

        class HtmlResponse:
            headers = {"Content-Type": "text/html; charset=utf-8"}

            def read(self, limit=-1):
                body = fixture_bytes("mea-listing.html")
                return body if limit < 0 else body[:limit]

            def geturl(self):
                return mea.endpoint

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

        def fake_curl(request, timeout=20):
            seen["curl"] += 1
            seen["curl_url"] = request.full_url
            return HtmlResponse()

        with patch.object(adapters_mod, "urlopen", forbidden), patch.object(
            adapters_mod, "curl_open", fake_curl
        ):
            rows, _ = fetch_source_details(mea, adapters_mod.urlopen)
        self.assertEqual(seen["urlopen"], 1)
        self.assertEqual(seen["curl"], 1)
        self.assertEqual(seen["curl_url"], mea.endpoint)
        self.assertEqual(rows[0]["title"], "India and partner conclude consultations")

    def test_injected_opener_forbidden_does_not_call_curl(self):
        mea = SourceConfig(
            id="mea", name="Ministry of External Affairs", country="IN",
            tier="indian-primary", hosts=("mea.gov.in",), adapter="listing",
            endpoint=(
                "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData"
                "?publicationId=51&page=1&PageSize=20&SortBy=Latest&PLngId=1"
            ),
            enabled=True, link_class="pressTitle",
        )

        def forbidden(request, timeout=20):
            raise urllib.error.HTTPError(
                request.full_url, 403, "Forbidden", {}, None
            )

        def fail_if_called(request, timeout=20):
            raise AssertionError("curl fallback must not run for injected openers")

        with patch.object(adapters_mod, "curl_open", fail_if_called):
            with self.assertRaises(urllib.error.HTTPError):
                fetch_source_details(mea, forbidden)

    def test_curl_open_reads_body_and_raises_http_errors(self):
        class Result:
            def __init__(self, stdout, returncode=0, stderr=""):
                self.stdout = stdout
                self.stderr = stderr
                self.returncode = returncode

        def run_ok(command, capture_output=True, text=True, check=False):
            body_path = command[command.index("-o") + 1]
            with open(body_path, "wb") as handle:
                handle.write(fixture_bytes("mea-listing.html"))
            return Result(
                "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData\n200\n"
                "text/html; charset=utf-8"
            )

        request = Request(
            "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData"
            "?publicationId=51&page=1&PageSize=20&SortBy=Latest&PLngId=1",
            headers={
                "User-Agent": "test",
                "Referer": "https://www.mea.gov.in/press-releases",
            },
        )
        with patch("scripts.upsc.adapters.subprocess.run", run_ok):
            response = curl_open(request, timeout=5)
            body = response.read()
        self.assertIn(b"pressTitle", body)
        self.assertEqual(
            response.geturl(),
            "https://www.mea.gov.in/FrontEnd/FetchPublicationListingData",
        )

        def run_forbidden(command, capture_output=True, text=True, check=False):
            body_path = command[command.index("-o") + 1]
            open(body_path, "wb").close()
            return Result("https://www.mea.gov.in/blocked\n403\ntext/html")

        with patch("scripts.upsc.adapters.subprocess.run", run_forbidden):
            with self.assertRaises(urllib.error.HTTPError) as raised:
                curl_open(request, timeout=5)
        self.assertEqual(raised.exception.code, 403)

    def test_module_docstring_points_at_source_criteria_covering_registry_tiers(self):
        root = Path(__file__).parents[2]
        adapters = (root / "scripts/upsc/adapters.py").read_text(encoding="utf-8")
        self.assertIn("docs/upsc-source-criteria.md", adapters)
        doc = (root / "docs/upsc-source-criteria.md").read_text(encoding="utf-8")
        registry = json.loads((root / "data/upsc/source-registry.json").read_text(encoding="utf-8"))
        tiers = {row["tier"] for row in registry}
        self.assertTrue(tiers)
        for tier in tiers:
            self.assertIn(tier, doc)


if __name__ == "__main__":
    unittest.main()
