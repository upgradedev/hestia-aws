"""Judge-facing Markdown renders the same in any viewer, and every diagram stays legible on GitHub.

Markdown: plain CommonMark with GFM tables, one title per document, no raw HTML or GitHub-only
alert syntax, resolvable relative links and heading anchors, alt text on every image, and a
language on every code fence. Diagrams: self-contained SVG with a title and an opaque background,
whose smallest text is still at least 11 px after GitHub scales the image into its 880 px column.
"""

from __future__ import annotations

import importlib.util
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DOCS = sorted((ROOT / "docs").glob("*.md"))
MARKDOWN = ("README.md", *(f"docs/{path.name}" for path in DOCS))
ASSETS = ROOT / "docs" / "assets"
SVGS = tuple(path.name for path in sorted(ASSETS.glob("*.svg")))
GITHUB_COLUMN_PX = 880
MIN_RENDERED_PX = 11
SVG = "{http://www.w3.org/2000/svg}"
TEXT_TAGS = (f"{SVG}text", f"{SVG}tspan")
BANNED_WORDS = ("leverage", "robust", "seamless", "comprehensive", "delve", "compliant")

FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
INLINE_CODE = re.compile(r"(`+)(.+?)\1")
AUTOLINK = re.compile(r"<(?:https?://|mailto:)[^>\s]+>")
RAW_HTML = re.compile(r"</?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?/?>")
ALERT = re.compile(r"^\s*>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]", re.I)
IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
ASSET_LINK = re.compile(r"\]\(([^)\s#]*assets/[^)\s#]+)")
TABLE_DELIMITER = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$")
EXTERNAL = re.compile(r"(?:href|src)\s*=\s*\"(?:https?:)?//|url\(\s*['\"]?https?:")
CLASS_FONT = re.compile(r"\.([\w-]+)\s*\{[^}]*?font-size:\s*([\d.]+)")
BASE_FONT = re.compile(r"(?:^|[\s}])(?:svg|text)\s*\{[^}]*?font-size:\s*([\d.]+)")
INLINE_FONT = re.compile(r"font-size:\s*([\d.]+)")


def scan(text: str) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """Return the lines outside fenced code, and each opening fence with its info string."""
    prose: list[tuple[int, str]] = []
    openings: list[tuple[int, str]] = []
    fence = ""
    for number, line in enumerate(text.splitlines(), start=1):
        match = FENCE.match(line)
        if fence:
            marker = match.group(1) if match else ""
            if marker[:1] == fence[:1] and len(marker) >= len(fence) and not match.group(2).strip():
                fence = ""
            continue
        if match:
            fence = match.group(1)
            openings.append((number, match.group(2).strip()))
            continue
        prose.append((number, line))
    return prose, openings


def slug(heading: str) -> str:
    """The anchor GitHub derives from a heading."""
    text = IMAGE.sub(lambda m: m.group(1), heading)
    text = LINK.sub(lambda m: m.group(1), text).replace("`", "")
    text = re.sub(r"[^\w\- ]", "", text.strip().lower())
    return text.replace(" ", "-")


def anchors(path: Path) -> set[str]:
    seen: dict[str, int] = {}
    for _, line in scan(path.read_text(encoding="utf-8"))[0]:
        match = HEADING.match(line)
        if match:
            base = slug(match.group(2))
            seen[base] = seen.get(base, -1) + 1
            if seen[base]:
                seen[f"{base}-{seen[base]}"] = 0
    return set(seen)


def tables(prose: list[tuple[int, str]]) -> list[list[tuple[int, str]]]:
    """Group consecutive pipe rows that open with a header row and a delimiter row."""
    groups: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    for number, line in [*prose, (-1, "")]:
        is_row = line.lstrip().startswith("|")
        if is_row and (not current or number == current[-1][0] + 1):
            current.append((number, line))
            continue
        if len(current) > 1 and TABLE_DELIMITER.match(current[1][1]):
            groups.append(current)
        current = [(number, line)] if is_row else []
    return groups


def cell_count(row: str) -> int:
    row = row.strip().replace("\\|", "")
    row = row[1:] if row.startswith("|") else row
    row = row[:-1] if row.endswith("|") else row
    return row.count("|") + 1


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


@pytest.mark.parametrize("relative_path", MARKDOWN)
def test_markdown_has_one_title_and_never_skips_a_heading_level(relative_path: str) -> None:
    prose, _ = scan(read(relative_path))
    first = next(line for _, line in prose if line.strip())
    assert first.startswith("# "), relative_path
    levels = [(number, len(m.group(1))) for number, line in prose if (m := HEADING.match(line))]
    assert [level for _, level in levels].count(1) == 1, relative_path
    pairs = zip(levels, levels[1:], strict=False)
    skipped = [number for (_, before), (number, level) in pairs if level > before + 1]
    assert not skipped, (relative_path, skipped)


@pytest.mark.parametrize("relative_path", MARKDOWN)
def test_markdown_uses_no_raw_html_or_github_only_alerts(relative_path: str) -> None:
    problems = []
    for number, line in scan(read(relative_path))[0]:
        text = AUTOLINK.sub("", INLINE_CODE.sub("", line))
        if RAW_HTML.search(text):
            problems.append((number, "raw HTML", line.strip()[:80]))
        if ALERT.match(line):
            problems.append((number, "GitHub-only alert", line.strip()[:80]))
    assert not problems, (relative_path, problems)


@pytest.mark.parametrize("relative_path", MARKDOWN)
def test_code_fences_name_their_language(relative_path: str) -> None:
    _, openings = scan(read(relative_path))
    assert not [number for number, info in openings if not info], relative_path


