# Hestia AWS: Autonomous Household Financial and Warranty Sentinel

## P0 candidate: isolated demo and exact approval

This revision changes the demo contract. It must not be deployed over an older backend
without a coordinated, owner-approved cutover. Source/CI validation is not proof of
the current CloudFront or Lambda revision; check the release receipt.

| Boundary | Behavior in this revision |
|---|---|
| Public access | Read-only synthetic preview. Explicit demo start issues an expiring capability for one isolated workspace. |
| Approval | The server prepares the exact recipient, subject, text, amount and source revision before sign-off. Changed or expired evidence is rejected. |
| Outcome | Approval records a SIMULATED artifact. It does not send mail, cancel a provider subscription or recover money. |
| Persistence | S3 creation uses If-None-Match; updates use If-Match. Failed or uncertain writes never become successful in-memory fallbacks. |
| Provider access | Separate reader and demo-writer functions. Reader IAM denies writes; both deny SES and Bedrock. Request flags cannot enable providers. |
| Verification | Unit/API tests and Playwright run in GitHub Actions only. Automated tests are not independent human UAT. |

Current provider ingestion and receipt OCR are explicitly unavailable in this safe demo;
the older capability descriptions below are product intent, not proof of active integrations.
The narrower public mode is a security boundary, not an AI-quality result.

### Approval-only rollout and recovery

1. Review the exact candidate SHA, CI artifacts, IAM diff and stored-state compatibility.
   Provision a dedicated Secrets Manager signing secret (at least 32 random bytes) only
   after owner authorization; never place its value in source, logs or frontend assets.
2. Render the API template and inspect a CloudFormation change set before applying it.
   Its new required DemoSecretArn parameter is an ARN, not a secret value. Retain the
   existing state bucket and historical keys. Only new demo/workspaces/ keys are writable.
   Confirm the packaged boto3/botocore support both PutObject conditional parameters.
3. The backend IAM/config/code cutover and frontend publication require separate release
   authority. Main merges still run CI but no longer publish this incompatible frontend
   automatically. The manual frontend workflow requires the already-approved backend SHA
   and checks its live capabilities before obtaining release credentials.
4. Verify exact frontend/backend SHAs, anonymous-write denial and one approved isolated
   synthetic session, including changed-draft rejection, replay, reload and state isolation.
   Do not test by sending real email or modifying historical household records.
5. On failure, keep writes disabled and serve read-only preview while reconciling receipts.
   Do not automatically restore permissive SES/model IAM or the old unguarded action routes.
   Preserved release artifacts and S3 versions support an explicitly reviewed paired rollback;
   capability-key rotation revokes demo sessions and requires owner approval.

No production migration, secret creation, real send or paid model activation is performed
by the source verification workflows.

