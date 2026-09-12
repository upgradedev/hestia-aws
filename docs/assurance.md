# Assurance: source evidence and unresolved gaps

[PRIMARY: repository inspection, 2026-09-12] Baseline `39e148536080e0957cc36dbd3ca8ea6b74785800`. Inspect the paths below with `git show 39e148536080e0957cc36dbd3ca8ea6b74785800:<path>`. These are implementation observations, not deployed acceptance, certification or independent human UAT. See the [mode inventory](../README.md#evidence-bound-mode-inventory) and [integration testbook](../README.md#integration-testbook).

## Engineering evidence

| Area | What the source implements | Evidence path | Residual gap |
|---|---|---|---|
| Operations | CI definitions for backend packaging and frontend browser journeys; separately authorized publication | `.github/workflows/ci.yml`, `.github/workflows/frontend-ci.yml`, `.github/workflows/frontend-deploy.yml` | Current-revision results and deployed SHA must be attached separately; workflow presence is not a pass |
| Access | Expiring demo capabilities; separate reader/writer functions and scoped storage permissions; SES and Bedrock denials | `src/hestia/app/access.py`, `infra/hestia_api_stack.py` | Demo capabilities are not verified consumer identities; effective deployed IAM needs a release-bound check |
| Persistence | Conditional S3 creation/update; approval, simulated result and audit event share a state write | `src/hestia/adapters/storage.py`, `src/hestia/app/claims.py` | No WORM Object Lock guarantee, external signature or independent timestamp authority is established |
| Oversight | Exact server-prepared notice bound to approval; changed/expired drafts rejected | `src/hestia/app/claims.py` | Consent records a simulation only; approval cannot verify entitlement or merchant receipt |
| Case records | Manual/synthetic source, actor, time, evidence reference, outcome attestation and reopen | `src/hestia/app/cases.py`, `src/hestia/domain/cases.py` | A reference or user attestation is not external confirmation; independent human UAT is NOT_RUN |
| Arithmetic and rules | Supplied integer-cent values and deterministic comparisons | `src/hestia/domain/`, `src/hestia/agents/sentinel.py` | Arithmetic tests do not establish factual inputs, legal accuracy or a zero-hallucination rate |
| Model boundary | Public preparation uses a deterministic template; optional Strands/Bedrock helpers remain outside that route | `src/hestia/app/claims.py`, `src/hestia/agents/sentinel.py` | Live inference, managed Guardrails and AgentCore are not connected; model quality is unmeasured |
| Performance | Lambda and static frontend infrastructure definitions | `infra/hestia_api_stack.py`, `infra/frontend_stack.py` | Cold-start latency, throughput and workload-specific tail latency are unmeasured here |
| Cost | Deployment uses storage, request handling and asset delivery resources | `infra/hestia_api_stack.py`, `infra/frontend_stack.py` | Idle cost, per-case cost and commercial margins are unmeasured; no bill or priced workload sample is attached |
| Sustainability | Deterministic public review path does not invoke a model | `src/hestia/app/claims.py` | Energy per request and environmental impact are unmeasured |

No AWS Well-Architected pillar or Agentic AI Lens control is marked satisfied. A future review needs verified control IDs, workload evidence and unresolved gaps for each applicable control. This inventory is not a completed framework review.

## Legal assessment boundary

EU AI Act applicability, GDPR obligations and consumer-law remedies require a separate legal review. No risk classification, legal certification or article-by-article assessment is established here. A date comparison, legal citation or approval button cannot supply that assessment. Official references and jurisdiction-specific interpretation remain pending verification and integration.

## Data handling inventory

The supplied fixtures are synthetic. That does not establish that every visitor submission, request or operational log contains no personal data. Visitors should use fictional details for demo entries.

| Surface | Source behavior | Unresolved evidence |
|---|---|---|
| Fixture records | Supplied sample household and example merchant data | Fixture coverage is not a representative household cohort |
| Browser session | Demo capability retained in session storage when available | Session expiry is an access boundary, not proof of server-side erasure |
| User input | Case notes, references, planning dates and attested outcomes can be saved in the isolated workspace | User-entered content has not been independently authenticated or audited for personal data |
| State storage | S3 adapter persists scoped records; CI uses in-memory state | Actual deployment, retention, deletion and backups need separate configuration and execution evidence |
| Provider transfers | Bank/mailbox sync and OCR are disabled at the baseline; SES and Bedrock are denied in infrastructure source | Any future manual import or adapter preparation must preserve visible provenance; actual OCR remains disabled |
| Operational metadata | Infrastructure includes request handling and log resources | A full deployed logging/telemetry inventory and retention audit are not supplied |

Source paths: `frontend/src/useDemoSession.ts`, `src/hestia/app/api.py`, `src/hestia/app/cases.py`, `src/hestia/adapters/storage.py`, `scripts/ci_api_server.py`, `infra/hestia_api_stack.py`. No claim of collecting nothing, guaranteed erasure or absence of third-party processing follows from this inventory.
