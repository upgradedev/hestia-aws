# How We Built an Autonomous Household Financial Sentinel with AWS Strands Agents SDK and Amazon Bedrock

*Published for the AWS Agents for Humans Hackathon (Everyday Agents Track)*

Every day, households lose money to routine oversights: forgotten warranties, sneaky subscription price increases, and misplaced receipts. While enterprise software has sophisticated FinOps platforms, everyday families are left with tedious manual spreadsheets.

In this article, we share how we built **Hestia AWS**, an autonomous household economic sentinel designed with the **AWS Strands Agents SDK** and **Amazon Bedrock AgentCore**. Our goal was simple: build an agent that runs quietly in the background, protects statutory consumer rights under EU law, and only surfaces when there is an actionable human decision.

---

## The Core Problem: The Bounded Autonomy Dilemma

When designing an everyday household agent, developers face a critical design choice:
- **Too passive:** The user has to initiate every scan, rendering the AI just another chores app.
- **Too active:** The agent hallucinates arithmetic, spams notifications, or triggers external financial cancellations without human oversight.

We resolved this by implementing **Bounded Autonomy** through three architectural pillars:
1. **Deterministic Domain Engines**: Pure integer-precision Python domain models calculate all monetary and legal timeframes, ensuring zero arithmetic hallucinations.
2. **Read-Only Autonomous Sentinels**: The agent sweeps appliance registries, bank transaction anti-joins, and subscriptions autonomously.
3. **Bedrock Return-of-Control (ROC)**: When an issue requires external action (e.g. demanding a €185.00 repair reimbursement from a retailer), the agent drafts the complete solution and pauses at an authorization gate.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       HESTIA ARCHITECTURAL FLOW                             │
│                                                                             │
│  [ Household Feeds ] ──> [ Pre-LLM PII Sanitizer ] ──> [ Strands Agent ]   │
│  (Receipts/Bills)         (GDPR Masking)               (Coordinator)        │
│                                                              │              │
│                                                              ▼              │
│  [ Statutory Proof ] <── [ Bedrock Return-of-Control ] <── [ Domain Tools ] │
│  (1-Click Human OK)      (Claim Drafter / Claude)      (EU 2019/771/EU)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Implementations

### 1. Statutory Warranty Enforcement (EU Directive 2019/771/EU)
Under EU consumer law, goods carry a mandatory 2-year statutory guarantee of conformity. If an appliance suffers a fault within 24 months, the retailer is legally obligated to repair or replace it free of charge.

In `hestia.domain.warranties`, our engine tracks elapsed statutory months versus commercial guarantees:

```python
def check_status(self, current_date: date) -> tuple[WarrantyStatus, int]:
    expiry = self.get_expiry_date()
    days_left = (expiry - current_date).days
    if days_left < 0:
        return WarrantyStatus.EXPIRED, days_left
    if days_left <= 60:
        return WarrantyStatus.EXPIRING_SOON, days_left
    return WarrantyStatus.ACTIVE, days_left
```

When an out-of-pocket repair occurs during the guarantee period, Hestia automatically generates a formal statutory demand letter ready for homeowner signature.

### 2. Receipt Anti-Join & Completeness
In `hestia.domain.completeness`, the sentinel executes an anti-join between bank transactions and saved receipts. Any outflow exceeding €50 lacking proof of purchase is flagged before tax deadlines or insurance claim windows expire.

### 3. Subscription Creep & Free Trial Traps
Subscriptions frequently increase rates by €1 to €4 per month without prominent notices. Hestia compares billing history against baselines, flagging unannounced price creeps and notifying users 3 days prior to free trial conversion.

---

## Why AWS Strands and Amazon Bedrock

The AWS Strands Agents SDK provides clean tool schema binding and multi-agent coordination. By integrating Claude 3.5 Haiku on Amazon Bedrock:
- Latency remains under 50ms for tool evaluations.
- Pre-LLM guardrails mask personal IBANs and card numbers before tokenization.
- The system runs 100% serverless on AWS Lambda with $0.00 idle cost.

---

## Conclusion

Building agents for humans means respecting human attention. By combining deterministic domain logic with the AWS Strands Agents SDK, Hestia proves that everyday household AI can be legally rigorous, financially protective, and respectful of human autonomy.
