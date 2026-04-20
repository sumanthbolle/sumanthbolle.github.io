#!/usr/bin/env python3
"""Parse '1. ServiceNow CSA 5.pdf' and merge clean question records into
quiz-questions.json under the csa_dumps_live category.

The script is idempotent and safe to re-run:
  - Each parsed question gets a stable id derived from a hash of its prompt.
  - Existing items in csa_dumps_live with the same id are replaced in place
    (so corrections re-applied here propagate without creating duplicates).
  - Items with no parseable answer key are skipped (and logged).

Corrections applied on top of the raw PDF text are documented inline in
CORRECTIONS / DROPS so the source of every override is auditable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = Path(
    os.environ.get(
        "CSA_PDF5_PATH",
        "/home/ubuntu/.cursor/projects/workspace/uploads/1._ServiceNow_CSA_5.pdf",
    )
)
DEFAULT_QUESTIONS_JSON = REPO_ROOT / "quiz-questions.json"
SOURCE_TAG = "CSA_5.pdf"
SOURCE_SET = "csa_dumps_live_pdf5"

ANSWER_LETTERS = "ABCDEFGHIJK"


# ---------------------------------------------------------------------------
# Corrections derived from the manual review.
#
# Keys are 1-based question ordinals as they appear in the PDF (in document
# order, counting both "Next Question is:" and "QUESTION >>" blocks).  Each
# entry can override:
#   - "correct":   list of 0-based option indices (replaces parsed answer).
#   - "explanation": replacement explanation text (parsed text is discarded).
#   - "options":   replacement option strings.
#   - "needs_review": True flags the item so it can be filtered out of strict
#                     exam modes if desired.
#   - "difficulty": override difficulty.
# ---------------------------------------------------------------------------
CORRECTIONS: Dict[int, Dict] = {
    # §1 — definitively-wrong answer keys
    53: {  # "Which of the following statements describes how data is organized in a table?"
        "correct": [1],  # B
        "explanation": (
            "A column represents one field in the table and a record represents one row "
            "(one set of field values). The dump's original key (A) describes a record as "
            "'one user', which is incorrect."
        ),
    },
    83: {  # Latin America time zone
        "correct": [1],  # B
        "explanation": (
            "Time zone is a per-user setting; the user should set it from the gear/user "
            "preferences. The instance time zone must not be changed for a single user."
        ),
    },
    108: {  # Flow trigger
        "correct": [2],  # C
        "explanation": (
            "Record-based triggers cause a flow to run after a record is created or updated. "
            "There is no 'Updated-date trigger' in Flow Designer."
        ),
    },
    117: {  # User cannot see modules
        "correct": [3],  # D
        "explanation": (
            "Use Impersonate to see the platform exactly as the affected user does. This is "
            "the standard admin debugging path; Connect Chat does not show what modules are "
            "rendered for the user."
        ),
    },
    134: {  # Return after impersonation
        "correct": [2],  # C
        "explanation": (
            "Use the dedicated 'End Impersonation' action from the user menu. Logging out and "
            "back in works but is not the 'best' way."
        ),
    },
    164: {  # Core tables
        "correct": [2],  # C
        "explanation": (
            "Task, User, and Configuration Item are the canonical core tables on the platform. "
            "Incident extends Task; sys_user holds users; cmdb_ci is the base CI table."
        ),
    },

    # §2 — truncated / corrupted option text fixes
    30: {  # Workflows moved between instances
        "options": [
            "Workflows are moved using Update Sets",
            "Workflows are moved using Transform Maps",
            "Workflows are moved using Application Sets",
            "Workflows cannot be moved between instances",
        ],
        "correct": [0],
        "explanation": "Workflows are tracked customizations and move between instances via Update Sets.",
    },
    33: {  # Stats module / stats.do
        "explanation": (
            "Admins navigate to stats.do (often labeled the 'Stats' page) to see the build and "
            "release information for the instance."
        ),
    },

    # §3 — items with answer-key annotations bleeding into options.
    # The Business Rule 'Choose four' question (78) has stray '×' markers
    # mixed into option text from the source author.  Replace with clean
    # options; keep the same 4 keyed answers (B, C, H, I).
    78: {
        "options": [
            "UI action",
            "Table",
            "Fields to update",
            "Who can run / When to run",
            "Script to run (optional)",
            "Application scope (auto-filled)",
            "Update set",
            "Timing",
            "Condition to evaluate",
        ],
        "correct": [1, 2, 7, 8],  # B, C, H, I
        "needs_review": True,
        "explanation": (
            "Source dump's answer key is internally inconsistent (annotations contradict the "
            "letters). Kept as-is for parity with the dump but flagged for review."
        ),
    },

    # Highlight ambiguous items as needs_review so a future strict mode can
    # exclude them.  The answer keys are kept as the source provided them.
    12: {"needs_review": True},   # App Navigator search overlap
    29: {"needs_review": True},   # Variable Types — multiple options valid
    70: {"needs_review": True},   # "Not in Update Set" includes Schedules / DB changes
    75: {"needs_review": True},   # T-shirt user criteria — fictional roles
    80: {"needs_review": True},   # Quick report from list — multiple plausible
    85: {"needs_review": True},   # Catalog testing best practices — annotations contradict key
    94: {"needs_review": True},   # 'Parent Catalog' isn't a standard concept
    100: {"needs_review": True},  # Run vs Execute Transform
    101: {"needs_review": True},  # Group records on list — non-standard wording
    104: {"needs_review": True},  # Update multiple records — terminology mismatch
    105: {"needs_review": True},  # KB Categories — source annotated ???
    110: {"needs_review": True},  # KB module — Self Service vs Knowledge Bases
    111: {"needs_review": True},  # 'across all applications' fits Data Policy better
    112: {"needs_review": True},  # 'Approving Manager' not a standard persona
    115: {"needs_review": True},  # First step for importing — 'Load Data' is canonical
    126: {"needs_review": True},  # 'Form Design' wording
    128: {"needs_review": True},  # Hamburger vs Context Menu both used
    132: {"needs_review": True},  # 'Network Server' isn't a standard data source
    138: {"needs_review": True},  # Operator vs Operation
    139: {"needs_review": True},  # Role definition
    140: {"needs_review": True},  # Blank page — multiple plausible reasons
    145: {"needs_review": True},  # 'Data pill runtime value' non-standard
    159: {"needs_review": True},  # UI16 attribute list debatable
    166: {"needs_review": True},  # 'Page Header' isn't a Form Designer section
    176: {"needs_review": True},  # withRoles() isn't a public FlowAPI method
    178: {"needs_review": True},  # Property doesn't match question
    179: {"needs_review": True},  # 'Data filtration' non-standard
    193: {"needs_review": True},  # KB template Preview text — 'random text' suspect
}

# Question ordinals to drop entirely (irrecoverable parsing or factually
# wrong without a defensible correction).  Currently empty — every question
# is parsed and either corrected or flagged.
DROPS: set = set()


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------
def extract_pdf_text(path: Path) -> str:
    """Return all text from the PDF, joined by newlines, stripped of NULs."""
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("pypdf is required: pip install pypdf") from exc

    reader = PdfReader(str(path))
    parts: List[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            parts.append("")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Block splitting
# ---------------------------------------------------------------------------
QUESTION_HEADER_RE = re.compile(
    r"(?:^|\n)\s*(?:Next Question is:|QUESTION\s*>{1,2})\s*\n",
    re.IGNORECASE,
)


def split_question_blocks(raw: str) -> List[str]:
    """Split raw PDF text into per-question chunks, preserving order."""
    sections = QUESTION_HEADER_RE.split(raw)
    sections = sections[1:] if sections else []
    return [s.strip() for s in sections if s.strip()]


# ---------------------------------------------------------------------------
# Question parser
# ---------------------------------------------------------------------------
ANSWER_LINE_RE = re.compile(
    r"^\s*(?:Correct Answer is:|~~\s*ANSWER\s*~~)\s*(.*?)\s*$",
    re.IGNORECASE,
)
PAGE_MARKER_RE = re.compile(r"--\s*\d+\s+of\s+\d+\s*--")
OPTION_LINE_RE = re.compile(r"^\s*([A-K])\.\s+(.*)$")
ANSWER_LETTER_RE = re.compile(r"[A-K]")
SELECT_HINT_RE = re.compile(
    r"\bSelect\s+(\d+)\s+Answers?\b|\(\s*Choose\s+(one|two|three|four|five|six)\s*\.?\s*\)",
    re.IGNORECASE,
)
WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8,
}


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_answer_letters(raw: str, option_count: int) -> List[str]:
    """Return the unique uppercase letters from an answer line, only those
    that fall within the option count.

    The input is the text after 'Correct Answer is:' or '~~ ANSWER ~~'.
    To avoid false positives like 'Option B stats.do' (where a/d would be
    incorrectly captured), we restrict ourselves to:
      * the substring up to the first sequence of >=2 alphabetic chars that
        is not a recognized connector ("Option", "and", "or"); and
      * uppercase or single-letter tokens delimited by non-alphabetic chars.
    """
    text = raw.strip()
    text = re.sub(r"^\s*Option\s*", "", text, flags=re.IGNORECASE)
    valid = set(ANSWER_LETTERS[:option_count])
    head_segments: List[str] = []
    for token in re.split(r"([A-Za-z]+|[^A-Za-z])", text):
        if not token:
            continue
        if token.isalpha() and len(token) > 1:
            if token.lower() in {"and", "or"}:
                head_segments.append(" ")
                continue
            upper = token.upper()
            if all(ch in valid for ch in upper):
                # Concatenated answer letters such as 'ACDF' or 'BCHI'.
                head_segments.append(upper)
                continue
            break
        head_segments.append(token)
    head = "".join(head_segments).upper()

    out: List[str] = []
    for ch in head:
        if ch in valid and ch not in out:
            out.append(ch)
    return out


def parse_question_block(block: str) -> Optional[Dict]:
    """Parse a single question block.

    Returns None if the block could not be parsed (no answer, no options).
    """
    block = PAGE_MARKER_RE.sub("\n", block)

    answer_match = None
    answer_line_idx = -1
    raw_lines = block.splitlines()
    for i, line in enumerate(raw_lines):
        m = ANSWER_LINE_RE.match(line)
        if m:
            answer_match = m
            answer_line_idx = i
            break
    if not answer_match:
        return None

    pre_answer_lines = raw_lines[:answer_line_idx]
    post_answer_lines = raw_lines[answer_line_idx + 1 :]

    # Walk pre-answer lines to find the last option block.  Options are
    # contiguous lines that start with a single letter "A. ", "B. ", etc.
    option_chunks: List[Tuple[str, List[str]]] = []
    current_letter: Optional[str] = None
    current_buf: List[str] = []
    prompt_lines: List[str] = []
    in_options = False

    for line in pre_answer_lines:
        m = OPTION_LINE_RE.match(line)
        if m:
            if current_letter is not None:
                option_chunks.append((current_letter, current_buf))
            current_letter = m.group(1)
            current_buf = [m.group(2)]
            in_options = True
        elif in_options and line.strip():
            # Continuation of the previous option.
            current_buf.append(line.strip())
        elif in_options and not line.strip():
            # Blank line inside options — keep accumulating in case of
            # multi-paragraph option text.
            continue
        else:
            prompt_lines.append(line)
    if current_letter is not None:
        option_chunks.append((current_letter, current_buf))

    if not option_chunks:
        return None

    # Validate option letters are in order starting at A.  If not, treat as
    # malformed and reject.
    expected = [ANSWER_LETTERS[i] for i in range(len(option_chunks))]
    actual = [letter for letter, _ in option_chunks]
    if actual != expected:
        # Try to keep going only if letters are a strict prefix; otherwise drop.
        if "".join(actual) not in ANSWER_LETTERS:
            return None

    options = [normalize_whitespace(" ".join(buf)) for _, buf in option_chunks]
    options = [strip_dump_artifacts(opt) for opt in options]
    options = [opt for opt in options if opt]
    if len(options) < 2:
        return None

    prompt = normalize_whitespace(" ".join(prompt_lines))
    prompt = strip_dump_artifacts(prompt)
    if not prompt:
        return None

    correct_letters = extract_answer_letters(answer_match.group(1), len(options))
    if not correct_letters:
        return None
    correct = [ANSWER_LETTERS.index(c) for c in correct_letters]
    if any(idx >= len(options) for idx in correct):
        return None

    explanation = normalize_whitespace(" ".join(post_answer_lines))
    explanation = strip_dump_artifacts(explanation)

    multi_hint = None
    sm = SELECT_HINT_RE.search(prompt)
    if sm:
        if sm.group(1):
            multi_hint = int(sm.group(1))
        elif sm.group(2):
            multi_hint = WORD_TO_NUM.get(sm.group(2).lower())

    return {
        "prompt": prompt,
        "options": options,
        "correct": correct,
        "explanation": explanation,
        "multi_hint": multi_hint,
    }


def strip_dump_artifacts(text: str) -> str:
    """Remove visible scratch markers the source author left in the PDF."""
    if not text:
        return text
    # Drop "Select N Answers from the below options." instructional tail.
    text = re.sub(
        r"\s*Select\s+\d+\s+Answers?\s+from\s+the\s+below\s+options\.?\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )
    # Drop trailing '???' uncertainty markers.
    text = re.sub(r"\?{2,}\s*$", "?", text).rstrip()
    # Drop stray '×' characters used as inline strike-throughs.
    text = text.replace("×", "").strip()
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Stable id derivation
# ---------------------------------------------------------------------------
def derive_id(prompt: str) -> str:
    h = hashlib.sha1(prompt.lower().encode("utf-8")).hexdigest()[:10]
    return f"csa-dump5-{h}"


def difficulty_for(prompt: str, options: List[str], multi: bool) -> str:
    word_count = len(prompt.split()) + sum(len(o.split()) for o in options)
    if multi or word_count > 90:
        return "hard"
    if word_count > 45:
        return "medium"
    return "easy"


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------
def parsed_to_record(idx: int, parsed: Dict) -> Optional[Dict]:
    overrides = CORRECTIONS.get(idx, {})
    options = overrides.get("options", parsed["options"])
    correct = overrides.get("correct", parsed["correct"])

    if any(i >= len(options) for i in correct):
        # Override is inconsistent with options length.
        return None

    explanation = overrides.get("explanation") or parsed["explanation"]
    if not explanation:
        explanation = "Detailed explanation not provided in the source dump."

    multi_hint = parsed.get("multi_hint")
    is_multi = bool(multi_hint and multi_hint > 1) or len(correct) > 1

    record = {
        "id": derive_id(parsed["prompt"]),
        "q": parsed["prompt"],
        "type": "mcq",
        "difficulty": overrides.get(
            "difficulty",
            difficulty_for(parsed["prompt"], options, is_multi),
        ),
        "options": options,
        "correct": correct,
        "explanation": explanation,
        "source": SOURCE_TAG,
        "sourceSet": SOURCE_SET,
    }
    if is_multi:
        record["multi"] = max(len(correct), multi_hint or len(correct))
    if overrides.get("needs_review"):
        record["needsReview"] = True
    return record


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", default=str(DEFAULT_PDF))
    parser.add_argument("--questions-json", default=str(DEFAULT_QUESTIONS_JSON))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    pdf_path = Path(args.pdf)
    json_path = Path(args.questions_json)
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1
    if not json_path.exists():
        print(f"questions JSON not found: {json_path}", file=sys.stderr)
        return 1

    raw = extract_pdf_text(pdf_path)
    blocks = split_question_blocks(raw)
    print(f"Extracted {len(blocks)} question blocks from PDF.")

    parsed_records: List[Dict] = []
    skipped: List[Tuple[int, str]] = []
    for idx, block in enumerate(blocks, start=1):
        if idx in DROPS:
            skipped.append((idx, "dropped via DROPS list"))
            continue
        parsed = parse_question_block(block)
        if parsed is None:
            preview = block.replace("\n", " ")[:80]
            skipped.append((idx, f"unparseable block: {preview!r}"))
            continue
        record = parsed_to_record(idx, parsed)
        if record is None:
            skipped.append((idx, "correction inconsistent with options"))
            continue
        parsed_records.append(record)

    # Deduplicate by id (last write wins).
    by_id: Dict[str, Dict] = {}
    for rec in parsed_records:
        by_id[rec["id"]] = rec
    new_records = list(by_id.values())
    print(f"Produced {len(new_records)} clean records ({len(skipped)} skipped).")
    for idx, reason in skipped:
        print(f"  skip Q#{idx}: {reason}")

    with json_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    bucket: List[Dict] = data.setdefault("csa_dumps_live", [])
    existing_ids = {q.get("id") for q in bucket if isinstance(q, dict)}
    new_ids = {rec["id"] for rec in new_records}

    additions = [rec for rec in new_records if rec["id"] not in existing_ids]
    replacements = [rec for rec in new_records if rec["id"] in existing_ids]

    if replacements:
        replacement_by_id = {rec["id"]: rec for rec in replacements}
        for i, q in enumerate(bucket):
            if isinstance(q, dict) and q.get("id") in replacement_by_id:
                bucket[i] = replacement_by_id[q["id"]]
    bucket.extend(additions)

    print(
        f"Adding {len(additions)} new csa_dumps_live items, "
        f"updating {len(replacements)} existing items "
        f"(bucket size now {len(bucket)})."
    )

    if args.dry_run:
        print("--dry-run: not writing changes.")
        return 0

    with json_path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"Wrote {json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
