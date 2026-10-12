#!/usr/bin/env python3
"""Bind newspaper topics to official records, cluster same-story items, rank.

Scores are study priority, not exam prediction. Every input that cannot be
computed defaults to zero, so an uncertain topic falls to a lower band rather
than taking a Must Know slot.
"""

from datetime import datetime, timedelta
from hashlib import sha1
from pathlib import Path
import re
import sys
from typing import Any, Iterable, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.models import SYLLABUS_CODES
from scripts.upsc.publish import _read_json


ROOT = Path(__file__).resolve().parents[2]
PYQ_BANK_PATH = ROOT / "data/upsc/pyq-bank.json"
PATTERNS_PATH = ROOT / "data/upsc-patterns.json"

# Mirrors api/upsc.js SYLLABUS_CODES so the writer can show labels.
CODE_LABELS = {
    "GS1.1": "Indian art, culture, architecture, literature — ancient to modern",
    "GS1.2": "Modern Indian history: mid-18th century to present; freedom struggle",
    "GS1.3": "Post-independence consolidation and reorganisation",
    "GS1.4": "World history: industrial revolution, wars, decolonisation, political philosophies",
    "GS1.5": "Indian society: salient features, diversity, role of women, population",
    "GS1.6": "Social issues: poverty, urbanisation, communalism, regionalism, secularism",
    "GS1.7": "Effects of globalisation on Indian society",
    "GS1.8": "Physical geography: geophysical phenomena, climatology, oceanography",
    "GS1.9": "Resource distribution, industrial location, changes in geographical features",
    "GS2.1": "Constitution: features, amendments, basic structure, comparison",
    "GS2.2": "Union and states: functions, issues in federal structure, devolution",
    "GS2.3": "Separation of powers, dispute redressal, constitutional bodies",
    "GS2.4": "Parliament and state legislatures, executive and judiciary structure",
    "GS2.5": "Governance: transparency, accountability, e-governance, citizen charters",
    "GS2.6": "Welfare schemes, vulnerable sections, social sector: health, education, HRD",
    "GS2.7": "Statutory, regulatory and quasi-judicial bodies; NGOs, SHGs, pressure groups",
    "GS2.8": "Role of civil services in a democracy",
    "GS2.9": "India and neighbourhood; bilateral, regional and global groupings",
    "GS2.10": "Effect of policies of developed and developing countries on India; diaspora",
    "GS3.1": "Indian economy: resource mobilisation, growth, development, employment",
    "GS3.2": "Government budgeting, inclusive growth, fiscal policy",
    "GS3.3": "Agriculture: cropping, irrigation, marketing, MSP, PDS, food processing",
    "GS3.4": "Land reforms, liberalisation effects, infrastructure, investment models",
    "GS3.5": "Environment: conservation, pollution, EIA, climate change, biodiversity",
    "GS3.6": "Science and technology: developments, applications, indigenisation, IPR",
    "GS3.7": "Disaster and disaster management",
    "GS3.8": "Internal security: extremism, external state and non-state actors",
    "GS3.9": "Security: communication networks, cyber security, money laundering, borders",
    "GS4.1": "Ethics and human interface: essence, determinants, consequences",
    "GS4.2": "Attitude, moral and political attitudes, social influence and persuasion",
    "GS4.3": "Aptitude and foundational values for civil service; emotional intelligence",
    "GS4.4": "Contributions of moral thinkers and philosophers, Indian and world",
    "GS4.5": "Public/civil service values and ethics in public administration",
    "GS4.6": "Probity in governance, RTI, codes of ethics and conduct, corporate governance",
    "GS4.7": "Case studies on the above",
    "ESSAY.A": "Essay — abstract / philosophical section",
    "ESSAY.B": "Essay — socio-economic / policy section",
}

