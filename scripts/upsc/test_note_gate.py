import copy
import json
import unittest
from pathlib import Path

from scripts.upsc.evidence import extract_text
from scripts.upsc.note_gate import (
    BANNED_PHRASES,
    body_text,
    check_note,
    normalise_numbers,
    word_count,
)


FIXTURES = Path(__file__).with_name("fixtures")
EVIDENCE = extract_text((FIXTURES / "pib-release.html").read_text(encoding="utf-8"))
PYQ_IDS = {"mains-2018-gs3-msp"}


def note():
    return json.loads((FIXTURES / "edition-note.json").read_text(encoding="utf-8"))


class NumberTests(unittest.TestCase):
    def test_indian_and_western_grouping_normalise(self):
        self.assertIn("11440", normalise_numbers("₹11,440 crore"))
        self.assertIn("11440", normalise_numbers("Rs 11440 crore"))
        self.assertIn("120000", normalise_numbers("1,20,000"))
        self.assertIn("120000", normalise_numbers("120000"))
        self.assertIn("5.5", normalise_numbers("5.5%"))
        self.assertIn("5.5", normalise_numbers("5.50 per cent"))

    def test_fiscal_year_ranges_expand(self):
        self.assertTrue({"2025", "26", "2025-26"} <= normalise_numbers("2025-26"))
        self.assertTrue({"2025", "26", "2025-26"} <= normalise_numbers("2025–26"))

    def test_single_digits_and_ordinals(self):
        self.assertEqual(normalise_numbers("3 schemes in 7 states"), set())
        self.assertEqual(normalise_numbers("its 33rd Foundation Day"), {"33"})

    def test_list_commas_are_not_grouping(self):
        self.assertEqual(normalise_numbers("36, 11 and 117"), {"36", "11", "117"})


