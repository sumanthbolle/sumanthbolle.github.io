import unittest

from scripts.upsc.candidates import (
    CODE_LABELS,
    FACT_FLOOR,
    NOTE_FLOOR,
    build_candidates,
    fingerprint,
    note_queue,
    tokens,
)
from scripts.upsc.models import SYLLABUS_CODES


WINDOW = ("2026-10-12T12:30:00Z", "2026-10-13T00:30:00Z")
PYQ = {"questions": [{
    "id": "mains-2018-gs3-msp", "year": 2018, "exam": "mains", "paper": "GS3",
    "tags": ["Agriculture msp and marketing"],
    "question": "What are the reasons for poor acceptance of cost-effective small processing units? How will the food processing unit be helpful to the poor farmers?",
}]}
PATTERNS = {"anchors": [{
    "id": "agriculture-msp-and-marketing", "anchor": "Agriculture, MSP and marketing",
    "aliases": ["MSP", "minimum support price", "agricultural marketing"],
    "codes": ["GS3.3"], "frequency_est": 80,
}]}


def record(rid, title, summary="", publisher="pib", published="2026-10-12T15:15:14Z"):
    return {
        "id": rid, "title": title, "officialSummary": summary or title,
        "publisherId": publisher, "publisherName": publisher.upper(),
        "publishedAt": published,
        "sourceUrl": f"https://{publisher}.gov.in/release/{rid}",
    }


def news(title, section="national", published="2026-10-12T20:00:00Z", url="https://www.thehindu.com/a.ece", publisher="The Hindu"):
    feed = ("hindu" if publisher == "The Hindu" else "express") + "-" + section
    return {
        "title": title, "url": url, "publishedAt": published,
        "feedId": feed, "publisher": publisher, "section": section,
    }


def build(records, discovery=()):
    return build_candidates(list(records), list(discovery), WINDOW, pyq_bank=PYQ, patterns=PATTERNS)


def fake(score, code, title):
    return {"score": score, "codesHint": [code] if code else [], "title": title, "fingerprint": title}


class SelectionTests(unittest.TestCase):
    def test_floors(self):
        self.assertEqual((NOTE_FLOOR, FACT_FLOOR), (45, 30))

    def test_queue_takes_top_scores_above_the_floor(self):
        rows = [fake(80, "GS3.1", "a"), fake(70, "GS2.4", "b"), fake(50, "GS1.5", "c"), fake(44, "GS2.1", "d")]
        self.assertEqual([row["title"] for row in note_queue(rows)], ["a", "b", "c"])

    def test_paper_balance_defers_a_fourth_note_from_one_paper(self):
        rows = [fake(90, "GS3.1", "a"), fake(85, "GS3.2", "b"), fake(80, "GS3.4", "c"),
                fake(75, "GS3.6", "d"), fake(50, "GS2.9", "e")]
        self.assertEqual([row["title"] for row in note_queue(rows)], ["a", "b", "c", "e", "d"])

    def test_paper_balance_allows_more_when_no_other_paper_qualifies(self):
        rows = [fake(90, "GS3.1", "a"), fake(85, "GS3.2", "b"), fake(80, "GS3.4", "c"),
                fake(75, "GS3.6", "d"), fake(40, "GS2.9", "e")]
        self.assertEqual([row["title"] for row in note_queue(rows)], ["a", "b", "c", "d"])


class TokenTests(unittest.TestCase):
    def test_tokens_drop_stopwords_numbers_and_short_words(self):
        self.assertEqual(
            tokens("Union Minister launches PM Dhan-Dhaanya Krishi Yojana in 100 districts"),
            {"dhan", "dhaanya", "krishi", "yojana", "district"},
        )

    def test_fingerprint_is_order_independent_and_stable(self):
        first = fingerprint("Krishi Yojana Dhan-Dhaanya districts")
        self.assertEqual(first, fingerprint("districts: Dhan-Dhaanya Krishi Yojana"))
        self.assertRegex(first, r"^[0-9a-f]{16}$")
        self.assertNotEqual(first, fingerprint("Coal stocks at power plants"))

    def test_code_labels_cover_exactly_the_canonical_codes(self):
        self.assertEqual(set(CODE_LABELS), SYLLABUS_CODES)


