# Hestia architecture: implemented demo and optional provider design

AgentCore is not connected in the public demo. The filename retains an earlier design reference; it is not a deployment claim. The implemented path uses Python HTTP handlers, deterministic notice preparation, explicit approval and scoped conditional persistence.

[PRIMARY: repository inspection, 2026-09-12] Baseline `39e148536080e0957cc36dbd3ca8ea6b74785800`. Reproduce the inventory with `git show 39e148536080e0957cc36dbd3ca8ea6b74785800:<path>`. No live runtime or current-revision CI check was performed for this correction.

## Implemented source flow

```text
Synthetic preview -> explicit demo session -> scoped capability
                                            |
                           supplied household facts
                                            |
                            deterministic notice draft
                                            |
                             exact human approval
                                            |
                   simulated outcome + audit + case timeline
                                            |
                   conditional session-scoped state write
```

This is a source topology, not a recorded execution trace. Approval does not send email, terminate a subscription or recover money. Case follow-up records manual/synthetic reports and attested outcomes; merchant confirmation remains unknown.

| Component | Implemented role | Evidence | Limit |
|---|---|---|---|
| API and capabilities | Public synthetic preview and explicit isolated sessions; authenticated scoped actions | `src/hestia/app/api.py`, `src/hestia/app/access.py` | Demo scope is not production account identity |
| Notice preparation / approval | Server binds the exact review template, source revision and approval proof; replay retains the recorded result | `src/hestia/app/claims.py` | An application approval flow is not Bedrock Return-of-Control |
| Household audit functions | Compare supplied dates, prices, receipts and utility baselines | `src/hestia/agents/sentinel.py`, `src/hestia/domain/` | A fixture rule is not verified legal eligibility or continuous provider monitoring |
| Case timeline | Preserve actor/time/source, references, planning deadlines, replies and outcome attestations | `src/hestia/app/cases.py`, `src/hestia/domain/cases.py` | Outcomes do not independently verify money received |
| State adapter | S3 conditional creation/update under `demo/workspaces/`; CI in-memory store | `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py` | Versioning and digests are not WORM storage or digital signatures |
| Reader / writer roles | Separate functions and policies; reader denies writes; both deny SES and Bedrock | `infra/hestia_api_stack.py` | Effective deployed permissions need release-bound verification |

## Provider inventory

| Provider or mechanism | Mode | What would establish more |
|---|---|---|
| PSD2 / bank stream | Not connected | Authorized adapter, provenance and retained integration evidence |
| Mailbox / retailer sync | Not connected | Authorized source-specific import and explicit consent |
| Receipt OCR | Disabled | Reviewed adapter plus input/output and failure evidence; adapter preparation alone is not OCR execution |
| Manual imports | Pending separate intake integration | Reviewed import records, source labels and manual correction flow; no paid provider activation |
| Strands / Bedrock | Optional source helpers; disabled in the public preparation path | Authorized paid model execution and exact model/input/output evidence |
| AgentCore runtime | Proposed, not connected | Actual runtime resources and invocation receipt |
| Managed Bedrock Guardrails | Proposed, not connected | Configured guardrail ID and invocation evidence; `sanitize_pii` is only a local pattern filter |
| Managed Bedrock Action Groups | Proposed, not connected | Deployed action-group configuration and exercised contracts; Python functions alone are not managed Action Groups |
| SES | Disabled; simulated outbox only | Separately authorized delivery integration and provider-confirmed receipts |

Provider helper names and returned metadata, including an AgentCore label in a fallback helper, do not prove that a managed runtime executed. No active OpenAPI action-group endpoint is asserted by this document.

## Optional MCTS illustration

`GET /api/simulation/mcts` is an explicit toy calculation outside claim preparation (`src/hestia/app/api.py`). `src/hestia/domain/mcts.py` supplies fixed priors and simulated rollouts. The API marks the response illustrative and the empirical success rate null. Its legacy action names, including an ODR-labelled branch, are toy identifiers, not current legal routes. There is no real settlement sample, observed resolution time or validated recommendation behind them.

The architecture UI labels this toy mode beside both its control and API response. It does not turn fixed probabilities or the most-visited branch into an empirical prediction. Actual recovery and time-to-resolution are unmeasured.

## Verification boundary

Repository implementation, CI synthetic execution, live read-only observations, human attestation and live mutating drills are separate evidence levels. New claims regression tests are pending CI at the integration SHA. Coverage, latency, costs, AI quality and independent human UAT cannot be inferred from this architecture. See the [README testbook](../README.md#integration-testbook) and [assurance gaps](assurance.md).
