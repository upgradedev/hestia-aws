# Hestia: the household warranty and subscription sentinel

Hestia reads a household's receipts, subscriptions and repair records with a Strands agent on Amazon Bedrock, and nothing is sent until the household has approved the exact text.

Built for the AWS "Agents for Humans" hackathon, Everyday Agents track. The household is fictional (Athens Apartment 4B, homeowner Elena Georgiou). Approvals are recorded, never sent. Real recovered money is always EUR 0.00.

[Live demo](https://drusjukc9d4oc.cloudfront.net/) · [Health check](https://drusjukc9d4oc.cloudfront.net/healthz) · [Backend CI](https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml) · [Frontend CI](https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml) · [Architecture diagram](docs/assets/request-flow.svg) · [Devpost text](docs/devpost-submission.md) · [Video script](docs/video-script.md)

## Try it in 90 seconds

The live URL is a navigation link, not a deployment receipt. `GET /healthz` reports the deployed backend revision (`commit`) and whether the Strands agent may call Bedrock there (`live_model`). [PRIMARY: `curl https://drusjukc9d4oc.cloudfront.net/healthz`, 2026-09-13] the endpoint reported `commit` `b9149c77e7eb18b129df7bbfcc5c19d4241ca050` and `live_model` `false`, which is the release before this branch. The release of this branch goes through the workflows in [Deploy and verify](#deploy-and-verify); after it, `/healthz` reports the new commit and `live_model` `true`.

1. Open https://drusjukc9d4oc.cloudfront.net/ and click **Start with the sample household**. One click creates a private copy of the sample household (an HMAC capability valid for 30 minutes, `src/hestia/app/access.py:15`) with its own S3 workspace. No account, no login.
2. The household's own path is the **Start here** block at the top of **Home** (`frontend/src/components/SentinelHome.tsx`). **Report a repair** records a repair date, invoice amount and fault against an appliance you own. **Add an appliance you own** records the receipt reference, seller, guarantee months and, if you have them, links to the product page, manual and quick start. **Paste a receipt or order email** sends the pasted text to the model once and shows you the records it proposes. Each route opens the same **Add records** dialog (`frontend/src/components/RegistryModal.tsx`), and each one stages a draft: you read and correct every field, consent to the exact subset, then commit. Pasting needs the live model; when `live_model` is `false` the dialog says so and points you at manual entry instead.
3. Open **Records** for the appliance catalogue. Each item shows its guarantee dates and the links you saved; where you saved none, the tile offers a labelled "Search" web search rather than a guessed page (`frontend/src/components/RecordsView.tsx`). **Report a repair** and **Edit details and links** sit on every item, and a repair you report there runs into the same notice, approval and case file flow as the sample one.
4. On **Home**, click **Ask Hestia to review this household**. A Strands agent calls four tools over the recorded facts, yours included, and writes a briefing: what it checked, the decisions waiting for you, one suggested next step. The chips under the button show the mode (live model or deterministic checks), the model id, token usage and how many of the 3 model reviews remain for this copy. Open **Tool trace** to read every tool call and its output.
5. Click **Review the exact notice**. The notice to Kotsovolos Megastore is prepared on the server from the recorded facts. You see the recipient, subject, the recorded repair cost (EUR 185.00) and the full text before you click **Approve this notice (recorded, not sent)**.
6. Click **Continue to the saved case and next step**. The case timeline shows the draft, the approval and the next step. Record a reply, a planning deadline, extra evidence or an outcome; each entry keeps who recorded it, when and from which source.
7. Open **About** for the list of what runs and what does not, and a read-only console that sends the same `GET /healthz` and `GET /api/state` requests the app sends.

What is real: the Lambda functions, the S3 workspace writes, the two Bedrock model calls through the Strands Agents SDK (the review agent and the reader of pasted text, when `live_model` is true), the session capability and the single-use approval token.
What is recorded, not executed: the notice approval (`delivery_status` `SIMULATED`, `ses_message_id` `null`), subscription cancellation requests, utility review requests, case replies (labelled manual or synthetic).
What is not connected: bank feeds (PSD2), mailbox or retailer sync, receipt OCR from a photo, email sending (SES), Bedrock AgentCore, Bedrock Guardrails. Records reach Hestia only because a person typed them or pasted the text and then confirmed what the model proposed.

## How Strands Agents is used

One sentence: the Strands agents read, and the household decides. The review agent calls bounded tools over one isolated workspace and writes the briefing; the extraction agent reads text the household pasted and proposes records for the household to correct. Neither prepares, approves or sends the notice, neither writes to the workspace on its own, and a guard withholds any briefing sentence the tool outputs do not support.

| Piece | Where | What it does |
|---|---|---|
| Agent construction | `src/hestia/agents/household_agent.py:474-485` | `BedrockModel(model_id="eu.anthropic.claude-haiku-4-5-20251001-v1:0", region_name="eu-west-1", max_tokens=700, temperature=0.2, streaming=False)` inside `strands.Agent(model=..., tools=..., system_prompt=SYSTEM_PROMPT, callback_handler=None)` |
| Tools | `src/hestia/agents/household_agent.py:155-273` | Four plain callables built per workspace, wrapped with `strands.tool` so the schema comes from the signature and docstring: `review_repair_evidence(appliance_id)`, `audit_subscriptions()`, `check_receipts_and_utilities()`, `read_case_timeline()` |
| Prompt rules | `src/hestia/agents/household_agent.py:35-51` | The system prompt forbids stating entitlement, inventing deadlines or amounts, and drafting the notice; it fixes three headings and a 180-word ceiling. The review prompt names the recorded appliance ids and the review date |
| Text extraction agent | `src/hestia/agents/household_agent.py:53-78, 360-397, 400-448` | A second, tool-less `strands.Agent` over `BedrockModel(..., temperature=0.0, streaming=False)` reads at most 6000 characters of pasted receipt, order or statement text and answers with a JSON object of records. `EXTRACT_PROMPT` tells it to include a field only when the text states it and never to guess a date, price, email or model number; `ALLOWED_EXTRACT_KEYS` and `normalise_extracted` then keep only the kinds `appliance`, `transaction` and `subscription`, only their known keys, only plain values, and at most 20 records. The call runs in a worker thread with the same 20 second limit; a timeout, an exception or an unparseable reply returns `unavailable` with the reason and no records |
| Extraction route and limits | `src/hestia/app/agent.py:96-159`, `src/hestia/app/api.py:333-334`, `infra/hestia_api_stack.py:17, 115, 275-282` | `POST /api/agent/extract` needs the session capability; the body is `{text, hint}` with `hint` in `auto`, `receipt`, `order` or `statement`. It fails closed and saves nothing: HTTP 503 when no model is configured or the shared daily budget is spent or unconfirmed, HTTP 429 past 3 readings per private copy (`state.agent_extracts`, env `HESTIA_AGENT_EXTRACT_SESSION_CAP`), HTTP 502 when the model fails. A reading that succeeds is stored as a staged intake with source `model_text_extraction` and `ocr_status` `model_text` on route `/api/ingest/sync`, so the household reviews, consents and commits it like any other draft. The pasted text itself is not stored: the draft keeps its SHA-256, its byte count and the proposed records, and pasting identical text replays the same draft without a second model call |
| Trace and usage | `src/hestia/agents/household_agent.py:326-345, 451-456` | Tool calls are paired from `agent.messages` (`toolUse` and `toolResult` blocks); token usage comes from `result.metrics.accumulated_usage` |
| Narrative guard | `src/hestia/agents/household_agent.py:81-102, 283-305` | Withholds the narrative when it matches an entitlement or deadline pattern, names an amount (with a currency mark) that no tool output contains, exceeds 3200 characters or omits the review boundary. The tool trace is shown regardless |
| Timeout and fallback | `src/hestia/agents/household_agent.py:465-520` | The review agent runs in a worker thread with a 20 second limit; a timeout or exception returns the deterministic tools-only outcome with the reason (`model_timeout`, `model_error:<class>`), never invented text. The extraction route has no deterministic equivalent, so it fails closed instead |
| Limits | `src/hestia/app/agent.py:27-93`, `src/hestia/adapters/storage.py:422-474` | 3 model reviews per private copy (`state.agent_calls`) and 3 text readings per private copy (`state.agent_extracts`). Both draw on one shared daily budget of 200 calls, reserved through a conditional S3 counter at `demo/workspaces/_usage/agent-review-<day>.json` (`If-None-Match` on create, `If-Match` on update); an unconfirmed budget means no model call |
| Route | `src/hestia/app/api.py:62-63, 307-310, 331-334`, `src/hestia/app/api.py:280-294` | `POST /api/agent/review` and `POST /api/agent/extract` are both in `PROTECTED_POST` and both pass through `authorize_demo`, so each needs the session capability; `GET /healthz` reports `live_model`, `model_id`, `framework`, `session_cap`, `extract_session_cap`, `daily_cap`, `max_output_tokens`; `live_send` is always `false` |
| IAM scope | `infra/hestia_api_stack.py:78-92, 242-244` | The writer role may call `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on that one inference profile and its foundation model only; the reader role denies `bedrock:*`; both deny `ses:*` and object deletes |
| Runtime | `scripts/deploy_api.py:26-27, 62-73` | The Lambda package bundles `strands-agents==1.53.0` and `boto3==1.43.93` and proves `from strands import Agent, tool` imports inside the bundle |
| UI | `frontend/src/components/AgentBriefing.tsx`, `frontend/src/components/RegistryModal.tsx` | The briefing card renders the three sections without trusting model markup, the mode chips, the reason for a deterministic fallback, a withheld notice and the tool trace. The paste tab shows the readings left, says when the model is not configured, and hands every proposed record to the same review form |
| Tests | `tests/test_household_agent.py`, `tests/test_registry_intake.py`, `frontend/tests/registry.spec.ts` | Tool outputs without entitlement, Strands tool schemas from signatures, tools-only mode, guard rejections and acceptances, trace extraction, fallback on error and timeout, the conditional daily counter, session cap, daily cap, health reporting; appliance and repair planning, the refusal of a second repair while one is open, reset keeping the household's own appliances, `normalise_extracted` dropping unknown kinds and keys, and the extraction route failing closed without a model, on a model failure and past its cap; the browser journey adds an appliance with links, reports its repair, approves the notice and pastes text with and without a model |

Directive (EU) 2019/771 is cited as general reference only. The tools return "review required" and never a determination of eligibility (`src/hestia/domain/warranties.py:192-248`).

## Architecture

```mermaid
flowchart LR
  B[Browser: React app on CloudFront and S3] --> G[API Gateway HTTP API]
  G -->|GET| R[Reader Lambda: read-only, Bedrock denied]
  G -->|POST| W[Writer Lambda: session, registry intake, review, exact approval, case updates]
  R --> S[(S3 state: demo/workspaces/id/state.json, conditional writes)]
  W --> S
  W --> A[Strands Agent: four workspace tools]
  W --> E[Strands Agent: tool-less reader of pasted text, staged for review]
  A --> M[Amazon Bedrock: Claude Haiku 4.5, 3 reviews and 3 readings per copy, one shared daily budget]
  E --> M
  W --> H{Human approval: single-use token bound to the exact digest}
  H --> C[Recorded simulation and case timeline in S3; no SES]
  X[Not connected: bank feed, mailbox, OCR, SES, AgentCore, Guardrails] -.-> W
```

The same picture with the boundaries drawn: [docs/assets/request-flow.svg](docs/assets/request-flow.svg). Narrative and evidence paths: [docs/architecture.md](docs/architecture.md) (the filename is historical; AgentCore is not connected).

## What runs where

[PRIMARY: repository inspection, 2026-09-13] Baseline before this wave: `b9149c77e7eb18b129df7bbfcc5c19d4241ca050`. Inspect the baseline with `git show b9149c77e7eb18b129df7bbfcc5c19d4241ca050:<path>` and this branch with `git show HEAD:<path>`; `git log b9149c77e7eb18b129df7bbfcc5c19d4241ca050..HEAD` lists the agent and UI commits on top of it. This is repository evidence, not a pipeline result or a live measurement.

| Surface | Mode on this branch | Evidence path | Boundary |
|---|---|---|---|
| Anonymous preview | Implemented: `GET /api/state` without a token returns the fresh synthetic household | `src/hestia/app/api.py:295-296` | Reading does not create a workspace |
| Demo space | Implemented: `POST /api/demo/session` issues a 30-minute HMAC capability and creates the workspace with `If-None-Match` | `src/hestia/app/access.py`, `src/hestia/adapters/storage.py:284-310` | A capability is not household identity |
| Strands review agent | Implemented on the writer Lambda; the stack sets `HESTIA_LIVE_MODEL=bedrock`; tools-only fallback with a visible reason | `src/hestia/agents/household_agent.py`, `src/hestia/app/agent.py`, `infra/hestia_api_stack.py:105-119` | Model output quality is unmeasured; a live call needs the deployed IAM and a confirmed daily budget |
| Notice preparation | Deterministic template bound to recipient, subject, amount, source revision and workspace | `src/hestia/app/claims.py:77-155`, `src/hestia/agents/tools.py:133-178` | The draft does not establish legal eligibility |
| Approval | Single-use token hashed server-side, digest compared in constant time, replay returns the same record, changed evidence rejected; result recorded as `SIMULATED` | `src/hestia/app/claims.py:158-224` | No delivery, no seller contact, no recovery |
| Case lifecycle | draft, review, authorized, pending_response, needs_information, rejected, resolved, reopen; replies labelled manual or synthetic; outcomes attested, capped at the recorded repair amount | `src/hestia/domain/cases.py:13-32`, `src/hestia/app/cases.py` | Attested amounts are not real recovery; `real_recovered_cents` stays 0 |
| Household rules | Date comparisons, subscription price and trial checks, receipt matching from EUR 50, utility baseline comparison | `src/hestia/agents/tools.py`, `src/hestia/domain/` | Thresholds are fixture assumptions |
| Manual import | Stage, review and commit of JSON facts or a validated PNG; hashes and reviewed facts retained | `src/hestia/app/intake.py`, `src/hestia/domain/ocr.py` | PNG bytes are validated, no text is extracted from an image; OCR is not connected |
| Household registry | Implemented, entered by hand and reviewed: the `appliance` and `repair` intake kinds add the household's own items and repairs through the same stage, review, consent and commit contract. A repair sets `has_repair_claim` and `claim_status` `open`, so the household's own appliance reaches the existing notice, approval and case file flow; a second repair is refused while a repair or case file is open | `src/hestia/domain/intake.py:65-135, 204-215`, `frontend/src/components/RegistryModal.tsx`, `frontend/src/components/RecordsView.tsx` | Recorded guarantee months are screening inputs, not a determination of legal eligibility. Product, manual and quick start links are only what the household saved and must be http(s); an item without them offers a labelled web search, never an invented page |
| Paste-a-receipt reading | Implemented, model-read and reviewed: pasted receipt, order or statement text is read once by a tool-less Strands agent and returned as proposed records, staged for the same review and commit. 3 readings per private copy, sharing the 200-per-day model budget | `src/hestia/app/agent.py:96-159`, `src/hestia/agents/household_agent.py:400-448`, `src/hestia/domain/ocr.py:39-53` | Extraction quality is unmeasured; every proposed fact requires review before it is saved. The pasted text is not stored, only its SHA-256, its byte count and the proposed records. Each record is capped at 20 fields, with 500 characters for a URL field and 200 for other text. A missing model or a model failure saves nothing |
| Reader and writer | Two Lambda functions and roles; reader denies writes and Bedrock; both deny SES and deletes | `infra/hestia_api_stack.py`, `src/hestia/app/web.py:311-317` | Effective deployed IAM needs a release-bound check |
| Persistence | S3 adapter with `If-None-Match` creation and `If-Match` updates; CI uses the in-memory mode of the same class | `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py` | Conditional writes and SHA-256 digests are not WORM storage |
| Health | `GET /healthz` reports commit, mode, `live_send` false, `live_model`, `model_id` and agent limits | `src/hestia/app/api.py:280-294` | A health field is configuration, not a measured call |
| Legacy toy route | `GET /api/simulation/mcts` still answers with `mode: illustrative`; the UI no longer shows it | `src/hestia/app/api.py:303-306` | No empirical rate behind it |
| Bank, mailbox, retailer feeds | Not connected | `src/hestia/adapters/storage.py:491-492`, `frontend/src/components/AboutView.tsx` | No PSD2 or mailbox adapter exists |
| SES | Not connected; direct dispatch route answers 403; IAM denies `ses:*` | `src/hestia/app/api.py:312-313`, `infra/hestia_api_stack.py:88-92` | Recorded approvals are not sent email |
| Bedrock AgentCore, Guardrails | Not connected | `docs/architecture.md` | The narrative guard is a local pattern check, not a managed guardrail |

## Deploy and verify

Every workflow lives in `.github/workflows/`. Their presence is not a passing result: read the run for the tested revision.

| Workflow | Trigger | What it proves |
|---|---|---|
| `ci.yml` | pull requests; pushes to `main`, `build/**`, `codex/**`; manual dispatch | `ruff check`, `python tools/prose_gate.py`, `pytest --cov=hestia --cov-branch --cov-fail-under=85 tests/ infra/`, executed synthetic measurement and ablation retained as artifacts, the Lambda package built with the pinned Strands and boto3 versions, a health call inside the bundle without AWS access, and the rendered CloudFormation template with checksums |
| `frontend-ci.yml` | pull requests; pushes to `main`, `codex/**`; dispatch; reused by the deploy workflow | `tsc` and Vite build, Playwright journeys against `scripts/ci_api_server.py` (the real Lambda handler behind loopback HTTP), acceptance calibration in the frontend phase, Python hosting tests |
| `frontend-deploy.yml` | manual dispatch on `main` with an approved backend SHA | `infra/check_p0_backend.py` reads the live `/healthz` and requires the approved commit, `live_send` false and a named bounded model before publishing versioned assets to S3 and CloudFront; `infra/frontend_smoke.py` then checks headers, the commit marker, the paired backend SHA and that an anonymous approval is rejected |
| `production-acceptance.yml` | manual dispatch on `main`, backend phase first, then the paired frontend phase | `frontend/acceptance/p0-live.spec.ts` against the live URL: exact approval, replay, isolation between sessions and fail-closed legacy routes |

Backend release: `CI=true python scripts/deploy_api.py --approved-commit <sha> --demo-secret-arn <arn>` packages the runtime, uploads it under `releases/<sha>/` and prepares a CloudFormation change set with `--no-execute-changeset` (`scripts/deploy_api.py:119-136`). Executing the change set is a separate reviewed step; CloudFormation rolls the stack back if the update fails. The state bucket is retained across stack operations.

This branch (`claude/registry-20260913`) is outside the push triggers above, so its CI results come from a pull request or a manual dispatch. Coverage measured locally on 2026-09-13 with `python -m pytest --cov=hestia --cov-branch tests/ infra/` on Python 3.11 was 96.26%; that is a local measurement, not the CI figure. Read test counts and the CI coverage figure from the CI run, not from this file.

## Verification and testbook

<a id="integration-testbook"></a>

The table defines the integrated regression testbook. The commands run in CI; their existence is not a passing result. Read the workflow checkout SHA and retained artifacts together. Automated checks do not complete deployed acceptance, legal review or independent human UAT (NOT_RUN).

| Requirement | Targeted regression evidence | Integration receipt |
|---|---|---|
| HE5 document bytes and manual correction | `tests/test_ocr.py`; `tests/test_intake.py::test_json_correction_exact_review_commit_and_reload_retain_real_input_provenance`; `frontend/tests/intake.spec.ts` JSON correction and reload journey | Backend JUnit plus browser HTTP state assertions; malformed bytes must fail without a draft |
| HE6 exact import, partial rows, dedupe and isolation | `tests/test_intake.py` partial-batch, stale digest, consent, cross-session, concurrent-write and lost-response tests; matching `frontend/tests/intake.spec.ts` journeys | Valid rows only after explicit subset consent; one persisted result after retry; no provider call |
| HE7 separate warranty facts and cautious wording | `tests/test_legal_guards.py` delivery and leap-day, statutory versus commercial, missing or contradictory facts, currency, draft tamper and current redress tests | JUnit proves technical guards, not legal eligibility |
| HE8 coherent facts and unknown versus zero | `tests/test_intake.py::test_canonical_metric_projection_ignores_stale_summary_and_uses_inclusive_threshold`; `frontend/tests/display-facts.spec.ts`; `frontend/tests/snapshot-consistency.spec.ts` | Backend record projection plus presentation fixtures with changed amounts, reload and keyboard navigation; real recovery stays zero |
| HE9 complete saved case journey | `tests/test_case_api.py`, `tests/test_case_lifecycle.py`, `frontend/tests/case-lifecycle.spec.ts` | CI HTTP journey: review, exact approval, follow-up, partial, rejected and resolved outcomes, replay; independent human acceptance remains separate |
| HE10 truthful claims and read-only console | `tests/test_claims_inventory.py` (README, docs, narration, the four UI copy files); `frontend/tests/claims-inventory.spec.ts` | Injected false copy must fail the Python guard. The browser spec now drives the rebuilt About page and its read-only console; read the frontend CI run for the result on this revision |
| HE10 executed synthetic measurement, not financial outcomes | `tests/test_measurement_truthfulness.py`; `tests/test_web.py` | The CI artifact holds executed measurement and ablation JSON with fixture fingerprints and a verification context; altered fixtures and historical overwrite attempts must fail |
| HE14 bounded Strands review | `tests/test_household_agent.py` | Tools-only mode, guard rejections, fallback on error and timeout, conditional daily counter, session cap, health reporting; a live Bedrock call is not exercised in CI |
| Preserved P0 authority and deployment contract | `frontend/tests/p0-session.spec.ts`, Python authority and storage tests, `frontend/acceptance/` | Negative gates and exact-content acceptance calibration; calibration is not an AWS deployment receipt |

The HE8 snapshot tests replace GET responses on purpose to test presentation; they are not backend-write evidence. Intake and case journeys use the CI HTTP API and persisted isolated state. `display-facts.spec.ts` holds pure-function Playwright cases, not browser journeys.

| CI scope | Command or workflow | Evidence required before reporting a result |
|---|---|---|
| Claims inventory and prose | `python -m pytest tests/test_claims_inventory.py`; `python tools/prose_gate.py` | Exact SHA, UTC time, JUnit and any failures |
| Browser claims | `npm --prefix frontend run test:e2e -- claims-inventory.spec.ts` | CI API and Vite harness, exact SHA, Playwright report |
| Backend regression | `.github/workflows/ci.yml` | Complete result including lint, tests, coverage and runtime packaging |
| Frontend regression | `.github/workflows/frontend-ci.yml` | Build, journeys, acceptance calibration |
| Independent human UAT | NOT_RUN | Named human protocol and attestation; automated browser work is not a substitute |

## Synthetic measurements

`tools/measure.py` and `tools/ablate.py` operate on synthetic fixtures. The historical `docs/measurement.json` and `docs/ablation.json` remain unchanged and were not regenerated for this branch: their recovery, exposure and delta labels describe synthetic amounts and rule assumptions, not real impact, seller confirmation or avoided household spending. `tests/test_measurement_truthfulness.py` pins them and refuses to overwrite them. Model accuracy, hallucination rate, cost per review, latency, time saved and merchant settlement rates are unmeasured for this revision. Any future measurement must name its command, input sample, exact SHA, UTC time and retained output.

## Prior work

`infra/frontend_stack.py` (the CloudFront and S3 hosting template, which serves several of the author's products) and the video tooling in `video/`, `web/video/` and `scripts/verify_video_sync.py` were written by the same author for earlier projects and reused here. Everything else in this repository was written for Hestia. Business logic follows the text of Directive (EU) 2019/771 and general household bookkeeping practice; no customer or private data was used.

## License

MIT. See [LICENSE](LICENSE). `pyproject.toml` declares the same license.