class CandidateTests(unittest.TestCase):
    def test_same_scheme_records_and_newspaper_item_merge(self):
        rows = build([
            record("a", "Cabinet approves expansion of PM Dhan-Dhaanya Krishi Yojana to 100 districts",
                   "The scheme covers farmers, crop productivity and irrigation in 100 districts. " * 12),
            record("b", "Agriculture Minister felicitates PM Dhan-Dhaanya Krishi Yojana districts"),
            record("c", "Coal stocks at power plants remain stable above 18 MT"),
        ], [news("Dhan-Dhaanya Krishi Yojana: what the expansion means for farmers", "explained")])
        merged = [row for row in rows if len(row["records"]) == 2]
        self.assertEqual(len(merged), 1)
        candidate = merged[0]
        self.assertEqual(len(candidate["discovery"]), 1)
        self.assertEqual(candidate["kind"], "news")
        self.assertEqual(candidate["band"], "must")
        self.assertIn("GS3.3", candidate["codesHint"])
        self.assertLessEqual(len(candidate["codesHint"]), 3)
        self.assertTrue(all(code in SYLLABUS_CODES for code in candidate["codesHint"]))
        self.assertEqual(candidate["title"], "Cabinet approves expansion of PM Dhan-Dhaanya Krishi Yojana to 100 districts")
        self.assertEqual(candidate["fingerprint"], fingerprint(candidate["title"]))
        self.assertEqual(sum(candidate["scoreParts"].values()), candidate["score"])

    def test_ceremony_record_is_skipped(self):
        rows = build([record("n", "NHRC celebrates its 33rd Foundation Day in New Delhi with welfare scheme focus on farmers")])
        self.assertLessEqual(rows[0]["score"], 30)
        self.assertEqual(rows[0]["band"], "skip")

    def test_routine_market_operations_are_skipped(self):
        rows = build([record(
            "r", "Money Market Operations as on October 11, 2026",
            "Liquidity repo inflation bank credit " * 40, "rbi", "2026-10-12T19:05:00Z",
        )])
        self.assertEqual(rows[0]["band"], "skip")

    def test_routine_surveys_and_campaigns_are_skipped(self):
        for title in (
            "Launching of 51st Round of Quarterly Services and Infrastructure Outlook Survey (SIOS)",
            "Ministry of MSME Concludes Swachhata Hi Seva 2026 Campaign with industry and MSME units",
            "NHRC organises a National Conference on Right to Water on its 33rd Foundation Day",
        ):
            rows = build([record("s", title, "Survey of bank credit, investment, growth and employment. " * 20)])
            self.assertEqual(rows[0]["band"], "skip", title)

    def test_discovery_without_official_match_becomes_editorial(self):
        rows = build([record("c", "Coal stocks at power plants remain stable above 18 MT")],
                     [news("The quiet erosion of federalism in fiscal transfers", "editorial",
                           url="https://www.thehindu.com/opinion/editorial/x.ece")])
        secondary = build([], [news("Supreme Court wants cap on trade margin for essential medicines")])
        self.assertEqual(secondary[0]["kind"], "secondary")
        editorial = [row for row in rows if row["kind"] == "editorial"]
        self.assertEqual(len(editorial), 1)
        self.assertEqual(editorial[0]["records"], [])
        self.assertEqual(editorial[0]["discovery"][0]["section"], "editorial")
        self.assertEqual(editorial[0]["scoreParts"]["primary"], 0)

    def test_out_of_window_record_needs_a_discovery_match(self):
        old = record("old", "India and Singapore sign agreement on green shipping corridor",
                     published="2026-10-11T18:00:00Z")
        self.assertEqual(build([old]), [])
        rows = build([old], [news("India, Singapore sign green shipping corridor agreement")])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["records"][0]["id"], "old")

    def test_weights_sum_to_one_hundred(self):
        rows = build([record("c", "Coal stocks at power plants remain stable above 18 MT")])
        self.assertEqual(set(rows[0]["scoreParts"]), {"syllabus", "primary", "pyq", "anchor", "depth", "coverage"})
        self.assertEqual(rows[0]["scoreParts"]["primary"], 10)

    def test_coverage_counts_publishers_feeds_and_analysis_sections(self):
        hindu = news("Karnataka High Court strikes down law to increase reservation for SCs and STs",
                     url="https://www.thehindu.com/k.ece")
        express = news("Karnataka HC quashes law raising reservation for SCs and STs", publisher="The Indian Express",
                       url="https://indianexpress.com/k/")
        single = build([], [hindu])[0]
        both = build([], [hindu, express])[0]
        self.assertEqual(single["scoreParts"]["coverage"], 8)
        self.assertEqual(both["scoreParts"]["coverage"], 16)
        self.assertEqual(len(both["discovery"]), 2)
        self.assertGreaterEqual(both["score"], 30)
        explained = news("Karnataka reservation law: why the High Court struck it down", "explained",
                         url="https://indianexpress.com/explained/k/", publisher="The Indian Express")
        rich = build([], [hindu, express, explained])[0]
        self.assertEqual(rich["scoreParts"]["coverage"], 20)

    def test_two_newspapers_make_a_topic_at_least_useful(self):
        rows = build([], [
            news("Retail inflation rises to 23-month high on food and fuel prices", url="https://www.thehindu.com/i.ece"),
            news("September retail inflation at 23-month high as food prices climb", publisher="The Indian Express",
                 url="https://indianexpress.com/i/"),
        ])
        self.assertEqual(len(rows), 1)
        self.assertGreaterEqual(rows[0]["score"], 40)

    def test_international_records_without_india_angle_are_capped(self):
        far = record("eu", "Ukraine: Council lists 77 individuals over illegal elections; sanctions on Russia",
                     "EU sanctions on Russia over Ukraine, bank and trade restrictions, multilateral. " * 10,
                     publisher="eu-council")
        near = record("un", "UN report: India leads poverty reduction as multilateral aid falls",
                      "Poverty, growth and employment data for India and the world bank. " * 10,
                      publisher="un-news")
        rows = {row["records"][0]["id"]: row for row in build([far, near])}
        self.assertLessEqual(rows["eu"]["score"], 40)
        self.assertNotIn("cap", rows["un"]["scoreParts"])
        bound = build([far], [news("EU lists 77 individuals over Ukraine elections in Russia sanctions push",
                                   "international")])
        self.assertNotIn("cap", bound[0]["scoreParts"])

    def test_anchor_name_words_match_without_alias(self):
        rows = build([], [news("Food and fuel drive September retail inflation to 23-month high", "business")],
                     )
        self.assertEqual(rows[0]["scoreParts"]["anchor"], 0)  # fixture atlas has no inflation anchor
        atlas = {"anchors": [{"id": "monetary-policy-and-inflation", "anchor": "Monetary policy and inflation",
                              "aliases": ["MPC", "repo rate"], "codes": ["GS3.1"], "frequency_est": 76}]}
        rows = build_candidates([], [news("Food and fuel drive September retail inflation to 23-month high", "business")],
                                WINDOW, pyq_bank=PYQ, patterns=atlas)
        self.assertEqual(rows[0]["scoreParts"]["anchor"], 8)
        self.assertEqual(rows[0]["anchorHint"], "Monetary policy and inflation")

    def test_company_results_and_local_crime_are_capped(self):
        for title, cap in (
            ("HCLTech posts 21% YoY jump in Q2 net profit on strong deal wins and revenue growth", 30),
            ("Stock markets tumble on oil price spike, FII outflows; Sensex drops 548 points", 30),
            ("Former security guard arrested for murder of five-year-old girl over ransom", 30),
            ("Cuddalore Collector urges farmers to insure Samba paddy crops against rainfall risks", 35),
        ):
            rows = build([], [news(title, "explained", url="https://x.example/" + title[:5]),
                              news(title, publisher="The Indian Express", url="https://y.example/" + title[:5])])
            self.assertLessEqual(rows[0]["score"], cap, title)

    def test_election_and_constitutional_keywords_fit_the_syllabus(self):
        rows = build([], [news("13.60 lakh names dropped from final electoral rolls after SIR in Punjab")])
        self.assertIn("GS2.4", rows[0]["codesHint"])
        rows = build([], [news("Karnataka High Court strikes down reservation law, declares it unconstitutional")])
        self.assertEqual(rows[0]["scoreParts"]["syllabus"], 25)

    def test_ordering_is_deterministic_by_score_then_title(self):
        records = [
            record("x", "Zeta committee reviews groundwater irrigation for farmers"),
            record("y", "Alpha committee reviews groundwater irrigation for farmers in drylands"),
            record("z", "Prime Minister greets citizens"),
        ]
        first = build(records)
        second = build(list(reversed(records)))
        self.assertEqual([row["fingerprint"] for row in first], [row["fingerprint"] for row in second])
        scores = [(-row["score"], row["title"]) for row in first]
        self.assertEqual(scores, sorted(scores))

    def test_bands_follow_thresholds(self):
        for row in build([record("c", "Coal stocks at power plants remain stable above 18 MT"),
                          record("e", "Speech by the President at a dinner", publisher="eu-council")]):
            expected = "must" if row["score"] >= NOTE_FLOOR else "useful" if row["score"] >= FACT_FLOOR else "skip"
            self.assertEqual(row["band"], expected)
            self.assertTrue(0 <= row["score"] <= 100)


if __name__ == "__main__":
    unittest.main()
