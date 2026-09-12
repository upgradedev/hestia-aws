# Hestia: household review and simulated case follow-up

Hestia turns synthetic household records into a reviewable notice and a saved case timeline, so a visitor can inspect the facts, approve the exact text, and record a next step.

The example household is fictional. Approval records a simulation: it does not send email, cancel a provider subscription, or recover money. A case outcome entered by a visitor is an attestation, not independent merchant confirmation. Independent human UAT is NOT_RUN.

[Demo entry point](https://drusjukc9d4oc.cloudfront.net/) · [Backend CI](https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml) · [Frontend CI](https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml)

The URL is a navigation link, not a deployment receipt. This document describes source; current frontend/backend identity and availability require a release receipt. Source corrections do not authorize deployment.

## Evidence-bound mode inventory

[PRIMARY: repository inspection, 2026-09-12] Implementation baseline: `39e148536080e0957cc36dbd3ca8ea6b74785800`. Inspect the baseline with `git show 39e148536080e0957cc36dbd3ca8ea6b74785800:<path>`. The inventory below includes the subsequent hardening changes in this tree; reproduce them with `git rev-parse HEAD` and `git show HEAD:<path>`. This is repository evidence, not a pipeline result or live measurement. CI receipts must identify the tested revision separately.

| Surface | Mode and useful behavior | Evidence path | Boundary / next evidence needed |
|---|---|---|---|
| Anonymous preview | Implemented: read-only synthetic household records | `src/hestia/app/api.py` | Reading the preview does not create a private workspace |
| Demo session | Implemented: explicit start creates an expiring capability for an isolated workspace | `src/hestia/app/access.py`, `src/hestia/app/api.py` | Demo access is not household identity verification |
| Notice preparation | Implemented: deterministic review template; server binds recipient, subject, text, amount and source revision | `src/hestia/app/claims.py` | Draft language and fixture dates do not establish legal entitlement |
| Approval and history | Simulated: approval, result and audit entry persist together; stale evidence and altered approval are rejected | `src/hestia/app/claims.py` | No delivery receipt, provider cancellation or recovery follows from approval |
| Case follow-up | Implemented in source: actor, time, evidence reference, planning deadline, manual/synthetic replies, partial/resolved outcomes and reopen | `src/hestia/app/cases.py`, `src/hestia/domain/cases.py` | Attested amounts are separate from real recovery; evidence references are not independently authenticated |
| Reader / writer | Implemented in infrastructure source: separate functions and roles; reader denies writes; both deny SES and Bedrock | `infra/hestia_api_stack.py` | Effective deployed IAM needs exact-release verification |
| Persistence | Implemented S3 adapter: scoped `demo/workspaces/` keys, `If-None-Match` creation and `If-Match` updates; CI uses an in-memory store | `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py` | Conditional writes and SHA-256 digests are not WORM storage or third-party signatures |
| Household rules | Implemented: date comparisons, subscription deltas, receipt matching and utility baseline comparisons on supplied records | `src/hestia/agents/sentinel.py`, `src/hestia/domain/` | Fixture thresholds are assumptions; legal eligibility and real-world accuracy remain unverified |
| Manual receipt reference | Implemented: visitor can link a receipt reference to a supplied outflow | `src/hestia/app/api.py` | A typed reference is not OCR or proof of document authenticity |
| Document / manual import | Implemented in source: bounded PNG/JSON validation or manual facts, saved original/corrected records, exact reviewed subset, conditional commit, dedupe and replay | `src/hestia/app/intake.py`, `src/hestia/domain/intake.py`, `src/hestia/domain/ocr.py` | PNG text is not extracted; OCR stays unavailable. No account connection, appliance creation or document authenticity is inferred. Only hashes and reviewed facts are retained |
| Bank / mailbox / retailer feeds | Not connected | `src/hestia/app/api.py` | No PSD2 feed, mailbox ingestion or retailer account sync is established |
| Bedrock / Strands | Disabled in the demo route; optional agent construction exists in source, while consumer review letters are deterministic | `src/hestia/agents/sentinel.py`, `src/hestia/app/claims.py`, `infra/hestia_api_stack.py` | No paid live model result or AI-quality measurement is claimed |
| AgentCore / Bedrock Guardrails / Action Groups | Proposed, not connected | `docs/BEDROCK_AGENTCORE_ARCHITECTURE.md` | Helper names and API metadata do not prove managed-service deployment |
| SES | Disabled in the demo route and denied by infrastructure source | `src/hestia/app/claims.py`, `infra/hestia_api_stack.py` | Simulated outbox records are not sent email |
| Optional MCTS | Toy illustration on explicit request; fixed assumptions, separate from claim preparation | `src/hestia/domain/mcts.py`, `src/hestia/app/api.py` | No empirical settlement probability, legal-route recommendation or measured time-to-resolution |

## Explore the demo

1. Open the cockpit and inspect the synthetic preview. Start an isolated demo session explicitly to enable its scoped actions.
2. Review the household facts and prepare the exact server notice. Inspect its recipient, text, amount and evidence before approving the simulation.
3. Open the saved case, record a manual or synthetic follow-up, and inspect the timeline. A planning deadline is a user-entered next step, not a verified legal deadline.
4. Use About / Advanced to inspect illustrative journeys, commercial hypotheses and the read-only API console. Unknown and disabled states are visible beside the feature they limit.

Source case follow-up is not a statement that the currently deployed URL includes this revision. A newer frontend must not be published over an incompatible backend.

## Synthetic examples and measurements

The amounts in `frontend/src/data/seedData.ts` are synthetic example inputs, not household savings. A repair invoice value is an amount for review; a subscription difference is arithmetic on supplied prices; a missing receipt is an evidence gap. None establishes reimbursement, prevented spending or a real outcome.

`tools/measure.py` and `tools/ablate.py` operate on synthetic fixtures. Historical `docs/measurement.json` and `docs/ablation.json` remain unchanged: their recovery/exposure/delta labels describe synthetic amounts and rule assumptions, not real impact, seller confirmation or avoided household expenditure. They were not regenerated for this correction. Test counts, coverage, model accuracy, hallucination rates, cost, margin, ROI, market size, customer count and merchant settlement rates are unknown or unmeasured for this revision.

Any future measurement must identify its command, input sample, exact SHA, UTC execution time and retained output. Synthetic arithmetic, automated CI, live read-only checks, human attestation and live mutating drills must remain distinguishable.

## Architecture and assurance

The operative source flow is HTTP API to scoped Python handlers to conditional state persistence. Human approval is an application mechanism. It is not evidence of Bedrock Return-of-Control or AgentCore execution. See the [architecture inventory](docs/BEDROCK_AGENTCORE_ARCHITECTURE.md) and [assurance evidence and gaps](docs/assurance.md).

No certification, regulatory risk classification or completed AWS review is claimed. Legal references and jurisdiction-specific applicability require separate verification; these source corrections supply no legal verdict.

## Verification and testbook

<a id="integration-testbook"></a>

The table defines the integrated regression testbook. Commands below run only in CI; their existence is not a passing result. Read the workflow checkout SHA and retained artifacts together. Automated checks do not complete deployed acceptance, legal review or independent human UAT (NOT_RUN).

| Requirement | Targeted regression evidence | Integration receipt |
|---|---|---|
| HE5 document bytes and manual correction | `tests/test_ocr.py`; `tests/test_intake.py::test_json_correction_exact_review_commit_and_reload_retain_real_input_provenance`; `frontend/tests/intake.spec.ts` JSON correction/reload journey | Backend JUnit plus browser HTTP state assertions; malformed bytes must fail without a draft |
| HE6 exact import, partial rows, dedupe and isolation | `tests/test_intake.py` partial-batch, stale/digest/consent, cross-session, concurrent-write and lost-response tests; corresponding `frontend/tests/intake.spec.ts` journeys | Valid rows only after explicit subset consent; one persisted result after retry; no provider call |
| HE7 separate warranty facts and cautious wording | `tests/test_legal_guards.py` delivery/leap-day, statutory vs commercial, missing/contradictory facts, currency, draft tamper and current redress tests | JUnit proves technical guards, not legal entitlement or a jurisdiction-specific legal opinion |
| HE8 coherent facts and unknown vs zero | `tests/test_intake.py::test_canonical_metric_projection_ignores_stale_summary_and_uses_inclusive_threshold`; `frontend/tests/display-facts.spec.ts`; `frontend/tests/snapshot-consistency.spec.ts` | Backend record projection plus desktop/mobile presentation fixtures with changed amounts, reload and keyboard navigation; real recovery stays zero |
| HE9 complete saved case journey | `tests/test_case_api.py`, `tests/test_case_lifecycle.py`, `frontend/tests/case-lifecycle.spec.ts` | Actual CI HTTP journey: review, exact approval, follow-up, partial/rejected/resolved outcome and replay; independent human acceptance remains separate |
| HE10 truthful detailed claims and read-only console | `tests/test_claims_inventory.py`; `frontend/tests/claims-inventory.spec.ts` | Injected false copy must fail; browser checks every journey, provider limits, unknown metrics and error reporting |
| HE10 executed synthetic measurement, not financial outcomes | `tests/test_measurement_truthfulness.py`; `tests/test_web.py` | Backend evidence artifact includes CLI measurement/ablation JSON, fixture fingerprints and verification context; altered fixtures and historical overwrite attempts must fail |
| Preserved P0 authority and deployment contract | Existing `frontend/tests/p0-session.spec.ts`, Python authority/storage tests and `frontend/acceptance/` | Existing negative gates and exact-content acceptance calibration remain required; calibration is not an AWS deployment receipt |

The HE8 snapshot tests intentionally replace GET responses to test presentation and are not backend-write evidence. Intake and case journeys use the actual CI HTTP API and persisted isolated state; the lost-response journey intentionally aborts only after the server has committed. `display-facts.spec.ts` contains pure-function Playwright cases, not browser journeys. Source/PR checks run on each change and on merges to main. The frontend publication step stays owner-gated.

| CI scope | Command / workflow | Evidence required before reporting a result |
|---|---|---|
| Claims inventory | `python -m pytest tests/test_claims_inventory.py` | Exact SHA, UTC, JUnit and any failures |
| Browser claims and preserved console | `npm --prefix frontend run test:e2e -- claims-inventory.spec.ts` | Existing CI API/Vite harness, exact SHA, Playwright report and screenshots |
| Backend regression | `.github/workflows/ci.yml` | Complete result including lint, tests, coverage and runtime packaging |
| Frontend regression | `.github/workflows/frontend-ci.yml` | Build, existing journeys, new claims checks and acceptance calibration |
| Independent human UAT | NOT_RUN | Named human protocol and attestation; automated browser work is not a substitute |

These commands belong in CI. Source checks cannot verify a deployed service or a real consumer outcome.

## Approval-only rollout and recovery

1. Review the exact candidate SHA, CI artifacts, IAM diff and stored-state compatibility. A dedicated signing secret is required; provisioning or rotating it needs release authority and its value must not enter source or logs.
2. Render configuration in CI and inspect the CloudFormation change set before applying it. Retain the state bucket, historical keys and scoped conditional writes. The deployment helper prepares a change set; preparation is not execution.
3. Backend cutover and frontend publication need separate owner approval. Main CI does not establish deployment. Verify paired frontend/backend identities, narrowed provider permissions, session isolation, changed-draft rejection, replay and reload against the approved revision.
4. If a cutover fails, retain provider denials and reconcile retained state and release artifacts. Recovery requires a reviewed plan; restoring an unguarded legacy route is not an automatic fallback.

Source verification performs no production migration, secret creation, real send or paid model activation.

## Licensing metadata needs owner resolution

[PRIMARY: repository inspection, 2026-09-12] At baseline `39e148536080e0957cc36dbd3ca8ea6b74785800`, `pyproject.toml` declares MIT while the earlier README asserted Apache-2.0. No LICENSE file is tracked (`git ls-tree -r --name-only 39e148536080e0957cc36dbd3ca8ea6b74785800`; inspect metadata with `git show 39e148536080e0957cc36dbd3ca8ea6b74785800:pyproject.toml`). Public licensing is an unresolved owner decision outside this correction. No license, copyright, ownership or publication change is made here.
