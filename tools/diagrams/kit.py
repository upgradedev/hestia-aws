"""Hestia diagram kit: ivory canvas, white cards, solid accent icon tiles.

Standard library only. Draw on a canvas 1200 to 1280 px wide; GitHub shows it
in an 880 px column. Every text call checks size, contrast and wording, cards
refuse text that would overflow, and Canvas.render() refuses a layout that
Canvas.check() flags. `python kit.py OUT.svg` writes a glyph sheet that
exercises every glyph and primitive; keep it out of docs/assets.
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from xml.sax.saxutils import escape

# ---------------------------------------------------------------- palette
IVORY = "#FFFBF5"        # outer card
HAIRLINE = "#EAD9C6"     # card and pill borders
WHITE = "#FFFFFF"        # cards and pills
INK = "#1F2937"          # titles and labels
MUTED = "#5B6472"        # secondary lines
# One meaning per accent in every diagram; a label or legend always says it too.
AMBER = "#B4520A"        # household and front door: browser, hestia-frontend, web app lane
SAGE = "#3F6F55"         # S3 storage and saved state
SLATE = "#3B5B7A"        # requests and compute: API, Lambda, roles, CI, checks, limits
TEAL = "#2F7F86"         # Amazon Bedrock, the Strands agents, model calls; text on white only
CLAY = "#9A3412"         # denied, failed or not connected
TINT_AMBER = "#FBF1E6"
TINT_SAGE = "#EEF4F0"
TINT_SLATE = "#EEF2F7"
TINT_TEAL = "#EAF4F4"
TINT_CLAY = "#FBEEE8"
SHADOW = "#7C4A1A"

FONT_STACK = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif"

# ------------------------------------------------------------- type scale
HEADING_PX = 30          # optional diagram title
TITLE_PX = 24            # node title; a canvas may lower it to 22
SUB_PX = 19              # secondary and list lines; a canvas may lower it to 18
CHIP_PX = 22             # item title in a not-connected strip
LABEL_PX = 18            # connector pills, group tabs, legend
MIN_TEXT_PX = 18
MIN_TITLE_PX = 22
MIN_CONTRAST = 4.5
MAX_WIDTH = 1280
BANNED = ("leverage", "robust", "seamless", "comprehensive", "delve", "compliant")

# ---------------------------------------------------------------- metrics
GRID = 8
CARD_H = 80
CARD_RADIUS = 16
GROUP_RADIUS = 16
TILE = 48
CARD_PAD = 16
TEXT_GAP = 16
PILL_H = 30
PILL_PAD = 12
STROKE = 3
HEAD_LEN = 12
HEAD_W = 12
BADGE_R = 16

# Glyph advances in 1/1000 em for ASCII 32..126: the larger of Segoe UI and
# Arial as measured in Edge. SAFETY covers Helvetica Neue on macOS.
_REG = (278, 284, 392, 591, 556, 889, 800, 230, 333, 333, 417, 684, 278, 400, 278, 390, 556, 556,
        556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 684, 684, 684, 556, 1015, 667, 667, 722,
        722, 667, 611, 778, 722, 278, 500, 667, 556, 898, 748, 778, 667, 778, 722, 667, 611, 722,
        667, 944, 667, 667, 611, 302, 379, 302, 684, 556, 333, 556, 588, 500, 589, 556, 313, 589,
        566, 242, 242, 500, 242, 861, 566, 586, 588, 589, 348, 500, 339, 566, 500, 723, 500, 500,
        500, 334, 260, 334, 684)
_BOLD = (278, 333, 474, 591, 556, 889, 722, 258, 333, 333, 434, 694, 278, 402, 278, 414, 556, 556,
         556, 556, 576, 556, 558, 556, 556, 558, 333, 333, 694, 694, 694, 611, 975, 722, 722, 722,
         722, 667, 611, 778, 735, 292, 556, 722, 611, 924, 767, 778, 667, 778, 722, 667, 611, 722,
         667, 966, 667, 667, 611, 333, 405, 333, 694, 556, 333, 556, 611, 556, 611, 556, 345, 611,
         611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 361, 611, 556, 778, 556, 556,
         500, 389, 280, 389, 694)
SAFETY = 1.03


def text_width(text: str, px: float, bold: bool = False) -> float:
    """Estimated rendered width in px; errs wide so text never clips."""
    table = _BOLD if bold else _REG
    units = sum(table[ord(c) - 32] if 32 <= ord(c) < 127 else 1000 for c in text)
    return units / 1000 * px * SAFETY


def pill_width(label: str, px: float = LABEL_PX, bold: bool = False) -> int:
    """Width of a connector pill or (bold=True) a group tab, for aligning them."""
    return math.ceil(text_width(label, px, bold) + 2 * PILL_PAD)


def check_words(s: str) -> None:
    """Refuse non-ASCII text (so no em or en dash) and the banned words."""
    for ch in s:
        if not 32 <= ord(ch) < 127:
            raise ValueError(f"non-ASCII character {ch!r} in {s!r}")
    low = s.lower()
    for word in BANNED:
        if word in low:
            raise ValueError(f"banned word {word!r} in {s!r}")


def _lum(colour: str) -> float:
    rgb = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(fg: str, bg: str) -> float:
    """WCAG contrast ratio of two #RRGGBB colours."""
    hi, lo = sorted((_lum(fg), _lum(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _f(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def _sign(v: float) -> int:
    return (v > 0) - (v < 0)


def _pull(a: tuple, b: tuple, n: float) -> tuple[float, float]:
    """The point n px before b on the horizontal or vertical segment a-b."""
    return (b[0] - _sign(b[0] - a[0]) * n, b[1] - _sign(b[1] - a[1]) * n)


@dataclass
class Box:
    """An occupied rectangle that Canvas.check() inspects."""
    kind: str
    name: str
    x: float
    y: float
    w: float
    h: float

    def hits(self, o: Box, gap: float = 0) -> bool:
        return (self.x - gap < o.x + o.w and o.x - gap < self.x + self.w
                and self.y - gap < o.y + o.h and o.y - gap < self.y + self.h)

    def holds(self, o: Box, margin: float = 0) -> bool:
        return (o.x >= self.x + margin and o.y >= self.y + margin
                and o.x + o.w <= self.x + self.w - margin
                and o.y + o.h <= self.y + self.h - margin)


@dataclass
class Node:
    """A drawn card; the anchors return points on its edges."""
    name: str
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    def left(self, dy: float = 0) -> tuple[float, float]:
        return (self.x, self.cy + dy)

    def right(self, dy: float = 0) -> tuple[float, float]:
        return (self.x + self.w, self.cy + dy)

    def top(self, dx: float = 0) -> tuple[float, float]:
        return (self.cx + dx, self.y)

    def bottom(self, dx: float = 0) -> tuple[float, float]:
        return (self.cx + dx, self.y + self.h)


def squircle(x: float, y: float, s: float) -> str:
    """Path data for a soft square tile of side s."""
    k, r = s * 0.08, s / 2
    return (f"M{_f(x + r)},{_f(y)} C{_f(x + s - k)},{_f(y)} {_f(x + s)},{_f(y + k)} "
            f"{_f(x + s)},{_f(y + r)} C{_f(x + s)},{_f(y + s - k)} {_f(x + s - k)},{_f(y + s)} "
            f"{_f(x + r)},{_f(y + s)} C{_f(x + k)},{_f(y + s)} {_f(x)},{_f(y + s - k)} "
            f"{_f(x)},{_f(y + r)} C{_f(x)},{_f(y + k)} {_f(x + k)},{_f(y)} {_f(x + r)},{_f(y)} Z")


class Canvas:
    """One diagram: layered SVG parts plus the geometry that check() inspects."""

    def __init__(self, width: int, height: int, title: str, desc: str,
                 title_px: float = TITLE_PX, sub_px: float = SUB_PX):
        if not 0 < width <= MAX_WIDTH or height <= 0:
            raise ValueError(f"canvas {width}x{height}: width must be 1 to {MAX_WIDTH} px")
        if title_px < MIN_TITLE_PX or sub_px < MIN_TEXT_PX:
            raise ValueError("node titles need at least 22 px, secondary lines 18 px")
        check_words(title)
        check_words(desc)
        self.width, self.height, self.title, self.desc = width, height, title, desc
        self.title_px, self.sub_px = title_px, sub_px
        self.layers: dict[str, list[str]] = {
            k: [] for k in ("back", "groups", "edges", "nodes", "labels")}
        self.boxes: list[Box] = []
        self.groups: list[Box] = []
        self.segments: list[tuple[str, tuple, tuple, set]] = []
        self.texts: list[tuple[str, float]] = []
        self._n = 0
        self.layers["back"].append(
            f'<rect x="1" y="1" width="{width - 2}" height="{height - 2}" rx="24" '
            f'fill="{IVORY}" stroke="{HAIRLINE}" stroke-width="2"/>')

    def _name(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}{self._n}"

    # ---------------------------------------------------------------- text
    def text(self, x: float, y: float, s: str, px: float, color: str = INK,
             weight: int = 400, anchor: str = "start", layer: str = "labels",
             bg: str = WHITE) -> None:
        """One line of text, y the baseline; checks size, contrast on bg and wording."""
        check_words(s)
        if px < MIN_TEXT_PX:
            raise ValueError(f"{px} px is below the {MIN_TEXT_PX} px floor: {s!r}")
        ratio = contrast(color, bg)
        if ratio < MIN_CONTRAST:
            raise ValueError(f"contrast {ratio:.2f} on {bg} is below {MIN_CONTRAST}: {s!r}")
        self.texts.append((s, px))
        self.layers[layer].append(
            f'<text x="{_f(x)}" y="{_f(y)}" font-size="{_f(px)}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{escape(s)}</text>')

    def heading(self, x: float, y: float, s: str) -> None:
        """Optional diagram title; the README heading usually makes it redundant."""
        self.text(x, y, s, HEADING_PX, INK, 600, bg=IVORY)

    def pill(self, cx: float, cy: float, s: str, color: str = INK, stroke: str = HAIRLINE,
             fill: str = WHITE, px: float = LABEL_PX, weight: int = 500,
             kind: str = "pill", owner: str = "") -> Box:
        """Opaque rounded label centred on (cx, cy)."""
        w = pill_width(s, px, weight >= 600)
        x, y = cx - w / 2, cy - PILL_H / 2
        self.layers["labels"].append(
            f'<rect x="{_f(x)}" y="{_f(y)}" width="{w}" height="{PILL_H}" rx="{PILL_H / 2}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
        self.text(cx, cy + px * 0.35, s, px, color, weight, "middle", bg=fill)
        box = Box(kind, owner or self._name(kind), x, y, w, PILL_H)
        self.boxes.append(box)
        return box

    # -------------------------------------------------------------- groups
    def group(self, x: float, y: float, w: float, h: float, label: str,
              stroke: str = SLATE, fill: str | None = TINT_SLATE, dashed: bool = False,
              label_x: float | None = None, label_color: str | None = None,
              tab_fill: str = IVORY) -> Box:
        """Container with a tab label straddling its top border.

        Solid: a deployable unit such as a stack. Dashed: a boundary such as a
        region. fill=None leaves it open. label_x is the tab's left edge; use
        pill_width(label, bold=True) to right-align it.
        """
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        self.layers["groups"].append(
            f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" '
            f'rx="{GROUP_RADIUS}" fill="{fill or "none"}" stroke="{stroke}" '
            f'stroke-width="1.5"{dash}/>')
        lx = x + 24 if label_x is None else label_x
        self.pill(lx + pill_width(label, bold=True) / 2, y, label, label_color or stroke,
                  stroke, tab_fill, LABEL_PX, 600, "tab", "tab:" + label)
        box = Box("group", label, x, y, w, h)
        self.groups.append(box)
        return box

    def not_connected_strip(self, x: float, y: float, w: float,
                            items: list[tuple[str, str, str | None]],
                            label: str = "Not connected", h: float = 56,
                            color: str = CLAY, fill: str = TINT_CLAY,
                            spread: bool = False) -> Box:
        """Dashed strip: a label, then (icon, title, note) items in one row.

        Tiles take `color`; titles are CHIP_PX bold, notes the secondary size.
        spread=True shares the free width between the items. Raises ValueError
        when the row does not fit.
        """
        self.layers["groups"].append(
            f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" '
            f'rx="{GROUP_RADIUS}" fill="{fill}" stroke="{color}" stroke-width="1.5" '
            f'stroke-dasharray="8 6"/>')
        tile = 32 if h < 64 else 40
        cy = y + h / 2
        left = x + 24
        self.text(left, cy + LABEL_PX * 0.35, label, LABEL_PX, color, 600, layer="nodes", bg=fill)
        start = left + text_width(label, LABEL_PX, True)
        sub = self.sub_px
        widths = [tile + 12 + text_width(t, CHIP_PX, True) + (12 + text_width(n, sub) if n else 0)
                  for _, t, n in items]
        room = x + w - 24 - start
        gap = 40.0
        if sum(widths) + gap * len(items) > room:
            raise ValueError(f"strip items need {sum(widths) + gap * len(items):.0f} px, "
                             f"have {room:.0f} px")
        if spread:
            gap = (room - sum(widths)) / len(items)
        cx = start
        for (icon, t, n), iw in zip(items, widths, strict=True):
            cx += gap
            self.tile(cx, cy - tile / 2, icon, color, tile)
            tx = cx + tile + 12
            self.text(tx, cy + CHIP_PX * 0.35, t, CHIP_PX, INK, 600, layer="nodes", bg=fill)
            if n:
                self.text(tx + text_width(t, CHIP_PX, True) + 12, cy + CHIP_PX * 0.35, n, sub,
                          MUTED, layer="nodes", bg=fill)
            self.boxes.append(Box("chip", t, cx, cy - tile / 2, iw, tile))
            cx += iw
        box = Box("group", label, x, y, w, h)
        self.groups.append(box)
        return box

    # --------------------------------------------------------------- cards
    def node(self, x: float, y: float, w: float, title: str, sub: str | None = None,
             icon: str | None = None, accent: str = SLATE, h: float = CARD_H,
             name: str | None = None) -> Node:
        """Card with an icon tile, a title of at most 4 words and one line of at most 6.

        Raises ValueError when text would overflow: shorten the words, never the type.
        """
        t, s = self.title_px, self.sub_px
        if len(title.split()) > 4 or (sub and len(sub.split()) > 6):
            raise ValueError(f"too many words for a card: {title!r} / {sub!r}")
        text_x = x + CARD_PAD + (TILE + TEXT_GAP if icon else 4)
        room = x + w - CARD_PAD - text_x
        for line, px, bold in ((title, t, True), (sub or "", s, False)):
            if text_width(line, px, bold) > room:
                raise ValueError(f"text does not fit in card: {line!r} needs "
                                 f"{text_width(line, px, bold):.0f} px, has {room:.0f} px")
        name = name or title
        self._card(x, y, w, h)
        if icon:
            self.tile(x + CARD_PAD, y + (h - TILE) / 2, icon, accent)
        if sub:
            self.text(text_x, y + h / 2 - t * 0.25, title, t, INK, 600, layer="nodes")
            self.text(text_x, y + h / 2 + s * 1.16, sub, s, MUTED, layer="nodes")
        else:
            self.text(text_x, y + h / 2 + t * 0.35, title, t, INK, 600, layer="nodes")
        self.boxes.append(Box("card", name, x, y, w, h))
        return Node(name, x, y, w, h)

    def list_card(self, x: float, y: float, w: float, title: str, lines: list[str],
                  icon: str | None = None, accent: str = SLATE,
                  name: str | None = None) -> Node:
        """Card with a title and 2 to 5 bullet lines at the secondary size.

        The height follows the line count; read it from the returned Node.
        """
        if not 2 <= len(lines) <= 5:
            raise ValueError("a list card holds 2 to 5 lines")
        t, s = self.title_px, self.sub_px
        head = 64 if icon else 52
        row = max(30, math.ceil(s * 1.6))
        h = GRID * math.ceil((head + row * len(lines) + 16) / GRID)
        tx = x + CARD_PAD + (40 + 12 if icon else 4)
        bullet_x = x + CARD_PAD + 10
        line_x = x + CARD_PAD + 24
        checks = [(title, t, True, x + w - CARD_PAD - tx)]
        checks += [(line, s, False, x + w - CARD_PAD - line_x) for line in lines]
        for line, px, bold, room in checks:
            if len(line.split()) > 6 or text_width(line, px, bold) > room:
                raise ValueError(f"list text does not fit: {line!r} needs "
                                 f"{text_width(line, px, bold):.0f} px, has {room:.0f} px")
        name = name or title
        self._card(x, y, w, h)
        if icon:
            self.tile(x + CARD_PAD, y + (head - 40) / 2, icon, accent, 40)
        self.text(tx, y + head / 2 + t * 0.35, title, t, INK, 600, layer="nodes")
        for i, line in enumerate(lines):
            cy = y + head + row * i + row / 2 - 4
            self.layers["nodes"].append(
                f'<circle cx="{_f(bullet_x)}" cy="{_f(cy)}" r="3.5" fill="{accent}"/>')
            self.text(line_x, cy + s * 0.35, line, s, INK, layer="nodes")
        self.boxes.append(Box("card", name, x, y, w, h))
        return Node(name, x, y, w, h)

    def _card(self, x: float, y: float, w: float, h: float) -> None:
        self.layers["nodes"].append(
            f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" '
            f'rx="{CARD_RADIUS}" fill="{WHITE}" stroke="{HAIRLINE}" stroke-width="1.5" '
            f'filter="url(#soft)"/>')

    def tile(self, x: float, y: float, icon: str, accent: str, size: float = TILE) -> None:
        """Soft square in the accent colour carrying a white glyph from ICONS."""
        if icon not in ICONS:
            raise ValueError(f"unknown glyph {icon!r}; known: {', '.join(ICONS)}")
        glyph = ICONS[icon].replace("ACCENT", accent)
        s = size * 0.62 / 24
        gx, gy = x + size * 0.19, y + size * 0.19
        self.layers["nodes"].append(
            f'<path d="{squircle(x, y, size)}" fill="{accent}"/>'
            f'<g transform="translate({_f(gx)} {_f(gy)}) scale({_f(s)})" fill="none" '
            f'stroke="{WHITE}" stroke-width="1.9" stroke-linecap="round" '
            f'stroke-linejoin="round">{glyph}</g>')

    # ---------------------------------------------------------- connectors
    def connector(self, points: list[tuple[float, float]], color: str = SLATE,
                  label: str | None = None, label_seg: int | None = None,
                  label_at: tuple[float, float] | None = None, dashed: bool = False,
                  ends: tuple = (), arrow: str = "end", radius: float = 12) -> str:
        """Straight or one-bend connector with 12 px arrowheads and an optional pill.

        points: 2 or 3 points joined by horizontal or vertical segments.
        label: pill centred on segment label_seg (default the longest), measured
        without the arrowhead, or at label_at. ends: the Nodes or names the line
        may touch. arrow: "end", "both" or "none". Returns the connector name.
        """
        pts = [(float(p[0]), float(p[1])) for p in points]
        if not 2 <= len(pts) <= 3:
            raise ValueError(f"connectors are straight or have one bend: {pts}")
        for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
            if (x0 != x1) == (y0 != y1):
                raise ValueError(f"connector segments must be horizontal or vertical: {pts}")
        if arrow not in ("end", "both", "none"):
            raise ValueError(f"arrow must be end, both or none, not {arrow!r}")
        body, trim = list(pts), list(pts)
        heads = []
        if arrow in ("end", "both"):
            body[-1] = _pull(pts[-2], pts[-1], HEAD_LEN - 2)
            trim[-1] = _pull(pts[-2], pts[-1], HEAD_LEN)
            heads.append((pts[-2], pts[-1]))
        if arrow == "both":
            body[0] = _pull(pts[1], pts[0], HEAD_LEN - 2)
            trim[0] = _pull(pts[1], pts[0], HEAD_LEN)
            heads.append((pts[1], pts[0]))
        d = [f"M{_f(body[0][0])},{_f(body[0][1])}"]
        if len(body) == 3:
            (x0, y0), (x1, y1), (x2, y2) = body
            r = min(radius, (abs(x1 - x0) + abs(y1 - y0)) / 2, (abs(x2 - x1) + abs(y2 - y1)) / 2)
            p = (x1 - _sign(x1 - x0) * r, y1 - _sign(y1 - y0) * r)
            q = (x1 + _sign(x2 - x1) * r, y1 + _sign(y2 - y1) * r)
            d.append(f"L{_f(p[0])},{_f(p[1])} Q{_f(x1)},{_f(y1)} {_f(q[0])},{_f(q[1])}")
        d.append(f"L{_f(body[-1][0])},{_f(body[-1][1])}")
        dash = ' stroke-dasharray="10 7"' if dashed else ""
        parts = [f'<path d="{" ".join(d)}" fill="none" stroke="{color}" stroke-width="{STROKE}" '
                 f'stroke-linecap="round" stroke-linejoin="round"{dash}/>']
        for (ax, ay), (bx, by) in heads:
            ux, uy = _sign(bx - ax), _sign(by - ay)
            hx, hy = HEAD_W / 2 * -uy, HEAD_W / 2 * ux
            base = (bx - ux * HEAD_LEN, by - uy * HEAD_LEN)
            parts.append(
                f'<path d="M{_f(bx)},{_f(by)} L{_f(base[0] + hx)},{_f(base[1] + hy)} '
                f'L{_f(base[0] - hx)},{_f(base[1] - hy)} Z" fill="{color}" stroke="{color}" '
                f'stroke-width="1" stroke-linejoin="round"/>')
        self.layers["edges"].append("".join(parts))
        name = self._name("edge")
        end_names = {e.name if isinstance(e, Node) else str(e) for e in ends}
        for p0, p1 in zip(pts, pts[1:], strict=False):
            self.segments.append((name, p0, p1, end_names))
        if label:
            if label_at is None:
                segs = list(zip(trim, trim[1:], strict=False))
                i = label_seg if label_seg is not None else max(
                    range(len(segs)), key=lambda k: abs(segs[k][1][0] - segs[k][0][0])
                    + abs(segs[k][1][1] - segs[k][0][1]))
                (x0, y0), (x1, y1) = segs[i]
                label_at = ((x0 + x1) / 2, (y0 + y1) / 2)
            self.pill(label_at[0], label_at[1], label, owner=name)
        return name

    # ---------------------------------------------------------- annotations
    def step_badge(self, cx: float, cy: float, n: int | str, color: str = AMBER,
                   on: Node | str | None = None) -> None:
        """Numbered circle, white 18 px digits on the accent.

        on: the card the badge is pinned to (for example its top-left corner);
        check() then allows that one overlap.
        """
        self.layers["labels"].append(
            f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="{BADGE_R}" fill="{color}" '
            f'stroke="{WHITE}" stroke-width="2"/>')
        self.text(cx, cy + LABEL_PX * 0.35, str(n), LABEL_PX, WHITE, 700, "middle", bg=color)
        owner = on.name if isinstance(on, Node) else on
        name = f"step {n}" + (f"@{owner}" if owner else "")
        self.boxes.append(Box("badge", name, cx - BADGE_R, cy - BADGE_R, 2 * BADGE_R, 2 * BADGE_R))

    def legend(self, x: float, y: float, items: list[tuple[str, str, str]],
               row: float = 36, bg: str = IVORY) -> Box:
        """Small key. items: (kind, text, colour); kind is line, dashed, box,
        dashed-box or a glyph name (drawn as a small tile)."""
        width = 0.0
        for i, (kind, s, color) in enumerate(items):
            cy = y + i * row + row / 2
            if kind in ("line", "dashed"):
                dash = ' stroke-dasharray="8 6"' if kind == "dashed" else ""
                self.layers["labels"].append(
                    f'<path d="M{_f(x)},{_f(cy)} H{_f(x + 32)}" stroke="{color}" '
                    f'stroke-width="{STROKE}" stroke-linecap="round"{dash}/>'
                    f'<path d="M{_f(x + 44)},{_f(cy)} L{_f(x + 32)},{_f(cy - 6)} '
                    f'L{_f(x + 32)},{_f(cy + 6)} Z" fill="{color}"/>')
            elif kind in ("box", "dashed-box"):
                dash = ' stroke-dasharray="6 4"' if kind == "dashed-box" else ""
                self.layers["labels"].append(
                    f'<rect x="{_f(x + 2)}" y="{_f(cy - 11)}" width="40" height="22" rx="6" '
                    f'fill="{bg}" stroke="{color}" stroke-width="1.5"{dash}/>')
            else:
                self.tile(x + 8, cy - 14, kind, color, 28)
            self.text(x + 56, cy + LABEL_PX * 0.35, s, LABEL_PX, INK, bg=bg)
            width = max(width, 56 + text_width(s, LABEL_PX))
        box = Box("legend", "legend", x, y, width, row * len(items))
        self.boxes.append(box)
        return box

    # --------------------------------------------------------------- check
    def check(self, gap: float = 6) -> list[str]:
        """Layout problems: boxes too close, lines through cards or labels,
        group borders through cards, chips or pills, and boxes off the canvas."""
        issues = []
        for i, a in enumerate(self.boxes):
            for b in self.boxes[i + 1:]:
                pinned = {a.kind, b.kind} == {"badge", "card"} and (
                    a.name.endswith("@" + b.name) or b.name.endswith("@" + a.name))
                if a.hits(b, gap) and not pinned:
                    issues.append(f"{a.kind} {a.name!r} and {b.kind} {b.name!r} "
                                  f"overlap or sit under {gap} px apart")
        for name, (x0, y0), (x1, y1), ends in self.segments:
            seg = Box("seg", name, min(x0, x1) - 1.5, min(y0, y1) - 1.5,
                      abs(x1 - x0) + 3, abs(y1 - y0) + 3)
            for b in self.boxes:
                if b.name == name or (b.kind == "card" and b.name in ends):
                    continue
                inner = Box(b.kind, b.name, b.x + 1, b.y + 1, b.w - 2, b.h - 2)
                if seg.hits(inner, 4):
                    issues.append(f"connector {name} crosses or grazes {b.kind} {b.name!r}")
        for g in self.groups:
            for b in self.boxes:
                if b.kind in ("tab", "badge") or not b.hits(g):
                    continue
                if not g.holds(b, 6 if b.kind == "pill" else 0):
                    issues.append(f"{b.kind} {b.name!r} crosses the border of group {g.name!r}")
        for b in self.boxes:
            if b.x < 8 or b.y < 8 or b.x + b.w > self.width - 8 or b.y + b.h > self.height - 8:
                issues.append(f"{b.kind} {b.name!r} leaves the canvas margin")
        return issues

    # --------------------------------------------------------------- write
    def svg(self) -> str:
        """Serialise the drawing without checks."""
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" '
            f'height="{self.height}" viewBox="0 0 {self.width} {self.height}" role="img" '
            f'aria-labelledby="title desc">\n'
            f'<title id="title">{escape(self.title)}</title>\n'
            f'<desc id="desc">{escape(self.desc)}</desc>\n'
            f'<defs><filter id="soft" x="-10%" y="-20%" width="120%" height="150%">'
            f'<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="{SHADOW}" '
            f'flood-opacity="0.10"/></filter></defs>\n')
        body = "\n".join(p for layer in ("back", "groups", "edges", "nodes", "labels")
                         for p in self.layers[layer])
        return f'{head}<g font-family="{FONT_STACK}">\n{body}\n</g>\n</svg>\n'

    def render(self) -> str:
        """The SVG text; raises ValueError listing every layout or markup problem."""
        issues = self.check()
        out = self.svg()
        for bad in ("<script", "foreignObject", "href=", "@import", "url(http"):
            if bad in out:
                issues.append(f"forbidden markup: {bad}")
        if issues:
            raise ValueError("layout problems:\n  " + "\n  ".join(issues))
        return out


# ------------------------------------------------------------------ glyphs
# Simple original glyphs on a 24 x 24 grid, stroked white by Canvas.tile().
# "ACCENT" becomes the tile colour, for cut-outs such as a slash.
_DOT = 'fill="#FFFFFF" stroke="none"'
ICONS: dict[str, str] = {
    # household browser: a window with a small house
    "browser": ('<rect x="2.5" y="3.5" width="19" height="17" rx="3"/>'
                '<path d="M2.5 8h19"/>'
                '<path d="M8 17.5v-4.2l4-3.1 4 3.1v4.2z"/>'),
    # Amazon CloudFront: a globe
    "cloudfront": ('<circle cx="12" cy="12" r="9"/>'
                   '<ellipse cx="12" cy="12" rx="3.8" ry="9"/>'
                   '<path d="M3.5 9h17M3.5 15h17"/>'),
    # Amazon S3: a bucket
    "s3": ('<ellipse cx="12" cy="6" rx="8" ry="2.8"/>'
           '<path d="M4 6l2 12.5c.3 1.6 2.9 2.7 6 2.7s5.7-1.1 6-2.7L20 6"/>'),
    # Amazon API Gateway: brackets around a row of requests
    "api_gateway": ('<path d="M7 5l-5 7 5 7M17 5l5 7-5 7"/>'
                    f'<circle cx="8.6" cy="12" r="1.35" {_DOT}/>'
                    f'<circle cx="12" cy="12" r="1.35" {_DOT}/>'
                    f'<circle cx="15.4" cy="12" r="1.35" {_DOT}/>'),
    # AWS Lambda: a lambda
    "lambda": ('<path d="M5.5 4.5H9l9.5 15H21"/>'
               '<path d="M12.3 10.2L6 19.5"/>'),
    # Amazon Bedrock: a foundation block
    "bedrock": ('<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/>'
                '<path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/>'),
    # AWS Secrets Manager: a key
    "secrets_manager": ('<circle cx="7.5" cy="12" r="4"/>'
                        '<path d="M11.5 12H21M18 12v3.2M15 12v2.4"/>'),
    # Amazon CloudWatch Logs: a panel of timestamped lines
    "cloudwatch_logs": ('<rect x="3" y="3.5" width="18" height="17" rx="3"/>'
                        f'<circle cx="7.3" cy="8.5" r="1.2" {_DOT}/>'
                        f'<circle cx="7.3" cy="12" r="1.2" {_DOT}/>'
                        f'<circle cx="7.3" cy="15.5" r="1.2" {_DOT}/>'
                        '<path d="M10.5 8.5h6.5M10.5 12h6.5M10.5 15.5h4"/>'),
    # CloudFront Function: a bolt, code that runs at the edge
    "edge_function": '<path d="M13.5 2.5L5.5 13.5h6l-1 8 8-11h-6z"/>',
    # origin access control: a padlock with a keyhole
    "lock": ('<rect x="4.5" y="10.5" width="15" height="11" rx="2.5"/>'
             '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
             f'<circle cx="12" cy="15.2" r="1.5" {_DOT}/>'
             '<path d="M12 16v2.4"/>'),
    # AWS IAM role: a shield with a person
    "iam_role": ('<path d="M12 2.8l7.5 3v6c0 4.6-3.2 8.2-7.5 9.6-4.3-1.4-7.5-5-7.5-9.6v-6z"/>'
                 '<circle cx="12" cy="10" r="2.3"/>'
                 '<path d="M8.4 16.2c.8-2.1 6.4-2.1 7.2 0"/>'),
    # GitHub Actions: a run button
    "github_actions": ('<circle cx="12" cy="12" r="9"/>'
                       '<path d="M10 8.3l5.6 3.7-5.6 3.7z" fill="#FFFFFF"/>'),
    # operator terminal: a prompt
    "terminal": ('<rect x="2.5" y="4" width="19" height="16" rx="3"/>'
                 '<path d="M6.5 9.5l3.2 2.7-3.2 2.7M12 15.5h5.5"/>'),
    # Amazon SES, not connected: an envelope with a slash cut out
    "ses_off": ('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/>'
                '<path d="M3.2 6.5l8.8 6.5 8.8-6.5"/>'
                '<path d="M4 21L20 3" stroke="ACCENT" stroke-width="5"/>'
                '<path d="M4 21L20 3"/>'),
    # bank or mailbox feed, not connected: a plug with a slash cut out
    "feed_off": ('<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/>'
                 '<path d="M12 17v4.5"/>'
                 '<path d="M4 21L20 3" stroke="ACCENT" stroke-width="5"/>'
                 '<path d="M4 21L20 3"/>'),
    # CloudFormation change set: a stack of layers with a pending dashed layer
    "change_set": ('<path d="M12 3l9 4.6-9 4.6-9-4.6z"/>'
                   '<path d="M3 12.1l9 4.6 9-4.6"/>'
                   '<path d="M3 16.6l9 4.6 9-4.6" stroke-dasharray="2.6 2.4"/>'),
    # generic agent: a friendly head
    "agent": ('<rect x="4" y="8" width="16" height="12" rx="3.5"/>'
              '<path d="M12 8V4.8"/><circle cx="12" cy="3.6" r="1.2"/>'
              '<circle cx="9" cy="13.5" r="1.1" fill="#FFFFFF"/>'
              '<circle cx="15" cy="13.5" r="1.1" fill="#FFFFFF"/>'
              '<path d="M9.5 17h5"/>'),
    # generic tool: a spanner
    "tool": ('<path d="M14.8 3.6a5 5 0 0 0-4.6 6.9L3.8 16.9a2.2 2.2 0 0 0 3.1 3.1l6.4-6.4'
             'a5 5 0 0 0 6.9-4.6l-3 3-2.9-.6-.6-2.9z"/>'),
    # generic guard: a shield with a tick
    "guard": ('<path d="M12 2.8l7.5 3v6c0 4.6-3.2 8.2-7.5 9.6-4.3-1.4-7.5-5-7.5-9.6v-6z"/>'
              '<path d="M8.6 12.3l2.4 2.4 4.6-4.8"/>'),
    # document or notice: a page with a folded corner and text lines
    "document": ('<path d="M5.5 2.5h9l4.5 4.5v14.5H5.5z"/>'
                 '<path d="M14.5 2.5V7H19"/>'
                 '<path d="M8.5 11.5h7M8.5 15h7M8.5 18.5h4"/>'),
    # check mark
    "check": '<path d="M4.5 12.8l4.8 4.7L19.5 6.8" stroke-width="2.6"/>',
}


def glyph_sheet() -> str:
    """Every glyph once and one of each primitive, for a visual smoke test."""
    names = list(ICONS)
    cols, col_w, row_h = 4, 280, 64
    grid_h = math.ceil(len(names) / cols) * row_h
    top = 32 + grid_h + 72
    c = Canvas(1200, top + 496, "Hestia diagram kit glyph sheet",
               "Every glyph and primitive in tools/diagrams/kit.py, drawn once.")
    c.group(24, 32, 1152, grid_h + 40, "Glyphs", stroke=SLATE, fill=TINT_SLATE)
    accents = (AMBER, SAGE, SLATE, TEAL)
    for i, name in enumerate(names):
        gx, gy = 48 + (i % cols) * col_w, 60 + (i // cols) * row_h
        c.tile(gx, gy, name, CLAY if name.endswith("_off") else accents[i % 4])
        c.text(gx + 60, gy + 24 + LABEL_PX * 0.35, name, LABEL_PX, INK, bg=TINT_SLATE)
    c.group(24, top, 568, 376, "Solid group", stroke=AMBER, fill=TINT_AMBER, label_x=312)
    agent = c.node(48, top + 40, 320, "Review agent", "Four read-only tools", "agent", TEAL)
    c.step_badge(agent.x, agent.y, 1, on=agent)
    card = c.list_card(48, top + 152, 320, "List card", [
        "Two to five lines", "At the secondary size", "Height follows the count"],
        "document", AMBER)
    c.step_badge(card.x, card.y, 2, SLATE, on=card)
    c.group(632, top, 544, 136, "Dashed group", stroke=MUTED, fill=None, dashed=True,
            label_color=INK, label_x=856)
    guard = c.node(656, top + 40, 320, "Pattern guard", "Blocks promises", "guard", AMBER)
    ses = c.node(656, top + 264, 320, "Amazon SES", "IAM denies ses:*", "ses_off", CLAY)
    c.connector([agent.right(), guard.left()], SLATE, "straight", ends=(agent, guard))
    c.connector([card.right(), (guard.cx, card.cy), guard.bottom()], SAGE, "one bend",
                label_at=(712, card.cy), ends=(card, guard))
    c.connector([card.right(dy=64), ses.left(dy=card.cy + 64 - ses.cy)], CLAY, "dashed",
                dashed=True, ends=(card, ses))
    c.legend(1000, top + 176, [("line", "Call", SLATE), ("dashed", "Denied", CLAY),
                               ("box", "Stack", AMBER), ("check", "Check", SAGE)])
    c.not_connected_strip(24, top + 408, 1152, [("ses_off", "Amazon SES", "IAM denies ses:*"),
                                               ("feed_off", "Bank feeds", "Not built")])
    return c.render()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python kit.py OUT.svg   (a scratch folder, never docs/assets)")
    with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as fh:
        fh.write(glyph_sheet())
    print(f"wrote {sys.argv[1]} with {len(ICONS)} glyphs")
