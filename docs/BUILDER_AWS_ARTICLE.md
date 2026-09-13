# Agents for Humans: a Strands agent that reads a household's records and waits for the person

*Draft for builder.aws.com. Live demo: https://drusjukc9d4oc.cloudfront.net/ (fictional household, no login). Source: https://github.com/upgradedev/hestia-aws, MIT.*

Households lose small amounts in boring ways. A washing machine fails in month 22 and the repair is paid without asking the seller to review it. A free trial converts on the 14th. A backup plan goes from 9.99 to 13.99 without anyone noticing. A receipt for a hardware-store purchase is gone by the time it matters. The Everyday Agents brief for the AWS Agents for Humans hackathon asked for agents that run quietly and only ping you when there is a real decision to make. Hestia is our answer, and this article is about the one design decision that shaped it: the agent reads and points, the person decides, and the money and the law never pass through the model.

## The shape of the product

The visitor opens one URL, clicks once, and gets a private demo space for a fictional Athens household. On Home, "Ask Hestia to review this household" runs a Strands agent that reads the recorded appliances, subscriptions, transactions, utility bills and saved case through four tools and writes a briefing with three fixed headings: what I checked, decisions waiting for you, suggested next step. The decision that matters most is the repair: a Bosch washing machine, a recorded repair of EUR 185.00, a seller called Kotsovolos Megastore. The notice to the seller is prepared on the server by deterministic Python, the person reads the exact text, and approval consumes a single-use token bound to that draft. The approval is recorded as a simulation and opens a case timeline. Nothing is emailed.

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

Every tool output ends in "review required" language. The warranty tool returns recorded dates and screening boundaries, never a determination of coverage, and the statutory reference to Directive (EU) 2019/771 is general reference only.

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

The model is `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in eu-west-1 with 700 output tokens. The call runs in a worker thread with a 20 second limit. On timeout or any exception the route returns the deterministic tools-only outcome, with a reason the page shows: `model_timeout`, `model_error:<class>`, `session_cap`, `daily_cap` or `budget_unconfirmed`. No text is invented on that path.

After the call, the tool trace is paired from `agent.messages` (the `toolUse` and `toolResult` blocks) and token usage is read from `result.metrics.accumulated_usage`. Both are stored with the briefing and shown in the UI.

## The guard reads the narrative against the tool outputs

The system prompt already forbids entitlement claims, invented deadlines and amounts that no tool returned. The guard enforces it after the fact:

```python
def guard_narrative(narrative: str, tool_outputs: list[str]) -> list[str]:
    """Return the reasons a narrative must be withheld; an empty list means it may be shown."""
    reasons: list[str] = []
    lowered = narrative.lower()
    for pattern in BANNED_PATTERNS:
        if re.search(pattern, narrative, re.I):
            reasons.append(f"unsupported claim matched {pattern!r}")
    evidence = " ".join(tool_outputs)
    known = {digits.replace(",", "") for digits in AMOUNT_PATTERN.findall(evidence)}
    known |= {re.sub(r"[.,]00$", "", value) for value in known}
    for digits in AMOUNT_PATTERN.findall(narrative):
        value = digits.replace(",", "")
        if value not in known and re.sub(r"[.,]00$", "", value) not in known:
            reasons.append(f"amount {value} does not appear in tool outputs")
    if len(narrative) > MAX_NARRATIVE_CHARS:
        reasons.append("narrative exceeds the length limit")
    if "requires review" not in lowered and "review" not in lowered:
        reasons.append("narrative omits the review boundary")
    return reasons
```

When the guard returns reasons, the briefing is withheld and the page says so; the tool findings underneath are unaffected, because they never came from the model.

## Cost limits on a public URL

The route is public behind a 30-minute demo capability, so the limits live on the server. Each demo space may make 3 model calls, counted in the workspace document. The shared budget is 200 calls per day, reserved with a conditional write to one small S3 object per day: `If-None-Match` creates it, `If-Match` increments it, and a lost race retries. If the budget cannot be confirmed, the model is not called. `GET /healthz` reports `live_model`, `model_id` and the limits, and the frontend release gate refuses to publish over a backend whose health does not name a bounded model.

## What the IAM policy says

The writer function may call `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on that one inference profile and its foundation model, nothing else. The reader function, which serves every GET, denies `bedrock:*`. Both deny `ses:*` and object deletes. The stack is rendered by `infra/hestia_api_stack.py` and prepared as a CloudFormation change set that a person executes.

## The honest limits

The bank feed, mailbox sync and retailer sync are not connected; the household imports facts by hand through a stage, review and commit flow. Receipt PNGs are validated for structure, checksums and size, but no text is extracted. Email is not sent; approvals are recorded with `delivery_status` `SIMULATED`. Bedrock AgentCore and Bedrock Guardrails are not connected; the guard above is a local pattern check. Model output quality is unmeasured, and independent human testing has not been run. The docs say all of this beside the feature it limits, and a claims test fails the build if someone writes otherwise.

## Why this shape

Removing AWS stops the product: Strands runs the model through Bedrock inside Lambda, and S3 conditional writes are what make an approval and a case revision consistent under concurrency. Removing the person stops it too, on purpose. The agent's job is to make the decision small and clear; the household's job is to make it.
