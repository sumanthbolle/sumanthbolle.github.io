import gzip
import json
import unittest
from pathlib import Path

from scripts.upsc.adapters import fetch_source_details, parse_payload
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
