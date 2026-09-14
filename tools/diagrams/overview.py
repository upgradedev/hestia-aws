"""README overview: how Hestia is served on AWS, where the agents and state live.

Facts: infra/frontend_stack.py:54-58, 137-143, 178-195; infra/hestia_api_stack.py:16,
88-92, 216, 235-244, 273-288; src/hestia/app/access.py:15; src/hestia/app/api.py:331-334;
src/hestia/app/web.py:311-317; src/hestia/adapters/storage.py:247-248, 300-304,
393-396, 491-492.
"""
from __future__ import annotations

import kit
from kit import AMBER, INK, MUTED, SAGE, SLATE, TEAL, TINT_AMBER, TINT_SLATE

W, H = 1200, 696
# Three card columns inside the AWS group; every edge sits on the 8 px grid.
A_X, A_W = 56, 336      # browser, CloudFront, API Gateway, reader
B_X, B_W = 520, 280     # site bucket, state bucket
C_X, C_W = 840, 304     # Bedrock, writer
ROW_0, ROW_1, ROW_2, ROW_3 = 24, 176, 344, 488
REGION_Y, FRONT_Y, API_Y, STRIP_Y = 128, 144, 328, 616   # 24 px under the strip

TITLE = "Hestia architecture overview"
DESC = (
    "A household member opens the React web app in a browser, with no account and a "
    "private copy that lasts 30 minutes. In AWS region eu-west-1 the hestia-frontend "
    "CloudFormation stack holds Amazon CloudFront, which serves the app files from a private "
    "Amazon S3 site bucket through origin access control and forwards /api, /api/*, /healthz "
    "and /action/* to the hestia-afh-api stack. There an Amazon API Gateway HTTP API sends "
    "the $default route to the read-only AWS Lambda reader, which answers only GET and "
    "OPTIONS, and 22 POST routes to the AWS Lambda writer. The reader reads the S3 state "
    "bucket, which keeps one JSON document per private copy, and the writer saves to it with "
    "conditional writes. The writer runs the two Strands agents, for review and reading, "
    "which call Claude Haiku 4.5 on Amazon Bedrock through an EU inference profile. Not "
    "connected: Amazon SES email, which IAM denies, and bank or mailbox feeds."
)


def build() -> str:
    """The overview SVG; raises ValueError on any layout problem."""
    if H > 700:
        raise ValueError("the README overview stays at most 700 px high")
    c = kit.Canvas(W, H, TITLE, DESC)

    region = "AWS eu-west-1"
    c.group(24, REGION_Y, 1152, STRIP_Y - 16 - REGION_Y, region, stroke=MUTED, fill=None,
            dashed=True, label_x=1176 - 24 - kit.pill_width(region, bold=True), label_color=INK)
    c.group(40, FRONT_Y, B_X + B_W + 16 - 40, 128, "hestia-frontend stack", stroke=AMBER,
            fill=TINT_AMBER, label_x=B_X)
    c.group(40, API_Y, 1120, ROW_3 + kit.CARD_H + 16 - API_Y, "hestia-afh-api stack",
            stroke=SLATE, fill=TINT_SLATE, label_x=B_X)

    browser = c.node(A_X, ROW_0, A_W, "Household browser", "30-minute private copy",
                     "browser", AMBER)
    cf = c.node(A_X, ROW_1, A_W, "CloudFront", "Serves the React app", "cloudfront", AMBER)
    site = c.node(B_X, ROW_1, B_W, "S3 site bucket", "Private, via OAC", "s3", SAGE)
    bedrock = c.node(C_X, ROW_1, C_W, "Amazon Bedrock", "Claude Haiku 4.5, EU", "bedrock", TEAL)
    api = c.node(A_X, ROW_2, A_W, "API Gateway", "HTTP API, throttled", "api_gateway", SLATE)
    writer = c.node(C_X, ROW_2, C_W, "Lambda writer", "Runs 2 Strands agents", "lambda", SLATE)
    reader = c.node(A_X, ROW_3, A_W, "Lambda reader", "Read-only, no Bedrock", "lambda", SLATE)
    state = c.node(B_X, ROW_3, B_W, "S3 state bucket", "state.json per copy", "s3", SAGE)

    between_stacks = (FRONT_Y + 128 + API_Y) / 2
    between_rows = (ROW_2 + kit.CARD_H + ROW_3 - kit.HEAD_LEN) / 2
    c.connector([browser.bottom(), cf.top()], SLATE, ends=(browser, cf))
    c.connector([cf.right(), site.left()], SAGE, "app files", ends=(cf, site))
    c.connector([cf.bottom(), api.top()], SLATE, "/api, /api/*, /healthz, /action/*",
                label_at=(cf.cx, between_stacks), ends=(cf, api))
    c.connector([api.right(), writer.left()], SLATE, "22 POST routes", ends=(api, writer))
    c.connector([api.bottom(), reader.top()], SLATE, "$default route",
                label_at=(api.cx, between_rows), ends=(api, reader))
    c.connector([reader.right(), state.left()], SAGE, "reads", ends=(reader, state))
    c.connector([writer.bottom(), (writer.cx, state.cy), state.right()], SAGE,
                "conditional writes", label_at=(writer.cx, between_rows), ends=(writer, state))
    c.connector([writer.top(), bedrock.bottom()], TEAL, "model calls",
                label_at=(writer.cx, between_stacks), ends=(writer, bedrock))

    c.not_connected_strip(24, STRIP_Y, 1152, [
        ("ses_off", "Amazon SES", "IAM denies ses:*"),
        ("feed_off", "Bank, mailbox feeds", "No automatic import"),
    ])
    return c.render()
