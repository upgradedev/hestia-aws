# Hestia AWS: The Autonomous Household Economic Sentinel
**Devpost Submission Dossier - Everyday Agents Track ($5,000 Gold Agent)**
**Challenge: AWS Agents for Humans Hackathon**

---

### Tagline
The autonomous household sentinel that watches receipts, protects statutory appliance warranties under EU law, and stops subscription leakage before you get billed.

---

### Inspiration
Every day, ordinary families lose an estimated €800 to €1,400 each year to silent financial friction:
1. Appliance breakdowns occurring 18 months after purchase are paid out-of-pocket because consumers forget that EU Directive 2019/771/EU mandates a 2-year statutory conformity guarantee from the retailer.
2. Subscription fees silently creep up by €2 to €4 a month (price creep), and free trials turn into unmonitored annual recurring charges.
3. Bank transactions over €50 lack invoice proof, jeopardizing home insurance claims and tax deductions.

Traditional budgeting apps demand relentless manual input: scanning receipts, tagging expenses, and checking dashboards. People do not want another app to manage. They need an autonomous background sentinel that runs silently on AWS, correlates household records against consumer protection law, and only surfaces when there is an actual decision to make.

---

### What It Does
Hestia is an everyday autonomous sentinel built with the AWS Strands Agents SDK and Amazon Bedrock AgentCore:
- **Live Interactive Demo (No Login Required)**: https://drusjukc9d4oc.cloudfront.net/
- **Warranty Sentinel**: Automatically monitors appliance purchase dates, tracks commercial vs. statutory warranty windows under EU Directive 2019/771/EU, and evaluates repair outlays. When an appliance breaks within the 2-year window, it drafts a legally airtight statutory demand letter citing the exact legal directives and serial numbers.
- **Subscription Auditor**: Ingests recurring transaction feeds to catch unannounced price hikes, identifies overlapping duplicate services (e.g. concurrent individual and family music plans), and alerts users 3 days before free trial expiration.
- **Household Completeness Engine**: Executes deterministic anti-joins between bank outflows and receipt archives (flagging transactions >€50 lacking tax/insurance documentation) and detects anomalous utility surges (>30% spike over baseline).
- **Bedrock Return-of-Control (ROC)**: Instead of pestering users with endless push notifications, Hestia holds critical actions at a human approval gate. The user receives a single actionable cockpit view to approve the drafted warranty claim letter or authorize a trial cancellation in one click.


---

### How We Built It
- **AWS Strands Agents SDK**: Orchestrates multi-agent coordination (`hestia.agents.sentinel`), separating read-only inspection tools from sensitive write actions.
- **Amazon Bedrock AgentCore**: Powers the Claim Drafter and reasoning agents using Claude 3.5 Haiku, backed by Pre-LLM PII Sanitizers to mask IBANs and payment card numbers before inference.
- **Architecture-First Deterministic Engines**: Pure integer-precision arithmetic (cents) guarantees zero mathematical hallucinations in financial and fee calculations.
- **EU Consumer Law Integration**: Directly embeds Directive 2019/771/EU statutory conformity rules and 14-day refund timelines into automated claim drafting.
- **Unified Mission-Control Web UI**: A zero-dependency 3-column operations cockpit served by AWS Lambda HTTP handlers, providing instant desktop and mobile visibility.

---

### Challenges We Overcame
1. **Preventing LLM Arithmetic Hallucinations**: Standard language models frequently make calculation errors with financial figures. We enforced a strict architecture pattern where all financial math, date comparisons, and warranty expirations are computed by pure, deterministic Python domain engines, passing verified facts into Bedrock prompts.
2. **True Bounded Autonomy (Return-of-Control)**: Defining the exact threshold where an agent should act autonomously versus when it must stop and request human authorization. We established strict authorization ceilings: routine logging and gap detection run autonomously, while external legal claims and service cancellations strictly require human approval.

---

### Accomplishments We Are Proud Of
- **100% Statement and Branch Test Coverage**: 35 unit and integration tests passing in under 0.4 seconds, with zero linter errors.
- **Real Legal Depth**: Transformed vague consumer protection rights into automated, enforceable recovery actions for real households.
- **100% Serverless & Zero Idle Cost**: Runs on AWS Lambda and Amazon Bedrock on-demand with $0.00 idle container burn.

---

### What We Learned
Everyday consumers do not want chatty AI assistants that ask questions for every routine task. The most powerful AI is the one that operates silently in the background and surfaces with a complete, verified solution ready for signature.

---

### What Is Next for Hestia
- Integration with Open Banking APIs (PSD2/PSD3) for real-time transaction ingestion.
- Multi-region statutory legal packs adapting to UK Consumer Rights Act 2015 and US Magnuson-Moss Warranty Act.
- Automated email dispatch via Amazon SES once human Return-of-Control approval is granted.

---

### Built With
- python
- aws-strands-sdk
- amazon-bedrock
- aws-lambda
- claude-3-5-haiku
- eu-directive-2019-771
