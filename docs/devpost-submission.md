# Devpost submission text: Hestia

AWS "Agents for Humans" hackathon, Everyday Agents track. Everything below describes the code on `main` of the upgradedev/hestia-aws repository on GitHub. Read `GET /healthz` on the live URL for the deployed revision before testing; [deployment.md](https://github.com/upgradedev/hestia-aws/blob/main/docs/deployment.md) lists the release evidence.

## Tagline

Reads a household's receipts and repair records with Strands agents, and records a notice only when you approve it. No notice or email is sent.

## Inspiration

A washing machine fails in month 22. The receipt is in a drawer, the repair invoice is in an email, the seller's address is on the website, and the question "can I ask the seller to review this?" never gets asked because nobody keeps the case together. Around it sit smaller leaks: a trial ending three days after this demo space opens, a backup plan that went from 9.99 to 13.99, a receipt missing for a hardware-store purchase. The track brief says the best everyday agents run quietly and only ping you when there is a real decision to make. Hestia implements that decision-only surface today; automatic triggers wait on bank and mailbox connections that are not built.

## What it does

The surface is the household's own case page in the browser, at the live URL, with no account and no login. The trigger today is the household asking for a review from the Home page; the intended trigger, a review after each imported statement, waits on bank and mailbox connections that are not built. What it replaces is the folder of receipts, the spreadsheet of subscriptions and the letter the household never writes.

For Elena Georgiou, who runs Athens Apartment 4B, Hestia does five things:

1. The records are hers to add. **Start here** on Home opens three doors: report a repair, add an appliance she owns, or paste a receipt or order email. An appliance carries its receipt reference, seller, purchase date, guarantee months and any product, manual or quick start link she saved, so the Records page becomes the catalogue that replaces the drawer of paper manuals. Pasting is the one place a model touches intake: a tool-less Strands agent reads the pasted text, and Hestia stores its proposed records as a draft for her to correct. Only the exact changes she confirms enter the household records.
2. A Strands agent on Amazon Bedrock reads her recorded appliances, subscriptions, transactions, utility bills and saved case through four tools, then writes a briefing in three fixed sections: what it checked, the decisions waiting for her, one suggested next step. It points; it does not decide eligibility.
3. The notice to the seller (Acropolis Appliance Store, about the Bosch washing machine and the recorded EUR 185.00 repair) is prepared on the server from the recorded facts by deterministic Python, not by the model. Elena reads the exact recipient, subject, amount and text, then approves it with a single-use token bound to that exact draft. A repair she reports on an appliance of her own runs into the same flow.
4. Reviewing the notice opens the case file, and approving it moves the case to Authorized. The approval is recorded as a simulation (`delivery_status` `SIMULATED`, no email). The timeline then holds replies, silence, extra evidence, planning deadlines and attested outcomes, each with who recorded it, when and from which source.
5. Subscription and receipt decisions sit next to it. A trial is ending (Fitness Stream Pro), and she can record a cancellation request. A price change (Cloud Backup Vault, 9.99 to 13.99) opens the subscription record. A receipt is missing for EUR 85.50 at Piraeus DIY Supplies, and she can link a receipt reference. An electricity bill is above baseline, and she can record a review request. Two overlapping music plans are flagged by the agent's subscription tool and on the Records page. None of these contacts a provider.

How the agents are limited:

- 3 reviews and 3 text readings per private copy.
- One shared daily limit of 200 reviews and readings, kept in a conditional S3 counter. A review can make several model requests in its tool loop.
- 700 output tokens and a 20-second timeout for each model call.
- A pattern guard that withholds a briefing if it matches entitlement or deadline phrases such as "entitled to" or "statutory deadline", names a euro amount the tool outputs do not contain, runs over 3200 characters, or never mentions review.

If no model is configured, a limit is reached, the budget cannot be confirmed, or the model call fails or times out, the review runs the four tools deterministically and the page says which of these happened. The tool trace is one click away.

Reading pasted text has no deterministic equivalent, so it fails closed. A missing model, used-up readings, a spent or unconfirmed daily budget or a model failure returns an error, creates no intake draft and points the household at manual entry. An attempted reading may still retain its input hash, audit event and usage accounting; Hestia does not retain the raw pasted text.

## How we built it

- Strands Agents SDK 1.53.0, pinned in the Lambda bundle: a `strands.Agent` over a `BedrockModel` for `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in `eu-west-1` with 700 output tokens, temperature 0.2 and streaming off; four `@tool` functions built per private copy from plain Python callables, so the schema comes from signatures and docstrings; the tool trace from `agent.messages` and usage from `result.metrics.accumulated_usage`. A second, tool-less `strands.Agent` at temperature 0.0 reads pasted text and returns JSON records, which a server-side allow-list of kinds and keys narrows before a person sees them. File: `src/hestia/agents/household_agent.py`; details in [strands-agents.md](https://github.com/upgradedev/hestia-aws/blob/main/docs/strands-agents.md).
- Amazon Bedrock: the writer role may invoke one Claude Haiku 4.5 inference profile and its foundation model; the reader role denies `bedrock:*`.
- AWS Lambda behind an Amazon API Gateway HTTP API: a reader function answers the default route, and a writer function answers an explicit list of POST routes in `infra/hestia_api_stack.py`. Both deny SES and object deletes. Python 3.11, boto3 1.43.93 bundled.
- Amazon S3: one JSON document per private copy, created with `If-None-Match` and updated with `If-Match`, so a lost race never overwrites a case; the daily model budget uses the same conditional writes.
- Amazon CloudFront with S3 for the React 19 and Vite frontend, same-origin API routing, no credentials in JavaScript.
- AWS Secrets Manager holds the session signing key, which CloudFormation resolves into the functions at deploy time.
- GitHub Actions: lint, a prose check over `README.md`, `docs/*.md` and the video narration (`tools/prose_gate.py`), pytest with a coverage threshold, Lambda packaging with pinned SDKs and the rendered CloudFormation template; Playwright journeys against the real Lambda handler behind a loopback HTTP server; a manually dispatched frontend release through GitHub OIDC, gated on the live backend health; production acceptance against the live URL.
- Backend release: CI packages the Lambda zip and renders the template as an artifact. `scripts/release_backend.py`, run by the owner, downloads that artifact from a successful `main` run, checks `SHA256SUMS`, uploads it once, prepares a CloudFormation change set, refuses one that removes or replaces resources, executes it only with `--execute`, and then checks `/healthz` for the released commit. Runbook: [deployment.md](https://github.com/upgradedev/hestia-aws/blob/main/docs/deployment.md).
- Deterministic notice: `draft_statutory_claim_letter` in `src/hestia/agents/tools.py` writes the review request from recorded facts and cites Directive (EU) 2019/771 as general reference only.
- Reused from the author's earlier projects: the CloudFront and S3 hosting template (`infra/frontend_stack.py`). Everything else was written for Hestia, including the video tooling in `video/`.

## Challenges we ran into

- Keeping the model from deciding money or law. The review agent writes the briefing and can read recorded amounts and warranty boundaries. The reading agent only proposes intake facts, which count only after the household confirms them, and it never proposes a repair amount. The notice, the approval and every case transition are deterministic. The guard had to be strict enough to catch a sentence that promises a refund and loose enough to let "requires review" through.
- Bounding cost on a public URL with no login. Per-copy and per-day limits are enforced on the server with S3 conditional writes; an unconfirmed budget means no model call.
- A Lambda that reports its own configuration. `/healthz` reports the commit, `live_model`, the model id and the limits, and the frontend release gate refuses to publish unless that health names the approved backend commit, `live_model` true with a model id, `live_send` false, and configured storage and sessions.
- Saying what is not built, on the page where it would be expected. The About page lists every mode beside the feature it limits.

## Accomplishments we are proud of

- A Strands agent on the public path with a visible tool trace, a stated fallback reason and a guard, covered by `tests/test_household_agent.py` (tools-only mode, guard rejections and acceptances, fallback on error and timeout, the conditional daily counter, caps, health reporting).
- A model that proposes and waits for confirmation: pasted text becomes a stored staged draft that the household edits, consents to and commits. Only confirmed changes enter the household records. `tests/test_registry_intake.py` covers the route failing closed without a model and past its cap, a timeout keeping the reading counted, an identical paste replaying without a second call, and the appliance and repair intake behind it.
- An approval that cannot be replayed into a second record and cannot be applied to changed evidence: `src/hestia/app/claims.py`.
- A case lifecycle whose every entry names its actor, time and source, and whose outcomes are capped at the recorded repair amount: `src/hestia/domain/cases.py`.
- Reader and writer separation with IAM denies for Bedrock (reader), SES and deletes (both): `infra/hestia_api_stack.py`.
- A green production acceptance run against the live URL, including a live text reading: see [deployment.md](https://github.com/upgradedev/hestia-aws/blob/main/docs/deployment.md).

## What we learned

We believe the agent earns trust by reading and pointing, not by acting. A three-section briefing with a visible tool trace, and a deterministic notice the person can read in full, turn "the AI wrote a letter" into "I approved this letter". We have not measured this with independent users.

## What's next

- Distribution through the surfaces households already open: a bank's transaction feed, a retailer's order history and an insurer's claim portal, each with explicit consent and a visible provenance label. Reading a pasted order email already works; reading the mailbox it came from does not.
- Receipt OCR from a photo or a PDF through Bedrock vision, staged behind the same review-and-commit intake that carries the pasted-text path.
- A measurement of extraction quality: today the model's proposals pass a server allow-list and the same field checks as typed records, then the household reviews them; no accuracy figure is claimed.
- Email delivery through Amazon SES only after a separate consent step, with the approval token and digest carried into the sent record.

## Built with

Python 3.11, Strands Agents SDK 1.53.0, Amazon Bedrock (Claude Haiku 4.5), AWS Lambda, Amazon API Gateway (HTTP API), Amazon S3, Amazon CloudFront, AWS CloudFormation, AWS Secrets Manager, boto3 1.43.93, React 19, TypeScript, Vite, Tailwind CSS, Playwright, pytest, GitHub Actions.

## Testing instructions for judges

Before you start, open https://drusjukc9d4oc.cloudfront.net/healthz. `commit` is the deployed backend revision and `live_model` says whether the Strands agents may call Bedrock there. If `live_model` is `false`, the review button runs the four tools deterministically and says why no model was called, and the paste tab says the model is not configured. Everything else below works either way.

1. Open https://drusjukc9d4oc.cloudfront.net/ and click **Start with the sample household**. This creates a stored demo space whose access expires after 30 minutes. Its data is not automatically deleted, so use only fictional, non-sensitive details. No account or login is needed, and no notice or email is sent to anyone.
2. On **Home**, under **Start here**, click **Add an appliance you own**. Give it a short appliance ID of your own (for example `fridge-kitchen`), the item, purchase date, seller name and email, and a receipt or order reference. Brand, model, serial, price, guarantee months (24 and 0 by default) and product, manual and quick start links are optional. Click **Check these facts**, then **Review exact changes**, tick the confirmation and click **Confirm and save**, then **Close**. Open **Records**: your item is in the appliance catalogue beside the sample ones, with the links you saved, or labelled "Search" links where you saved none.
3. In the catalogue, click **Report a repair** on your item. The Start here door on Home opens the same form with the first appliance preselected, so from there choose yours under **Which appliance broke?**. Enter the repair date, the repair cost and what broke, then click **Check these facts**, then **Review exact changes**, tick the confirmation and click **Confirm and save**, then **Close**. The appliance now has an open repair.
4. Back on **Home**, click **Paste a receipt or order email**. When the model is live, the tab shows how many of the 3 text readings are left. Paste fictional, non-sensitive text and click **Ask Hestia to read it**. A tool-less Strands agent proposes records, and Hestia stores them as a staged draft under **Check what Hestia read**. Correct the draft, then confirm the exact changes that may enter the household records. If the model call fails, no intake draft is created, but an audit event, input hash and usage accounting may be retained. Click **Close** before the next step.
5. Click **Ask Hestia to review this household**. Expect a few seconds, then a briefing with three headings and a row of chips: the mode (**Live model via Strands Agents**, or **Deterministic checks only**), the model id, the Strands version, tokens and seconds, and how many of the 3 model reviews are left. Open **Tool trace** to read each tool call and its output. Click **Ask Hestia again** up to twice more; the fourth request runs deterministically and says so.
6. Click **Review the exact notice** on a repair card on Home: the sample washing machine, or the repair you reported. The dialog shows the claimant, the seller and the seller's email address, the subject, the recorded repair cost and the full text. Click **Approve this notice (recorded, not sent)**. Expect "Simulated approval recorded. No email sent and no reimbursement recorded."
7. Click **Continue to the saved case and next step**. The case shows status Authorized, the next step and a timeline. In **Add a case update**, choose **Start response tracking**, add a summary, an evidence reference and a planning date, and click **Save case update**. The entry appears on the timeline, and **Actor and audit detail** shows your session. Reload the page and click **Continue your household case**: the case is still there.
8. Open **Records** again for the subscriptions and transactions behind the alerts. Recording a cancellation request or linking a receipt reference changes only your private copy.
9. Open **About** for what runs and what does not, and use the read-only console to send `GET /healthz` yourself.

The household is fictional, and the records you add are yours to make up. No bank, mailbox or retailer account is connected, no receipt photo is scanned, no email is sent and no money moves. The review agent reads tool outputs built from the recorded facts, including the ones you add; beyond those, the only text a model reads is text you paste yourself, and every fact it proposes waits for your confirmation.
