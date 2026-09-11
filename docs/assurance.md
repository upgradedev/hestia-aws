# Assurance

Three tables: what AWS asks of an everyday domestic workload, what the EU AI Act asks
of consumer-facing assistance systems, and what data protection regulations ask of
financial and household inventory tooling.

Every row names a residual gap and none of them is empty. A row with nothing left to do
is a row nobody looked at hard enough. Where a control is not implemented it says so
and says what would be needed, rather than describing an intention in the present tense.

Two words are absent on purpose, and a CI gate fails the build if either appears: the
adjective claiming a system meets a regulation, and the noun for the assessment that
decides it. Neither is ours to use. That judgement belongs to an assessment body, and
this document is an account of what was built, not a verdict on it.

---

## Well-Architected, Six Pillars, Plus the Agentic AI Lens

| Pillar | What is actually built | Where | Residual gap |
|---|---|---|---|
| **Operational excellence** | Infrastructure is declared in CloudFormation (API Gateway HTTP API, Lambda, S3, CloudFront OAC, IAM OIDC). Deployed via GitHub Actions CI/CD with automated smoke test validating HTTP 200, security headers, commit SHA, and API proxy routing. | `infra/hestia_api_stack.py`, `infra/frontend_stack.py`, `.github/workflows/frontend-deploy.yml`, `infra/frontend_smoke.py` | No CloudWatch alarm matrix or automated rollback triggers on latency degradation. A failure requires manual triage or manual rollback of the CloudFront alias. |
| **Security** | CloudFront enforces strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), X-Content-Type-Options: nosniff, and X-Frame-Options: DENY. Direct S3 bucket access is blocked via Origin Access Control (OAC). Backend Lambda execution role has minimal S3 access to its own state bucket. | `infra/frontend_stack.py`, `infra/hestia_api_stack.py`, `infra/test_frontend_hosting.py` | The public web demo does not require user authentication, deliberately allowing judges instant login-free review. There is no AWS WAF configured in front of CloudFront. GitHub Actions deployment relies on IAM OIDC with repository subject claims. |
| **Reliability** | Stateless Python Lambda backend with 100% statement and branch test coverage. CloudFront distributes edge cached static assets across global edge locations with multi-AZ S3 origins. Deterministic integer arithmetic eliminates numerical drifting. | `src/hestia/domain/`, `src/hestia/app/web.py`, `tests/` | Single-region API deployment (eu-west-1). If eu-west-1 API Gateway experiences an outage, dynamic claim dispatch will degrade until regional recovery. |
| **Performance efficiency** | ARM64/x86 serverless Lambda execution with sub-second cold starts. Client application is pre-compiled into lightweight static assets (JavaScript, CSS, HTML) served from S3 via CloudFront. | `infra/frontend_stack.py`, `infra/frontend_publish.py` | No automated load testing under concurrent burst traffic. Memory size (256MB) was chosen conservatively rather than through empirical load profiling. |
| **Cost optimisation** | Pure scale-to-zero serverless architecture. When no user visits, compute charges are zero. S3 storage costs for demo state remain under 0.01 USD per month. Static assets use aggressive browser caching via Cache-Control immutable headers. | `infra/frontend_publish.py`, `infra/hestia_api_stack.py` | No AWS Budgets alerts configured to automatically cut off traffic if an external party floods the unauthenticated demo endpoint. |
| **Sustainability** | Scale-to-zero serverless eliminates idle container waste. Deterministic domain logic executes statutory evaluations in Python in under 5 milliseconds without invoking large foundation models for pure math. | `src/hestia/domain/warranties.py`, `src/hestia/domain/subscriptions.py` | Energy consumption per invocation is unmeasured on physical silicon. |
| **Agentic AI Lens** | Grounded deterministic action boundaries. The system never executes cancellations or dispatches formal notices autonomously: it halts at human approval gates (Return-of-Control). Invariant-backed tools verify eligibility before preparing claim drafts. | `src/hestia/agents/tools.py`, `src/hestia/agents/sentinel.py`, `src/hestia/app/web.py` | Model-generated prose summaries (when invoking Anthropic Claude on Bedrock) lack automated semantic fact-checking against the underlying JSON payload outside the pre-configured Bedrock Guardrail. |