@pytest.mark.parametrize("relative_path", MARKDOWN)
def test_tables_keep_one_column_count_per_table(relative_path: str) -> None:
    problems = []
    for table in tables(scan(read(relative_path))[0]):
        columns = cell_count(table[0][1])
        for number, row in table[1:]:
            if cell_count(row) != columns:
                problems.append((number, cell_count(row), columns))
    assert not problems, (relative_path, problems)


@pytest.mark.parametrize("relative_path", MARKDOWN)
def test_images_have_alt_text_and_links_and_anchors_resolve(relative_path: str) -> None:
    source = ROOT / relative_path
    problems = []
    for number, line in scan(source.read_text(encoding="utf-8"))[0]:
        text = INLINE_CODE.sub("", line)
        images = IMAGE.findall(text)
        for alt, target in images:
            if not alt.strip():
                problems.append((number, "image without alt text", target))
        links = LINK.findall(IMAGE.sub("image", text))
        for target in [target for _, target in images] + [target for _, target in links]:
            if re.match(r"^(?:https?:|mailto:)", target):
                continue
            path_part, _, fragment = target.partition("#")
            destination = (source.parent / path_part).resolve() if path_part else source
            if not destination.exists():
                problems.append((number, "missing file", target))
            elif fragment and destination.suffix == ".md" and fragment not in anchors(destination):
                problems.append((number, "missing anchor", target))
    assert not problems, (relative_path, problems)


def test_every_asset_is_used_by_a_document() -> None:
    used = set()
    for relative_path in MARKDOWN:
        for _, line in scan(read(relative_path))[0]:
            used.update(Path(target).name for target in ASSET_LINK.findall(line))
    unused = sorted(p.name for p in ASSETS.iterdir() if p.is_file() and p.name not in used)
    assert not unused, unused


def svg_length(value: str | None, full: float) -> float:
    match = re.match(r"\s*([\d.]+)\s*(%?)", value or "0")
    number = float(match.group(1)) if match else 0.0
    return number * full / 100 if match and match.group(2) else number


def text_with_sizes(root: ET.Element) -> list[tuple[float, str]]:
    """Every text run with the font size it inherits from attributes, classes and styles."""
    css = " ".join(element.text or "" for element in root.iter(f"{SVG}style"))
    by_class = {m.group(1): float(m.group(2)) for m in CLASS_FONT.finditer(css)}
    base = BASE_FONT.search(css)
    found: list[tuple[float, str]] = []

    def walk(element: ET.Element, inherited: float) -> None:
        size = inherited
        if element.get("font-size"):
            size = svg_length(element.get("font-size"), inherited)
        for name in (element.get("class") or "").split():
            size = by_class.get(name, size)
        inline = INLINE_FONT.search(element.get("style") or "")
        size = float(inline.group(1)) if inline else size
        if element.tag in TEXT_TAGS and (element.text or "").strip():
            found.append((size, element.text.strip()))
        for child in element:
            walk(child, size)
            if element.tag in TEXT_TAGS and (child.tail or "").strip():
                found.append((size, child.tail.strip()))

    walk(root, float(base.group(1)) if base else 16.0)
    return found


@pytest.mark.parametrize("name", SVGS)
def test_diagrams_are_self_contained_titled_and_opaque(name: str) -> None:
    raw = (ASSETS / name).read_text(encoding="utf-8")
    root = ET.fromstring(raw)
    assert root.tag == f"{SVG}svg", name
    width, height = svg_length(root.get("width"), 0), svg_length(root.get("height"), 0)
    assert width and height, name
    view_box = [float(v) for v in (root.get("viewBox") or "").replace(",", " ").split()]
    assert view_box == [0, 0, width, height], name
    title = root.find(f"{SVG}title")
    assert title is not None and (title.text or "").strip(), name
    assert "<script" not in raw and "foreignObject" not in raw and "@import" not in raw, name
    assert not EXTERNAL.search(raw), name
    backgrounds = [
        rect for rect in root.iter(f"{SVG}rect")
        if svg_length(rect.get("width"), width) >= 0.95 * width
        and svg_length(rect.get("height"), height) >= 0.95 * height
        and (rect.get("fill") or "").strip().lower() not in ("", "none", "transparent")
    ]
    assert backgrounds, f"{name}: needs an opaque background to read on light and dark pages"


@pytest.mark.parametrize("name", SVGS)
def test_diagram_text_is_legible_on_github_and_follows_the_prose_rules(name: str) -> None:
    root = ET.parse(ASSETS / name).getroot()
    scale = min(1.0, GITHUB_COLUMN_PX / svg_length(root.get("width"), 0))
    texts = text_with_sizes(root)
    assert texts, name
    too_small = sorted({(size, text) for size, text in texts if size * scale < MIN_RENDERED_PX})
    assert not too_small, (name, too_small[:5])
    words = " ".join(text for _, text in texts)
    assert "—" not in words and "–" not in words, name
    banned = [word for word in BANNED_WORDS if re.search(rf"\b{word}\b", words, re.I)]
    assert not banned, (name, banned)


def test_diagrams_match_their_generators(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each committed diagram equals what tools/diagrams builds, so no SVG is edited by hand."""
    generators = ROOT / "tools" / "diagrams"
    monkeypatch.syspath_prepend(str(generators))
    modules, bytecode = set(sys.modules), sys.dont_write_bytecode
    spec = importlib.util.spec_from_file_location("hestia_diagram_build", generators / "build.py")
    build = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(build)
        stale = []
        for module, file_name in build.DIAGRAMS.values():
            committed = (ASSETS / file_name).read_text(encoding="utf-8")
            if importlib.import_module(module).build() != committed:
                stale.append(file_name)
        assert not stale, f"run python tools/diagrams/build.py and commit the result: {stale}"
    finally:
        for name in set(sys.modules) - modules:
            del sys.modules[name]
        sys.dont_write_bytecode = bytecode
