"""Release path for docs/deployment.md: two lanes, backend and web app, that meet at the live site.

Facts: .github/workflows/ci.yml:9-10, 29-39, 61-81; scripts/release_backend.py:4-8, 47-85,
93-138, 156-166; infra/hestia_api_stack.py:102, 109, 156, 261;
.github/workflows/frontend-deploy.yml:2-8, 24-68; infra/frontend_stack.py:207-254, 256-272;
infra/frontend_publish.py:99-108; infra/frontend_smoke.py:22-69;
.github/workflows/production-acceptance.yml:2-13, 24-46;
frontend/playwright.acceptance.config.ts:3-12, 26; docs/deployment.md:3, 20, 26, 52, 80.
"""
from __future__ import annotations

import kit
from kit import AMBER, INK, MUTED, SAGE, SLATE

W, H = 1200, 952
# Three card columns: the backend lane, a middle column, the web app lane.
L_X, L_W = 48, 336      # Backend CI, release_backend.py, deploy bucket, hestia-afh-api stack
M_X, M_W = 416, 352     # acceptance, change set, live site
R_X, R_W = 800, 352     # frontend-deploy.yml, release role, hestia-frontend stack
CS_W = 272              # change set: narrow, so the acceptance line passes beside it
TURN_X = 472            # the change set path turns here, clear of the backend column
ACCEPT_X = 728          # the acceptance line, between the change set and the web lane
ROW_0, ROW_1, ROW_2, ROW_3, ROW_4 = 64, 264, 456, 616, 744
GH_Y, OP_Y, AWS_Y, STRIP_Y = 32, 232, 424, 872
PILL_CI, PILL_UP, PILL_AWS, PILL_STACK = 188, 304, 392, 576

# Glyphs this diagram adds to the kit set, with a slash cut out like ses_off. Both are
# solid outlines that still read at 23 px, the strip tile in the 880 px column; a thin
# diagonal key read as a percent sign there.
_SLASH = '<path d="M4 21L20 3" stroke="ACCENT" stroke-width="5"/><path d="M4 21L20 3"/>'
GLYPHS = {
    # no AWS credentials: a cloud
    "release_cloud_off": ('<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.3'
                          'A3.4 3.4 0 0 0 7 18.5z"/>' + _SLASH),
    # does not deploy the API: an upload arrow over a tray
    "release_upload_off": ('<path d="M4 14.5v5h16v-5"/>'
                           '<path d="M12 15.5V3.5M7.5 8l4.5-4.5L16.5 8"/>' + _SLASH),
}

TITLE = "Hestia release path"
DESC = (
    "Two release lanes that meet at the live site. Backend lane: on GitHub Actions, ci.yml "
    "builds and tests the backend and keeps the Lambda zip, the rendered template and "
    "SHA256SUMS. On the operator host, scripts/release_backend.py runs prepare, execute and "
    "verify: it takes that artifact from a successful main run, uploads the zip once to the "
    "S3 deploy bucket under one key per commit, and prints a CloudFormation change set on the "
    "hestia-afh-api stack for review. The execute step prepares and prints a new change set "
    "and executes it with automatic rollback on; both Lambda functions take their code "
    "from the deploy bucket and carry the commit. Web app lane: on GitHub Actions, the "
    "release job of frontend-deploy.yml runs only when started by hand on main. It builds "
    "the app, assumes the IAM release role through GitHub OIDC, "
    "a role that trusts only the main branch, puts the files into the S3 site bucket of the "
    "hestia-frontend stack, invalidates the CloudFront cache and runs a smoke test. The "
    "hestia-afh-api stack serves the API and the hestia-frontend stack the web app of the "
    "live site, whose /healthz names the deployed commit. On GitHub Actions, "
    "production-acceptance.yml is started by hand on main after a release, an order the "
    "workflow does not enforce, and runs one phase per run, backend or frontend, against "
    "the live site. "
    "Not connected: no workflow holds AWS credentials for the API stack, and "
    "frontend-deploy.yml does not deploy the API."
)


def build() -> str:
    """The release SVG; raises ValueError on any layout problem."""
    added = [name for name in GLYPHS if name not in kit.ICONS]
    kit.ICONS.update({name: GLYPHS[name] for name in added})
    try:
        return _draw()
    finally:
        for name in added:
            del kit.ICONS[name]