# Word-start regex fragments per code; a trailing \b makes a short word exact.
SYLLABUS_KEYWORDS: dict[str, tuple[str, ...]] = {
    "GS1.1": ("heritage", "temple", "unesco", "monument", "handloom", "handicraft", "classical dance", "archaeolog", "manuscript"),
    "GS1.5": ("women", "gender", "demograph", "population", "tribal", "caste"),
    "GS1.6": ("poverty", "urbanis", "urbaniz", "slum", "communal", "migrant"),
    "GS1.8": ("monsoon", "el nino", "ocean", "glacier", "earthquake", "tsunami", "cyclone"),
    "GS1.9": ("critical mineral", "mineral", "mining", "industrial corridor"),
    "GS2.1": ("constitution", "amendment", "fundamental right", "article \\d", "preamble"),
    "GS2.2": ("federal", "centre-state", "finance commission", "devolution", "panchayat", "municipal", "governor"),
    "GS2.3": ("supreme court", "high court", "judgment", "verdict", "constitutional bod", "cag\\b", "election commission"),
    "GS2.4": ("parliament", "lok sabha", "rajya sabha", "bill\\b", "ordinance", "legislat", "assembly"),
    "GS2.5": ("e-governance", "transparency", "accountab", "grievance", "citizen", "digital public", "rti\\b"),
    "GS2.6": ("scheme", "welfare", "health", "education", "school", "nutrition", "child", "disabilit", "elderly", "pension", "hospital", "ayushman", "skill"),
    "GS2.7": ("commission", "regulator", "sebi\\b", "nhrc\\b", "trai\\b", "tribunal", "authority", "self-help"),
    "GS2.8": ("civil service", "bureaucra", "karmayogi", "lateral entry"),
    "GS2.9": ("bilateral", "summit", "bimstec", "saarc", "asean", "brics", "quad\\b", "sco\\b", "g20", "nepal", "bangladesh", "china", "pakistan", "sri lanka", "bhutan", "maldives", "myanmar", "afghanistan", "neighbour", "joint exercise", "strategic partnership", "foreign minister", "external affairs"),
    "GS2.10": ("diaspora", "united states", "european union", "eu\\b", "uk\\b", "russia", "ukraine", "sanction", "tariff", "wto\\b", "united nations", "un\\b", "unhcr", "refugee", "imf\\b", "world bank", "multilateral"),
    "GS3.1": ("inflation", "monetary", "repo\\b", "liquidity", "gdp\\b", "growth", "employment", "unemployment", "bank", "credit", "money supply", "investment", "rbi\\b", "export", "trade"),
    "GS3.2": ("budget", "fiscal", "deficit", "tax", "gst\\b", "revenue", "expenditure", "borrowing", "government securit", "dated securit"),
    "GS3.3": ("agricultur", "farmer", "crop", "msp\\b", "minimum support price", "krishi", "kisan", "pulses", "irrigation", "fertili", "food", "pds\\b", "fisher", "dairy", "horticultur", "seed"),
    "GS3.4": ("infrastructure", "railway", "rail", "port\\b", "ports\\b", "highway", "logistics", "power plant", "electricity", "coal", "energy", "msme", "manufactur", "industr", "telecom", "shipping", "aviation", "airport"),
    "GS3.5": ("climate", "environment", "biodiversity", "pollution", "forest", "wildlife", "tiger", "big cat", "emission", "carbon", "wetland", "conservation", "dust", "air quality", "caqm\\b", "net zero", "renewable", "cop\\d"),
    "GS3.6": ("space", "isro\\b", "satellite", "nuclear", "biotech", "semiconductor", "ai\\b", "artificial intelligence", "quantum", "research", "technolog", "vaccine", "patent", "drug discovery", "innovation"),
    "GS3.7": ("disaster", "flood", "landslide", "drought", "ndma\\b", "heatwave", "heat wave", "relief operation"),
    "GS3.8": ("terror", "insurgen", "extremis", "naxal", "maoist", "militan", "navy", "naval", "army", "defence", "missile", "submarine", "warship", "military"),
    "GS3.9": ("cyber", "money laundering", "pmla\\b", "narcotic", "smuggl", "seiz", "border", "fraud", "counterfeit"),
    "GS4.6": ("probity", "corruption", "code of conduct", "ethics", "integrity"),
}
_KEYWORD_RES = {
    code: tuple(re.compile(r"(?<![a-z0-9])" + fragment) for fragment in fragments)
    for code, fragments in SYLLABUS_KEYWORDS.items()
}

PUBLISHER_WEIGHTS = {
    "pib": 1.0, "rbi": 1.0, "sebi": 1.0, "mea": 1.0,
    "un-news": 0.7, "who": 0.7, "eu-council": 0.7,
}
CEREMONIAL = (
    "celebrat", "felicitat", "pays tribute", "greets", "condoles", "yoga day",
    "swachhata pledge", "pays homage", "offers prayers", "subhashitam",
    "birth anniversary", "extends wishes", "curtain raiser", "foundation day",
    "swachhata", "special campaign", " mela", "golden jubilee",
)
ROUTINE = (
    "money market operations", "auction of", "result of", "money supply",
    "reverse repo (vrrr) auction", "variable rate repo", "treasury bill",
    "weekly statistical supplement", "state government securities", "cash management bill",
    "lending facility", "auction under laf", "conversion/switch", "outlook survey",
    "launching of", "survey round", "expectations survey", "confidence survey",
)
CEREMONIAL_CAP = 30
ROUTINE_CAP = 35
FOREIGN_CAP = 40
COVERAGE_MAX = 20
INTERNATIONAL_PUBLISHERS = frozenset({"un-news", "who", "eu-council"})
INDIA_RE = re.compile(r"\b(india|indian|india's|new delhi|bharat)\b", re.I)
CONCEPTUAL_SECTIONS = ("explained", "editorial")

