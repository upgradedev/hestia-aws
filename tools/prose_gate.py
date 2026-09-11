"""Fail the build when judge-facing prose reads as machine-written or contains forbidden claims.

Covers README.md and docs/*.md.

Run: python tools/prose_gate.py
"""

from __future__ import annotations

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

EM_DASH = "\u2014"


def targets() -> list[pathlib.Path]:
    files = [pathlib.Path("README.md")]
    files += sorted(pathlib.Path("docs").glob("*.md"))
    return [f for f in files if f.is_file()]


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
    return found


def main() -> int:
    files = targets()
    if not files:
        print("no judge-facing prose found, which is itself wrong")
        return 1

    found: list[str] = []
    for path in files:
        found.extend(problems_in(path))

    if found:
        print("judge-facing prose issues detected:")
        for problem in found:
            print(f"  {problem}")
        return 1

    print(f"prose gate passed over {len(files)} file(s): " + ", ".join(str(f) for f in files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
