"""Strands household review agent over one isolated workspace.

The agent reads recorded household facts through bounded tools, then writes a short
briefing. It never prepares or approves a notice, never determines legal entitlement and
never sends anything. When no model is configured, or a cost limit is reached, the same
tools run deterministically and the narrative is absent: nothing is fabricated.
"""
from __future__ import annotations

import re
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from hestia.agents.tools import (
    audit_subscriptions_tool,
    check_appliance_warranty_tool,
    check_completeness_tool,
)
from hestia.domain.cases import project_case
from hestia.domain.subscriptions import SubscriptionCharge
from hestia.domain.warranties import ApplianceWarranty

FRAMEWORK = "strands-agents"
DEFAULT_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
DEFAULT_REGION = "eu-west-1"
MAX_OUTPUT_TOKENS = 700
MAX_NARRATIVE_CHARS = 3200
MODEL_TIMEOUT_SECONDS = 20.0
TOOL_OUTPUT_CHARS = 1600
SYSTEM_PROMPT = (
    "You are Hestia, a household evidence review assistant running inside an isolated demo "
    "workspace. Use the tools to read recorded facts; do not guess facts that a tool did not "
    "return. Write for a busy household member. Rules that override everything else: "
    "(1) never state or imply that the household is entitled to a refund, repair or amount; "
    "say 'requires review' where a tool says so; (2) never invent deadlines, statutory "
    "periods or attachments; (3) use only amounts and dates that appear in tool outputs; "
    "(4) do not draft the notice yourself: the household reviews an exact server-prepared "
    "draft in Hestia and approves it explicitly; (5) keep the whole briefing under 180 words; (6) "
    "do not use dashes as punctuation. Format exactly three sections with these headings: 'What I "
    "checked', 'Decisions waiting for you' (at most three bullets, each an action available in "
    "Hestia; when a tool reports a recorded repair with no approved notice yet, the first bullet "
    "is to review that repair's exact notice in Hestia), 'Suggested next step' (one sentence)."
)
REVIEW_PROMPT = (
    "Review this household using every tool once, then write the briefing. Recorded "
    "appliance ids: {appliance_ids}. Today's date for the review is {today}."
)

EXTRACT_PROMPT = (
    "You extract household purchase facts from text a household member pasted (a receipt, an "
    "order confirmation email, a bank statement excerpt). Return ONLY a JSON object of the form "
    '{"records": [...]} with no prose. Each record is one of:\n'
    '{"kind": "appliance", "appliance_id": "<short-id>", "item_name": "...", "brand": "...", '
    '"model_number": "...", "serial_number": "...", "purchase_date": "YYYY-MM-DD", '
    '"purchase_price_cents": <integer cents>, "seller_name": "...", "seller_email": "...", '
    '"receipt_reference": "<order or receipt number>"}\n'
    '{"kind": "transaction", "transaction_id": "<short-id>", "merchant": "...", '
    '"amount_cents": <integer cents>, "date": "YYYY-MM-DD", "category": "..."}\n'
    '{"kind": "subscription", "subscription_id": "<short-id>", "service_name": "...", '
    '"category": "...", "monthly_cents": <integer cents>, "last_billed": "YYYY-MM-DD", '
    '"is_trial": false}\n'
    "Rules: include a field only when the text states it; never guess dates, prices, emails or "
    "model numbers; amounts are integer cents; ids are short lowercase slugs; an appliance is a "
    "device or machine that carries a guarantee; at most 20 records; if nothing is extractable "
    'return {"records": []}.'
)
ALLOWED_EXTRACT_KEYS = {
    "appliance": {"appliance_id", "item_name", "brand", "model_number", "serial_number",
                  "purchase_date", "purchase_price_cents", "seller_name", "seller_email",
                  "receipt_reference"},
    "transaction": {"transaction_id", "merchant", "amount_cents", "date", "category"},
    "subscription": {"subscription_id", "service_name", "category", "monthly_cents",
                     "last_billed", "is_trial", "trial_end_date", "previous_monthly_cents"},
}
MAX_EXTRACT_CHARS = 6000

