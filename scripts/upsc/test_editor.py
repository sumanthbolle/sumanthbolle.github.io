import json
import tempfile
import unittest
from pathlib import Path

from scripts.upsc.candidates import build_candidates
from scripts.upsc.editor import (
    EDITOR_PROMPT_PATH,
    apply_stories,
    build_editor_messages,
    parse_editor_response,
    run_editor,
)


WINDOW = ("2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z")
EDITION = {"id": "2026-10-13-am", "window": {"from": WINDOW[0], "to": WINDOW[1]}}
ENV = {"OPENAI_API_KEY": "sk-test"}


def news(title, url, publisher="The Hindu", section="national"):
    return {"title": title, "url": url, "publishedAt": "2026-10-12T16:00:00Z",
            "feedId": "x-" + section, "publisher": publisher, "section": section}


def record(rid, title):
    return {"id": rid, "title": title, "officialSummary": title, "publisherId": "pib",
            "publisherName": "Press Information Bureau", "publishedAt": "2026-10-12T15:00:00Z",
            "sourceUrl": f"https://pib.gov.in/PressReleaseIframePage.aspx?PRID={rid}"}


def clusters():
    rows = build_candidates([record("1", "Indian Navy commissions anti-submarine craft INS Mangrol")], [
        news("Kerala Assembly passes resolution seeking removal of CEC Gyanesh Kumar", "https://a.example/1"),
        news("13.60 lakh names dropped from final electoral rolls after SIR in Punjab", "https://a.example/2"),
        news("INDIA bloc marches through Delhi, takes SIR protest to SC", "https://b.example/3",
             publisher="The Indian Express"),
        news("Stock markets tumble on oil price spike; Sensex drops 548 points", "https://a.example/4", section="business"),
    ], WINDOW, pyq_bank={"questions": []}, patterns={"anchors": []})
    return {row["title"][:12]: row for row in rows}


def sir_reply(rows):
    return {"stories": [
        {"storyId": "sir-cec", "title": "Electoral roll revision (SIR) and the move to remove the CEC",
         "memberIds": [rows["Kerala Assem"]["fingerprint"], rows["13.60 lakh n"]["fingerprint"],
                       rows["INDIA bloc m"]["fingerprint"]],
         "upscRelevance": "must", "why": "Raises questions on ECI independence and the removal process.",
         "codes": ["GS2.4", "GS2.3"], "prelimsAngle": "Removal procedure for the CEC.",
         "mainsAngle": "Independence of the Election Commission."},
        {"storyId": "mangrol", "title": "INS Mangrol commissioned", "memberIds": [rows["Indian Navy "]["fingerprint"]],
         "upscRelevance": "useful", "why": "Indigenous shallow-water ASW craft.", "codes": ["GS3.8"],
         "prelimsAngle": "", "mainsAngle": ""},
    ]}


class FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self, limit=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class Transport:
    def __init__(self, content):
        self.content = content
        self.requests = []

    def __call__(self, request, timeout=120):
        self.requests.append(request)
        return FakeResponse({"choices": [{"message": {"content": self.content}}]})


class PromptTests(unittest.TestCase):
    def test_prompt_states_merge_and_relevance_rules(self):
        prompt = EDITOR_PROMPT_PATH.read_text(encoding="utf-8")
        for needle in ("memberIds", "upscRelevance", "must", "useful", "skip", "SIR",
                       "state-level", "ceremonial", "company results", "carryOver", "at most 25 words"):
            self.assertIn(needle, prompt)

    def test_messages_list_every_cluster_with_headlines_records_and_carry_flag(self):
        rows = clusters()
        carried = dict(rows["INDIA bloc m"], carryOver=True)
        others = [row for key, row in rows.items() if key != "INDIA bloc m"]
        messages = build_editor_messages(others + [carried], EDITION)
        payload = json.loads(messages[1]["content"])
        self.assertEqual(payload["edition"], EDITION)
        self.assertEqual(len(payload["allowedCodes"]), 37)
        by_id = {row["id"]: row for row in payload["clusters"]}
        self.assertEqual(len(by_id), len(rows))
        navy = by_id[rows["Indian Navy "]["fingerprint"]]
        self.assertEqual(navy["officialRecords"][0]["publisher"], "Press Information Bureau")
        self.assertTrue(by_id[carried["fingerprint"]]["carryOver"])
        self.assertEqual(by_id[rows["Kerala Assem"]["fingerprint"]]["headlines"][0]["publisher"], "The Hindu")


