import json
import unittest
import urllib.error
from pathlib import Path

from scripts.upsc.evidence import extract_text
from scripts.upsc.note_gate import BANNED_PHRASES, check_note
from scripts.upsc.writer import (
    SYSTEM_PROMPT_PATH,
    build_messages,
    call_llm,
    write_note,
)


FIXTURES = Path(__file__).with_name("fixtures")
NOTE = json.loads((FIXTURES / "edition-note.json").read_text(encoding="utf-8"))
LLM_NOTE = {key: value for key, value in NOTE.items() if key not in ("sources", "kind")}
EVIDENCE = [{
    "n": 1, "title": "Cabinet approves expansion of PM Dhan-Dhaanya Krishi Yojana",
    "publisher": "Press Information Bureau", "date": "2026-10-12",
    "url": "https://pib.gov.in/PressReleaseIframePage.aspx?PRID=1", "kind": "official",
    "text": extract_text((FIXTURES / "pib-release.html").read_text(encoding="utf-8")),
}]
CANDIDATE = {
    "fingerprint": "abc123", "title": "Cabinet approves expansion of PM Dhan-Dhaanya Krishi Yojana",
    "kind": "news", "codesHint": ["GS3.3"], "anchorHint": "Agriculture, MSP and marketing",
    "records": [], "discovery": [],
}
PYQ_OPTIONS = [{
    "id": "mains-2018-gs3-msp", "year": 2018, "paper": "GS3", "exam": "mains",
    "question": "What are the reasons for poor acceptance of cost-effective small processing units?",
}]
ENV = {"OPENAI_API_KEY": "sk-test", "UPSC_EDITION_MODEL": "test-model"}


class FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self, limit=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def openai_reply(content):
    return {"choices": [{"message": {"content": content}}]}


class FakeTransport:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def __call__(self, request, timeout=120):
        self.requests.append(request)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return FakeResponse(reply)

    def user_payload(self, index):
        body = json.loads(self.requests[index].data.decode("utf-8"))
        return json.loads(body["messages"][1]["content"])


class PromptTests(unittest.TestCase):
    def test_system_prompt_carries_rules_schema_and_every_banned_phrase(self):
        prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        for phrase in BANNED_PHRASES:
            self.assertIn(f'"{phrase}"', prompt)
        for needle in ('"keyNumbers"', '"back2basics"', '"whyInNews"', '"practice"', '"faq"',
                       "allowedCodes", "pyqOptions", "ending with", "label", "misconception",
                       "wayForward", "Copy every number exactly"):
            self.assertIn(needle, prompt)

    def test_messages_carry_evidence_codes_pyq_and_feedback(self):
        messages = build_messages(CANDIDATE, EVIDENCE, PYQ_OPTIONS, ["unsupported-number:4500"])
        self.assertEqual([row["role"] for row in messages], ["system", "user"])
        self.assertEqual(messages[0]["content"], SYSTEM_PROMPT_PATH.read_text(encoding="utf-8"))
        payload = json.loads(messages[1]["content"])
        self.assertEqual(payload["evidence"][0]["n"], 1)
        self.assertIn("36 existing schemes", payload["evidence"][0]["text"])
        self.assertNotIn("wordRange", payload)
        self.assertEqual(payload["suggestedCodes"], ["GS3.3"])
        self.assertEqual(len(payload["allowedCodes"]), 37)
        self.assertEqual(payload["pyqOptions"][0]["id"], "mains-2018-gs3-msp")
        self.assertIn("4500", payload["previousAttemptProblems"][0])
        first = json.loads(build_messages(CANDIDATE, EVIDENCE, PYQ_OPTIONS, [])[1]["content"])
        self.assertNotIn("previousAttemptProblems", first)

    def test_editor_brief_is_passed_when_present(self):
        brief = {"storyId": "s", "title": "t", "why": "Why it matters.", "prelimsAngle": "p", "mainsAngle": "m"}
        payload = json.loads(build_messages(dict(CANDIDATE, editor=brief), EVIDENCE, [], [])[1]["content"])
        self.assertEqual(payload["editorBrief"], {"why": "Why it matters.", "prelimsAngle": "p", "mainsAngle": "m"})
        plain = json.loads(build_messages(CANDIDATE, EVIDENCE, [], [])[1]["content"])
        self.assertNotIn("editorBrief", plain)
        self.assertIn("editorBrief", SYSTEM_PROMPT_PATH.read_text(encoding="utf-8"))

    def test_prompt_sets_no_word_range(self):
        prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        self.assertNotIn("wordRange", prompt)
        self.assertNotIn("450", prompt)
        self.assertIn("length follows the topic", prompt)
        self.assertIn("no padding and no omissions", prompt)


