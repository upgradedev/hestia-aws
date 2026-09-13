# Agents for Humans: Strands agents that read a household's records and wait for the person

*Draft for builder.aws.com. Live demo: https://drusjukc9d4oc.cloudfront.net/ (fictional household, no login). Source: https://github.com/upgradedev/hestia-aws, MIT.*

Households lose small amounts in boring ways. A washing machine fails in month 22 and the repair is paid without asking the seller to review it. A free trial converts on the 14th. A backup plan goes from 9.99 to 13.99 without anyone noticing. A receipt for a hardware-store purchase is gone by the time it matters. The Everyday Agents brief for the AWS Agents for Humans hackathon asked for agents that run quietly and only ping you when there is a real decision to make. Hestia is our answer, and this article is about the one design decision that shaped it: the agent reads and points, the person decides, and the money and the law never pass through the model.

## The shape of the product

The visitor opens one URL, clicks once, and gets a 30-minute private copy of a fictional Athens household. Home opens with a Start here block: report a repair, add an appliance the household owns, or paste a receipt or order email for a second, tool-less agent to read. Below it, "Ask Hestia to review this household" runs a Strands agent that reads the recorded appliances, subscriptions, transactions, utility bills and saved case through four tools and writes a briefing with three fixed headings: what I checked, decisions waiting for you, suggested next step. The decision that matters most is the repair: a Bosch washing machine, a recorded repair of EUR 185.00, a seller called Kotsovolos Megastore. The notice to the seller is prepared on the server by deterministic Python, and reviewing it opens the case file. The person reads the exact text, approval consumes a single-use token bound to that draft, and the approval is recorded as a simulation that moves the case to Authorized. Nothing is emailed.

## The tools are plain functions over one workspace

The four tools are closures over the loaded workspace state and the review date. Strands turns them into tool specs from the signature and the docstring, so the description the model reads is the same sentence a reviewer reads in the source. From `src/hestia/agents/household_agent.py`:

```python
def review_repair_evidence(appliance_id: str) -> str:
    """Screen one recorded appliance's warranty timing and any documented repair.

    Returns recorded dates, screening boundaries, missing facts and review flags.
    It never determines legal entitlement or a reimbursable amount.
    """
    ...

def strands_tools(state: dict[str, Any], today: date) -> list[Any]:
    """Wrap the workspace callables as Strands tools (schemas come from signatures and docs)."""
    from strands import tool

    return [tool(func) for func in tool_functions(state, today).values()]
```

The repair tool's output opens with "REVIEW REQUIRED. No legal entitlement determined." and closes with the legal limits of any remedy. It returns recorded dates and screening boundaries, never a determination of coverage, and it cites Directive (EU) 2019/771 as general reference only. The other tools return recorded flags with a suggested action, and the case tool ends by stating that real recovered money is EUR 0.00.

## The agent is built per request, with a bounded model

There is no long-lived agent. Each review builds one `Agent` with a `BedrockModel` whose limits are part of the construction, then asks it once to use every tool and write the briefing:

```python
model = BedrockModel(
    model_id=model_id, region_name=region_name, max_tokens=max_tokens,
    temperature=0.2, streaming=False,
)
return Agent(
    model=model, tools=strands_tools(state, today), system_prompt=SYSTEM_PROMPT,
    callback_handler=None,
)
```

The model is `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in eu-west-1 with 700 output tokens. The call runs in a worker thread with a 20 second limit. On a timeout or any exception, the route returns the deterministic tools-only outcome with `model_timeout` or `model_error:<class>`. Before any call it does the same with `model_not_configured`, `session_cap`, `daily_cap` or `budget_unconfirmed`, and the page turns each reason into a plain sentence. No text is invented on that path.

After the call, the tool trace is paired from `agent.messages` (the `toolUse` and `toolResult` blocks) and token usage is read from `result.metrics.accumulated_usage`. Both are stored with the briefing and shown in the UI.

## The guard reads the narrative against the tool outputs

The system prompt already forbids entitlement claims, invented deadlines and amounts that no tool returned. The guard backs part of that up after the fact, with a pattern check for listed phrases and for any euro amount that no tool returned:

```python
def guard_narrative(narrative: str, tool_outputs: list[str]) -> list[str]:
    """Return the reasons a narrative must be withheld; an empty list means it may be shown."""
    reasons: list[str] = []
    lowered = narrative.lower()
    for pattern in BANNED_PATTERNS:
        if re.search(pattern, narrative, re.I):
            reasons.append(f"unsupported claim matched {pattern!r}")
    # Tool outputs write amounts bare ("13.99"), with a currency ("EUR 185.00") or in cents
    # ("18500 minor units"); a narrative amount must match one of those spellings exactly.
    known: set[str] = set()
    evidence = re.sub(r"\d{4}-\d{2}-\d{2}", " ", " ".join(tool_outputs))  # dates are not amounts
    for digits in NUMBER_PATTERN.findall(evidence):
        known.add(_canonical(digits))
        if digits.isdigit():
            known.add(_canonical(f"{int(digits) / 100:.2f}"))
    for digits in AMOUNT_PATTERN.findall(narrative):
        if _canonical(digits) not in known:
            reasons.append(f"amount {digits} does not appear in tool outputs")
    if len(narrative) > MAX_NARRATIVE_CHARS:
        reasons.append("narrative exceeds the length limit")
    if "requires review" not in lowered and "review" not in lowered:
        reasons.append("narrative omits the review boundary")
    return reasons
