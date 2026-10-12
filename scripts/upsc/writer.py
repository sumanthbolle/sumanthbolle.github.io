#!/usr/bin/env python3
"""Write one edition note with an LLM, then gate it deterministically.

The model sees only the evidence list, the canonical code list and a short
list of PYQ options. Sources, papers and read time are attached here from
the evidence, so the model cannot cite a URL it was not given.
"""

import json
import math
import os
from pathlib import Path
import re
import sys
from typing import Any, Callable, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.upsc.candidates import CODE_LABELS
from scripts.upsc.note_gate import check_note, word_count


SYSTEM_PROMPT_PATH = Path(__file__).with_name("prompts") / "note_system.txt"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
NOTE_KEYS = (
    "title", "deck", "oneLine", "subject", "codes", "anchor", "whyInNews",
    "sections", "keyNumbers", "back2basics", "wayForward", "misconception", "practice",
)
SOURCE_KEYS = ("n", "title", "publisher", "url", "date", "kind")
FEEDBACK_HINTS = {
    "unsupported-number": "is not in the evidence. Remove it, or use a figure copied exactly from the evidence.",
    "faq-number-not-in-body": "appears in an FAQ answer but not in the note body. Use only numbers already in the body.",
    "banned": "is a banned phrase. Rewrite the sentence plainly.",
    "section-without-source": "has no valid evidence n in its sources. Cite at least one evidence n.",
    "bad-code": "is not an allowed code (or there are more than 3). Choose 1 to 3 codes from allowedCodes.",
    "empty-section": "is a section with no bullet text. Fill it from the evidence or remove the section.",
    "missing": "is missing or empty. Add it in the schema shape.",
    "heading-not-question": "is a section heading that is not a question ending with '?'.",
    "pyq-not-in-bank": "Choose practice.pyq only by an id from pyqOptions, or omit it.",
    "discovery-source-on-news": "A newspaper source cannot be used on a news note.",
    "bad-mcq": "The MCQ needs a stem, 4 distinct options, answer 0-3 and a trap.",
    "invalid-json": "Your reply was not a single JSON object. Return only the JSON object.",
}


def _system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def _feedback_line(reason: str) -> str:
    key, _, value = reason.partition(":")
    hint = FEEDBACK_HINTS.get(key, "Fix this problem.")
    return f"{reason} — {value + ' ' if value else ''}{hint}".strip()


def build_messages(
    candidate: Mapping[str, Any],
    evidence: list[dict[str, Any]],
    pyq_options: list[dict[str, Any]],
    feedback: list[str],
) -> list[dict[str, str]]:
    kind = str(candidate.get("kind") or "news")
    payload: dict[str, Any] = {
        "topic": candidate.get("title", ""),
        "kind": kind,
        "allowedCodes": [{"code": code, "label": label} for code, label in CODE_LABELS.items()],
        "suggestedCodes": list(candidate.get("codesHint") or []),
        "anchorHint": candidate.get("anchorHint", ""),
        "pyqOptions": [
            {key: row.get(key) for key in ("id", "year", "paper", "exam", "question")}
            for row in pyq_options
        ],
        "evidence": [
            {key: row.get(key) for key in ("n", "title", "publisher", "date", "url", "kind", "text")}
            for row in evidence
        ],
    }
    brief = candidate.get("editor")
    if isinstance(brief, Mapping):
        payload["editorBrief"] = {key: brief.get(key, "") for key in ("why", "prelimsAngle", "mainsAngle")}
    if feedback:
        payload["previousAttemptProblems"] = [_feedback_line(reason) for reason in feedback]
    return [
        {"role": "system", "content": _system_prompt()},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, indent=1)},
    ]


def _post(transport: Callable[..., Any], url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        method="POST",
    )
    with transport(request, timeout=120) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("LLM response exceeded 2 MiB")
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("LLM response is not an object")
    return parsed


def _openai(messages: list[dict[str, str]], transport: Callable[..., Any], env: Mapping[str, str]) -> str:
    reply = _post(transport, OPENAI_URL, {"Authorization": "Bearer " + env["OPENAI_API_KEY"]}, {
        "model": env.get("UPSC_EDITION_MODEL") or DEFAULT_OPENAI_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    })
    return str(reply["choices"][0]["message"]["content"])


def _gemini(messages: list[dict[str, str]], transport: Callable[..., Any], env: Mapping[str, str]) -> str:
    system = "\n\n".join(row["content"] for row in messages if row["role"] == "system")
    user = "\n\n".join(row["content"] for row in messages if row["role"] != "system")
    model = env.get("UPSC_EDITION_GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    reply = _post(transport, GEMINI_URL.format(model=model), {"x-goog-api-key": env["GEMINI_API_KEY"]}, {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3},
    })
    return str(reply["candidates"][0]["content"]["parts"][0]["text"])


