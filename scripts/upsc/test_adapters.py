import unittest
from pathlib import Path

from scripts.upsc.adapters import parse_payload
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

    def test_malformed_payload_fails_that_adapter(self):
        with self.assertRaisesRegex(ValueError, "malformed"):
            parse_payload(
                source_config("rss"), fixture_bytes("malformed.xml"),
                "application/rss+xml",
            )


if __name__ == "__main__":
    unittest.main()
