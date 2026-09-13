# Devpost submission text: Hestia

AWS "Agents for Humans" hackathon, Everyday Agents track. Everything below describes the code on branch `claude/registry-20260913` of the public repository. Read `GET /healthz` on the live URL for the deployed revision before testing.

## Tagline

Reads your receipts and repair records with a Strands agent; asks you before any notice goes out.

## Inspiration

A washing machine fails in month 22. The receipt is in a drawer, the repair invoice is in an email, the seller's address is on the website, and the question "can I ask the seller to review this?" never gets asked because nobody keeps the case together. Around it sit smaller leaks: a trial that converts on the 14th, a backup plan that went from 9.99 to 13.99, a receipt missing for a hardware-store purchase. The track brief says the best everyday agents run quietly and only ping you when there is a real decision to make. Hestia is our attempt at exactly that decision-only surface, with the person holding the pen.

## What it does

The surface is the household's own case page in the browser, at the live URL, with no account and no login. The trigger today is the household asking for a review from the Home page; the intended trigger, a review after each imported statement, waits on bank and mailbox connections that are not built. What it replaces is the folder of receipts, the spreadsheet of subscriptions and the letter the household never writes.

For Elena Georgiou, who runs Athens Apartment 4B, Hestia does five things:

1. The records are hers to add. **Start here** on Home opens three doors: report a repair, add an appliance she owns, or paste a receipt or order email. An appliance carries its receipt reference, seller, purchase date, guarantee months and any product, manual or quick start link she saved, so the Records page becomes the catalogue that replaces the drawer of paper manuals. Pasting is the one place a model touches intake: a tool-less Strands agent reads the text she pasted and proposes records, and she corrects and confirms every field before anything is saved.
2. A Strands agent on Amazon Bedrock reads her recorded appliances, subscriptions, transactions, utility bills and saved case through four tools, then writes a briefing in three fixed sections: what it checked, the decisions waiting for her, one suggested next step. It points; it does not decide eligibility.
3. The notice to the seller (Kotsovolos Megastore, about the Bosch washing machine and the recorded EUR 185.00 repair) is prepared on the server from the recorded facts by deterministic Python, not by the model. Elena reads the exact recipient, subject, amount and text, then approves it with a single-use token bound to that exact draft. A repair she reports on an appliance of her own runs into exactly the same flow.
4. The approval is recorded as a simulation (`delivery_status` `SIMULATED`, no email) and opens a case timeline: replies, silence, extra evidence, planning deadlines and attested outcomes, each with who recorded it, when and from which source. A second repair on the same appliance is refused while that case file is open.
5. Subscription and receipt decisions sit next to it: a trial ending (Fitness Stream Pro), a price change (Cloud Backup Vault, 9.99 to 13.99), two music plans that overlap, a receipt missing for EUR 85.50 at Leroy Merlin, an electricity bill above baseline. Each has one recorded action; none contacts a provider.

How the Strands agents are limited: 3 review calls and 3 text readings per private copy, one shared budget of 200 model calls per day through a conditional S3 counter, 700 output tokens, a 20 second timeout, and a guard that withholds any briefing that claims an entitlement, invents a deadline, or names an amount the tool outputs do not contain. When a review limit is reached or the model fails, the same four tools run deterministically and the page says why no model was called. The tool trace is always visible. Reading pasted text has no deterministic equivalent, so it fails closed instead: no model, a spent budget or a model failure returns an error, saves nothing, and points the household at manual entry.

## How we built it

- Strands Agents SDK 1.53.0: `strands.Agent` with `BedrockModel(model_id="eu.anthropic.claude-haiku-4-5-20251001-v1:0", region_name="eu-west-1", max_tokens=700, temperature=0.2, streaming=False)`; four `@tool` functions built per workspace from plain Python callables so the schema comes from signatures and docstrings; tool trace extracted from `agent.messages`; usage from `result.metrics.accumulated_usage`. A second, tool-less `strands.Agent` at `temperature=0.0` reads pasted text and returns JSON records, which a server-side allow-list of kinds and keys narrows before a person sees them. File: `src/hestia/agents/household_agent.py`.
- Amazon Bedrock: one inference profile, allowed to the writer role only; the reader role denies `bedrock:*`.
- AWS Lambda behind an API Gateway HTTP API: a reader function for GET and a writer function for POST, both denying SES and object deletes. Python 3.11, boto3 1.43.93 bundled.
- Amazon S3: one JSON document per demo workspace, created with `If-None-Match` and updated with `If-Match`, so a lost race never overwrites a case; the daily model budget uses the same conditional writes.
- Amazon CloudFront with S3 for the React 19 and Vite frontend, same-origin API routing, no credentials in JavaScript.
- GitHub Actions: lint, prose gate, pytest with a coverage threshold, Lambda packaging with pinned SDKs, rendered CloudFormation template; Playwright journeys against the real Lambda handler behind a loopback HTTP server; a manually dispatched frontend release gated on the live backend health.
- Backend release: `scripts/deploy_api.py` (guarded to run only with `CI=true`) uploads the package and prepares a CloudFormation change set with `--no-execute-changeset`; executing it is a separately reviewed step, and CloudFormation rolls back on failure.
- Deterministic notice: `draft_statutory_claim_letter` in `src/hestia/agents/tools.py` writes the review request from recorded facts and cites Directive (EU) 2019/771 as general reference only.

## Challenges we ran into

