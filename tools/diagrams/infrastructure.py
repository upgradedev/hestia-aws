"""AWS resources for docs/architecture.md: both stacks in eu-west-1 and what sits outside them.

Facts: infra/frontend_stack.py:16-23, 43-58, 60-84, 102-136, 160-163, 178-205, 257-258;
infra/hestia_api_stack.py:16, 31, 53-60, 62-94, 96-120, 125-129, 158-164, 171-178, 195,
212-218, 232-264, 273-288; scripts/release_backend.py:28-30;
scripts/deploy_frontend_stack.py:15-16; src/hestia/adapters/storage.py:491-492.
"""
from __future__ import annotations

import kit
from kit import AMBER, INK, IVORY, MUTED, SAGE, SLATE, TEAL, TINT_AMBER, TINT_SLATE

W, H = 1280, 1184
# Three card columns at the family type scale (24 px titles, 19 px lines); the narrower
# centre column carries the request spine. The right gap keeps room for the get, put pill.
L_X, L_W = 56, 344      # CloudFront Function, headers policy, secret, reader lane
C_X, C_W = 480, 280     # CloudFront, API Gateway, log groups, state bucket
R_X, R_W = 872, 352     # origin access control, site bucket, Bedrock, writer lane
F1, F2 = 168, 312       # hestia-frontend rows
BAND = 472              # outside the stacks, under its caption
A1, A2, A3 = 688, 824, 968
REGION_Y, FRONT_Y, API_Y, STRIP_Y = 96, 128, 648, 1104
FRONT_B = F2 + kit.CARD_H + 24
API_B = A3 + kit.CARD_H + 24
PILL_Y = 592            # one row of pills on the edges that enter the API stack

TITLE = "Hestia AWS resources"
DESC = (
    "AWS resources of Hestia in region eu-west-1. The hestia-frontend CloudFormation stack "
    "holds a CloudFront distribution with HTTP/2 and 3 and IPv6. A CloudFront Function "
    "rewrites app paths to /index.html, a response headers policy adds HSTS, a content "
    "security policy and frame DENY on every behavior, and origin access control signs S3 "
    "requests with SigV4 so the versioned, TLS-only S3 site bucket allows GetObject to this "
    "distribution only. CloudFront forwards /api, /api/*, /healthz and /action/* with caching "
    "disabled to the hestia-afh-api stack. There an API Gateway HTTP API, throttled at 2 "
    "requests per second with a burst of 4, sends the $default route to the Lambda reader "
    "(512 MB) and 22 POST routes to the Lambda writer (1024 MB), both with a 28 second "
    "timeout. Each function writes to its own CloudWatch log group, kept 14 days. The reader "
    "runs as a role that may get objects from the versioned, TLS-only S3 state bucket and "
    "denies writes and Bedrock; the writer runs as a role that may get and put them and "
    "denies SES and deletes. Outside the stacks, the writer invokes Claude Haiku 4.5 on "
    "Amazon Bedrock through an EU inference profile, and CloudFormation resolves the HMAC "
    "signing key from AWS Secrets Manager into the stack, for both functions, at deploy "
    "time; the functions never call Secrets Manager. Not connected: Amazon SES, which IAM "
    "denies, and bank or mailbox feeds."
)