BANNED_PATTERNS = (
    r"entitled to", r"legally (?:entitled|required|obliged|owed)", r"must (?:refund|reimburse)",
    r"will (?:be )?(?:refund|reimburs)",
    r"guarantee[sd]? (?:a |the |your )?(?:refund|reimbursement)",
    r"\bdeadline of\b", r"statutory deadline", r"you (?:are|were) (?:owed|due)", r"airtight",
    r"\bODR\b", r"recover(?:ed|s)?\s+(?:€|EUR)", r"full reimbursement",
)
AMOUNT_PATTERN = re.compile(r"(?:€|EUR)\s?(\d+(?:[.,]\d+)*)")
NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)*")


def _canonical(digits: str) -> str:
    """Normalise 1,399.00 / 1399,00 / 1399 to one spelling for comparison."""
    text = digits.replace(",", ".")
    if text.count(".") > 1:  # thousands separators
        head, _, tail = text.rpartition(".")
        text = head.replace(".", "") + "." + tail
    try:
        value = float(text)
    except ValueError:
        return digits
    return f"{value:.2f}"


@dataclass
class ToolCall:
    tool: str
    input: dict[str, Any]
    output: str
    status: str = "success"


@dataclass
class AgentOutcome:
    mode: str  # "live_model" or "tools_only"
    model_id: str | None
    framework: str
    narrative: str | None
    withheld: bool = False
    withheld_reasons: list[str] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, int] | None = None
    duration_ms: int = 0
    stop_reason: str | None = None
    reason: str | None = None

    def to_record(self) -> dict[str, Any]:
        record = asdict(self)
        record["tool_calls"] = [asdict(call) for call in self.tool_calls]
        return record


def _date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _clip(text: str, limit: int = TOOL_OUTPUT_CHARS) -> str:
    return text if len(text) <= limit else text[: limit - 15] + " [truncated]"


def framework_version() -> str:
    try:
        from importlib.metadata import version

        return f"{FRAMEWORK} {version('strands-agents')}"
    except Exception:  # pragma: no cover - metadata absent in unusual packaging
        return FRAMEWORK


