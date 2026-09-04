# Hestia: Household Sentinel Amazon Bedrock AgentCore Architecture

This document specifies how Hestia's autonomous household financial, warranty, and subscription sentinel maps to the **Amazon Bedrock AgentCore** architecture and everyday consumer agent runtime primitives.

---

## 1. Executive Summary

Hestia is an everyday autonomous AI sentinel protecting family finances from silent leakage:
1. **Statutory Warranty Defense**: Automatically correlates appliance repair invoices against EU Directive 2019/771/EU 2-year mandatory conformity guarantees, drafting recovery claims.
2. **Subscription Leakage Mitigation**: Detects stealth month-over-month price hikes, tracks expiring free trials, and eliminates duplicate family streaming/software services.
3. **Completeness & Anomaly Detection**: Flags high-value bank expenses lacking proof-of-purchase and detects anomalous utility spikes (water, electricity, gas) before catastrophic leakages compound.

By adhering to the Amazon Bedrock AgentCore paradigm, Hestia decouples LLM conversational synthesis, deterministic consumer law logic, privacy guardrails, and persistent household memory into cloud-native primitives.

```
                  ┌─────────────────────────────────────────┐
                  │    Bank Feeds / Invoices / Utility Bills│
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │     Amazon Bedrock Guardrails (PII)     │
                  │   (Payment Cards, IBANs, Personal Data) │
                  └────────────────────┬────────────────────┘
                                       │ Sanitized Context
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Amazon Bedrock AgentCore Runtime                      │
│                                                                             │
│   ┌───────────────────────┐                 ┌──────────────────────────┐   │
│   │   Household Sentinel  │                 │    Claim Drafter Agent   │   │
│   │ (Claude 3.5 Haiku)    │                 │ (Claude 3.5 Haiku)       │   │
│   └───────────┬───────────┘                 └─────────────▲────────────┘   │
│               │                                           │                 │
│               ▼                                           │                 │
│   ┌───────────────────────────────────────────────────────┴────────────┐   │
│   │                 Bedrock Action Groups (Deterministic)              │   │
│   │   - ApplianceWarrantyActionGroup: check_status(), evaluate_claim() │   │
│   │   - SubscriptionActionGroup: detect_creep(), audit_trials()        │   │
│   │   - CompletenessActionGroup: audit_missing(), detect_spikes()      │   │
│   └───────────────────────────────────┬────────────────────────────────┘   │
│                                       │                                     │
│                                       ▼                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │        Homeowner Decision Hub (Bedrock Return-of-Control)          │   │
│   │   - Disputed Repair Claim -> Review Pre-Drafted Statutory Letter   │   │
│   │   - Expiring Trial -> One-Click Cancel / Reminder Trigger          │   │
│   │   - Utility Spike -> Household Leakage Alert Checklist             │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Bedrock AgentCore Primitive Mapping

| Hestia Component | Bedrock AgentCore Equivalent | Implementation & Role |
| :--- | :--- | :--- |
| **`hestia.agents.sentinel`** | **Supervisor Agent** | Orchestrates weekly household financial sweeps, compiling prioritized digests and actionable recovery items. |
| **`hestia.domain.warranties`** | **Bedrock Action Group: Warranty Engine** | Deterministic domain service calculating statutory periods, expiration milestones, and repair reimbursement eligibility. |
| **`hestia.domain.subscriptions`** | **Bedrock Action Group: Subscription Auditor** | Evaluates price deltas, trial expiration deadlines, and duplicate service categories without LLM arithmetic errors. |
| **`hestia.domain.completeness`** | **Bedrock Action Group: Completeness Reconciler**| Anti-joins bank transactions against saved receipts and flags utility baseline spikes exceeding predefined thresholds. |
| **Claim Drafter Agent** | **Bedrock Collaborating Agent** | Generates legally grounded claim letters under consumer protection regulations (e.g., EU Directive 2019/771/EU) using verified facts. |
| **Bedrock Return-of-Control**| **Human-in-the-Loop Gatekeeper** | Returns control to the homeowner for approval before dispatching dispute emails or cancelling recurring subscriptions. |

---

## 3. Bedrock Action Group OpenAPI Contract

Hestia exposes deterministic domain operations to the Bedrock AgentCore runtime via OpenAPI 3.0 schemas:

```yaml
openapi: 3.0.0
info:
  title: Hestia Household Sentinel Action Groups
  version: 1.0.0
  description: Deterministic household warranty, subscription, and completeness services for Amazon Bedrock.
paths:
  /warranties/evaluate-claim:
    post:
      summary: Evaluate out-of-pocket appliance repair against statutory warranty
      operationId: evaluateRepairClaim
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [itemName, purchaseDate, repairDate, repairAmountCents]
              properties:
                itemName:
                  type: string
                purchaseDate:
                  type: string
                  format: date
                repairDate:
                  type: string
                  format: date
                repairAmountCents:
                  type: integer
      responses:
        '200':
          description: Claim eligibility decision and statutory justification
          content:
            application/json:
              schema:
                type: object
                properties:
                  isCovered:
                    type: boolean
                  claimableAmountCents:
                    type: integer
                  reason:
                    type: string

  /subscriptions/audit:
    post:
      summary: Audit active recurring charges for price creep and trial expirations
      operationId: auditSubscriptions
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [charges, currentDate]
              properties:
                charges:
                  type: array
                  items:
                    type: object
                currentDate:
                  type: string
                  format: date
      responses:
        '200':
          description: List of detected anomalies and monthly cost impact
```

---

## 4. Operational Invariants and Safety

1. **Zero Hallucination Arithmetic**: Every euro and cent calculation is performed within Python integer-based domain models (`*_cents`), completely isolated from LLM token prediction.
2. **Deterministic Statutory Rules**: Expiration dates and statutory conformity periods are calculated according to jurisdictional consumer law, not estimated by language models.
3. **Homeowner Sovereignty**: Hestia never executes payment cancellations or legal claims without explicit homeowner Return-of-Control authorization.
