import json
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.discovery import fetch_discovery, load_feeds, parse_rss


FIXTURES = Path(__file__).with_name("fixtures")
ROOT = Path(__file__).parents[2]
FEED = {
    "id": "hindu-national", "publisher": "The Hindu", "section": "national",
    "url": "https://www.thehindu.com/news/national/feeder/default.rss",
}


class FakeResponse:
    def __init__(self, body, content_type="application/rss+xml"):
        self._body = body
        self.headers = {"Content-Type": content_type}

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def geturl(self):
        return FEED["url"]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class DiscoveryTests(unittest.TestCase):
    def test_feeds_file_lists_hindu_and_express_sections(self):
        feeds = load_feeds(ROOT / "data/upsc/discovery-feeds.json")
        urls = {feed["url"] for feed in feeds}
        self.assertIn("https://www.thehindu.com/news/national/feeder/default.rss", urls)
        self.assertIn("https://www.thehindu.com/opinion/editorial/feeder/default.rss", urls)
        self.assertIn("https://indianexpress.com/section/explained/feed/", urls)
        self.assertIn("https://indianexpress.com/section/opinion/editorials/feed/", urls)
        self.assertIn("https://indianexpress.com/section/india/feed/", urls)
        self.assertIn("https://indianexpress.com/section/business/economy/feed/", urls)
        self.assertEqual(len(feeds), 8)
        for feed in feeds:
            self.assertTrue(feed["id"] and feed["publisher"] and feed["section"])

    def test_rss_items_parse_to_iso_utc_and_strip_html(self):
        rows = parse_rss((FIXTURES / "hindu-rss.xml").read_bytes(), FEED)
        self.assertEqual(rows[0], {
            "title": "Cabinet approves PM Dhan-Dhaanya Krishi Yojana expansion",
            "url": "https://www.thehindu.com/news/national/cabinet-dhan-dhaanya/article1.ece",
            "publishedAt": "2026-10-12T17:00:00Z",
            "feedId": "hindu-national", "publisher": "The Hindu", "section": "national",
        })
        self.assertEqual(rows[1]["publishedAt"], "2026-10-12T23:40:00Z")
        self.assertNotIn("Item without a date", [row["title"] for row in rows])
        self.assertTrue(all(set(row) == set(rows[0]) for row in rows))

    def test_items_outside_window_are_dropped(self):
        body = (FIXTURES / "hindu-rss.xml").read_bytes()
        errors = []
        rows = fetch_discovery(
            [FEED], lambda request, timeout=20: FakeResponse(body),
            "2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z", errors,
        )
        self.assertEqual([row["url"][-12:] for row in rows], ["article1.ece", "article2.ece"])
        self.assertEqual(errors, [])

    def test_feed_failure_is_isolated(self):
        body = (FIXTURES / "hindu-rss.xml").read_bytes()
        broken = dict(FEED, id="broken", url="https://example.com/broken.rss")

        def opener(request, timeout=20):
            if request.full_url == broken["url"]:
                raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)
            return FakeResponse(body)

        errors = []
        rows = fetch_discovery(
            [broken, FEED], opener, "2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z", errors,
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(errors, [{"feedId": "broken", "error": "HTTP 403"}])
        only_broken = fetch_discovery(
            [broken], opener, "2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z",
        )
        self.assertEqual(only_broken, [])

    def test_malformed_feed_is_an_error_not_a_crash(self):
        errors = []
        rows = fetch_discovery(
            [FEED], lambda request, timeout=20: FakeResponse(b"<html>not rss"),
            "2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z", errors,
        )
        self.assertEqual(rows, [])
        self.assertEqual(errors[0]["feedId"], "hindu-national")

    def test_duplicate_links_across_feeds_kept_once(self):
        body = (FIXTURES / "hindu-rss.xml").read_bytes()
        twin = dict(FEED, id="hindu-twin")
        rows = fetch_discovery(
            [FEED, twin], lambda request, timeout=20: FakeResponse(body),
            "2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z",
        )
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
