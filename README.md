# Hestia AWS: Autonomous Household Financial and Warranty Sentinel

> **Everyday Agents Track Submission**  
> An autonomous domestic financial sentinel protecting family budgets from silent leakage, unexercised appliance warranties, stealth subscription hikes, and utility anomalies.

---

## 1. The Everyday Problem

Every year, modern households lose €500 to €1,200 due to four silent financial leaks:
1. **Unexercised Statutory Warranties**: When major appliances (washers, refrigerators, TVs) malfunction within the mandatory 2-year statutory conformity period (EU Directive 2019/771/EU), consumers routinely pay repair technicians out-of-pocket, unaware that manufacturers are legally obligated to cover repair or replacement costs.
2. **Stealth Price Creeping**: Subscriptions quietly raise prices by €1 to €3 per month without clear notification, compounding across dozens of digital services.
3. **Zombie Free Trials**: 7-day or 30-day "free trials" convert into non-refundable annual charges without warning.
4. **Utility Leakage and Spikes**: Water leaks, faulty thermostats, or meter reading errors remain unnoticed until multi-hundred euro bills arrive weeks later.

**Hestia** solves this by operating as an autonomous, privacy-conscious sentinel in the home. It reconciles bank debits, scans utility statements, monitors warranty rights, and prepares pre-drafted reimbursement claim letters with human-in-the-loop Return-of-Control.

---

## 2. Core Capabilities

### A. Statutory Warranty & Repair Reimbursement Engine
- **Statutory Conformity Tracking**: Enforces mandatory 2-year statutory warranty windows alongside commercial manufacturer guarantees.
- **Repair Invoice Reconciliation**: Cross-examines out-of-pocket repair costs against warranty dates, verifying whether the repair is 100% reimbursable under consumer protection law.
- **Claim Drafting**: Formulates legally compliant reimbursement requests ready for manufacturer submission.

### B. Subscription Leakage Auditor
- **Price Creep Detection**: Identifies month-over-month price jumps across recurring subscriptions.
- **Trial Expiration Horizon**: Triggers actionable alerts 3 to 7 days before free trials convert into paid tiers.
- **Duplicate Service Scanner**: Detects redundant active subscriptions in identical categories (e.g., multiple streaming or cloud storage tiers).

### C. Household Completeness & Utility Guard
- **Receipt Anti-Join**: Highlights major bank debits (>€50) lacking digital receipt or warranty proof, prompting proactive uploads before receipts fade or get discarded.
- **Utility Baseline Anomaly Detection**: Compares current utility charges (water, gas, electricity) against seasonal baselines, immediately flagging surges exceeding 30%.

---

## 3. Amazon Bedrock AgentCore Architecture

Hestia is architected natively for the Amazon Bedrock AgentCore paradigm:

- **Bedrock Supervisor Agent**: Synthesizes multi-source financial events into a clear weekly Household Health Digest using Anthropic Claude on Bedrock.
- **Bedrock Action Groups**: Exposes deterministic, integer-precision domain models via OpenAPI specifications for warranties, subscriptions, and completeness audits, guaranteeing zero arithmetic hallucinations.
- **Bedrock Return-of-Control (ROC)**: Ensures homeowner autonomy. Hestia never executes cancellations or dispatches claims without explicit approval.
- **Bedrock Guardrails**: Filters payment cards, IBANs, and sensitive personal data before model inference.

See [docs/BEDROCK_AGENTCORE_ARCHITECTURE.md](docs/BEDROCK_AGENTCORE_ARCHITECTURE.md) for complete technical specifications and OpenAPI contracts.

---

## 4. Verification and Test Suite

Hestia is built to enterprise software standards with strict invariant enforcement and 100% test coverage.

### Running Tests
```bash
python -m pytest --cov=hestia --cov-report=term-missing
```

```
=============================== tests coverage ================================
Name                                 Stmts   Miss Branch BrPart  Cover   Missing
--------------------------------------------------------------------------------
src\hestia\__init__.py                   1      0      0      0   100%
src\hestia\agents\sentinel.py           48      0     20      0   100%
src\hestia\domain\__init__.py            0      0      0      0   100%
src\hestia\domain\completeness.py       43      0     10      0   100%
src\hestia\domain\subscriptions.py      47      0     10      0   100%
src\hestia\domain\warranties.py         48      0      8      0   100%
--------------------------------------------------------------------------------
TOTAL                                  187      0     48      0   100%
19 passed in 0.40s
```

### Running Linting
```bash
python -m ruff check src tests
```

```
All checks passed!
```

---

## 5. License

Apache 2.0. Open source for household financial resilience.