def tool_functions(state: dict[str, Any], today: date) -> dict[str, Callable[..., str]]:
    """Plain callables over recorded workspace facts; the Strands tool wrapper is added later."""

    def review_repair_evidence(appliance_id: str) -> str:
        """Screen one recorded appliance's warranty timing and any documented repair.

        Returns recorded dates, screening boundaries, missing facts and review flags.
        It never determines legal entitlement or a reimbursable amount.
        """
        item = next((a for a in state.get("appliances", []) if a.get("id") == appliance_id), None)
        if item is None:
            return f"No appliance with id {appliance_id!r} is recorded in this workspace."
        try:
            warranty = ApplianceWarranty(
                item_name=str(item.get("item_name", "")),
                serial_number=str(item.get("serial_number") or ""),
                purchase_date=_date(item.get("purchase_date")),
                statutory_months=int(item.get("statutory_months", 24)),
                commercial_months=int(item.get("commercial_months", 24)),
                receipt_reference=str(item.get("receipt_reference") or ""),
                delivery_date=_date(item.get("delivery_date")),
                defect_date=_date(item.get("defect_date")),
                commercial_start_date=_date(item.get("commercial_start_date")),
                commercial_terms_reference=str(item.get("commercial_terms_reference") or ""),
                jurisdiction=item.get("jurisdiction"),
                seller_is_business=item.get("seller_is_business"),
                consumer_purchase=item.get("consumer_purchase"),
                currency=str(item.get("currency", "EUR")),
            )
        except (TypeError, ValueError) as exc:
            return f"Recorded facts for {appliance_id} need correction before screening: {exc}"
        amount = item.get("repair_amount_cents") if item.get("has_repair_claim") else 0
        text = check_appliance_warranty_tool(
            warranty=warranty, current_date=today, repair_date=_date(item.get("repair_date")),
            repair_amount_cents=int(amount or 0),
        )
        seller = item.get("seller_name") or "unknown seller"
        case = next((c for c in state.get("cases", []) if c.get("item_id") == appliance_id), None)
        status = f"Saved case status: {case['status']}." if case else "No saved case yet."
        return _clip(f"Seller of record: {seller}. {status}\n{text}")

    def audit_subscriptions() -> str:
        """Inspect recorded recurring charges for trial end dates, price changes and overlaps.

        Amounts are recorded monthly charges, not measured waste or savings.
        """
        charges: list[SubscriptionCharge] = []
        histories: list[tuple[str, int, int]] = []
        for sub in state.get("subscriptions", []):
            if sub.get("status") == "cancelled":
                continue
            billed = _date(sub.get("last_billed")) or today
            charges.append(SubscriptionCharge(
                service_name=str(sub.get("service_name", "")),
                category=str(sub.get("category", "")),
                monthly_cents=int(sub.get("monthly_cents", 0)), last_billed=billed,
                is_trial=bool(sub.get("is_trial")),
                trial_end_date=_date(sub.get("trial_end_date")),
            ))
            previous = sub.get("previous_monthly_cents")
            if isinstance(previous, int) and previous != sub.get("monthly_cents"):
                histories.append((str(sub.get("service_name", "")), previous,
                                  int(sub.get("monthly_cents", 0))))
        if not charges:
            return "No recurring charges are recorded in this workspace."
        requested = [s.get("service_name") for s in state.get("subscriptions", [])
                     if s.get("demo_cancellation_requested")]
        note = (f"\nSynthetic cancellation requests already recorded for: {', '.join(requested)}."
                if requested else "")
        audit = audit_subscriptions_tool(charges, current_date=today, price_histories=histories)
        return _clip(audit + note)

    def check_receipts_and_utilities() -> str:
        """Find recorded outlays without a linked receipt and utility bills above baseline.

        A missing receipt reference is an evidence gap, not a loss. A bill comparison does
        not establish a billing error.
        """
        transactions = []
        matched: set[str] = set()
        for out in state.get("outflows", []):
            transactions.append({
                "merchant": out.get("merchant"),
                "amount_cents": int(out.get("amount_cents", 0)),
                "date": _date(out.get("date")) or today,
            })
            if out.get("has_receipt"):
                matched.add(str(out.get("merchant")))
        bills = []
        for bill in state.get("utility_bills", []):
            bills.append((str(bill.get("provider", "")), int(bill.get("baseline_cents", 0)),
                          int(bill.get("current_cents", 0)), _date(bill.get("bill_date")) or today))
        return _clip(check_completeness_tool(transactions, matched, bills))

    def read_case_timeline() -> str:
        """Read the saved case timeline, status and household next step, if a case exists."""
        cases = state.get("cases", [])
        if not cases:
            return ("No case has been saved yet. The household can review the exact notice "
                    "draft for a documented repair and approve it explicitly in Hestia.")
        lines = []
        for case in cases:
            view = project_case(case)
            events = view["timeline"][-3:]
            lines.append(
                f"Case {view['title']} (seller {view['seller']}): status {view['status']}, "
                f"revision {view['revision']}, planning deadline {view['deadline'] or 'not set'} "
                f"({view['deadline_status']}). Next step: {view['next_action']} Recent events: "
                + "; ".join(f"{e['status']} via {e['source']}: {e['note']}" for e in events)
                + ". Real recovered money: EUR 0.00."
            )
        return _clip("\n".join(lines))

    return {
        "review_repair_evidence": review_repair_evidence,
        "audit_subscriptions": audit_subscriptions,
        "check_receipts_and_utilities": check_receipts_and_utilities,
        "read_case_timeline": read_case_timeline,
    }


def strands_tools(state: dict[str, Any], today: date) -> list[Any]:
    """Wrap the workspace callables as Strands tools (schemas come from signatures and docs)."""
    from strands import tool

    return [tool(func) for func in tool_functions(state, today).values()]


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