STOPWORDS = frozenset("""
a about above after against all also amid among an and any are around as at be been before being
between both but by can could did do does during each for from further had has have having he her
here hers him his how i if in into is it its itself just may me more most must my new no nor not
now of off on once only or other our out over own per same says said she should so some such than
that the their them then there these they this those through to too under until up upon very was
we were what when where which while who whom why will with would you your
india indian india's govt government union minister ministers ministry shri smt prime chief
secretary department national today day days year years held launches launch launched inaugurates
inaugurated calls called address english rendering first two three week weeks month months
approves approved approve cabinet lakh crore cent percent per hon'ble dr mr ms
january february march april may june july august september october november december
monday tuesday wednesday thursday friday saturday sunday
""".split())
TOKEN_RE = re.compile(r"[a-z][a-z0-9]*")


def tokens(text: str) -> set[str]:
    result: set[str] = set()
    for word in TOKEN_RE.findall(str(text or "").lower().replace("’", "'")):
        if len(word) < 3 or word in STOPWORDS or word.isdigit():
            continue
        if len(word) > 4 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
            word = word[:-1]
        if word not in STOPWORDS:
            result.add(word)
    return result


def _ranked_tokens(text: str) -> list[str]:
    words = tokens(text)
    return sorted(words, key=lambda word: (-len(word), word))[:8]


def fingerprint(text: str) -> str:
    top = sorted(_ranked_tokens(text))
    return sha1(" ".join(top).encode("utf-8")).hexdigest()[:16]


def similar(left: set[str], right: set[str]) -> bool:
    shared = len(left & right)
    if not left or not right:
        return False
    return shared >= 3 or (shared >= 2 and shared >= 0.5 * min(len(left), len(right)))


def _time(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def _in(value: str, start: datetime, end: datetime) -> bool:
    moment = _time(value)
    return moment is not None and start <= moment < end


def _load(path: Path, value: Any) -> Any:
    return value if value is not None else _read_json(path, {})


def _pyq_token_sets(pyq_bank: Any) -> list[set[str]]:
    rows = pyq_bank.get("questions") if isinstance(pyq_bank, dict) else pyq_bank
    result = []
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict):
            result.append(tokens(" ".join(row.get("tags") or []) + " " + str(row.get("question") or "")))
    return result


def _anchor_rows(patterns: Any) -> list[dict[str, Any]]:
    rows = patterns.get("anchors") if isinstance(patterns, dict) else patterns
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _phrase_in(phrase: str, text: str) -> bool:
    phrase = phrase.lower().strip()
    return bool(phrase) and re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text) is not None


def _text(cluster: dict[str, Any]) -> str:
    parts = []
    for row in cluster["records"]:
        parts.extend([row.get("title", ""), row.get("officialSummary", "")])
    parts.extend(row.get("title", "") for row in cluster["discovery"])
    return " ".join(str(part) for part in parts).lower()


def _syllabus(text: str) -> tuple[int, list[str], int]:
    hits: dict[str, int] = {}
    for code, patterns in _KEYWORD_RES.items():
        count = sum(1 for pattern in patterns if pattern.search(text))
        if count:
            hits[code] = count
    total = sum(hits.values())
    ranked = sorted(hits, key=lambda code: (-hits[code], code))
    return (25 if total >= 2 else 15 if total == 1 else 0), ranked, total


def _coverage(discovery: list[dict[str, Any]]) -> int:
    """Newspaper salience: distinct publishers, extra feeds, analysis sections (max 20)."""
    publishers = {str(row.get("publisher") or "") for row in discovery}
    feeds = {str(row.get("feedId") or "") for row in discovery}
    if not discovery:
        return 0
    score = 8 if len(publishers) == 1 else 16 if len(publishers) == 2 else 18
    score += min(2, max(0, len(feeds) - len(publishers)))
    if any(row.get("section") in CONCEPTUAL_SECTIONS for row in discovery):
        score += 6
    return min(COVERAGE_MAX, score)


def _foreign_only(cluster: dict[str, Any]) -> bool:
    """International-institution records with no India angle and no newspaper pickup."""
    records = cluster["records"]
    if not records or cluster["discovery"]:
        return False
    if any(str(row.get("publisherId") or "") not in INTERNATIONAL_PUBLISHERS for row in records):
        return False
    text = " ".join(f"{row.get('title', '')} {row.get('officialSummary', '')}" for row in records)
    return INDIA_RE.search(text) is None


