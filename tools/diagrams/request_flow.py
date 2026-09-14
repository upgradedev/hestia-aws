"""Household request flow for docs/architecture.md: seven numbered steps on the writer.

Facts: src/hestia/app/access.py:15; src/hestia/app/api.py:297-302, 312-313, 331-334;
src/hestia/app/intake.py:28-107; src/hestia/app/agent.py:50-170; src/hestia/app/claims.py:77-224;
src/hestia/app/cases.py:17-62; src/hestia/agents/household_agent.py:28-32, 414-423, 475-495;
src/hestia/adapters/storage.py:300-304, 393-396, 491-492; infra/hestia_api_stack.py:16, 88-92;
src/hestia/domain/intake.py:128-130; frontend/src/stateMapping.ts:56-71 (a committed repair,
not the review agent, puts Review the exact notice on Home).
"""
from __future__ import annotations

import kit
from kit import SAGE, SLATE, TEAL, TINT_SLATE, TINT_TEAL, WHITE

W, H = 1200, 912
L_X, R_X, CARD_W = 48, 712, 392       # deterministic steps left, agent steps right
LANE_X = 1152                         # the review agent's model call rises in this lane
CHANNEL_X = (464 + 688) // 2          # pills between the two groups share this axis
DET_Y, AG_Y = 32, 240                 # group tops
ROW_1, ROW_2, ROW_3, ROW_4, ROW_5 = 64, 272, 424, 576, 704
DET_BOTTOM = ROW_5 + kit.CARD_H + 24
AG_BOTTOM = ROW_3 + kit.CARD_H + 24
STATE_Y = (ROW_4 + ROW_5) // 2       # centred between steps 6 and 7
STRIP_Y = DET_BOTTOM + 24

TITLE = "Hestia household request flow"
DESC = (
    "Seven numbered household steps, each a POST route on the writer AWS Lambda function. "
    "1. Open a private copy with POST /api/demo/session, which returns a 30-minute "
    "capability. 2. Add and confirm records with POST /api/ingest/sync: stage, review, then "
    "commit with confirmed true. 3. The reading agent proposes records from pasted text with "
    "POST /api/agent/extract and stages them as a draft for the same review. 4. The review "
    "agent writes a briefing with POST /api/agent/review. Both Strands agents call Claude "
    "Haiku 4.5 on Amazon Bedrock. The briefing is advice and does not gate the notice. "
    "5. Review the exact notice with POST /api/action/claim/prepare, a deterministic "
    "template offered for any appliance with a committed repair. 6. Approve it with POST "
    "/api/action/claim and a single-use token; the approval is recorded as SIMULATED and no "
    "email is sent. 7. Update the case file with POST /api/case/update. Steps 1, 2, 5, 6 and 7 "
    "are deterministic Python. Every step saves one state.json per private copy in Amazon S3 "
    "with conditional writes, including the reading agent's draft and the review agent's "
    "briefing and trace. Not connected: Amazon SES email, where the dispatch route answers "
    "403, and bank or mailbox feeds."
)

# Glyphs this diagram adds, on the kit's 24 x 24 grid; kit.ICONS stays untouched.
GLYPHS = {
    # records to confirm: a card with two ticked rows
    "records": ('<rect x="3" y="3.5" width="18" height="17" rx="3"/>'
                '<path d="M6.8 9.2l1.6 1.6 2.6-2.8M13.5 9.5h4"/>'
                '<path d="M6.8 15.2l1.6 1.6 2.6-2.8M13.5 15.5h4"/>'),
    # case file: a folder
    "folder": ('<path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.3H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5'
               'a2 2 0 0 1-2-2z"/>'
               '<path d="M3 10.8h18"/>'),
}