class CallTests(unittest.TestCase):
    def test_openai_request_shape(self):
        transport = FakeTransport([openai_reply("{}")])
        self.assertEqual(call_llm([{"role": "user", "content": "x"}], transport, ENV), "{}")
        request = transport.requests[0]
        self.assertEqual(request.full_url, "https://api.openai.com/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer sk-test")
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(body["model"], "test-model")
        self.assertEqual(body["response_format"], {"type": "json_object"})

    def test_falls_back_to_gemini(self):
        transport = FakeTransport([
            urllib.error.HTTPError("https://api.openai.com", 429, "Too Many", {}, None),
            {"candidates": [{"content": {"parts": [{"text": "{\"ok\": 1}"}]}}]},
        ])
        env = dict(ENV, GEMINI_API_KEY="g-test")
        self.assertEqual(call_llm([{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], transport, env), "{\"ok\": 1}")
        gemini = transport.requests[1]
        self.assertIn("generativelanguage.googleapis.com", gemini.full_url)
        self.assertNotIn("g-test", gemini.full_url)
        body = json.loads(gemini.data.decode("utf-8"))
        self.assertEqual(body["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(body["systemInstruction"]["parts"][0]["text"], "s")

    def test_no_keys_raises_no_llm_key(self):
        transport = FakeTransport([])
        with self.assertRaisesRegex(RuntimeError, "no-llm-key"):
            call_llm([{"role": "user", "content": "x"}], transport, {})
        self.assertEqual(transport.requests, [])


class WriteNoteTests(unittest.TestCase):
    def test_valid_reply_passes_first_time(self):
        transport = FakeTransport([openai_reply(json.dumps(LLM_NOTE))])
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertEqual(reasons, [])
        self.assertEqual(len(transport.requests), 1)
        self.assertEqual(note["kind"], "news")
        self.assertEqual(note["sources"], [{key: EVIDENCE[0][key] for key in ("n", "title", "publisher", "url", "date", "kind")}])
        self.assertEqual(note["papers"], ["GS3", "GS2"])
        self.assertIsInstance(note["readTime"], int)
        self.assertGreaterEqual(note["readTime"], 1)
        self.assertEqual(check_note(note, EVIDENCE[0]["text"], {"mains-2018-gs3-msp"}), [])

    def test_gate_failure_retries_with_reasons(self):
        bad = json.loads(json.dumps(LLM_NOTE))
        bad["sections"][0]["body"][0]["text"] += " About 4,500 villages are covered."
        transport = FakeTransport([openai_reply(json.dumps(bad)), openai_reply(json.dumps(LLM_NOTE))])
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertEqual(reasons, [])
        self.assertIsNotNone(note)
        problems = transport.user_payload(1)["previousAttemptProblems"]
        self.assertTrue(any("4500" in problem for problem in problems))

    def test_two_failures_hold_the_note(self):
        bad = dict(LLM_NOTE, codes=["GS9.9"])
        transport = FakeTransport([openai_reply(json.dumps(bad))] * 2)
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertIsNone(note)
        self.assertIn("bad-code:GS9.9", reasons)

    def test_non_json_reply_is_a_gate_failure(self):
        transport = FakeTransport([openai_reply("Sure! Here is your note."), openai_reply("```json\n" + json.dumps(LLM_NOTE) + "\n```")])
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertEqual(reasons, [])
        self.assertIn("invalid-json", transport.user_payload(1)["previousAttemptProblems"][0])
        transport = FakeTransport([openai_reply("[1, 2]")] * 2)
        self.assertEqual(write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV), (None, ["invalid-json"]))

    def test_missing_keys_hold_as_llm_unavailable(self):
        self.assertEqual(write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, FakeTransport([]), env={}), (None, ["llm-unavailable"]))
        raising = FakeTransport([RuntimeError("no-llm-key")])
        self.assertEqual(write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, raising, env=ENV), (None, ["llm-unavailable"]))

    def test_provider_error_holds_as_llm_unavailable(self):
        transport = FakeTransport([urllib.error.URLError("down")])
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertIsNone(note)
        self.assertEqual(reasons[0], "llm-unavailable")

    def test_pyq_is_resolved_from_options_only(self):
        chosen = json.loads(json.dumps(LLM_NOTE))
        chosen["practice"]["pyq"] = {"id": "mains-2018-gs3-msp", "why": "District delivery of farm support.", "question": "invented text"}
        transport = FakeTransport([openai_reply(json.dumps(chosen))])
        note, reasons = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertEqual(reasons, [])
        self.assertEqual(note["practice"]["pyq"]["question"], PYQ_OPTIONS[0]["question"])
        self.assertEqual(note["practice"]["pyq"]["year"], 2018)
        invented = json.loads(json.dumps(LLM_NOTE))
        invented["practice"]["pyq"] = {"id": "made-up", "why": "x"}
        transport = FakeTransport([openai_reply(json.dumps(invented))] * 2)
        self.assertEqual(write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)[1], ["pyq-not-in-bank"])

    def test_unknown_keys_are_dropped(self):
        extra = dict(LLM_NOTE, sources=[{"n": 9, "url": "https://evil.example"}], html="<script>")
        transport = FakeTransport([openai_reply(json.dumps(extra))])
        note, _ = write_note(CANDIDATE, EVIDENCE, PYQ_OPTIONS, transport, env=ENV)
        self.assertNotIn("html", note)
        self.assertEqual(note["sources"][0]["url"], EVIDENCE[0]["url"])


if __name__ == "__main__":
    unittest.main()