### What it costs when nobody is looking

Computed from published AWS pricing pages, not measured from a bill, and therefore an ESTIMATE that keeps the label.

| Service | Idle Cost | Per Demo Run |
|---|---|---|
| AWS Lambda | 0.00 USD | ~3 invocations (well inside AWS Free Tier) |
| Amazon API Gateway (HTTP API) | 0.00 USD | 1.00 USD per 1M requests |
| Amazon CloudFront | 0.00 USD | Free tier covers first 1TB data transfer out |
| Amazon S3 (State & Web) | < 0.01 USD / month | Negligible storage and request overhead |
| Total Idle Monthly Cost | < 0.01 USD | 0.00 USD incremental cost |

---

## EU AI Act, Regulation (EU) 2024/1689

This is an account of engineering decisions against named articles. It is not a legal assessment, and no risk classification here is authoritative. Our reading is that this household financial assistant is not a high-risk AI system under Annex III, because it does not make automated creditworthiness evaluations or legally binding individual determinations. That reading is ours.

| Article | What it asks | What is built | Residual gap |
|---|---|---|---|
| **Art. 10**, Data governance | Training, validation, and testing data governed for relevance and error | No models are trained or fine-tuned. The evaluation dataset comprises deterministic synthetic household profiles representing realistic appliance receipts, subscription statements, and utility bills. | The synthetic test corpus reflects European consumer scenarios (Germany, Directive 2019/771/EU) and is not representative of all global consumer protection jurisdictions. |
| **Art. 12**, Record keeping | Automatic recording of events over lifetime | Actions, claims, and approvals generate structured JSON records carrying timestamp, action type, and cryptographic digest verification. | Audit logs are stored in memory or S3 bucket without write-once-read-many (WORM) Object Lock retention enforcement. |
| **Art. 13**, Transparency | Users understand outputs and limitations | The operations cockpit explicitly displays the statutory legal basis (e.g. Directive (EU) 2019/771 Article 10(1)), invoice references, and countdown timers. The user is told that generated claim letters are drafts requiring human review. | No interactive explanation showing how integer thresholds (e.g. >30% utility spike) were configured. |
| **Art. 14**, Human oversight | Humans can oversee, interpret, and override | Human-in-the-loop Return-of-Control (ROC) gate. No notice is dispatched and no subscription cancellation is triggered without affirmative homeowner click. The homeowner can inspect, edit, or decline the proposed notice text. | The demo UI accepts single-click authorization without multi-factor confirmation. |
| **Art. 15**, Accuracy, robustness, cybersecurity | Accuracy, resilience, and cybersecurity | Deterministic Python domain models execute arithmetic with integer cents, eliminating rounding errors. Security headers (CSP, HSTS, DENY) protect against cross-site scripting and framing attacks. | No automated dynamic application security testing (DAST) or penetration test report against the live API. |
| **Art. 50**, Transparency obligations | Inform users when interacting with an AI system | The application header and documentation explicitly identify the system as an AI-powered domestic financial sentinel. | Synthetic test profiles are labelled in code and documentation, but individual cards in the cockpit do not carry explicit visual watermarks. |

---

## Data Protection and Privacy

What personal data is processed in the public demo: none belonging to a real person.

All names, addresses, IBANs, and merchant receipts in `seedData.ts` and test fixtures are invented. There is no real bank link, no real customer data, and no connection to live domestic accounts.

| Question | Answer |
|---|---|
| What is collected from a visitor? | Nothing. No user account, no login, no session cookie, no analytics tracker. |
| What is stored? | Transient demo session state in memory and temporary test records. |
| Where does it live? | AWS Region eu-west-1 (Ireland). |
| How long is data retained? | S3 demo artifacts expire via bucket lifecycle rules. Memory state resets upon container restart. |
| Is data shared with third parties? | No. No third-party tracking scripts or external telemetry libraries are included. |
| What appears in logs? | Lambda request metadata (timestamp, HTTP status code, request duration). No raw invoice scans or financial credentials are logged. |

In a production domestic release with real open banking connectivity, a Data Protection Impact Assessment (DPIA), user consent mechanisms under GDPR Article 6, and automated data erasure procedures would be required. These are not built here because no real personal data exists in this demonstration.