def build() -> str:
    """The infrastructure SVG; raises ValueError on any layout problem."""
    c = kit.Canvas(W, H, TITLE, DESC)
    left_cx, centre_cx, right_cx = L_X + L_W / 2, C_X + C_W / 2, R_X + R_W / 2

    region = "AWS eu-west-1"
    c.group(24, REGION_Y, W - 48, API_B + 16 - REGION_Y, region, stroke=MUTED, fill=None,
            dashed=True, label_x=W - 48 - kit.pill_width(region, bold=True), label_color=INK)
    # Both stack tabs and the caption between the stacks start at the left card edge.
    c.group(40, FRONT_Y, W - 80, FRONT_B - FRONT_Y, "hestia-frontend stack", stroke=AMBER,
            fill=TINT_AMBER, label_x=L_X)
    api_tab = "hestia-afh-api stack"
    c.group(40, API_Y, W - 80, API_B - API_Y, api_tab, stroke=SLATE, fill=TINT_SLATE,
            label_x=L_X)
    # The deploy-time arrow lands on the tab (56 to 257 px), snapped to the 8 px grid.
    api_tab_cx = kit.GRID * round((L_X + kit.pill_width(api_tab, bold=True) / 2) / kit.GRID)

    outside = "Outside the stacks"
    caption_cy = (FRONT_B + BAND) / 2
    c.text(L_X, caption_cy + kit.LABEL_PX * 0.35, outside, kit.LABEL_PX, MUTED, 600,
           layer="nodes", bg=IVORY)
    # Text alone adds no Box, so register one for Canvas.check().
    c.boxes.append(kit.Box("caption", outside, L_X, caption_cy - kit.LABEL_PX / 2,
                           kit.text_width(outside, kit.LABEL_PX, True), kit.LABEL_PX))

    # hestia-frontend
    router = c.node(L_X, F1, L_W, "CloudFront Function", "App paths to /index.html",
                    "edge_function", AMBER)
    cdn = c.node(C_X, F1, C_W, "CloudFront", "HTTP/2 and 3, IPv6", "cloudfront", AMBER)
    oac = c.node(R_X, F1, R_W, "Origin access control", "Signs S3 requests, SigV4",
                 "lock", AMBER)
    headers = c.node(L_X, F2, L_W, "Headers policy", "HSTS, CSP, frame DENY", "guard", AMBER)
    site = c.node(R_X, F2, R_W, "S3 site bucket", "Versioned, TLS only", "s3", SAGE)

    # outside the stacks
    secret = c.node(L_X, BAND, L_W, "Secrets Manager", "HMAC key, both functions",
                    "secrets_manager", SLATE)
    bedrock = c.node(R_X, BAND, R_W, "Amazon Bedrock", "Claude Haiku 4.5, EU profile",
                     "bedrock", TEAL)

    # hestia-afh-api
    api = c.node(C_X, A1, C_W, "API Gateway", "Throttle 2/s, burst 4", "api_gateway", SLATE)
    reader = c.node(L_X, A2, L_W, "Lambda reader", "512 MB, 28 s timeout", "lambda", SLATE)
    logs = c.node(C_X, A2, C_W, "Log groups", "One each, 14 days", "cloudwatch_logs", SLATE)
    writer = c.node(R_X, A2, R_W, "Lambda writer", "1024 MB, 28 s timeout", "lambda", SLATE)
    reader_role = c.node(L_X, A3, L_W, "Reader role", "Denies writes and Bedrock",
                         "iam_role", SLATE)
    state = c.node(C_X, A3, C_W, "S3 state bucket", "Versioned, TLS only", "s3", SAGE)
    writer_role = c.node(R_X, A3, R_W, "Writer role", "Denies SES and deletes",
                         "iam_role", SLATE)

    # requests into and through hestia-frontend
    c.connector([(centre_cx, 24), cdn.top()], SLATE, "HTTPS from browsers",
                label_at=(centre_cx, 56), ends=(cdn,))
    c.connector([cdn.left(), router.right()], AMBER, ends=(cdn, router))
    c.connector([cdn.right(), oac.left()], AMBER, ends=(cdn, oac))
    c.connector([cdn.bottom(-104), (centre_cx - 104, headers.cy), headers.right()], AMBER,
                "every behavior",
                label_at=(centre_cx - 104, (F1 + kit.CARD_H + headers.cy) / 2),
                ends=(cdn, headers))
    c.connector([oac.bottom(), site.top()], SAGE, "GetObject, this distribution",
                ends=(oac, site))
    c.connector([cdn.bottom(), api.top()], SLATE, "/api, /api/*, /healthz, /action/*, uncached",
                label_at=(centre_cx, PILL_Y), ends=(cdn, api))

    # deploy-time value and model calls, both outside the stacks
    c.connector([secret.bottom(api_tab_cx - secret.cx), (api_tab_cx, API_Y - kit.PILL_H / 2 - 6)],
                SLATE, "deploy time", label_at=(api_tab_cx, PILL_Y), dashed=True, ends=(secret,))
    c.connector([writer.top(60), bedrock.bottom(60)], TEAL, "model calls",
                label_at=(right_cx + 60, PILL_Y), ends=(writer, bedrock))

    # hestia-afh-api
    c.connector([api.left(), (left_cx + 60, api.cy), reader.top(60)], SLATE, "$default route",
                label_at=((C_X + left_cx + 60) / 2, api.cy), ends=(api, reader))
    c.connector([api.right(), (right_cx - 60, api.cy), writer.top(-60)], SLATE,
                "22 POST routes", label_at=((C_X + C_W + right_cx - 60) / 2, api.cy),
                ends=(api, writer))
    c.connector([reader.right(), logs.left()], SLATE, ends=(reader, logs))
    c.connector([writer.left(), logs.right()], SLATE, ends=(writer, logs))
    c.connector([reader.bottom(), reader_role.top()], SLATE, "runs as",
                ends=(reader, reader_role))
    c.connector([writer.bottom(), writer_role.top()], SLATE, "runs as",
                ends=(writer, writer_role))
    c.connector([reader_role.right(), state.left()], SAGE, "get", ends=(reader_role, state))
    # Kit's 6 px card clearance leaves the pill 3 px from the arrowhead; 7 px from the card.
    c.connector([writer_role.left(), state.right()], SAGE, "get, put",
                label_at=(C_X + C_W + 60, state.cy), ends=(writer_role, state))

    c.not_connected_strip(24, STRIP_Y, W - 48, [
        ("ses_off", "Amazon SES", "IAM denies ses:*"),
        ("feed_off", "Bank, mailbox feeds", "No automatic import"),
    ])
    return c.render()
