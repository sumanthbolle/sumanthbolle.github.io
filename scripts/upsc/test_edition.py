import json
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.edition import (
    build_edition,
    edition_id,
    render_note_page,
    resolve_slot,
    slot_window,
)


FIXTURES = Path(__file__).with_name("fixtures")
ROOT = Path(__file__).parents[2]
NOTE = json.loads((FIXTURES / "edition-note.json").read_text(encoding="utf-8"))
LLM_NOTE = {key: value for key, value in NOTE.items() if key not in ("sources", "kind")}
ENV = {"OPENAI_API_KEY": "sk-test"}
PIB_URL = "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2322443"
FEED_URL = "https://www.thehindu.com/news/national/feeder/default.rss"
SUMMARY = (
    "The Union Cabinet approved the expansion of the PM Dhan-Dhaanya Krishi Yojana for farmers "
    "to raise crop productivity, irrigation and credit in lagging agriculture districts. "
) * 5


def record(rid, title, url, published="2026-10-12T15:15:14Z", summary=SUMMARY):
    return {
        "id": rid, "title": title, "officialSummary": summary,
        "publisherId": "pib", "publisherName": "Press Information Bureau",
        "publishedAt": published, "sourceUrl": url, "canonicalUrl": url,
        "contentHash": "h", "sourceVerified": True,
    }


SCHEME = record("src_scheme", "Cabinet approves expansion of PM Dhan-Dhaanya Krishi Yojana", PIB_URL)
FACT = record(
    "src_fact", "INS TRISHUL ARRIVES AT PLYMOUTH, UK FOR EXERCISE KONKAN 2026",
    "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2321915", summary="INS Trishul arrives.",
)


class FakeResponse:
    def __init__(self, body, content_type, url):
        self._body, self._url = body, url
        self.headers = {"Content-Type": content_type}

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def opener(blocked=()):
    pages = {
        FEED_URL: ((FIXTURES / "hindu-rss.xml").read_bytes(), "application/rss+xml"),
        PIB_URL: ((FIXTURES / "pib-release.html").read_bytes(), "text/html; charset=utf-8"),
    }

    def open_url(request, timeout=20):
        url = request.full_url
        if url in blocked or url not in pages:
            raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
        body, content_type = pages[url]
        return FakeResponse(body, content_type, url)

    return open_url


class LLM:
    def __init__(self, reply=None):
        self.calls = 0
        self.reply = reply or LLM_NOTE

    def __call__(self, request, timeout=120):
        self.calls += 1
        content = json.dumps(self.reply)
        return FakeResponse(json.dumps({"choices": [{"message": {"content": content}}]}).encode(), "application/json", "")


class Workspace:
    def __init__(self, records):
        self.directory = tempfile.TemporaryDirectory()
        base = Path(self.directory.name)
        self.output = base / "data/upsc"
        self.site = base / "upsc-study"
        self.feeds = base / "feeds.json"
        feed = self.output / "feed/2026/10/12.json"
        feed.parent.mkdir(parents=True)
        feed.write_text(json.dumps(records), encoding="utf-8")
        self.feeds.write_text(json.dumps({"discovery": [{
            "id": "hindu-national", "publisher": "The Hindu", "section": "national", "url": FEED_URL,
        }]}), encoding="utf-8")

    def build(self, slot="am", now="2026-10-13T00:20:00Z", transport=None, env=ENV, blocked=(), dry_run=False, date="2026-10-13"):
        return build_edition(
            self.output, date, slot, now, opener(blocked), transport or LLM(),
            dry_run=dry_run, env=env, site_root=self.site, feeds_path=self.feeds,
        )

    def edition_path(self, slot="am"):
        return self.output / f"editions/2026/10/13-{slot}.json"

    def close(self):
        self.directory.cleanup()


