"""Build the Hestia diagrams into docs/assets.

usage: python tools/diagrams/build.py [name ...]   (no names: every known diagram)
Each module in this folder exposes build() -> str. Modules that do not exist
yet are skipped, so their current SVG stays as it is.
"""
from __future__ import annotations

import importlib
import re
import sys
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ASSETS = HERE.parents[1] / "docs" / "assets"

# name -> (module in this folder, file in docs/assets)
DIAGRAMS = {
    "overview": ("overview", "overview.svg"),
    "banner": ("banner", "banner.svg"),
    "infrastructure": ("infrastructure", "infrastructure.svg"),
    "request-flow": ("request_flow", "request-flow.svg"),
    "agents": ("agents", "agents.svg"),
    "release": ("release", "release.svg"),
}


def main(names: list[str]) -> int:
    names = names or list(DIAGRAMS)
    unknown = [n for n in names if n not in DIAGRAMS]
    if unknown:
        print(f"unknown diagram: {', '.join(unknown)} (known: {', '.join(DIAGRAMS)})",
              file=sys.stderr)
        return 2
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    failed = 0
    for name in names:
        module, file_name = DIAGRAMS[name]
        if not (HERE / f"{module}.py").exists():
            print(f"skip {name}: tools/diagrams/{module}.py does not exist yet")
            continue
        try:
            svg = importlib.import_module(module).build()
            if not isinstance(svg, str) or not svg.startswith("<svg"):
                raise TypeError(f"{module}.build() must return SVG text")
        except Exception:
            failed += 1
            print(f"FAIL {name}", file=sys.stderr)
            traceback.print_exc()
            continue
        ASSETS.mkdir(parents=True, exist_ok=True)
        with open(ASSETS / file_name, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(svg)
        size = re.search(r'width="(\d+)" height="(\d+)"', svg)
        dims = f"{size.group(1)}x{size.group(2)}" if size else "unknown size"
        print(f"wrote docs/assets/{file_name} ({dims})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
