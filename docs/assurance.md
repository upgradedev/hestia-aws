# Assurance: source evidence and unresolved gaps

[PRIMARY: repository inspection, 2026-09-13] Baseline before the final wave: `b9149c77e7eb18b129df7bbfcc5c19d4241ca050`. Inspect a baseline path with `git show b9149c77e7eb18b129df7bbfcc5c19d4241ca050:<path>` and this branch with `git show HEAD:<path>`; the Strands agent and the rebuilt UI are in `git log b9149c77e7eb18b129df7bbfcc5c19d4241ca050..HEAD`. These are implementation observations, not deployed acceptance, certification or independent human UAT. See the [mode inventory](../README.md#what-runs-where) and the [integration testbook](../README.md#integration-testbook).

## Engineering evidence

| Area | What the source implements | Evidence path | Residual gap |
|---|---|---|---|
| Operations | CI definitions for lint, prose gate, tests with a coverage threshold, packaging and template rendering; browser journeys; separately dispatched publication and acceptance | `.github/workflows/ci.yml`, `.github/workflows/frontend-ci.yml`, `.github/workflows/frontend-deploy.yml`, `.github/workflows/production-acceptance.yml` | Results for this revision must be read from the runs; workflow presence is not a pass. Several Playwright specs still target the previous UI and are being realigned |
| Access | 30-minute HMAC demo capabilities; separate reader and writer functions and roles; reader denies writes and Bedrock; both deny SES and deletes | `src/hestia/app/access.py`, `infra/hestia_api_stack.py` | A capability is not a verified household identity; effective deployed IAM needs a release-bound check |
| Persistence | Conditional S3 creation and update; approval, simulated result and audit event share one write; daily model counter with the same conditional writes | `src/hestia/adapters/storage.py`, `src/hestia/app/claims.py` | No WORM Object Lock, external signature or independent timestamp authority |
| Agent boundary | A Strands agent reads the workspace through four tools and writes a briefing; it cannot prepare, approve or send a notice and has no write tool | `src/hestia/agents/household_agent.py:127-245`, `src/hestia/app/agent.py` | The briefing is advisory text; nothing in the case lifecycle depends on it |
| Narrative guard | Withholds a briefing that matches entitlement or deadline patterns, names an amount absent from tool outputs, exceeds the length limit or omits the review boundary; the tool trace is kept | `src/hestia/agents/household_agent.py:53-75, 255-277`, `tests/test_household_agent.py` | A local pattern check, not a managed guardrail; a wording the patterns miss would pass |
| Agent limits | 3 model calls per demo space, 200 per day, 700 output tokens, 20 second timeout, deterministic fallback with a stated reason; an unconfirmed budget blocks the call | `src/hestia/app/agent.py:21-84`, `src/hestia/adapters/storage.py:416-459`, `infra/hestia_api_stack.py:17` | Limits bound spend, not output quality; the daily counter is shared by all visitors |
| IAM scope for the model | Writer role allows `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on one inference profile and its foundation model; reader role denies `bedrock:*` | `infra/hestia_api_stack.py:77-91, 240-242` | Rendered policy, not a read of the deployed role; the deployed revision is reported by `/healthz` |
| Oversight | Exact server-prepared notice bound to approval; single-use token hashed at rest; changed or expired drafts rejected; replay returns the recorded result | `src/hestia/app/claims.py:158-224` | Consent records a simulation only; approval cannot verify eligibility or seller receipt |
| Case records | Manual or synthetic source, actor, time, evidence reference, outcome attestation capped at the recorded amount, reopen | `src/hestia/app/cases.py`, `src/hestia/domain/cases.py` | A reference or attestation is not external confirmation; independent human UAT is NOT_RUN |
| Arithmetic and rules | Integer-cent values and deterministic comparisons; the notice generator never states entitlement | `src/hestia/domain/`, `src/hestia/agents/tools.py` | Arithmetic tests do not establish factual inputs or legal accuracy |
| Performance | Lambda (1024 MB writer, 512 MB reader, reserved concurrency 2) and a static frontend | `infra/hestia_api_stack.py`, `infra/frontend_stack.py` | Cold start, model latency and tail latency are unmeasured |
| Cost | Bounded model calls, request handling, storage and asset delivery | `infra/hestia_api_stack.py`, `infra/frontend_stack.py` | Cost per review and idle cost are unmeasured; no bill is attached |
| Sustainability | Notice preparation and the fallback path do not invoke a model | `src/hestia/app/claims.py`, `src/hestia/agents/household_agent.py:280-295` | Energy per request is unmeasured |

No AWS Well-Architected pillar or Agentic AI Lens control is marked satisfied. A future review needs verified control IDs, workload evidence and unresolved gaps for each applicable control. This inventory is not a completed framework review.

## Legal assessment boundary

EU AI Act applicability, GDPR obligations and consumer-law remedies require a separate legal review. No risk classification, legal certification or article-by-article assessment is established here. A date comparison, a legal citation, a model briefing or an approval button cannot supply that assessment. Directive (EU) 2019/771 appears in the notice as general reference only; jurisdiction-specific applicability remains pending verification.

## Data handling inventory

The supplied fixtures are synthetic. That does not establish that every visitor submission, request or operational log contains no personal data. Visitors should use fictional details for demo entries.

| Surface | Source behavior | Unresolved evidence |
|---|---|---|
| Fixture records | Supplied sample household and example merchant data | Fixture coverage is not a representative household cohort |
| Browser session | Demo capability retained in session storage when available | Session expiry is an access boundary, not proof of server-side erasure |
| User input | Case notes, references, planning dates and attested outcomes are saved in the isolated workspace | User-entered content is not authenticated or audited for personal data |
| Model input | The system prompt, the review prompt (appliance ids and review date) and the clipped tool outputs over the workspace facts are sent to Amazon Bedrock in eu-west-1 when a live call is made; the briefing, trace and token usage are stored with the workspace | Bedrock data handling terms and retention need separate confirmation; no local PII filter runs before the call |
| State storage | S3 adapter persists scoped records under `demo/workspaces/`; CI uses in-memory state | Deployment retention, deletion and backups need separate configuration and execution evidence |
| Provider transfers | Bank, mailbox and retailer sync are not connected; OCR is not connected; SES is denied | Any future adapter must preserve visible provenance |
| Operational metadata | Log groups with 14-day retention for both functions | A full logging and telemetry inventory is not supplied |

Source paths: `frontend/src/useDemoSession.ts`, `src/hestia/app/api.py`, `src/hestia/app/agent.py`, `src/hestia/app/cases.py`, `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py`, `infra/hestia_api_stack.py`. No claim of collecting nothing, guaranteed erasure or absence of third-party processing follows from this inventory.