- Keeping the model out of the money and the law. The agent writes the briefing; the notice, the approval and every case transition are deterministic. The guard had to be strict enough to catch a sentence that promises a refund and loose enough to let "requires review" through.
- Bounding cost on a public URL with no login. Per-space and per-day limits are enforced server-side with S3 conditional writes; an unconfirmed budget means no model call.
- A Lambda that cannot lie about itself. `/healthz` reports the model configuration, and the frontend release gate refuses to publish over a backend whose health does not name a bounded model and `live_send` false.
- Saying what is not built, on the page where it would be expected. The About page lists every mode beside the feature it limits.

## Accomplishments we are proud of

- A Strands agent on the public path with a visible tool trace, a stated fallback reason and a guard, all covered by `tests/test_household_agent.py` (tools-only mode, guard rejections and acceptances, fallback on error and timeout, the conditional daily counter, session cap, health reporting).
- A model that proposes and never saves: pasted text becomes a staged draft that the household edits, consents to and commits, and `tests/test_registry_intake.py` covers the route failing closed without a model, on a model failure and past its cap, plus the appliance and repair intake behind it.
- An approval that cannot be replayed into a second record and cannot be applied to changed evidence: `src/hestia/app/claims.py`.
- A case lifecycle whose every entry names its actor, time and source, and whose outcomes are capped at the recorded repair amount: `src/hestia/domain/cases.py`.
- Reader and writer separation with IAM denies for Bedrock (reader), SES and deletes (both): `infra/hestia_api_stack.py`.

## What we learned

The agent earns trust by reading and pointing, not by acting. A three-section briefing with a visible tool trace was more useful to a first-time visitor than any amount of autonomous action, and a deterministic notice the person can read in full was the difference between "the AI wrote a letter" and "I approved this letter".

## What's next

- Distribution through the surfaces households already open: a bank's transaction feed, a retailer's order history and an insurer's claim portal as future channels, each with explicit consent and a visible provenance label. Reading a pasted order email already works; reading the mailbox it came from does not.
- Receipt OCR from a photo or a PDF through Bedrock vision, staged behind the same review-and-commit intake that already carries the pasted-text path, so an extracted fact is never trusted without a person confirming it.
- A measurement of extraction quality: today the model's proposals are reviewed by the household and nothing more, and no accuracy figure is claimed.
- Email delivery through Amazon SES only after a separate consent step, with the approval token and digest carried into the sent record.

## Built with

Python 3.11, Strands Agents SDK 1.53.0, Amazon Bedrock (Claude Haiku 4.5), AWS Lambda, Amazon API Gateway (HTTP API), Amazon S3, Amazon CloudFront, AWS CloudFormation, AWS Secrets Manager, boto3 1.43.93, React 19, TypeScript, Vite, Tailwind CSS, Playwright, pytest, GitHub Actions.

## Testing instructions for judges

Before you start: open https://drusjukc9d4oc.cloudfront.net/healthz. `commit` is the deployed backend revision and `live_model` says whether the Strands agents may call Bedrock there. If `live_model` is `false`, the review button still runs the four tools deterministically and states why no model was called, and the paste tab says the model is not configured and points you at manual entry. Everything else in the walkthrough below works either way.

1. Open https://drusjukc9d4oc.cloudfront.net/ and click **Start with the sample household**. This one click creates a private copy valid for 30 minutes. No account, no login, nothing is sent to anyone.
2. On **Home**, use the **Start here** block to add something of your own. **Add an appliance you own** asks for the item, purchase date, seller name and email, and a receipt reference, with brand, model, serial, price, guarantee months and product, manual and quick start links optional. Save it, then open **Records**: your item is in the appliance catalogue beside the sample ones, with the links you saved or a labelled "Search" web search where you saved none.
3. Back on **Home** or from the catalogue, click **Report a repair** on that item and enter a repair date, invoice amount and what broke. Hestia stages the change, you review the exact fields, consent and commit; the appliance now has an open repair.
4. Try **Paste a receipt or order email**. Paste the text of an order confirmation and click **Ask Hestia to read it**. A tool-less Strands agent proposes the records, and they land in the same review form for you to correct before anything is saved. If `/healthz` reports `live_model` `false`, this tab says the model is not configured and sends you to manual entry; nothing is saved either way until you commit.
5. Click **Ask Hestia to review this household**. Expect a few seconds, then a briefing with three headings and a row of chips: mode (Live model via Strands Agents, or Deterministic checks only), the model id, tokens used, and how many of the 3 model reviews remain for this copy. Open **Tool trace** to read the four tool calls and their outputs. You can ask twice more; the fourth request runs deterministically and says so.
6. Click **Review the exact notice**, on the sample repair card or on the repair you just reported. The dialog shows the claimant, the seller and address, the subject, the recorded repair cost and the full text. Click **Approve this notice (recorded, not sent)**. Expect "Simulated approval recorded. No email sent and no reimbursement recorded." Approvals are recorded in your private copy, never sent.
7. Click **Continue to the saved case and next step**. The case shows status Authorized, the next step and a timeline. Add an update, for example **Start response tracking** with a planning date; the entry appears on the timeline with the label "Manual household report" and your session as the actor. Reload the page: the case is still there, and a second repair on that appliance is refused while the case file is open.
8. Open **Records** again for the subscriptions and transactions behind the alerts. Recording a cancellation request or linking a receipt reference changes only your private copy.
9. Open **About** for what runs and what does not, and use the read-only console to send `GET /healthz` yourself.

Everything you see is a fictional household, and the records you add are yours to make up. No bank, mailbox or retailer account is connected, no receipt photo is scanned, no email is sent and no money moves. The only text a model reads is text you paste yourself, and every fact it proposes waits for your confirmation.