def _draw() -> str:
    """Draw the diagram while its own glyphs are registered with the kit."""
    c = kit.Canvas(W, H, TITLE, DESC)

    aws = "AWS eu-west-1"
    c.group(24, GH_Y, 1152, ROW_0 + kit.CARD_H + 16 - GH_Y, "GitHub Actions", stroke=MUTED,
            fill=None, dashed=True, label_x=L_X, label_color=INK)
    c.group(24, OP_Y, L_X + L_W + 24 - 24, ROW_1 + kit.CARD_H + 16 - OP_Y, "Operator host",
            stroke=MUTED, fill=None, dashed=True, label_x=L_X, label_color=INK)
    c.group(24, AWS_Y, 1152, ROW_4 + kit.CARD_H + 16 - AWS_Y, aws, stroke=MUTED, fill=None,
            dashed=True, label_x=1176 - 24 - kit.pill_width(aws, bold=True), label_color=INK)

    ci = c.node(L_X, ROW_0, L_W, "Backend CI", "ci.yml builds and tests", "github_actions", SLATE)
    accept = c.node(M_X, ROW_0, M_W, "Acceptance", "production-acceptance.yml", "check", SLATE)
    web = c.node(R_X, ROW_0, R_W, "frontend-deploy.yml", "Manual release, smoke test",
                 "github_actions", AMBER)
    script = c.node(L_X, ROW_1, L_W, "release_backend.py", "prepare, execute, verify",
                    "terminal", SLATE)
    bucket = c.node(L_X, ROW_2, L_W, "S3 deploy bucket", "One zip per commit", "s3", SAGE)
    change = c.node(M_X, ROW_2, CS_W, "Change set", "Printed for review", "change_set", SLATE)
    role = c.node(R_X, ROW_2, R_W, "IAM release role", "Trusts main branch only", "iam_role",
                  AMBER)
    api = c.node(L_X, ROW_3, L_W, "hestia-afh-api stack", "Carries the commit SHA", "lambda",
                 SLATE)
    front = c.node(R_X, ROW_3, R_W, "hestia-frontend stack", "S3 site bucket, CloudFront",
                   "cloudfront", AMBER)
    live = c.node(M_X, ROW_4, M_W, "Live site", "/healthz names the commit", "browser", AMBER)

    # Backend lane.
    c.connector([ci.bottom(), script.top()], SLATE, "zip, template, SHA256SUMS",
                label_at=(ci.cx, PILL_CI), ends=(ci, script))
    c.connector([script.bottom(), bucket.top()], SAGE, "uploads zip once",
                label_at=(script.cx, PILL_AWS), ends=(script, bucket))
    c.connector([script.right(), (TURN_X, script.cy), change.top(TURN_X - change.cx)], SLATE,
                "prepare, then execute", label_at=(TURN_X, PILL_AWS), ends=(script, change))
    c.connector([bucket.bottom(), api.top()], SAGE, "Lambda code",
                label_at=(bucket.cx, PILL_STACK), ends=(bucket, api))
    c.connector([change.bottom(TURN_X - change.cx), (TURN_X, api.cy), api.right()], SLATE,
                "applied with rollback on", label_at=(TURN_X, PILL_STACK), ends=(change, api))
    # Web app lane.
    c.connector([web.bottom(), role.top()], AMBER, "GitHub OIDC",
                label_at=(web.cx, PILL_UP), ends=(web, role))
    c.connector([role.bottom(), front.top()], AMBER, "put files, invalidate cache",
                label_at=(role.cx, PILL_STACK), ends=(role, front))
    # The lanes meet at the live site, where acceptance runs.
    c.connector([api.bottom(), (api.cx, live.cy), live.left()], SLATE, "API", ends=(api, live))
    c.connector([front.bottom(), (front.cx, live.cy), live.right()], AMBER, "web app",
                ends=(front, live))
    c.connector([accept.bottom(ACCEPT_X - accept.cx), live.top(ACCEPT_X - live.cx)], SLATE,
                "backend or frontend, after release", label_at=(ACCEPT_X, PILL_UP),
                ends=(accept, live))

    c.not_connected_strip(24, STRIP_Y, 1152, [
        ("release_cloud_off", "GitHub to API stack", "No AWS credentials"),
        ("release_upload_off", "frontend-deploy.yml", "No API deploy"),
    ])
    return c.render()