def _score(
    cluster: dict[str, Any],
    window_start: datetime,
    pyq_sets: list[set[str]],
    anchors: list[dict[str, Any]],
) -> dict[str, Any]:
    text = _text(cluster)
    words = tokens(text)
    syllabus, codes, _ = _syllabus(text)
    primary = round(10 * max(
        (PUBLISHER_WEIGHTS.get(str(row.get("publisherId") or ""), 0.0) for row in cluster["records"]),
        default=0.0,
    ))
    best_pyq = max((len(words & pyq) for pyq in pyq_sets), default=0)
    pyq = 20 if best_pyq >= 4 else 15 if best_pyq == 3 else 10 if best_pyq == 2 else 0
    anchor_score, anchor_name = 0, ""
    for anchor in anchors:
        names = [str(anchor.get("anchor") or "")] + [str(alias) for alias in anchor.get("aliases") or []]
        if any(_phrase_in(name, text) for name in names):
            value = 15 if int(anchor.get("frequency_est") or 0) >= 60 else 10
            if value > anchor_score:
                anchor_score, anchor_name = value, str(anchor.get("anchor") or "")
                codes = codes + [code for code in anchor.get("codes") or [] if code not in codes]
    depth = 0
    if any(row.get("section") in CONCEPTUAL_SECTIONS for row in cluster["discovery"]):
        depth = 10
    elif any(len(str(row.get("officialSummary") or "")) >= 600 for row in cluster["records"]):
        depth = 6
    parts = {
        "syllabus": syllabus, "primary": primary, "pyq": pyq,
        "anchor": anchor_score, "depth": depth, "coverage": _coverage(cluster["discovery"]),
    }
    total = sum(parts.values())
    lead = " " + cluster["title"].lower()
    cap = min(
        CEREMONIAL_CAP if any(word in lead for word in CEREMONIAL) else 100,
        ROUTINE_CAP if any(word in lead for word in ROUTINE) else 100,
        FOREIGN_CAP if _foreign_only(cluster) else 100,
    )
    if total > cap:
        parts["cap"] = cap - total
        total = cap
    return {
        "score": total, "scoreParts": parts, "anchorHint": anchor_name,
        "codesHint": [code for code in codes if code in SYLLABUS_CODES][:3],
    }


def _band(score: int) -> str:
    return "must" if score >= 60 else "useful" if score >= 40 else "skip"


def build_candidates(
    records: Iterable[dict[str, Any]],
    discovery: Iterable[dict[str, Any]],
    window: tuple[str, str],
    pyq_bank: Any = None,
    patterns: Any = None,
) -> list[dict[str, Any]]:
    start, end = _time(window[0]), _time(window[1])
    if start is None or end is None:
        raise ValueError("window must be ISO timestamps")
    lookback = start - timedelta(hours=24)
    pool = sorted(
        (row for row in records if isinstance(row, dict) and row.get("id") and _in(row.get("publishedAt", ""), lookback, end)),
        key=lambda row: (row.get("publishedAt", ""), row["id"]),
    )
    clusters: list[dict[str, Any]] = []
    for row in pool:
        words = tokens(row.get("title", ""))
        target = next((c for c in clusters if c["records"] and any(similar(words, t) for t in c["tokens"])), None)
        if target is None:
            target = {"title": str(row.get("title") or ""), "records": [], "discovery": [], "tokens": []}
            clusters.append(target)
        target["records"].append(row)
        target["tokens"].append(words)
    for item in sorted(discovery, key=lambda row: (row.get("publishedAt", ""), row.get("url", ""))):
        if not _in(item.get("publishedAt", ""), start, end):
            continue
        words = tokens(item.get("title", ""))
        scored = [
            (max(len(words & t) for t in c["tokens"]), index)
            for index, c in enumerate(clusters) if any(similar(words, t) for t in c["tokens"])
        ]
        if scored:
            target = clusters[max(scored, key=lambda pair: (pair[0], -pair[1]))[1]]
        else:
            target = {"title": str(item.get("title") or ""), "records": [], "discovery": [], "tokens": []}
            clusters.append(target)
        target["discovery"].append(item)
        target["tokens"].append(words)
    pyq_sets = _pyq_token_sets(_load(PYQ_BANK_PATH, pyq_bank))
    anchors = _anchor_rows(_load(PATTERNS_PATH, patterns))
    candidates = []
    for cluster in clusters:
        fresh = cluster["discovery"] or any(_in(row.get("publishedAt", ""), start, end) for row in cluster["records"])
        if not fresh:
            continue
        scored = _score(cluster, start, pyq_sets, anchors)
        candidates.append({
            "fingerprint": fingerprint(cluster["title"]),
            "title": cluster["title"],
            "records": cluster["records"],
            "discovery": cluster["discovery"],
            "kind": "news" if cluster["records"] else "editorial",
            "band": _band(scored["score"]),
            **scored,
        })
    return sorted(candidates, key=lambda row: (-row["score"], row["title"], row["fingerprint"]))