def run_tools_only(state: dict[str, Any], today: date, reason: str) -> AgentOutcome:
    """Execute every workspace tool deterministically; no narrative is produced."""
    started = time.monotonic()
    calls: list[ToolCall] = []
    for name, func in tool_functions(state, today).items():
        if name == "review_repair_evidence":
            for item in state.get("appliances", []):
                if item.get("has_repair_claim"):
                    calls.append(ToolCall(name, {"appliance_id": item["id"]},
                                          func(item["id"])))
        else:
            calls.append(ToolCall(name, {}, func()))
    return AgentOutcome(
        mode="tools_only", model_id=None, framework=framework_version(), narrative=None,
        tool_calls=calls, duration_ms=int((time.monotonic() - started) * 1000), reason=reason,
    )


def extract_tool_calls(messages: list[dict[str, Any]]) -> list[ToolCall]:
    """Pair toolUse and toolResult blocks from a Strands conversation history."""
    uses: dict[str, ToolCall] = {}
    ordered: list[ToolCall] = []
    for message in messages:
        for block in message.get("content", []) or []:
            if "toolUse" in block:
                use = block["toolUse"]
                call = ToolCall(str(use.get("name")), dict(use.get("input") or {}), "", "pending")
                uses[str(use.get("toolUseId"))] = call
                ordered.append(call)
            elif "toolResult" in block:
                result = block["toolResult"]
                call = uses.get(str(result.get("toolUseId")))
                if call is None:
                    continue
                texts = [c.get("text", "") for c in result.get("content", []) if "text" in c]
                call.output = _clip("\n".join(texts))
                call.status = str(result.get("status") or "success")
    return ordered


@dataclass
class ExtractionOutcome:
    mode: str  # "live_model" or "unavailable"
    model_id: str | None
    framework: str
    records: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, int] | None = None
    duration_ms: int = 0
    reason: str | None = None
    raw_chars: int = 0


def normalise_extracted(payload: Any) -> list[dict[str, Any]]:
    """Keep only known kinds and keys with plain values; the review step validates the rest."""
    if not isinstance(payload, dict) or not isinstance(payload.get("records"), list):
        return []
    rows: list[dict[str, Any]] = []
    for item in payload["records"][:20]:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        keys = ALLOWED_EXTRACT_KEYS.get(str(kind))
        if keys is None:
            continue
        row: dict[str, Any] = {"kind": kind}
        for key in keys:
            value = item.get(key)
            if value is None:
                continue
            if isinstance(value, float) and value.is_integer():
                value = int(value)
            if isinstance(value, bool) or isinstance(value, int) or (
                isinstance(value, str) and value.strip()
            ):
                row[key] = value.strip() if isinstance(value, str) else value
        if kind == "subscription" and "is_trial" not in row:
            row["is_trial"] = False
        rows.append(row)
    return rows


def parse_extraction_text(text: str) -> Any:
    """Locate the first JSON object in a model reply; the model may wrap it in a fence."""
    import json

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object in the model reply")
    return json.loads(text[start:end + 1])