class GateTests(unittest.TestCase):
    def assertReason(self, mutated, reason):
        self.assertIn(reason, check_note(mutated, EVIDENCE, PYQ_IDS))

    def test_fixture_note_passes(self):
        self.assertEqual(check_note(note(), EVIDENCE, PYQ_IDS), [])

    def test_body_text_excludes_headings_and_practice(self):
        text = body_text(note())
        self.assertIn("117 key performance indicators", text)
        self.assertNotIn("How are districts chosen?", text)
        self.assertNotIn("State Agriculture Minister", text)
        self.assertGreaterEqual(word_count(note()), 450)

    def test_rupee_figure_matches_rs_evidence(self):
        evidence = EVIDENCE.replace("₹11,440 crore", "Rs 11440 crore")
        self.assertEqual(check_note(note(), evidence, PYQ_IDS), [])

    def test_lakh_grouping_matches_plain_evidence(self):
        mutated = note()
        mutated["keyNumbers"].append({"figure": "1,20,000", "meaning": "Test figure", "source": 1})
        self.assertEqual(check_note(mutated, EVIDENCE + " 120000 hectares", PYQ_IDS), [])
        self.assertIn("unsupported-number:120000", check_note(mutated, EVIDENCE, PYQ_IDS))

    def test_missing_fields(self):
        for field in ("title", "oneLine", "codes", "sections", "back2basics", "keyNumbers", "sources"):
            mutated = note()
            del mutated[field]
            self.assertReason(mutated, f"missing:{field}")
        mutated = note()
        del mutated["practice"]["mains"]
        self.assertReason(mutated, "missing:practice.mains")
        mutated = note()
        mutated["practice"]["faq"] = mutated["practice"]["faq"][:2]
        self.assertReason(mutated, "missing:practice.faq")
        mutated = note()
        mutated["whyInNews"] = {"text": "", "sources": [1]}
        self.assertReason(mutated, "missing:whyInNews")

    def test_bad_code(self):
        mutated = note()
        mutated["codes"] = ["GS3.3", "GS9.9"]
        self.assertReason(mutated, "bad-code:GS9.9")
        mutated["codes"] = ["GS3.1", "GS3.2", "GS3.3", "GS3.4"]
        self.assertReason(mutated, "bad-code:count")

    def test_unsupported_number(self):
        mutated = note()
        mutated["sections"][0]["body"][0]["text"] += " About 4,500 villages are covered."
        self.assertReason(mutated, "unsupported-number:4500")

    def test_numbers_only_in_question_headings_are_ignored(self):
        mutated = note()
        mutated["sections"][0]["heading"] = "What did the Cabinet approve in 2027?"
        self.assertEqual(check_note(mutated, EVIDENCE, PYQ_IDS), [])

    def test_faq_number_must_appear_in_body(self):
        mutated = note()
        mutated["practice"]["faq"][1]["a"] = "The District Collector, across 117 indicators and 1.7 crore farmers."
        self.assertEqual(check_note(mutated, EVIDENCE, PYQ_IDS), [])
        mutated["practice"]["faq"][1]["a"] = "Six members, reviewed every 90 days."
        self.assertReason(mutated, "faq-number-not-in-body:90")

    def test_banned_phrases(self):
        self.assertIn("plays a pivotal role", BANNED_PHRASES)
        self.assertEqual(len(BANNED_PHRASES), 19)
        mutated = note()
        mutated["deck"] = "This scheme Plays A Pivotal Role in the farm landscape."
        reasons = check_note(mutated, EVIDENCE, PYQ_IDS)
        self.assertIn("banned:plays a pivotal role", reasons)
        self.assertIn("banned:landscape", reasons)
        mutated = note()
        mutated["practice"]["mains"]["demand"] = "Delve into the issue."
        self.assertReason(mutated, "banned:delve")

    def test_section_without_source(self):
        mutated = note()
        mutated["sections"][2]["sources"] = []
        self.assertReason(mutated, "section-without-source:2")
        mutated = note()
        mutated["sections"][1]["sources"] = [4]
        self.assertReason(mutated, "section-without-source:1")
        mutated = note()
        mutated["whyInNews"]["sources"] = []
        self.assertReason(mutated, "section-without-source:whyInNews")

    def test_length(self):
        mutated = note()
        mutated["sections"] = mutated["sections"][:1]
        reasons = check_note(mutated, EVIDENCE, PYQ_IDS)
        self.assertTrue(any(reason.startswith("length:") for reason in reasons), reasons)
        mutated = note()
        mutated["kind"] = "editorial"
        self.assertTrue(any(r.startswith("length:") for r in check_note(mutated, EVIDENCE, PYQ_IDS)))

    def test_pyq_must_come_from_bank(self):
        mutated = note()
        mutated["practice"]["pyq"] = {"id": "mains-2018-gs3-msp", "why": "Same district-level delivery question."}
        self.assertEqual(check_note(mutated, EVIDENCE, PYQ_IDS), [])
        mutated["practice"]["pyq"]["id"] = "invented-2030"
        self.assertReason(mutated, "pyq-not-in-bank")

    def test_discovery_source_on_news(self):
        mutated = note()
        mutated["sources"].append({"n": 2, "title": "Hindu", "publisher": "The Hindu", "url": "https://www.thehindu.com/x", "date": "2026-10-12", "kind": "discovery"})
        self.assertReason(mutated, "discovery-source-on-news")

    def test_bad_mcq(self):
        for change in (
            lambda mcq: mcq.update(answer=4),
            lambda mcq: mcq.update(answer="0"),
            lambda mcq: mcq.update(options=["a", "b", "c"]),
            lambda mcq: mcq.update(options=["a", "a", "b", "c"]),
            lambda mcq: mcq.update(trap=""),
        ):
            mutated = note()
            change(mutated["practice"]["mcq"])
            self.assertReason(mutated, "bad-mcq")

    def test_headings_must_be_questions(self):
        mutated = note()
        mutated["sections"][0]["heading"] = "Background"
        self.assertReason(mutated, "heading-not-question:0")

    def test_gate_does_not_mutate_note(self):
        original = note()
        copied = copy.deepcopy(original)
        check_note(copied, EVIDENCE, PYQ_IDS)
        self.assertEqual(copied, original)


if __name__ == "__main__":
    unittest.main()
