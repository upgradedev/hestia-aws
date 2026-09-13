<p align="center">
  <img src="docs/assets/banner.svg" alt="Hestia keeps a household's receipts, guarantees and repair cases together" width="100%">
</p>

<p align="center">
  <a href="https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml"><img alt="Backend CI" src="https://github.com/upgradedev/hestia-aws/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml"><img alt="Frontend CI" src="https://github.com/upgradedev/hestia-aws/actions/workflows/frontend-ci.yml/badge.svg?branch=main"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3f6f55"></a>
  <img alt="Python 3.11" src="https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <a href="docs/strands-agents.md"><img alt="Strands Agents 1.53.0" src="https://img.shields.io/badge/Strands%20Agents-1.53.0-b4520a"></a>
  <img alt="Amazon Bedrock with Claude Haiku 4.5" src="https://img.shields.io/badge/Amazon%20Bedrock-Claude%20Haiku%204.5-6b4fbb?logo=anthropic&logoColor=white">
  <a href="docs/architecture.md"><img alt="AWS Lambda, S3 and CloudFront" src="https://img.shields.io/badge/AWS-Lambda%2C%20S3%2C%20CloudFront-232f3e"></a>
</p>

<p align="center">
  <a href="https://drusjukc9d4oc.cloudfront.net/"><b>Live demo</b></a> ·
  <a href="docs/devpost-submission.md#testing-instructions-for-judges">Judge walkthrough</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/strands-agents.md">Strands Agents</a> ·
  <a href="docs/testing.md">Testing</a>
</p>

Hestia is an everyday agent for the paperwork a household never keeps together: receipts, guarantees, subscriptions and repair bills. A Strands agent on Amazon Bedrock reads the household's records and points at the decisions waiting. The household reads the exact notice and approves it, and nothing is ever sent.

Built for the AWS Agents for Humans hackathon, Everyday Agents track.

> [!NOTE]
> The demo household is fictional and its amounts are synthetic. Approvals are recorded, never sent, and no money moves.

<p align="center">
  <img src="docs/assets/home.png" alt="Hestia Home: the Start here block with three ways to add records, and the agent review with its live model chips" width="900">
  <br>
  <sub>Home on the live demo during a production acceptance run.</sub>
</p>

## Try it

1. Open the [live demo](https://drusjukc9d4oc.cloudfront.net/) and click **Start with the sample household**. You get a private copy for 30 minutes, with no account.
2. Under **Start here**, report a repair, add an appliance you own, or paste a receipt or order email. Every record waits for you to check and confirm it before it is saved.
3. Click **Ask Hestia to review this household**. A Strands agent reads the records through four tools and writes a short briefing. **Tool trace** shows every call.
4. Click **Review the exact notice**, read it, and click **Approve this notice (recorded, not sent)**.
5. Follow the saved case file through replies, deadlines, evidence and outcomes. **About** lists what runs and what does not.

The step-by-step walkthrough for judges is in [docs/devpost-submission.md](docs/devpost-submission.md#testing-instructions-for-judges).

## How it works

The agents read; the household decides.

- **Review agent.** A Strands agent with four read-only tools (repair evidence, subscriptions, receipts and utilities, case timeline) writes a briefing under three headings. A pattern guard withholds a briefing that claims an entitlement or names an amount no tool returned. Without the model, the same tools run deterministically and the page says why.
- **Reading agent.** A second Strands agent, with no tools, turns pasted receipt or order text into proposed records. They land in the same review form as manual entry, and nothing is saved until the household confirms.
- **Deterministic where it matters.** The notice, the single-use approval and every case transition are plain Python. The approval is recorded as a simulation, and email sending is not connected.
- **Bounded.** 3 reviews and 3 readings per private copy, 200 model calls per day in total, 700 output tokens and a 20-second timeout.

Code-level detail with file references: [docs/strands-agents.md](docs/strands-agents.md).

## Architecture

<p align="center">
  <img src="docs/assets/infrastructure.svg" alt="AWS resources: CloudFront and S3 for the web app, API Gateway with reader and writer Lambda functions, S3 state, Amazon Bedrock, Secrets Manager, CloudWatch Logs and the release path" width="100%">
</p>

- **Web app:** React 19 and Vite, served from a private S3 bucket through CloudFront.
- **API:** an API Gateway HTTP API in front of two Lambda functions on Python 3.11. A read-only function answers GET requests, and a writer handles every change.
- **State:** one JSON document per private copy in S3, written with conditional requests so a lost race never overwrites a case.
- **Model:** Claude Haiku 4.5 on Amazon Bedrock through an EU inference profile, callable by the writer only.
- **Release:** GitHub Actions builds and tests. The backend ships as a reviewed CloudFormation change set, and the web app through GitHub OIDC.

Request flow, trust boundaries and every resource: [docs/architecture.md](docs/architecture.md).

## What is real

| Capability | Status | Code |
|---|---|---|
| Strands review and reading agents on Amazon Bedrock | Live | `src/hestia/agents/household_agent.py` |
| Household records: appliances, repairs, imported facts | Live, confirmed by the household before saving | `src/hestia/domain/intake.py` |
| Notice preparation and approval | Live; the approval is recorded as a simulation | `src/hestia/app/claims.py` |
| Case file with replies, deadlines and outcomes | Live; outcomes are attested by the household | `src/hestia/app/cases.py` |
| Conditional S3 state, one private copy per session | Live | `src/hestia/adapters/storage.py` |
| Email sending through Amazon SES | Not connected; IAM denies it | `infra/hestia_api_stack.py` |
| Bank feeds, mailbox or retailer sync, receipt photo OCR | Not connected | `src/hestia/adapters/storage.py` |
| Bedrock AgentCore, Bedrock Guardrails | Not connected | [docs/architecture.md](docs/architecture.md#what-runs-where) |

Every mode with its evidence and limits is in [docs/architecture.md](docs/architecture.md#what-runs-where). Briefing quality and extraction accuracy are unmeasured, and independent human UAT is NOT_RUN.

## Run it locally

```bash
pip install -e ".[dev]"
python -m pytest
```

To click through the app, run the real API handler on loopback and the Vite dev server, then open http://127.0.0.1:3000. The local API keeps state in memory and has no model, so a review runs the tools deterministically.

```bash
cd frontend && npm ci && cd ..
CI=true python scripts/ci_api_server.py --port 8000 &
npm --prefix frontend run dev -- --port 3000
```

Browser tests and CI: [docs/testing.md](docs/testing.md). Releasing to AWS: [docs/deployment.md](docs/deployment.md).

## Documentation

| Document | What it covers |
|---|---|
| [Architecture](docs/architecture.md) | request flow, components, AWS resources, what runs where, trust boundaries |
| [Strands Agents](docs/strands-agents.md) | both agents, their tools, guard, limits and permissions, with line references |
| [Testing](docs/testing.md) | local commands, CI, the suites and the integration testbook |
| [Deployment](docs/deployment.md) | the release runbook and the evidence for the deployed revision |
| [Assurance](docs/assurance.md) | open gaps, the legal boundary, data handling and provenance |
| [Devpost text](docs/devpost-submission.md) | the submission text and the judge walkthrough |
| [Builder article](docs/builder-aws-article.md) | a draft article on the design |
| [Video script](docs/video-script.md) | the demo video beats and production pipeline |

## License

MIT. See [LICENSE](LICENSE).