def _error_text(error: BaseException) -> str:
    if isinstance(error, HTTPError):
        return f"HTTP {error.code}"
    if isinstance(error, URLError):
        return f"network error: {error.reason}"[:200]
    return (str(error) or error.__class__.__name__)[:200]


def call_llm(
    messages: list[dict[str, str]],
    transport: Callable[..., Any] = urlopen,
    env: Optional[Mapping[str, str]] = None,
) -> str:
    """OpenAI first, Gemini on failure. Raises RuntimeError('no-llm-key') without keys."""
    env = os.environ if env is None else env
    providers = [
        (name, call) for name, call, key in (
            ("openai", _openai, "OPENAI_API_KEY"), ("gemini", _gemini, "GEMINI_API_KEY"),
        ) if env.get(key)
    ]
    if not providers:
        raise RuntimeError("no-llm-key")
    failures = []
    for name, call in providers:
        try:
            return call(messages, transport, env)
        except RuntimeError as error:
            if str(error) == "no-llm-key":
                raise
            failures.append(f"{name}: {_error_text(error)}")
        except Exception as error:  # provider boundary: try the next one
            failures.append(f"{name}: {_error_text(error)}")
            if isinstance(error, HTTPError):
                error.close()
    raise RuntimeError("llm-failed: " + "; ".join(failures))


def _parse(raw: str) -> Optional[dict[str, Any]]:
    text = str(raw or "").strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _finalise(
    raw: dict[str, Any],
    candidate: Mapping[str, Any],
    evidence: list[dict[str, Any]],
    pyq_options: list[dict[str, Any]],
) -> dict[str, Any]:
    note: dict[str, Any] = {key: raw[key] for key in NOTE_KEYS if key in raw}
    if not str(note.get("misconception") or "").strip():
        note.pop("misconception", None)
    note.setdefault("wayForward", [])
    note["kind"] = str(candidate.get("kind") or "news")
    note["sources"] = [{key: row.get(key) for key in SOURCE_KEYS} for row in evidence]
    codes = note.get("codes") if isinstance(note.get("codes"), list) else []
    note["papers"] = list(dict.fromkeys(str(code).split(".", 1)[0] for code in codes))
    practice = note.get("practice")
    if isinstance(practice, dict) and practice.get("pyq") is not None:
        chosen = practice["pyq"] if isinstance(practice["pyq"], dict) else {}
        option = next((row for row in pyq_options if row.get("id") == chosen.get("id")), None)
        if option:
            practice["pyq"] = {
                "id": option["id"], "year": option.get("year"), "paper": option.get("paper"),
                "marks": option.get("marks"), "question": option.get("question"),
                "why": str(chosen.get("why") or ""),
            }
            if practice["pyq"]["marks"] is None:
                practice["pyq"].pop("marks")
        elif not chosen:
            practice.pop("pyq")
    note["readTime"] = max(1, math.ceil(word_count(note) / 200))  # whole minutes
    return note


def evidence_text(evidence: list[dict[str, Any]]) -> str:
    return "\n".join(f"{row.get('title', '')}\n{row.get('text', '')}" for row in evidence)


def write_note(
    candidate: Mapping[str, Any],
    evidence: list[dict[str, Any]],
    pyq_options: list[dict[str, Any]],
    transport: Callable[..., Any] = urlopen,
    max_attempts: int = 2,
    env: Optional[Mapping[str, str]] = None,
) -> tuple[Optional[dict[str, Any]], list[str]]:
    """Return (gated note, []) or (None, reasons). Never raises on LLM failure."""
    text = evidence_text(evidence)
    pyq_ids = {str(row.get("id")) for row in pyq_options if row.get("id")}
    reasons: list[str] = []
    for _ in range(max(1, max_attempts)):
        try:
            raw = call_llm(build_messages(candidate, evidence, pyq_options, reasons), transport, env)
        except RuntimeError as error:
            if str(error) == "no-llm-key":
                return None, ["llm-unavailable"]
            return None, ["llm-unavailable", str(error)[:240]]
        except Exception as error:  # transport raised outside call_llm's provider loop
            return None, ["llm-unavailable", _error_text(error)]
        parsed = _parse(raw)
        if parsed is None:
            reasons = ["invalid-json"]
            continue
        note = _finalise(parsed, candidate, evidence, pyq_options)
        reasons = check_note(note, text, pyq_ids)
        if not reasons:
            return note, []
    return None, reasons
