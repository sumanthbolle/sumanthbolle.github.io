import json
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.candidates import fingerprint
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
    "src_fact", "Indian Navy commissions indigenous anti-submarine warfare craft INS Mangrol",
    "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2321915", summary="The Navy commissioned a warship.",
)
SECOND = record(
    "src_second", "Coal stocks at thermal power plants stay above 18 MT as railway rake loading rises",
    "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2322065",
    summary="Coal supply to power plants and electricity generation; energy transition and infrastructure. " * 8,
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


ARTICLE_URL = "https://www.thehindu.com/news/national/cabinet-dhan-dhaanya/article1.ece"


EXPLAINED_FEED = "https://indianexpress.com/section/explained/feed/"
EXPLAINED_RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>Explained: what the PM Dhan-Dhaanya Krishi Yojana expansion means for farmers, crop productivity and irrigation</title>
<link>https://www.thehindu.com/news/national/cabinet-dhan-dhaanya/article1.ece</link>
<pubDate>Mon, 12 Oct 2026 23:00:00 +0530</pubDate></item></channel></rss>"""


SIR_FEED = "https://www.thehindu.com/news/national/sir/feeder/default.rss"
SIR_ITEMS = [
    ("Kerala Assembly passes resolution seeking removal of CEC Gyanesh Kumar", "https://www.thehindu.com/sir/1.ece", "22:00"),
    ("13.60 lakh names dropped from final electoral rolls after SIR in Punjab", "https://www.thehindu.com/sir/2.ece", "22:10"),
    ("INDIA bloc marches through Delhi, takes SIR protest to SC", "https://www.thehindu.com/sir/3.ece", "22:20"),
    ("Stock markets tumble on oil price spike; Sensex drops 548 points", "https://www.thehindu.com/sir/4.ece", "22:30"),
]
SIR_RSS = ("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>" + "".join(
    f"<item><title>{title}</title><link>{url}</link><pubDate>Mon, 12 Oct 2026 {time}:00 +0530</pubDate></item>"
    for title, url, time in SIR_ITEMS
) + "</channel></rss>").encode("utf-8")
SIR_IDS = [fingerprint(title) for title, _, _ in SIR_ITEMS]


def sir_editor(payload=None):
    return {"stories": [
        {"storyId": "sir-cec", "title": "SIR electoral rolls and the move to remove the CEC", "memberIds": SIR_IDS[:3],
         "upscRelevance": "must", "why": "Election Commission independence and the CEC removal process.",
         "codes": ["GS2.4", "GS2.3"], "prelimsAngle": "Article 324 removal procedure.", "mainsAngle": "ECI autonomy."},
        {"storyId": "markets", "title": "Markets fall", "memberIds": [SIR_IDS[3]], "upscRelevance": "skip",
         "why": "Daily market move.", "codes": ["GS3.1"], "prelimsAngle": "", "mainsAngle": ""},
    ]}


def opener(blocked=()):
    pages = {
        SIR_FEED: (SIR_RSS, "application/rss+xml"),
        **{url: ((FIXTURES / "hindu-article.html").read_bytes(), "text/html; charset=utf-8") for _, url, _ in SIR_ITEMS},
        EXPLAINED_FEED: (EXPLAINED_RSS, "application/rss+xml"),
        ARTICLE_URL: ((FIXTURES / "hindu-article.html").read_bytes(), "text/html; charset=utf-8"),
        FEED_URL: ((FIXTURES / "hindu-rss.xml").read_bytes(), "application/rss+xml"),
        PIB_URL: ((FIXTURES / "pib-release.html").read_bytes(), "text/html; charset=utf-8"),
        SECOND["sourceUrl"]: ((FIXTURES / "pib-release.html").read_bytes(), "text/html; charset=utf-8"),
    }

    def open_url(request, timeout=20):
        url = request.full_url
        if url in blocked or url not in pages:
            raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
        body, content_type = pages[url]
        return FakeResponse(body, content_type, url)

    return open_url


class LLM:
    """Answers the editor call with `editor` (default: no usable stories, which
    selects deterministic fallback) and every writer call with `reply`.
    `calls` counts writer calls only."""

    def __init__(self, reply=None, editor=None):
        self.calls = 0
        self.editor_calls = []
        self.reply = reply or LLM_NOTE
        self.editor = editor

    def __call__(self, request, timeout=120):
        body = json.loads(request.data.decode("utf-8"))
        if "current-affairs editor" in body["messages"][0]["content"]:
            self.editor_calls.append(json.loads(body["messages"][1]["content"]))
            content = json.dumps(self.editor(self.editor_calls[-1]) if callable(self.editor) else (self.editor or {}))
            return FakeResponse(json.dumps({"choices": [{"message": {"content": content}}]}).encode(), "application/json", "")
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

    def build(self, slot="am", now="2026-10-13T00:20:00Z", transport=None, env=ENV, blocked=(), dry_run=False,
              date="2026-10-13", max_notes=8):
        return build_edition(
            self.output, date, slot, now, opener(blocked), transport or LLM(),
            dry_run=dry_run, env=env, site_root=self.site, feeds_path=self.feeds, max_notes=max_notes,
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
        # The bound Hindu article is evidence too; its PIB link is the record itself.
        self.assertEqual([(row["kind"], row["url"]) for row in note["sources"]],
                         [("official", PIB_URL), ("discovery", ARTICLE_URL)])
        self.assertEqual(note["updates"], [])
        self.assertEqual(edition["glimpse"][0], {"noteId": note_id, "line": note["oneLine"], "code": "GS3.3"})
        facts = {fact["id"]: fact for fact in edition["quickFacts"]}
        self.assertIn("qf-src_fact", facts)
        self.assertEqual(facts["qf-src_fact"]["source"]["publisher"], "Press Information Bureau")
        self.assertEqual(facts["qf-src_fact"]["source"]["kind"], "official")
        page = self.ws.site / "notes" / note["slug"] / "index.html"
        self.assertTrue(page.is_file())
        self.assertTrue((self.ws.site / ".upsc-generated").is_file())
        index = json.loads((self.ws.output / "editions/index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["editions"][0]["id"], "2026-10-13-am")
        self.assertEqual(index["editions"][0]["counts"]["notes"], 1)
        # The fixture's RBI headline has no official record; its newspaper page
        # is not served here, so it is held and still listed as a quick fact.
        self.assertEqual(report["candidates"]["must"], 2)
        self.assertEqual([row["topic"] for row in edition["held"]], ["RBI keeps repo rate unchanged at 5.5%"])

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
        held = {row["topic"]: row["reasons"] for row in edition["held"]}
        self.assertEqual(held[SCHEME["title"]], ["llm-unavailable"])
        self.assertEqual(llm.calls, 0)
        self.ws.build(now="2026-10-13T00:50:00Z")
        retried = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual((retried["status"], len(retried["notes"])), ("closed", 1))
        self.assertFalse(any("llm-unavailable" in row["reasons"] for row in retried["held"]))

    def test_blocked_evidence_is_held_and_run_continues(self):
        self.ws.build(blocked=(PIB_URL,))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        held = {row["topic"]: row["reasons"] for row in edition["held"]}
        self.assertEqual(held[SCHEME["title"]], ["evidence-unavailable", "http-403"])
        self.assertIn("qf-src_scheme", [fact["id"] for fact in edition["quickFacts"]])

    def test_gate_failure_is_held_with_reasons(self):
        self.ws.build(transport=LLM(dict(LLM_NOTE, codes=["GS9.9"])))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        held = {row["topic"]: row["reasons"] for row in edition["held"]}
        self.assertIn("bad-code:GS9.9", held[SCHEME["title"]])

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

    def test_archived_discovery_items_count_after_they_leave_the_feed(self):
        self.ws.build()
        self.assertTrue((self.ws.output / "discovery/2026/10/12.json").is_file())
        archived = json.loads((self.ws.output / "discovery/2026/10/12.json").read_text(encoding="utf-8"))
        self.assertIn("RBI keeps repo rate unchanged at 5.5%", [row["title"] for row in archived])
        report = self.ws.build(now="2026-10-13T00:50:00Z", blocked=(FEED_URL,))
        self.assertEqual(report["discovery"]["items"], 2)
        self.assertEqual(report["discovery"]["fromArchive"], 2)

    def test_am_topic_already_in_previous_pm_becomes_an_update(self):
        morning = record("src_pm12", "Union Cabinet clears PM Dhan-Dhaanya Krishi Yojana expansion districts",
                         PIB_URL, published="2026-10-12T06:00:00Z")
        (self.ws.output / "feed/2026/10/12.json").write_text(json.dumps([morning]), encoding="utf-8")
        self.ws.build(slot="pm", date="2026-10-12", now="2026-10-12T12:20:00Z")
        pm = json.loads((self.ws.output / "editions/2026/10/12-pm.json").read_text(encoding="utf-8"))
        self.assertEqual(len(pm["notes"]), 1)
        (self.ws.output / "feed/2026/10/12.json").write_text(json.dumps([morning, SCHEME, FACT]), encoding="utf-8")
        llm = LLM()
        self.ws.build(now="2026-10-13T00:20:00Z", transport=llm)
        am = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertFalse(any("Dhan-Dhaanya" in note["topicTitle"] for note in am["notes"].values()))
        pm = json.loads((self.ws.output / "editions/2026/10/12-pm.json").read_text(encoding="utf-8"))
        updates = next(iter(pm["notes"].values()))["updates"]
        self.assertEqual([row["text"] for row in updates], [SCHEME["title"]])

    def test_dry_run_writes_nothing(self):
        report = self.ws.build(dry_run=True, env={})
        self.assertFalse((self.ws.output / "editions").exists())
        self.assertFalse((self.ws.output / "discovery").exists())
        self.assertFalse(self.ws.site.exists())
        self.assertIn(["llm-unavailable"], [row["reasons"] for row in report["edition"]["held"]])
        self.assertTrue(report["dryRun"])
        self.assertEqual(report["written"], [])


class SelectionBuildTests(unittest.TestCase):
    def setUp(self):
        self.ws = Workspace([SCHEME, SECOND, FACT])

    def tearDown(self):
        self.ws.close()

    def test_top_n_become_notes_and_the_rest_quick_facts(self):
        report = self.ws.build(max_notes=1)
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual(len(edition["notes"]), 1)
        fact_ids = [fact["id"] for fact in edition["quickFacts"]]
        self.assertEqual(len(fact_ids), len(set(fact_ids)))
        self.assertIn("qf-src_fact", fact_ids)
        noted = next(iter(edition["notes"].values()))["recordIds"]
        self.assertFalse(any(f"qf-{rid}" in fact_ids for rid in noted))
        self.assertEqual(report["candidates"]["must"], 1)

    def test_blocked_evidence_backfills_with_the_next_candidate(self):
        self.ws.build(max_notes=1, blocked=(PIB_URL,))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        self.assertEqual(len(edition["notes"]), 1)
        self.assertEqual(next(iter(edition["notes"].values()))["recordIds"], ["src_second"])
        self.assertIn(["evidence-unavailable", "http-403"], [row["reasons"] for row in edition["held"]])
        self.assertIn("qf-src_scheme", [fact["id"] for fact in edition["quickFacts"]])


class SecondaryTests(unittest.TestCase):
    """No official record binds the Dhan-Dhaanya headline in these runs."""

    def setUp(self):
        self.ws = Workspace([])
        self.ws.feeds.write_text(json.dumps({"discovery": [{
            "id": "express-explained", "publisher": "The Indian Express", "section": "explained", "url": EXPLAINED_FEED,
        }]}), encoding="utf-8")

    def tearDown(self):
        self.ws.close()

    def note_for(self, edition):
        return next(note for note in edition["notes"].values() if "Dhan-Dhaanya" in note["topicTitle"])

    def test_official_link_inside_the_article_becomes_primary_evidence(self):
        self.ws.build()
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        note = self.note_for(edition)
        self.assertEqual(note["kind"], "news")
        self.assertEqual([(row["n"], row["kind"]) for row in note["sources"]], [(1, "official"), (2, "discovery")])
        self.assertEqual(note["sources"][0]["url"], PIB_URL)
        self.assertEqual(note["sources"][1]["url"], ARTICLE_URL)
        self.assertEqual(note["sources"][1]["publisher"], "The Indian Express")

    def test_unreachable_official_link_falls_back_to_a_secondary_note(self):
        self.ws.build(blocked=(PIB_URL,))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        note = self.note_for(edition)
        self.assertEqual(note["kind"], "secondary")
        self.assertEqual([row["kind"] for row in note["sources"]], ["discovery"])
        page = (self.ws.site / "notes" / note["slug"] / "index.html").read_text(encoding="utf-8")
        self.assertIn("Secondary", page)
        self.assertIn("ue-chip--secondary", page)


class EditorTests(unittest.TestCase):
    def setUp(self):
        self.ws = Workspace([])
        self.ws.feeds.write_text(json.dumps({"discovery": [{
            "id": "hindu-national", "publisher": "The Hindu", "section": "national", "url": SIR_FEED,
        }]}), encoding="utf-8")

    def tearDown(self):
        self.ws.close()

    def edition(self, slot="am"):
        return json.loads(self.ws.edition_path(slot).read_text(encoding="utf-8"))

    def test_editor_merges_a_running_story_into_one_note(self):
        llm = LLM(editor=sir_editor)
        report = self.ws.build(transport=llm)
        edition = self.edition()
        self.assertEqual((edition["editor"], edition["editorReason"]), ("llm", ""))
        self.assertEqual(len(llm.editor_calls), 1)
        self.assertEqual(len(llm.editor_calls[0]["clusters"]), 4)
        self.assertEqual(len(edition["notes"]), 1)
        note = next(iter(edition["notes"].values()))
        self.assertIn(note["fingerprint"], SIR_IDS[:3])
        self.assertEqual(note["editor"]["why"], "Election Commission independence and the CEC removal process.")
        discovery_urls = {row["url"] for row in note["sources"] if row["kind"] == "discovery"}
        self.assertEqual(len(discovery_urls), 1)  # one article per publisher is fetched
        self.assertEqual(note["sources"][0]["kind"], "official")  # PIB link found in the article
        self.assertFalse(any("Sensex" in fact["fact"] for fact in edition["quickFacts"]))
        story = report["editor"]["stories"][0]
        self.assertEqual((story["storyId"], story["members"]), ("sir-cec", 3))

    def test_invalid_editor_reply_falls_back_to_deterministic_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "editor.json"
            path.write_text("not json at all", encoding="utf-8")
            build_edition(self.ws.output, "2026-10-13", "am", "2026-10-13T00:20:00Z", opener(), LLM(),
                          env=ENV, site_root=self.ws.site, feeds_path=self.ws.feeds, editor_fixture=path)
        edition = self.edition()
        self.assertEqual((edition["editor"], edition["editorReason"]), ("fallback", "invalid-editor-json"))

    def test_cap_overflow_and_carry_over_to_the_next_slot(self):
        def two_musts(payload):
            return {"stories": [
                {"storyId": "kerala", "title": "CEC removal resolution", "memberIds": [SIR_IDS[0]],
                 "upscRelevance": "must", "why": "w", "codes": ["GS2.4"], "prelimsAngle": "", "mainsAngle": ""},
                {"storyId": "punjab", "title": "Punjab rolls", "memberIds": [SIR_IDS[1]],
                 "upscRelevance": "must", "why": "w", "codes": ["GS2.4"], "prelimsAngle": "", "mainsAngle": ""},
            ]}

        self.ws.build(transport=LLM(editor=two_musts), max_notes=1)
        am = self.edition()
        self.assertEqual(len(am["notes"]), 1)
        overflow = [fact for fact in am["quickFacts"] if fact.get("overflow")]
        self.assertEqual(len(overflow), 1)
        carried_ids = [row["id"] for row in am["carryOver"]]
        self.assertEqual(len(carried_ids), 1)
        self.assertEqual(am["carryOver"][0]["firstSeen"], "2026-10-13T00:20:00Z")

        def promote(payload):
            carried = [row for row in payload["clusters"] if row["carryOver"]]
            self.assertEqual([row["id"] for row in carried], carried_ids)
            return {"stories": [{"storyId": "promoted", "title": "Promoted", "memberIds": carried_ids,
                                 "upscRelevance": "must", "why": "w", "codes": ["GS2.4"],
                                 "prelimsAngle": "", "mainsAngle": ""}]}

        llm = LLM(editor=promote)
        self.ws.build(slot="pm", now="2026-10-13T12:20:00Z", transport=llm)
        pm = self.edition("pm")
        self.assertEqual([note["fingerprint"] for note in pm["notes"].values()], carried_ids)
        self.assertEqual(pm["carryOver"], [])

    def test_carry_over_keeps_its_clock_and_expires_after_a_day(self):
        self.ws.build(transport=LLM(editor=sir_editor), max_notes=0)
        self.assertEqual([row["firstSeen"] for row in self.edition()["carryOver"]], ["2026-10-13T00:20:00Z"])
        # PM: the carried story is offered again but not promoted, so it is carried on
        # with its original clock.
        pm_llm = LLM(editor=lambda payload: {"stories": [{
            "storyId": "again", "title": "t", "memberIds": [row["id"] for row in payload["clusters"]],
            "upscRelevance": "useful", "why": "w", "codes": ["GS2.4"], "prelimsAngle": "", "mainsAngle": ""}]})
        self.ws.build(slot="pm", now="2026-10-13T12:20:00Z", transport=pm_llm)
        self.assertTrue(all(row["carryOver"] for row in pm_llm.editor_calls[0]["clusters"]))
        pm = self.edition("pm")
        self.assertEqual({row["firstSeen"] for row in pm["carryOver"]}, {"2026-10-13T00:20:00Z"})
        # Next AM, 24.5 hours after it was first carried: expired.
        next_llm = LLM(editor=sir_editor)
        report = self.ws.build(date="2026-10-14", now="2026-10-14T00:50:00Z", transport=next_llm)
        self.assertEqual(next_llm.editor_calls, [])
        self.assertEqual(report["editor"]["carryOverIn"], 0)


class QuickFactTests(unittest.TestCase):
    def test_quick_fact_skips_routine_member_titles(self):
        from scripts.upsc.edition import _quick_fact
        speech = record("s1", "English rendering of PM's address during the launch of development projects in Chennai", PIB_URL)
        stations = record("s2", "PM inaugurates 26 stations redeveloped under the Amrit Bharat Station Scheme", PIB_URL)
        fact = _quick_fact({"records": [speech, stations], "discovery": [], "codesHint": ["GS3.4"]})
        self.assertEqual((fact["id"], fact["fact"]), ("qf-s2", stations["title"]))
        only_routine = _quick_fact({"records": [speech], "discovery": [], "codesHint": ["GS3.4"]})
        self.assertEqual(only_routine["id"], "qf-s1")


FRONTEND_FIXTURE = ROOT / "scripts/fixtures/upsc-edition-generated"


class WriteSafetyTests(unittest.TestCase):
    def setUp(self):
        self.ws = Workspace([SCHEME, FACT])

    def tearDown(self):
        self.ws.close()

    def test_wrong_typed_llm_note_is_held_and_edition_stays_consistent(self):
        self.ws.build(transport=LLM(dict(LLM_NOTE, keyNumbers=5)))
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        held = {row["topic"]: row["reasons"] for row in edition["held"]}
        self.assertIn("bad-type:keyNumbers", held[SCHEME["title"]])
        self.assertEqual(edition["notes"], {})
        self.assertFalse((self.ws.site / "notes").exists())

    def test_render_failure_holds_that_note_only(self):
        from unittest import mock
        with mock.patch("scripts.upsc.edition.render_note_page", side_effect=RuntimeError("boom")):
            report = self.ws.build()
        edition = json.loads(self.ws.edition_path().read_text(encoding="utf-8"))
        held = {row["topic"]: row["reasons"] for row in edition["held"]}
        self.assertEqual(held[SCHEME["title"]][0], "render-error")
        self.assertEqual(edition["notes"], {})
        self.assertEqual(edition["prelims"] + edition["mains"] + edition["glimpse"], [])
        self.assertEqual(report["newNotes"], 0)
        self.assertFalse((self.ws.site / "notes").exists())


class FrontendContractTests(unittest.TestCase):
    """The browser desk must load exactly what build_edition writes."""

    def build_tree(self):
        ws = Workspace([SCHEME, FACT])
        self.addCleanup(ws.close)
        ws.build()
        return ws.output / "editions"

    def test_index_paths_are_relative_to_the_editions_directory(self):
        index = json.loads((self.build_tree() / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["editions"][0]["path"], "2026/10/13-am.json")

    def test_node_desk_loads_the_python_edition(self):
        import os
        import shutil
        editions = self.build_tree()
        if os.environ.get("UPSC_UPDATE_FIXTURES") == "1":
            shutil.rmtree(FRONTEND_FIXTURE, ignore_errors=True)
            shutil.copytree(editions, FRONTEND_FIXTURE)
        committed = sorted(path.relative_to(FRONTEND_FIXTURE).as_posix() for path in FRONTEND_FIXTURE.rglob("*.json"))
        built = sorted(path.relative_to(editions).as_posix() for path in editions.rglob("*.json"))
        self.assertEqual(committed, built, "regenerate with UPSC_UPDATE_FIXTURES=1")
        for name in built:
            self.assertEqual((FRONTEND_FIXTURE / name).read_text(encoding="utf-8"), (editions / name).read_text(encoding="utf-8"),
                             f"{name} is stale; regenerate with UPSC_UPDATE_FIXTURES=1")
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        completed = subprocess.run([node, "scripts/test-upsc-edition-integration.js", str(editions)],
                                   cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)


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
    def test_cli_rebuilds_the_index_from_edition_files(self):
        ws = Workspace([SCHEME, FACT])
        self.addCleanup(ws.close)
        ws.build()
        (ws.output / "editions/index.json").write_text("{}", encoding="utf-8")
        completed = subprocess.run(
            [sys.executable, "scripts/upsc/edition.py", "--rebuild-index", "--output", str(ws.output),
             "--now", "2026-10-13T01:00:00Z"], cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        index = json.loads((ws.output / "editions/index.json").read_text(encoding="utf-8"))
        self.assertEqual([row["path"] for row in index["editions"]], ["2026/10/13-am.json"])

    def test_cli_help_runs_as_script(self):
        completed = subprocess.run(
            [sys.executable, "scripts/upsc/edition.py", "--help"],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("--slot", completed.stdout)


if __name__ == "__main__":
    unittest.main()
