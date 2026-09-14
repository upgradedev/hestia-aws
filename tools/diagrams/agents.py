"""docs/strands-agents.md: the review agent and the reading agent, their bounds and limits.

Facts: src/hestia/agents/household_agent.py:27-33, 81-102, 114-128, 155-280, 283-323,
360-448, 474-518; src/hestia/app/agent.py:28-31, 58-94, 102-168; src/hestia/app/api.py:62-63,
144-153, 331-334; src/hestia/app/intake.py:69-70; src/hestia/adapters/storage.py:422-474;
infra/hestia_api_stack.py:16-18, 111-117. Two labels follow the fact sheet rather than the
prose: the review agent makes model requests in a tool loop (Strands calls the model again
after each round of tool results), so the daily budget counts reviews and readings, not
model requests.
"""
from __future__ import annotations

import kit
from kit import AMBER, CLAY, SAGE, SLATE, TEAL, WHITE

W = 1280
# Top band: the shared daily budget, then Amazon Bedrock above both agents.
BUDGET_X, BUDGET_W = 48, 416
BED_X, BED_W, TOP_Y = 584, 432, 24
MODEL_LINE_DX = 144     # each model connector sits this far from Bedrock's centre
# Left panel: two card columns. Right panel: one wider column.
LEFT_X, LEFT_W = 24, 768
A_X, B_X, COL_W = 48, 432, 336
RIGHT_X, RIGHT_W = 816, 440
R_X, R_W = 840, 392
PANEL_Y = 200
ROW_1 = 248
ROW_GAP = 72            # room for a pill between rows

TITLE = "Hestia Strands agents"
DESC = (
    "Two agents built with the Strands Agents SDK call Claude Haiku 4.5 on Amazon Bedrock "
    "through an EU inference profile, within a shared daily limit of 200 reviews and readings "
    "per UTC day. Left, POST /api/agent/review: the Strands review agent runs at temperature "
    "0.2 with streaming off, 700 output tokens and a 20 second timeout, and makes model "
    "requests in a tool loop over four read-only tools: review_repair_evidence, "
    "audit_subscriptions, check_receipts_and_utilities and read_case_timeline. Its briefing "
    "passes a local pattern guard that withholds it on refund, owed or deadline claims, a EUR "
    "amount no tool returned, more than 3200 characters, no mention of review or an empty "
    "reply, while the tool trace and usage are kept. The briefing or the withheld reasons, the "
    "tool trace and any fallback reason are saved in the state.json of the private copy, which "
    "keeps the last five, and the route answers HTTP 200 in either mode. Without the model the "
    "tools-only fallback runs every tool and shows its reason: model_not_configured, "
    "session_cap, daily_cap, budget_unconfirmed, model_timeout or model_error. Each private "
    "copy allows 3 reviews, counted before the model call and kept through a sample reset. "
    "Right, POST /api/agent/extract: the Strands reading agent has no tools, runs at "
    "temperature 0.0 with 700 output tokens and a 20 second timeout, and makes one call with "
    "streaming off; it accepts 1 to 6000 characters and 3 readings per private copy. From the "
    "JSON reply it keeps at most 20 appliance, transaction or subscription records with known "
    "keys and stages them as one intake draft for the household, which corrects them and "
    "commits with confirmed: true; a private copy holds up to 8 intake drafts of any status, "
    "and the pasted text is not stored. If a reading fails the route answers HTTP 502 and "
    "stages nothing; a model_error hands the reading back, a timeout or an unreadable reply "
    "stays counted, and the daily unit is never returned."
)

# Extra glyphs on the kit's 24 x 24 grid, drawn by this module's Canvas only.
_DOT = f'fill="{WHITE}" stroke="none"'
GLYPHS = {
    # per-copy limit: a gauge with its needle
    "gauge": ('<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0"/>'
              '<path d="M12 16.5l4.2-5.2"/>'
              f'<circle cx="12" cy="16.5" r="1.6" {_DOT}/>'
              '<path d="M3.5 20.5h17"/>'),
    # daily budget: a calendar page
    "calendar": ('<rect x="3" y="5" width="18" height="16" rx="2.5"/>'
                 '<path d="M3 10h18M8 3v4M16 3v4"/>'
                 f'<circle cx="8" cy="14.5" r="1.2" {_DOT}/>'
                 f'<circle cx="12" cy="14.5" r="1.2" {_DOT}/>'
                 f'<circle cx="16" cy="14.5" r="1.2" {_DOT}/>'),
    # tools-only fallback: a turn back
    "fallback": ('<path d="M9.5 4.5L4.5 9.5l5 5"/>'
                 '<path d="M4.5 9.5h9.5a5.5 5.5 0 0 1 0 11H10"/>'),
    # failed reading: a warning triangle
    "alert": ('<path d="M12 3.2l9.5 17H2.5z"/>'
              '<path d="M12 9.5v5"/>'
              f'<circle cx="12" cy="17.4" r="1.2" {_DOT}/>'),
}


class Canvas(kit.Canvas):
    """The kit canvas plus this diagram's own glyphs; kit.ICONS stays untouched."""

    def tile(self, x: float, y: float, icon: str, accent: str, size: float = kit.TILE) -> None:
        if icon not in GLYPHS:
            super().tile(x, y, icon, accent, size)
            return
        s = size * 0.62 / 24
        gx, gy = x + size * 0.19, y + size * 0.19
        self.layers["nodes"].append(
            f'<path d="{kit.squircle(x, y, size)}" fill="{accent}"/>'
            f'<g transform="translate({gx:.2f} {gy:.2f}) scale({s:.4f})" fill="none" '
            f'stroke="{WHITE}" stroke-width="1.9" stroke-linecap="round" '
            f'stroke-linejoin="round">{GLYPHS[icon]}</g>')


