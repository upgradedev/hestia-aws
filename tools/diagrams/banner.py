"""README banner: the idea in one line and the three steps a household follows.

Facts: README.md:3, 13, 26, 51; frontend/src/components/Landing.tsx:20;
docs/devpost-submission.md:19; src/hestia/app/intake.py:69-81; src/hestia/app/agent.py:50-94;
src/hestia/agents/household_agent.py:35-51, 268-273; src/hestia/app/claims.py:197-199;
frontend/src/components/FormalNoticeModal.tsx:137; frontend/src/components/TopBar.tsx:24.
"""
from __future__ import annotations

import kit
from kit import AMBER, HAIRLINE, INK, IVORY, MUTED, TEAL, TINT_AMBER, WHITE

W, H = 1280, 320
# Three equal cards on the 8 px grid: 48 + 3 * 368 + 2 * 40 + 48 = 1280.
MARGIN, GAP, CARD_W, CARD_H = 48, 40, 368, 96
HEAD_CY = 72            # centre line of the mark and the headline, on the 8 px grid
BAND_Y = 144            # top of the amber band: 48 px above and below the mark
CARD_Y = BAND_Y + 40    # 40 px above the cards, and 40 px below them to the canvas edge
HEADLINE_PX = 32
MARK_R, MARK_PX = 24, 26

HEADLINE = "Keeps a household's receipts, guarantees and repair cases together."
TITLE = "Hestia: records you add, an agent review, a notice you approve"
DESC = (
    "Hestia keeps a household's receipts, guarantees and repair cases together, in three "
    "steps from left to right. Step 1, records you add: receipts, guarantees and repairs, "
    "saved only after you confirm them. Step 2, agent review: a Strands agent on Amazon "
    "Bedrock reads the records and points at the decisions waiting. Step 3, notice you "
    "approve: the approval is recorded and the notice is not sent."
)

# Banner-only glyphs on the kit's 24 x 24 grid. A receipt with a torn lower edge.
RECEIPT = ('<path d="M5.5 2.5h13V20l-3.25 2-3.25-2-3.25 2-3.25-2z"/>'
           '<path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>')
# The kit's notice page, with a tick where the text lines were: the approved notice.
APPROVED = ('<path d="M5.5 2.5h9l4.5 4.5v14.5H5.5z"/>'
            '<path d="M14.5 2.5V7H19"/>'
            '<path d="M8.6 14.4l2.4 2.4 4.6-4.8"/>')

STEPS = (
    ("Records you add", "Receipts, guarantees, repairs", RECEIPT, AMBER),
    ("Agent review", "Points at decisions waiting", kit.ICONS["agent"], TEAL),
    ("Notice you approve", "Recorded, not sent", APPROVED, AMBER),
)


def tile(c: kit.Canvas, x: float, y: float, glyph: str, accent: str) -> None:
    """Canvas.tile() for glyph markup, so a banner-only glyph stays out of kit.ICONS."""
    size = kit.TILE
    c.layers["nodes"].append(
        f'<path d="{kit.squircle(x, y, size)}" fill="{accent}"/>'
        f'<g transform="translate({x + size * 0.19:g} {y + size * 0.19:g}) '
        f'scale({size * 0.62 / 24:g})" fill="none" stroke="{WHITE}" stroke-width="1.9" '
        f'stroke-linecap="round" stroke-linejoin="round">{glyph.replace("ACCENT", accent)}</g>')


def band(c: kit.Canvas) -> None:
    """Amber ground under the cards, following the inner edge of the canvas card."""
    r = 23
    c.layers["back"].append(
        f'<path d="M2,{BAND_Y} H{W - 2} V{H - 2 - r} A{r},{r} 0 0 1 {W - 2 - r},{H - 2} '
        f'H{2 + r} A{r},{r} 0 0 1 2,{H - 2 - r} Z" fill="{TINT_AMBER}"/>'
        f'<path d="M2,{BAND_Y} H{W - 2}" stroke="{HAIRLINE}" stroke-width="1.5"/>')


