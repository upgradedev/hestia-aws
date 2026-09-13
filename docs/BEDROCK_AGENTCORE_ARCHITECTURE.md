# Hestia architecture: the implemented demo and the provider boundary

Bedrock AgentCore is not connected in the public demo. The filename keeps an earlier design reference; it is not a deployment claim. The implemented path is: a Strands agent that reads one isolated workspace through four tools and writes a briefing, deterministic notice preparation, explicit single-use approval, a case lifecycle, and scoped conditional persistence on S3.

[PRIMARY: repository inspection, 2026-09-13] Baseline before the final wave: `b9149c77e7eb18b129df7bbfcc5c19d4241ca050`. Reproduce the inventory with `git show b9149c77e7eb18b129df7bbfcc5c19d4241ca050:<path>` for the baseline and `git show HEAD:<path>` for this branch. No live runtime measurement was performed for this document; `GET /healthz` on the live URL names the deployed revision.

The drawn version is [architecture.svg](architecture.svg); the README carries the same picture as a mermaid diagram.

## Implemented source flow

```text
Landing (one click) -> POST /api/demo/session -> 30-minute capability + S3 workspace
                                                        |
                       POST /api/agent/review -> Strands Agent (four tools) -> Amazon Bedrock
                                                        |          (3 per space, 200 per day, guard)
                                        briefing + tool trace stored with the workspace
                                                        |
                       POST /api/action/claim/prepare -> deterministic notice from recorded facts
                                                        |
                       POST /api/action/claim -> single-use token bound to the exact digest
                                                        |
                         recorded simulation + audit event + case timeline (one conditional write)
                                                        |
                       POST /api/case/update -> replies, deadlines, evidence, attested outcomes
```

This is a source topology, not a recorded execution trace. Approval does not send email, cancel a subscription or recover money. Case follow-up records manual or synthetic reports and attested outcomes; merchant confirmation remains unknown.

| Component | Implemented role | Evidence | Limit |
|---|---|---|---|
| API and capabilities | Public synthetic preview; explicit isolated sessions; capability-scoped POST routes | `src/hestia/app/api.py`, `src/hestia/app/access.py` | Demo scope is not production account identity |
| Strands review agent | `strands.Agent` over `BedrockModel` with four `@tool` functions built per workspace; system prompt with review rules; trace from `agent.messages`; usage from `result.metrics.accumulated_usage` | `src/hestia/agents/household_agent.py:343-354, 127-245, 298-331` | The agent reads and writes text only; it has no tool that changes state |
| Narrative guard | Withholds entitlement claims, invented deadlines, amounts absent from tool outputs, over-long or review-free text; keeps the trace | `src/hestia/agents/household_agent.py:53-75, 255-277` | Local pattern check, not a managed guardrail |
| Agent limits | 3 model calls per demo space, 200 per day (conditional S3 counter), 700 output tokens, 20 s timeout, deterministic fallback with a stated reason | `src/hestia/app/agent.py`, `src/hestia/adapters/storage.py:416-459`, `infra/hestia_api_stack.py:17, 105-119` | Spend is bounded; output quality is unmeasured |
| Notice preparation and approval | Server binds the deterministic template, recipient, amount, source revision and workspace; approval consumes a hashed single-use token; replay returns the recorded result | `src/hestia/app/claims.py`, `src/hestia/agents/tools.py:133-178` | An application approval flow is not Bedrock return of control |
| Household rules | Compare supplied dates, prices, receipts and utility baselines | `src/hestia/agents/tools.py`, `src/hestia/domain/` | A fixture rule is not verified legal eligibility or continuous monitoring |
| Case timeline | Actor, time, source, references, planning deadlines, replies and outcome attestations; outcomes capped at the recorded repair amount | `src/hestia/app/cases.py`, `src/hestia/domain/cases.py` | Outcomes do not verify money received; `real_recovered_cents` stays 0 |
| State adapter | S3 conditional creation and update under `demo/workspaces/`; in-memory mode for CI | `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py` | Versioning and digests are not WORM storage or digital signatures |
| Reader and writer roles | Separate functions and policies; reader denies writes and `bedrock:*`; writer allows two Bedrock actions on one inference profile; both deny SES and deletes | `infra/hestia_api_stack.py:61-93, 230-262` | Effective deployed permissions need release-bound verification |
| Frontend | React app on CloudFront and S3, same-origin API routing, commit marker in the HTML | `infra/frontend_stack.py`, `infra/frontend_publish.py`, `infra/frontend_smoke.py` | The hosting template is shared with the author's other products |

## Provider inventory

| Provider or mechanism | Mode on this branch | What would establish more |
|---|---|---|
| Strands Agents SDK | Connected: 1.53.0 bundled in the Lambda package; `Agent`, `tool`, `BedrockModel` imported and used on the review route | `scripts/deploy_api.py:26-27, 62-73` proves the import in the bundle; a CI run proves it for a revision |
| Amazon Bedrock | Connected on the writer when `HESTIA_LIVE_MODEL=bedrock` (the stack sets it); `/healthz` reports `live_model` and `model_id` | A recorded live briefing with usage on the deployed revision; model quality remains unmeasured |
| Bedrock AgentCore runtime | Not connected | Runtime resources and an invocation receipt |
| Bedrock Guardrails | Not connected; the narrative guard is a local pattern check | A configured guardrail id and invocation evidence |
| Bedrock action groups | Not used; the tools are Strands `@tool` functions inside the writer | Not planned for this design |
| PSD2 or bank stream | Not connected | Authorized adapter, provenance and retained integration evidence |
| Mailbox or retailer sync | Not connected; manual import with stage, review and commit exists | Authorized source-specific import with explicit consent |
| Receipt OCR | Not connected; PNG bytes are validated, no text is extracted | A reviewed adapter with input, output and failure evidence |
| SES | Not connected; direct dispatch route answers 403; IAM denies `ses:*` | A separately authorized delivery integration with consent and provider receipts |

## Legacy route

`GET /api/simulation/mcts` still answers with `mode: illustrative` and `empirical_success_rate: null` (`src/hestia/app/api.py:301-304`). The rebuilt UI does not show it. There is no settlement sample, observed resolution time or validated recommendation behind it.

## Verification boundary

Repository implementation, CI synthetic execution, live read-only observations, human attestation and live mutating drills are separate evidence levels. A live Bedrock call is not exercised in CI; `tests/test_household_agent.py` covers the route with a fake agent. Coverage, latency, cost, model quality and independent human UAT (NOT_RUN) cannot be inferred from this architecture; several of those figures are unmeasured. See the [README testbook](../README.md#integration-testbook) and [assurance gaps](assurance.md).