class ParseTests(unittest.TestCase):
    def test_invalid_json_returns_none(self):
        self.assertIsNone(parse_editor_response("not json", {"a"}))
        self.assertIsNone(parse_editor_response(json.dumps({"stories": "x"}), {"a"}))

    def test_unknown_ids_codes_and_duplicates_are_dropped(self):
        stories = parse_editor_response(json.dumps({"stories": [
            {"storyId": "s1", "title": "One", "memberIds": ["a", "ghost", "a"], "upscRelevance": "must",
             "why": " ".join(["word"] * 40), "codes": ["GS2.4", "GS9.9", "GS2.4"], "prelimsAngle": "p", "mainsAngle": "m"},
            {"storyId": "s2", "title": "Two", "memberIds": ["a", "b"], "upscRelevance": "useful", "codes": []},
            {"storyId": "s3", "title": "Three", "memberIds": ["ghost"], "upscRelevance": "must", "codes": ["GS1.1"]},
            {"storyId": "s4", "title": "Four", "memberIds": ["c"], "upscRelevance": "urgent", "codes": ["GS1.1"]},
        ]}), {"a", "b", "c"})
        self.assertEqual([row["storyId"] for row in stories], ["s1", "s2"])
        self.assertEqual(stories[0]["memberIds"], ["a"])
        self.assertEqual(stories[0]["codes"], ["GS2.4"])
        self.assertEqual(len(stories[0]["why"].split()), 25)
        self.assertEqual(stories[1]["memberIds"], ["b"])


class ApplyTests(unittest.TestCase):
    def test_merged_story_unions_members_and_carries_editor_fields(self):
        rows = clusters()
        stories = parse_editor_response(json.dumps(sir_reply(rows)), {row["fingerprint"] for row in rows.values()})
        merged = apply_stories(stories, list(rows.values()), pyq_bank={"questions": []}, patterns={"anchors": []})
        self.assertEqual([row["band"] for row in merged], ["must", "useful"])
        sir = merged[0]
        self.assertEqual(len(sir["discovery"]), 3)
        self.assertEqual(sir["codesHint"], ["GS2.4", "GS2.3"])
        self.assertEqual(sir["editor"]["storyId"], "sir-cec")
        self.assertEqual(sir["editor"]["why"], "Raises questions on ECI independence and the removal process.")
        self.assertEqual(sorted(sir["memberIds"]), sorted(sir_reply(rows)["stories"][0]["memberIds"]))
        best = max((rows[key] for key in ("Kerala Assem", "13.60 lakh n", "INDIA bloc m")),
                   key=lambda row: (row["score"], row["title"]))
        self.assertEqual(sir["fingerprint"], best["fingerprint"])
        self.assertGreaterEqual(sir["score"], best["score"])
        self.assertEqual(merged[1]["records"][0]["id"], "1")


class RunTests(unittest.TestCase):
    def test_llm_reply_is_used(self):
        rows = clusters()
        transport = Transport(json.dumps(sir_reply(rows)))
        result = run_editor(list(rows.values()), EDITION, transport, ENV)
        self.assertEqual((result["mode"], result["reason"]), ("llm", ""))
        self.assertEqual(len(transport.requests), 1)
        self.assertEqual(result["stories"][0]["editor"]["storyId"], "sir-cec")
        body = json.loads(transport.requests[0].data.decode("utf-8"))
        self.assertIn("UPSC Civil Services study desk", body["messages"][0]["content"])

    def test_invalid_reply_falls_back(self):
        rows = clusters()
        result = run_editor(list(rows.values()), EDITION, Transport("Sorry, I cannot."), ENV)
        self.assertEqual((result["mode"], result["reason"], result["stories"]), ("fallback", "invalid-editor-json", None))
        empty = run_editor(list(rows.values()), EDITION, Transport(json.dumps({"stories": []})), ENV)
        self.assertEqual((empty["mode"], empty["reason"]), ("fallback", "no-editor-stories"))

    def test_missing_keys_fall_back_without_calling(self):
        transport = Transport("{}")
        result = run_editor(list(clusters().values()), EDITION, transport, {})
        self.assertEqual((result["mode"], result["reason"]), ("fallback", "llm-unavailable"))
        self.assertEqual(transport.requests, [])

    def test_fixture_file_replaces_the_llm_call(self):
        rows = clusters()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "editor.json"
            path.write_text(json.dumps(sir_reply(rows)), encoding="utf-8")
            transport = Transport("{}")
            result = run_editor(list(rows.values()), EDITION, transport, {}, fixture=path)
        self.assertEqual(result["mode"], "fixture")
        self.assertEqual(transport.requests, [])
        self.assertEqual(len(result["stories"]), 2)


if __name__ == "__main__":
    unittest.main()