class SlotTests(unittest.TestCase):
    def test_windows_cross_midnight_in_ist(self):
        self.assertEqual(slot_window("2026-10-13", "am"), ("2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z"))
        self.assertEqual(slot_window("2026-10-13", "pm"), ("2026-10-13T00:30:00Z", "2026-10-13T12:30:00Z"))
        self.assertEqual(slot_window("2026-11-01", "am"), ("2026-10-31T12:30:00Z", "2026-11-01T00:30:00Z"))
        with self.assertRaises(ValueError):
            slot_window("2026-10-13", "noon")

    def test_edition_id_and_auto_slot(self):
        self.assertEqual(edition_id("2026-10-13", "pm"), "2026-10-13-pm")
        self.assertEqual(resolve_slot("auto", "2026-10-13T00:15:00Z"), ("am", "2026-10-13"))
        self.assertEqual(resolve_slot("auto", "2026-10-13T12:15:00Z"), ("pm", "2026-10-13"))
        self.assertEqual(resolve_slot("auto", "2026-10-12T19:00:00Z"), ("am", "2026-10-13"))
        self.assertEqual(resolve_slot("pm", "2026-10-13T00:15:00Z"), ("pm", "2026-10-13"))


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.ws = Workspace([SCHEME, FACT])

    def tearDown(self):
        self.ws.close()

    def test_builds_edition_note_page_and_index(self):
        report = self.ws.build()
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual(edition["id"], "2026-10-13-am")
        self.assertEqual(edition["window"], {"from": "2026-10-12T12:30:00Z", "to": "2026-10-13T00:30:00Z"})
        self.assertEqual(edition["status"], "closed")
        self.assertEqual(len(edition["notes"]), 1)
        note_id, note = next(iter(edition["notes"].items()))
        self.assertEqual(note["id"], note_id)
        self.assertIn(note_id, edition["prelims"] + edition["mains"])
        self.assertNotIn(note_id, set(edition["prelims"]) & set(edition["mains"]))
        self.assertEqual(note["recordIds"], ["src_scheme"])
        self.assertEqual(note["sources"][0]["url"], PIB_URL)
        self.assertEqual(note["updates"], [])
        self.assertEqual(edition["glimpse"][0], {"noteId": note_id, "line": note["oneLine"], "code": "GS3.3"})
        self.assertEqual([fact["id"] for fact in edition["quickFacts"]], ["qf-src_fact"])
        self.assertEqual(edition["quickFacts"][0]["source"]["publisher"], "Press Information Bureau")
        page = self.ws.site / "notes" / note["slug"] / "index.html"
        self.assertTrue(page.is_file())
        self.assertTrue((self.ws.site / ".upsc-generated").is_file())
        index = json.loads((self.ws.output / "editions/index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["editions"][0]["id"], "2026-10-13-am")
        self.assertEqual(index["editions"][0]["counts"]["notes"], 1)
        self.assertEqual(report["candidates"]["must"], 1)

    def test_second_run_is_byte_identical_and_skips_llm(self):
        self.ws.build()
        first = self.ws.edition_path().read_bytes()
        llm = LLM()
        self.ws.build(now="2026-10-13T00:50:00Z", transport=llm)
        self.assertEqual(self.ws.edition_path().read_bytes(), first)
        self.assertEqual(llm.calls, 0)

    def test_missing_llm_key_holds_note_and_marks_partial(self):
        llm = LLM()
        self.ws.build(env={}, transport=llm)
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual(edition["status"], "partial")
        self.assertEqual(edition["notes"], {})
        self.assertEqual(edition["held"][0]["reasons"], ["llm-unavailable"])
        self.assertEqual(llm.calls, 0)
        self.ws.build(now="2026-10-13T00:50:00Z")
        retried = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual((retried["status"], len(retried["notes"]), retried["held"]), ("closed", 1, []))

    def test_blocked_evidence_is_held_and_run_continues(self):
        self.ws.build(blocked=(PIB_URL,))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual(edition["held"][0]["reasons"], ["evidence-unavailable", "http-403"])
        self.assertEqual(len(edition["quickFacts"]), 1)

    def test_gate_failure_is_held_with_reasons(self):
        self.ws.build(transport=LLM(dict(LLM_NOTE, codes=["GS9.9"])))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertIn("bad-code:GS9.9", edition["held"][0]["reasons"])
        self.assertEqual(edition["held"][0]["topic"], SCHEME["title"])

    def test_pm_duplicate_becomes_update_on_am_note(self):
        self.ws.build()
        pm_record = record(
            "src_scheme_pm", "Agriculture Ministry issues guidelines for PM Dhan-Dhaanya Krishi Yojana districts",
            "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=9", published="2026-10-13T06:00:00Z",
        )
        feed = self.ws.output / "feed/2026/10/13.json"
        feed.write_text(json.dumps([pm_record]), encoding="utf-8")
        llm = LLM()
        self.ws.build(slot="pm", now="2026-10-13T12:20:00Z", transport=llm)
        self.assertEqual(llm.calls, 0)
        pm = json.loads(self.ws.edition_path("pm").read_text(encoding="utf-8"))
        self.assertEqual(pm["notes"], {})
        am = json.loads(self.ws.edition_path("am").read_text(encoding="utf-8"))
        note = next(iter(am["notes"].values()))
        self.assertEqual(note["updates"], [{
            "at": "2026-10-13T12:20:00Z", "text": pm_record["title"],
            "source": {"title": pm_record["title"], "url": pm_record["sourceUrl"], "publisher": "Press Information Bureau"},
        }])
        self.assertIn("src_scheme_pm", note["recordIds"])
        page = (self.ws.site / "notes" / note["slug"] / "index.html").read_text(encoding="utf-8")
        self.assertIn("Agriculture Ministry issues guidelines", page)
        index = json.loads((self.ws.output / "editions/index.json").read_text(encoding="utf-8"))
        self.assertEqual([row["id"] for row in index["editions"]], ["2026-10-13-pm", "2026-10-13-am"])
        self.ws.build(slot="pm", now="2026-10-13T12:50:00Z")
        am_again = json.loads(self.ws.edition_path("am").read_text(encoding="utf-8"))
        self.assertEqual(len(next(iter(am_again["notes"].values()))["updates"]), 1)

    def test_dry_run_writes_nothing(self):
        report = self.ws.build(dry_run=True, env={})
        self.assertFalse((self.ws.output / "editions").exists())
        self.assertFalse(self.ws.site.exists())
        self.assertEqual(report["edition"]["held"][0]["reasons"], ["llm-unavailable"])
        self.assertTrue(report["dryRun"])
        self.assertEqual(report["written"], [])


class PageTests(unittest.TestCase):
    def test_page_escapes_untrusted_text_and_links(self):
        note = dict(NOTE, id="2026-10-13-am-abc", slug="2026-10-13-x-abc123",
                    title="</title><script>alert(1)</script>", publishedAt="2026-10-13T00:20:00Z",
                    updates=[], codes=["GS3.3"], papers=["GS3"], readTime="3 min")
        note["sources"] = NOTE["sources"] + [{"n": 2, "title": "bad", "publisher": "x", "url": "javascript:alert(1)", "date": "", "kind": "official"}]
        page = render_note_page(note, "2026-10-13-am")
        self.assertNotIn("<script>alert", page)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)
        self.assertNotIn('href="javascript:', page)
        self.assertIn('<link rel="canonical" href="https://sumanthbolle.com/upsc-study/notes/2026-10-13-x-abc123/">', page)
        self.assertIn('/assets/css/upsc-edition.css', page)
        self.assertIn('"@type":"Article"', page)
        self.assertIn('<details class="ue-practice">', page)
        self.assertIn('rel="noopener noreferrer"', page)
        self.assertIn("<h2>What did the Cabinet approve?</h2>", page)
        self.assertIn("<strong>Scale.</strong>", page)
        self.assertNotIn("<script src=", page)


class CliTests(unittest.TestCase):
    def test_cli_help_runs_as_script(self):
        completed = subprocess.run(
            [sys.executable, "scripts/upsc/edition.py", "--help"],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("--slot", completed.stdout)


if __name__ == "__main__":
    unittest.main()