```

`_canonical` folds `1,399.00`, `1399,00` and `1399` into one spelling, so the comparison survives the several ways a tool and a model each write the same number, and the date strip stops `2024-11-08` from lending its digits to an invented amount. The guard does not check dates or amounts written without a currency.

When the guard returns reasons, the briefing is withheld and the page says so; the tool findings underneath are unaffected, because they never came from the model.

## The records are the household's, and a second agent only proposes them

A sentinel with nothing to watch is a demo. So the household keeps its own registry: two intake kinds, `appliance` and `repair`, put the household's own appliances, a fridge or a laptop, say, beside the three sample ones, with the receipt reference, seller, guarantee months and whatever product, manual or quick start link they saved. Reporting a repair marks that appliance's claim open, so the household can prepare the same notice, approval and case file the sample repair uses, and a second repair on it is refused while the claim is open. Both kinds run through the intake contract that was already there: stage a draft, show the exact fields, take consent for the exact subset, then commit.

Typing a receipt is tedious, so there is a second Strands agent with no tools at all. Paste the text of an order confirmation, at most 6000 characters, and one `BedrockModel` call at `temperature=0.0` answers with a JSON object of records. The prompt tells it to include a field only when the text states it and never to guess a date, price, email or model number; an allow-list of three kinds, their keys and plain value types then drops everything else before a person sees it. What comes back is a staged draft, labelled `model_text_extraction` and `ocr_status: model_text`, sitting in the same review form as a hand-typed one. Nothing reaches the household records until the household corrects it and commits.

The route has no deterministic equivalent to fall back to, so it fails closed. A missing model, used-up readings for this copy, a spent or unconfirmed daily budget, a model error, a timeout or an unreadable reply all return an error, save no records, and point at manual entry. When the model call itself raises an error, throttled or unreachable for example, the reading is handed back and the household is told the attempt was not counted; a timeout or an unreadable reply stays counted. The pasted text is not kept either, only its SHA-256, its byte count and the proposed records, which is enough to replay an identical paste without paying for a second call. How well it reads a receipt is unmeasured; the control is that a person confirms every fact.

## Cost limits on a public URL

Both routes sit behind a 30-minute demo capability, so the limits live on the server. Each private copy may make 3 review calls and 3 text readings, counted separately in the workspace document. The shared budget behind them is 200 calls per day, reserved with a conditional write to one small S3 object per day: `If-None-Match` creates it, `If-Match` increments it, and a lost race retries. If the budget cannot be confirmed, the model is not called. A text reading whose model call raised an error is handed back to the copy, but its unit of the daily budget stays spent. `GET /healthz` reports `live_model`, `model_id` and the limits, and the frontend release gate refuses to publish unless that health reports the approved commit, `live_model` true with a model id, and `live_send` false.

## What the IAM policy says

The writer function may call `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on that one inference profile and its foundation model, nothing else. The reader function, which answers every GET, denies `bedrock:*`. Both deny `ses:*` and object deletes. The stack is rendered by `infra/hestia_api_stack.py`, and a release prepares a CloudFormation change set that a person reads before executing it.

## The honest limits

The bank feed, mailbox sync and retailer sync are not connected; the household adds facts by hand or by pasting text, and either way through a stage, review and commit flow. Receipt PNGs are validated for structure, checksums and size, but no text is extracted from an image, and pasting the text of an order email reads no mailbox. Email is not sent; approvals are recorded with `delivery_status` `SIMULATED`. Bedrock AgentCore and Bedrock Guardrails are not connected; the guard above is a local pattern check and covers the briefing only. Briefing quality and extraction quality are both unmeasured, and independent human testing has not been run. The docs say all of this beside the feature it limits. CI fails the build if these files bring back any phrase from a fixed list of retired or unsupported claims, or if the About page drops its not-connected labels.

## Why this shape

Removing AWS stops the product: Strands runs the model through Bedrock inside Lambda, and S3 conditional writes are what make an approval and a case revision consistent under concurrency. Removing the person stops it too, on purpose. The agent's job is to make the decision small and clear; the household's job is to make it.