def _f(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


class FlowCanvas(kit.Canvas):
    """The kit canvas, able to draw this module's own glyphs."""

    def tile(self, x: float, y: float, icon: str, accent: str, size: float = kit.TILE) -> None:
        if icon not in GLYPHS:
            super().tile(x, y, icon, accent, size)
            return
        s = size * 0.62 / 24
        self.layers["nodes"].append(
            f'<path d="{kit.squircle(x, y, size)}" fill="{accent}"/>'
            f'<g transform="translate({_f(x + size * 0.19)} {_f(y + size * 0.19)}) '
            f'scale({_f(s)})" fill="none" stroke="{WHITE}" stroke-width="1.9" '
            f'stroke-linecap="round" stroke-linejoin="round">{GLYPHS[icon]}</g>')


def build() -> str:
    """The request flow SVG; raises ValueError on any layout problem."""
    c = FlowCanvas(W, H, TITLE, DESC)

    det, agents = "Lambda writer: deterministic", "Lambda writer: Strands agents"
    c.group(24, DET_Y, 440, DET_BOTTOM - DET_Y, det, stroke=SLATE, fill=TINT_SLATE,
            label_x=464 - 24 - kit.pill_width(det, bold=True))
    c.group(688, AG_Y, 440, AG_BOTTOM - AG_Y, agents, stroke=TEAL, fill=TINT_TEAL,
            label_x=1128 - 24 - kit.pill_width(agents, bold=True), tab_fill=WHITE)

    s1 = c.node(L_X, ROW_1, CARD_W, "Open a private copy", "POST /api/demo/session",
                "browser", SLATE)
    s2 = c.node(L_X, ROW_2, CARD_W, "Add and confirm records", "POST /api/ingest/sync",
                "records", SLATE)
    s3 = c.node(R_X, ROW_2, CARD_W, "Reading agent proposes", "POST /api/agent/extract",
                "agent", TEAL)
    s4 = c.node(R_X, ROW_3, CARD_W, "Review agent briefing", "POST /api/agent/review",
                "agent", TEAL)
    s5 = c.node(L_X, ROW_3, CARD_W, "Review the exact notice", "POST /api/action/claim/prepare",
                "document", SLATE)
    # the route gives way on this card only: the brief needs "recorded" and "not sent" here
    s6 = c.node(L_X, ROW_4, CARD_W, "Approve the notice", "Recorded, not sent", "check", SLATE)
    s7 = c.node(L_X, ROW_5, CARD_W, "Update the case file", "POST /api/case/update",
                "folder", SLATE)
    bedrock = c.node(R_X, ROW_1, LANE_X + 24 - R_X, "Amazon Bedrock",
                     "Claude Haiku 4.5, EU profile", "bedrock", TEAL)
    state = c.node(R_X, STATE_Y, CARD_W, "S3 state.json per copy",
                   "If-None-Match, then If-Match", "s3", SAGE)
    for n, step in enumerate((s1, s2, s3, s4, s5, s6, s7), start=1):
        c.step_badge(step.x, step.y, n, on=step)

    # the household's path through the steps
    c.connector([s1.bottom(), s2.top()], SLATE, "30-minute capability", ends=(s1, s2))
    c.connector([s3.left(), s2.right()], SLATE, "staged for review",
                label_at=(CHANNEL_X, s3.cy), ends=(s3, s2))
    # a committed repair puts the notice on Home; the review agent's briefing does not gate it
    c.connector([s2.bottom(), s5.top()], SLATE, "committed repair", ends=(s2, s5))
    c.connector([s5.bottom(), s6.top()], SLATE, "single-use token", ends=(s5, s6))
    c.connector([s6.bottom(), s7.top()], SLATE, ends=(s6, s7))

    # where the model runs: both agents call Bedrock from the writer
    model_x = R_X + 64
    c.connector([(model_x, s3.y), (model_x, bedrock.y + bedrock.h)], TEAL, "model calls",
                label_at=(model_x, (bedrock.y + bedrock.h + AG_Y) / 2), ends=(s3, bedrock))
    c.connector([s4.right(), (LANE_X, s4.cy), (LANE_X, bedrock.y + bedrock.h)], TEAL,
                ends=(s4, bedrock))

    # where state is written: each lane saves through its own route, never the model
    c.connector([(464, state.cy), state.left()], SAGE, "every step saves",
                label_at=(CHANNEL_X, state.cy), ends=(state,))
    c.connector([(state.cx, AG_BOTTOM), state.top()], SAGE, "draft and briefing saved",
                ends=(state,))

    c.not_connected_strip(24, STRIP_Y, 1152, [
        ("ses_off", "Amazon SES", "Dispatch answers 403"),
        ("feed_off", "Bank, mailbox feeds", "No automatic import"),
    ])
    return c.render()