def headline(c: kit.Canvas) -> None:
    """The product mark and the one-line idea, registered so check() keeps cards clear."""
    text_x = MARGIN + 2 * MARK_R + 16
    width = text_x - MARGIN + kit.text_width(HEADLINE, HEADLINE_PX, True)
    if MARGIN + width > W - MARGIN:
        raise ValueError(f"headline needs {width:.0f} px, has {W - 2 * MARGIN} px")
    c.layers["nodes"].append(
        f'<circle cx="{MARGIN + MARK_R}" cy="{HEAD_CY}" r="{MARK_R}" fill="{AMBER}"/>')
    c.text(MARGIN + MARK_R, HEAD_CY + MARK_PX * 0.35, "H", MARK_PX, WHITE, 700, "middle",
           layer="nodes", bg=AMBER)
    c.text(text_x, HEAD_CY + HEADLINE_PX * 0.35, HEADLINE, HEADLINE_PX, INK, 600,
           layer="nodes", bg=IVORY)
    c.boxes.append(kit.Box("card", "headline", MARGIN, HEAD_CY - MARK_R, width, 2 * MARK_R))


def step_card(c: kit.Canvas, x: float, y: float, n: int, title: str, sub: str,
              glyph: str, accent: str) -> kit.Node:
    """A kit card (tile, title, one secondary line) with its step badge on the corner."""
    text_x = x + kit.CARD_PAD + kit.TILE + kit.TEXT_GAP
    room = x + CARD_W - kit.CARD_PAD - text_x
    if len(title.split()) > 4 or len(sub.split()) > 6:
        raise ValueError(f"too many words for a card: {title!r} / {sub!r}")
    for line, px, bold in ((title, c.title_px, True), (sub, c.sub_px, False)):
        if kit.text_width(line, px, bold) > room:
            raise ValueError(f"text does not fit in card: {line!r} needs "
                             f"{kit.text_width(line, px, bold):.0f} px, has {room:.0f} px")
    c._card(x, y, CARD_W, CARD_H)
    tile(c, x + kit.CARD_PAD, y + (CARD_H - kit.TILE) / 2, glyph, accent)
    c.text(text_x, y + CARD_H / 2 - c.title_px * 0.25, title, c.title_px, INK, 600,
           layer="nodes")
    c.text(text_x, y + CARD_H / 2 + c.sub_px * 1.16, sub, c.sub_px, MUTED, layer="nodes")
    c.boxes.append(kit.Box("card", title, x, y, CARD_W, CARD_H))
    c.step_badge(x, y, n, AMBER, on=title)
    return kit.Node(title, x, y, CARD_W, CARD_H)


def chevron(c: kit.Canvas, cx: float, cy: float) -> None:
    """A small amber chevron in the gap between two cards: the reading direction."""
    c.layers["edges"].append(
        f'<path d="M{cx - 3:g},{cy - 8:g} L{cx + 5:g},{cy:g} L{cx - 3:g},{cy + 8:g}" '
        f'fill="none" stroke="{AMBER}" stroke-width="{kit.STROKE}" stroke-linecap="round" '
        f'stroke-linejoin="round"/>')
    c.boxes.append(kit.Box("mark", f"chevron at {cx:g}", cx - 5, cy - 10, 12, 20))


def build() -> str:
    """The banner SVG; raises ValueError on any layout problem."""
    if not 300 <= H <= 380 or W != 1280:
        raise ValueError("the README banner is 1280 wide and 300 to 380 px high")
    c = kit.Canvas(W, H, TITLE, DESC)
    band(c)
    headline(c)
    for i, (title, sub, glyph, accent) in enumerate(STEPS):
        x = MARGIN + i * (CARD_W + GAP)
        step_card(c, x, CARD_Y, i + 1, title, sub, glyph, accent)
        if i:
            chevron(c, x - GAP / 2, CARD_Y + CARD_H / 2)
    return c.render()