def run_text_extraction(
    text: str, hint: str, *, model_id: str = DEFAULT_MODEL_ID, region_name: str = DEFAULT_REGION,
    max_tokens: int = MAX_OUTPUT_TOKENS, timeout_seconds: float = MODEL_TIMEOUT_SECONDS,
    agent_factory: Callable[..., Any] | None = None,
) -> ExtractionOutcome:
    """One bounded model call that proposes records for human review; nothing is saved here."""
    started = time.monotonic()
    outcome: dict[str, Any] = {}

    def build_agent() -> Any:
        from strands import Agent
        from strands.models import BedrockModel

        model = BedrockModel(
            model_id=model_id, region_name=region_name, max_tokens=max_tokens,
            temperature=0.0, streaming=False,
        )
        return Agent(model=model, tools=[], system_prompt=EXTRACT_PROMPT, callback_handler=None)

    def work() -> None:
        try:
            agent = (agent_factory or build_agent)()
            outcome["result"] = agent(f"Document type hint: {hint}.\n\n{text}")
        except Exception as exc:
            outcome["error"] = type(exc).__name__

    worker = threading.Thread(target=work, name="hestia-extract", daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    duration = int((time.monotonic() - started) * 1000)
    if worker.is_alive():
        return ExtractionOutcome("unavailable", model_id, framework_version(),
                                 reason="model_timeout", duration_ms=duration)
    if "error" in outcome:
        return ExtractionOutcome("unavailable", model_id, framework_version(),
                                 reason="model_error:" + outcome["error"], duration_ms=duration)
    reply = _result_text(outcome["result"])
    try:
        records = normalise_extracted(parse_extraction_text(reply))
    except ValueError:
        return ExtractionOutcome("unavailable", model_id, framework_version(),
                                 reason="unparseable_reply",
                                 usage=_usage(getattr(outcome["result"], "metrics", None)),
                                 duration_ms=duration, raw_chars=len(reply))
    return ExtractionOutcome(
        "live_model", model_id, framework_version(), records=records,
        usage=_usage(getattr(outcome["result"], "metrics", None)), duration_ms=duration,
        raw_chars=len(reply),
    )


def _usage(metrics: Any) -> dict[str, int] | None:
    usage = getattr(metrics, "accumulated_usage", None)
    if not isinstance(usage, dict):
        return None
    return {"input_tokens": int(usage.get("inputTokens", 0)),
            "output_tokens": int(usage.get("outputTokens", 0))}


def _result_text(result: Any) -> str:
    message = getattr(result, "message", None) or {}
    blocks = message.get("content", []) if isinstance(message, dict) else []
    return "\n".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict) and "text" in b)


def run_live_agent(
    state: dict[str, Any], today: date, *, model_id: str = DEFAULT_MODEL_ID,
    region_name: str = DEFAULT_REGION, max_tokens: int = MAX_OUTPUT_TOKENS,
    timeout_seconds: float = MODEL_TIMEOUT_SECONDS, agent_factory: Callable[..., Any] | None = None,
) -> AgentOutcome:
    """Run the Strands agent once with a bounded model; fall back to tools only on failure."""
    started = time.monotonic()
    outcome: dict[str, Any] = {}

    def build_agent() -> Any:
        from strands import Agent
        from strands.models import BedrockModel

        model = BedrockModel(
            model_id=model_id, region_name=region_name, max_tokens=max_tokens,
            temperature=0.2, streaming=False,
        )
        return Agent(
            model=model, tools=strands_tools(state, today), system_prompt=SYSTEM_PROMPT,
            callback_handler=None,
        )

    def work() -> None:
        try:
            agent = (agent_factory or build_agent)()
            ids = ", ".join(
                f"{a['id']} ({a.get('item_name')})" for a in state.get("appliances", [])
            )
            prompt = REVIEW_PROMPT.format(appliance_ids=ids or "none", today=today.isoformat())
            outcome["result"] = agent(prompt)
            outcome["messages"] = list(getattr(agent, "messages", []) or [])
        except Exception as exc:  # the caller records the failure class, never fake text
            outcome["error"] = f"{type(exc).__name__}"

    worker = threading.Thread(target=work, name="hestia-agent", daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    if worker.is_alive():
        fallback = run_tools_only(state, today, "model_timeout")
        fallback.model_id = model_id
        return fallback
    if "error" in outcome:
        fallback = run_tools_only(state, today, "model_error:" + outcome["error"])
        fallback.model_id = model_id
        return fallback
    result = outcome["result"]
    calls = extract_tool_calls(outcome.get("messages", []))
    narrative = _result_text(result).strip()
    reasons = guard_narrative(narrative, [c.output for c in calls]) if narrative else ["empty"]
    return AgentOutcome(
        mode="live_model", model_id=model_id, framework=framework_version(),
        narrative=None if reasons else narrative, withheld=bool(reasons), withheld_reasons=reasons,
        tool_calls=calls, usage=_usage(getattr(result, "metrics", None)),
        duration_ms=int((time.monotonic() - started) * 1000),
        stop_reason=str(getattr(result, "stop_reason", None) or ""),
    )