def build() -> str:
    """The agents SVG; raises ValueError on any layout problem."""
    height = _draw(Canvas(W, 4000, TITLE, DESC))  # first pass measures the list cards
    c = Canvas(W, height, TITLE, DESC)
    _draw(c)
    return c.render()


def _draw(c: Canvas) -> int:
    """Draw every part on c and return the canvas height the drawing needs."""
    c.node(BUDGET_X, TOP_Y, BUDGET_W, "Shared daily limit: 200",
           "Reviews and readings per UTC day", "calendar", SLATE)
    bedrock = c.node(BED_X, TOP_Y, BED_W, "Amazon Bedrock", "Claude Haiku 4.5, EU profile",
                     "bedrock", TEAL)

    tools = c.list_card(A_X, ROW_1, COL_W, "Four read-only tools", [
        "review_repair_evidence", "audit_subscriptions", "check_receipts_and_utilities",
        "read_case_timeline"], "tool", SLATE)
    review = c.list_card(B_X, ROW_1, COL_W, "Strands review agent", [
        "Temperature 0.2, streaming off", "700 output tokens", "20 s timeout",
        "Short briefing, three headings"], "agent", TEAL)
    reading = c.list_card(R_X, ROW_1, R_W, "Strands reading agent", [
        "No tools, temperature 0.0", "700 output tokens, 20 s timeout",
        "1 to 6000 characters of text", "3 readings per private copy"], "agent", TEAL)

    row_2 = ROW_1 + max(tools.h, review.h, reading.h) + ROW_GAP
    fallback = c.list_card(A_X, row_2, COL_W, "Tools-only fallback", [
        "model_not_configured", "session_cap, daily_cap", "budget_unconfirmed",
        "model_timeout, model_error", "Reason shown, no narrative"], "fallback", SLATE)
    guard = c.list_card(B_X, row_2, COL_W, "Local pattern guard", [
        "Refund, owed, deadline claims", "EUR amounts no tool returned",
        "Over 3200 characters or empty", "Never mentions review",
        "Trace and usage still kept"], "guard", SLATE)
    staged = c.list_card(R_X, row_2, R_W, "Staged for the household", [
        "appliance, transaction, subscription", "At most 20, known keys only",
        "8 drafts per copy, any status", "Pasted text is not stored",
        "Commit needs confirmed: true"], "document", AMBER)

    row_3 = row_2 + max(fallback.h, guard.h, staged.h) + ROW_GAP
    per_copy = c.list_card(A_X, row_3, COL_W, "Per-copy limit", [
        "3 reviews per private copy", "Counted before the model call",
        "Pre-call fallbacks use none", "Kept through a sample reset"], "gauge", SLATE)
    saved = c.list_card(B_X, row_3, COL_W, "Saved in state.json", [
        "Briefing or withheld reasons", "Tool trace and fallback reason",
        "Last five briefings kept", "HTTP 200 in either mode"], "s3", SAGE)
    failed = c.list_card(R_X, row_3, R_W, "If a reading fails", [
        "HTTP 502, nothing staged", "model_error: reading handed back",
        "Timeout, bad reply: still counted", "Daily unit never returned"], "alert", CLAY)

    panel_bottom = max(n.y + n.h for n in (per_copy, saved, failed)) + 24
    extract = "POST /api/agent/extract"
    c.group(LEFT_X, PANEL_Y, LEFT_W, panel_bottom - PANEL_Y, "POST /api/agent/review",
            stroke=SLATE, fill=kit.TINT_SLATE, label_x=A_X)
    c.group(RIGHT_X, PANEL_Y, RIGHT_W, panel_bottom - PANEL_Y, extract, stroke=SLATE,
            fill=kit.TINT_SLATE, label_x=R_X + R_W - kit.pill_width(extract, bold=True))

    # Both model connectors rise straight into Bedrock; their pills share one line,
    # centred between Bedrock and the panel tabs.
    pill_y = (TOP_Y + kit.CARD_H + PANEL_Y - kit.PILL_H // 2) // 2
    review_x, reading_x = bedrock.cx - MODEL_LINE_DX, bedrock.cx + MODEL_LINE_DX
    c.connector([review.top(review_x - review.cx), bedrock.bottom(-MODEL_LINE_DX)], TEAL,
                "model requests in a tool loop", label_at=(review_x, pill_y),
                ends=(review, bedrock))
    c.connector([reading.top(reading_x - reading.cx), bedrock.bottom(MODEL_LINE_DX)], TEAL,
                "one call, streaming off", label_at=(reading_x, pill_y), ends=(reading, bedrock))

    c.connector([review.left(), tools.right()], SLATE, ends=(review, tools))
    c.connector([fallback.top(), tools.bottom()], SLATE, "runs every tool, no model",
                dashed=True, ends=(fallback, tools))
    c.connector([review.bottom(), guard.top()], SLATE, "briefing", ends=(review, guard))
    c.connector([guard.bottom(), saved.top()], SAGE, "shown or withheld", ends=(guard, saved))
    c.connector([reading.bottom(), staged.top()], SLATE, "JSON reply", ends=(reading, staged))
    return int(panel_bottom + 24)
