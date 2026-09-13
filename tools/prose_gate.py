"""Fail the build when judge-facing prose reads as machine-written or contains forbidden claims.

Covers README.md and docs/*.md in full, plus video/narration.json (captionText and speechText)
and frontend/index.html for em dashes and stale claims.

Run: python tools/prose_gate.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

BANNED_WORDS = ("leverage", "robust", "seamless", "comprehensive", "delve")
BANNED_PHRASES = ("in today's world",)
FORBIDDEN_CLAIMS = ("compliant",)
FORBIDDEN_VERDICTS = (
    "legally cleared",
    "zero risk",
    "all rules verified",
    "safe to sign",
)
# Claims from earlier drafts that no longer describe the product. Matched case-insensitively.
STALE_CLAIMS = (
    "claude 3.5 haiku",
    "claude-3-5-haiku",
    "agentcore powers",
    "react 18",
    "merkle",
    "71 unit",
    "37 unit",
    "100% statement",
    "100% branch",
    "under 50ms",
    "$0.00 idle",
    "airtight",
    "zero mathematical hallucinations",
    "pre-llm pii",
    "3-column",
    "mediamarkt",
    "munich",
)

EM_DASH = "\u2014"
NARRATION = pathlib.Path("video/narration.json")
INDEX_HTML = pathlib.Path("frontend/index.html")


def targets() -> list[pathlib.Path]:
    files = [pathlib.Path("README.md")]
    files += sorted(pathlib.Path("docs").glob("*.md"))
    return [f for f in files if f.is_file()]


def stale_problems(label: str, text: str) -> list[str]:
    found: list[str] = []
    if EM_DASH in text:
        found.append(f"{label}: em dash")
    lowered = text.lower()
    for claim in STALE_CLAIMS:
        if claim in lowered:
            found.append(f"{label}: stale claim {claim!r}")
    return found


def problems_in(path: pathlib.Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    found: list[str] = []

    for index, line in enumerate(text.splitlines(), start=1):
        if EM_DASH in line:
            found.append(f"{path}:{index}: em dash")
        for word in BANNED_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", line, re.I):
                found.append(f"{path}:{index}: banned word {word!r}")
        for phrase in BANNED_PHRASES:
            if phrase in line.lower():
                found.append(f"{path}:{index}: banned phrase {phrase!r}")
        for word in FORBIDDEN_CLAIMS:
            if re.search(rf"\b{word}\b", line, re.I):
                found.append(f"{path}:{index}: forbidden claim {word!r}")
        for verdict in FORBIDDEN_VERDICTS:
            if verdict in line.lower():
                found.append(f"{path}:{index}: forbidden verdict {verdict!r}")
        for claim in STALE_CLAIMS:
            if claim in line.lower():
                found.append(f"{path}:{index}: stale claim {claim!r}")
    return found


def narration_problems(path: pathlib.Path) -> list[str]:
    """Check every beat's caption and speech text; a malformed file is itself a failure."""
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
        segments = spec["segments"]
    except (OSError, ValueError, KeyError, TypeError):
        return [f"{path}: narration is not a readable spec with segments"]
    found: list[str] = []
    for position, segment in enumerate(segments, start=1):
        if not isinstance(segment, dict):
            found.append(f"{path}: segment {position} is not an object")
            continue
        identifier = str(segment.get("id", position))
        for field in ("captionText", "speechText"):
            value = segment.get(field)
            if not isinstance(value, str) or not value.strip():
                found.append(f"{path}: segment {identifier} lacks {field}")
                continue
            found.extend(stale_problems(f"{path}:{identifier}.{field}", value))
    return found


def html_problems(path: pathlib.Path) -> list[str]:
    found: list[str] = []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        found.extend(stale_problems(f"{path}:{index}", line))
    return found


def main() -> int:
    files = targets()
    if not files:
        print("no judge-facing prose found, which is itself wrong")
        return 1

    found: list[str] = []
    for path in files:
        found.extend(problems_in(path))
    checked = [str(f) for f in files]
    if NARRATION.is_file():
        found.extend(narration_problems(NARRATION))
        checked.append(str(NARRATION))
    if INDEX_HTML.is_file():
        found.extend(html_problems(INDEX_HTML))
        checked.append(str(INDEX_HTML))

    if found:
        print("judge-facing prose issues detected:")
        for problem in found:
            print(f"  {problem}")
        return 1

    print(f"prose gate passed over {len(checked)} file(s): " + ", ".join(checked))
    return 0


if __name__ == "__main__":
    sys.exit(main())