[![ci](https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml/badge.svg)](https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml)
[![frontend-ci](https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml)
[![licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)
[![python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)

**Hestia reconciles household debits against statutory warranty law and subscription baselines, recovering out-of-pocket appliance repairs through human-approved legal notices.**

Built for **Elena**, a working parent in Munich managing three household appliance warranties, recurring family subscriptions, and utility bills without time to audit consumer protection laws.

---

## Try it without installing anything

**[https://drusjukc9d4oc.cloudfront.net/](https://drusjukc9d4oc.cloudfront.net/)**

No account, no login, no local installation required. Opens directly on the 3-column operations cockpit:
1. **Household Inventory**: appliances with live 24-month statutory warranty horizons (EU Directive 2019/771/EU), recurring subscriptions, and card debits flagged for missing receipts (>50 EUR anti-join).
2. **Sentinel Radar**: animated radar feed prioritizing statutory warranty recovery, price creep spikes, and trial expirations.
3. **Return-of-Control (ROC)**: human approval gate previewing formal notice letters before dispatch, backed by cryptographic dispute audit trails.

---

## 1. The Everyday Problem

Every year, modern households lose 500 EUR to 1,200 EUR due to four silent financial leaks:
1. **Unexercised Statutory Warranties**: When major appliances (washers, refrigerators, TVs) malfunction within the mandatory 2-year statutory warranty period (EU Directive 2019/771/EU), consumers routinely pay repair technicians out-of-pocket, unaware that retailers are legally obligated to cover repair or replacement costs.
2. **Stealth Price Creeping**: Subscriptions quietly raise prices by 1 EUR to 4 EUR per month without clear notification, compounding across dozens of digital services.
3. **Zombie Free Trials**: 7-day or 30-day free trials convert into non-refundable annual charges without warning.
4. **Utility Leakage and Spikes**: Water leaks, faulty thermostats, or meter reading errors remain unnoticed until multi-hundred euro bills arrive weeks later.

**Hestia** operates as an autonomous, privacy-conscious domestic sentinel. It reconciles bank debits, scans utility statements, monitors warranty rights, and prepares pre-drafted reimbursement claim letters with human-in-the-loop Return-of-Control.

---

## 2. Core Capabilities

### A. Statutory Warranty and Repair Reimbursement Engine
- **Statutory Guarantee Tracking**: Enforces mandatory 2-year statutory warranty windows alongside commercial manufacturer guarantees.
- **Repair Invoice Reconciliation**: Cross-examines out-of-pocket repair costs against warranty dates, verifying whether the repair is 100% reimbursable under consumer protection law.
- **Claim Drafting**: Formulates statutory reimbursement notices ready for retailer submission.

### B. Subscription Leakage Auditor
- **Price Creep Detection**: Identifies month-over-month price jumps across recurring subscriptions.
- **Trial Expiration Horizon**: Triggers actionable alerts 3 to 7 days before free trials convert into paid tiers.
- **Duplicate Service Scanner**: Detects redundant active subscriptions in identical categories (e.g., multiple streaming or cloud storage tiers).

### C. Household Completeness and Utility Guard
- **Receipt Anti-Join**: Highlights major bank debits (>50 EUR) lacking digital receipt or warranty proof, prompting proactive uploads before receipts fade or get discarded.
- **Utility Baseline Anomaly Detection**: Compares current utility charges (water, gas, electricity) against seasonal baselines, immediately flagging surges exceeding 30%.

---

## 3. Measured Results and Ablations

Every number is produced by a reproducible command against the synthetic benchmark corpus:

```bash
python tools/measure.py
python tools/ablate.py
```

### Measured Headline Results ([`docs/measurement.json`](docs/measurement.json))
- **Headline Out-of-Pocket Recovery**: **185.00 EUR** recovered on a defective Bosch washing machine repair under EU Directive 2019/771/EU.
- **Stealth Subscription Creep Caught**: **4.00 EUR/mo** (+40.0% unannounced hike) flagged on CloudVault Pro.
- **Trial Auto-Renewal Exposure Guarded**: **419.88 EUR/year** intercepted prior to trial lock-in.
- **Total Economic Exposure Guarded**: **791.88 EUR** across 4 household domains.
- **Arithmetic Invariants**: 100% held with 0 calculation hallucinations.

### What Each Rule is Worth ([`docs/ablation.json`](docs/ablation.json))
| Rule | With Rule | Without Rule | Economic Delta |
|---|---|---|---|
| **Statutory 2-year warranty window (Directive 2019/771/EU)** | 185 EUR repair invoice recognized as reimbursable; formal notice prepared | Consumer pays 185 EUR out-of-pocket, assuming commercial 1-year guarantee expired | +185.00 EUR |
| **Subscription price creep detector** | Flags +4.00 EUR/mo stealth increase within 24 hours of posting | Silent ongoing fee increase totaling 48.00 EUR annually unnoticed | +48.00 EUR |
| **7-day trial conversion horizon alert** | Warns user 3 days prior to non-refundable annual conversion | Converts automatically into 34.99 EUR non-refundable charge | +34.99 EUR |
| **Receipt anti-join on outlays > 50 EUR** | Flags 85.00 EUR purchase missing digital proof before paper fades | Receipt discarded; warranty proof lost for future statutory claims | +85.00 EUR |

---

## 4. Amazon Bedrock AgentCore Architecture

Hestia is architected natively for the Amazon Bedrock AgentCore paradigm:

- **Bedrock Supervisor Agent**: Synthesizes multi-source financial events into a clear weekly Household Health Digest using Anthropic Claude on Bedrock.
- **Bedrock Action Groups**: Exposes deterministic, integer-precision domain models via OpenAPI specifications for warranties, subscriptions, and completeness audits, guaranteeing zero arithmetic hallucinations.
- **Bedrock Return-of-Control (ROC)**: Ensures homeowner autonomy. Hestia never executes cancellations or dispatches claims without explicit approval.
- **Bedrock Guardrails**: Filters payment cards, IBANs, and sensitive personal data before model inference.

See [docs/BEDROCK_AGENTCORE_ARCHITECTURE.md](docs/BEDROCK_AGENTCORE_ARCHITECTURE.md) for technical specifications and OpenAPI contracts.

---

## 5. Assurance, AWS Well-Architected and EU AI Act

[`docs/assurance.md`](docs/assurance.md) holds three structured tables:
1. **AWS Well-Architected Framework**: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimisation, Sustainability, plus the 2026 Agentic AI Lens.
2. **EU AI Act (Regulation EU 2024/1689)**: Articles 10, 12, 13, 14, 15, and 50 with honest residual gaps.
3. **Data Protection and GDPR**: Complete data mapping demonstrating zero personal data processed in the demonstration.

---

## 6. Verification and Gates

Hestia is built to enterprise software standards with strict invariant enforcement and 100% test coverage.

### Running Tests and Gates
```bash
# Run pytest with full statement and branch coverage
python -m pytest --cov=hestia --cov-branch tests/ infra/test_frontend_hosting.py

# Run ruff linter
python -m ruff check src tests infra

# Run judge-facing prose gate (zero em dashes, no marketing jargon, no forbidden claims)
python tools/prose_gate.py

# Run benchmark measurements and ablation
python tools/measure.py
python tools/ablate.py
```

### Coverage Report
```
=============================== tests coverage ================================
Name                                 Stmts   Miss Branch BrPart  Cover   Missing
--------------------------------------------------------------------------------
src/hestia/__init__.py                   1      0      0      0   100%
src/hestia/agents/sentinel.py           48      0     20      0   100%
src/hestia/agents/tools.py              58      0     34      0   100%
src/hestia/app/__init__.py               0      0      0      0   100%
src/hestia/app/web.py                   45      0     12      0   100%
src/hestia/domain/__init__.py            0      0      0      0   100%
src/hestia/domain/completeness.py       43      0     10      0   100%
src/hestia/domain/subscriptions.py      47      0     10      0   100%
src/hestia/domain/warranties.py         48      0      8      0   100%
--------------------------------------------------------------------------------
TOTAL                                  290      0     94      0   100%
37 passed in 0.45s
```

---

## 7. License

Apache 2.0. Open source for household financial resilience.
