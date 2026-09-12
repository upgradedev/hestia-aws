"""Household case lifecycle. Transport success never establishes an outcome.

All current cases belong to synthetic workspaces. Manual reports are attributed
to the scoped session, not authenticated merchants. Deadlines are user planning
dates, never inferred statutory limits. No provider or storage dependencies.
"""
from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any

TRANSITIONS = {
    "start_tracking": ({"authorized"}, "pending_response"),
    "reply": ({"pending_response", "needs_information"}, "pending_response"),
    "request_information": ({"pending_response"}, "needs_information"),
    "add_evidence": ({"needs_information", "pending_response"}, "pending_response"),
    "reject": ({"pending_response", "needs_information"}, "rejected"),
    "partial_outcome": ({"pending_response", "needs_information"}, "pending_response"),
    "resolve": ({"pending_response", "needs_information"}, "resolved"),
    "reopen": ({"rejected", "resolved"}, "pending_response"),
    "set_deadline": ({"authorized", "pending_response", "needs_information"}, None),
    "record_silence": ({"pending_response", "needs_information"}, None),
}
SOURCE_LABELS = {
    "synthetic_seed": "Synthetic household facts; not independently verified",
    "prepared_template": "Deterministic review template; no model invocation",
    "exact_approval": "Exact notice approved by household session; no email sent",
    "synthetic_reply": "Synthetic reply fixture; not a merchant response",
    "manual_update": "Manual household report; identity and evidence not independently verified",
}
MANUAL_ONLY = {"start_tracking", "add_evidence", "reopen", "set_deadline", "record_silence"}


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def append_event(
    case: dict[str, Any], *, action: str, status: str, actor: str, source: str,
    note: str, evidence_reference: str, timestamp: str, **details: Any,
) -> dict[str, Any]:
    case["revision"] += 1
    event = {
        "id": f"{case['id']}:{case['revision']}", "action": action, "status": status,
        "actor": actor, "timestamp": timestamp, "source": source,
        "source_label": SOURCE_LABELS[source], "note": note,
        "evidence_reference": evidence_reference, **details,
    }
    case["timeline"].append(event)
    case.update(status=status, updated_at=timestamp)
    return event


def review_case(
    state: dict[str, Any], item: dict[str, Any], draft: dict[str, Any], actor: str,
) -> dict[str, Any]:
    cases = state.setdefault("cases", [])
    case = next((c for c in cases if c["item_id"] == item["id"]), None)
    timestamp = utc_now()
    if case is None:
        case = {
            "id": "case-" + draft["id"][6:], "item_id": item["id"],
            "title": item["item_name"], "seller": item["seller_name"],
            "mode": "simulated", "status": "draft", "revision": 0,
            "created_at": timestamp, "updated_at": timestamp,
            "facts": copy.deepcopy(item), "notice": None, "approval": None,
            "deadline": None, "outcome": None, "timeline": [], "requests": {},
            "real_recovered_cents": 0,
        }
        cases.append(case)
        append_event(
            case, action="draft_created", status="draft", actor="review_template",
            source="synthetic_seed", note="Case opened from the recorded appliance and receipt.",
            evidence_reference=item["receipt_reference"], timestamp=timestamp,
        )
    # Additional previews never replace an approved notice or reopen a closed case.
    reviewing = case["status"] in {"draft", "review"}
    if reviewing:
        case["facts"] = copy.deepcopy(item)
        case["notice"] = copy.deepcopy(draft)
    append_event(
        case, action="review_requested" if reviewing else "additional_preview",
        status="review" if reviewing else case["status"], actor=actor,
        source="prepared_template", note="Household requested this exact draft for review.",
        evidence_reference=draft["id"], timestamp=timestamp,
    )
    return case


def authorize_case(
    case: dict[str, Any], draft: dict[str, Any], digest: str, record_id: str, actor: str,
) -> None:
    if case["status"] != "review":
        raise ValueError("This case already has an approval. Continue its timeline or reopen it.")
    case["notice"] = copy.deepcopy(draft)
    case["approval"] = {"draft_id": draft["id"], "digest": digest, "record_id": record_id}
    append_event(
        case, action="notice_authorized", status="authorized", actor=actor,
        source="exact_approval", note="Approval persisted. No merchant contacted; no outcome inferred.",
        evidence_reference=digest, timestamp=utc_now(),
    )


def apply_update(case: dict[str, Any], update: dict[str, Any], actor: str) -> dict[str, Any]:
    action, source = update["action"], update["source"]
    if action not in TRANSITIONS or source not in {"manual_update", "synthetic_reply"}:
        raise ValueError("Choose a supported case action and an explicitly labeled source.")
    allowed, target = TRANSITIONS[action]
    if case["status"] not in allowed:
        raise ValueError(f"Cannot {action} while this case is {case['status']}.")
    if action in MANUAL_ONLY and source != "manual_update":
        raise ValueError("This action requires a manual household update.")
    if action in {"start_tracking", "set_deadline", "reopen"}:
        if not update.get("deadline"):
            raise ValueError("Choose an explicit planning deadline; no legal deadline is inferred.")
    elif "deadline" in update:
        raise ValueError("Use set_deadline to change the planning date explicitly.")
    monetary = action in {"partial_outcome", "resolve"}
    if monetary:
        amount = update.get("amount_cents")
        if update.get("attested") is not True:
            raise ValueError("Attest to the recorded evidence before saving an outcome.")
        if type(amount) is not int or not 0 <= amount <= case["facts"]["repair_amount_cents"]:
            raise ValueError("Outcome amount must be within the documented repair amount.")
        if action == "partial_outcome" and not 0 < amount < case["facts"]["repair_amount_cents"]:
            raise ValueError("A partial outcome must be positive and below the repair amount.")
    elif "amount_cents" in update or "attested" in update:
        raise ValueError("Only an evidence-attested outcome may record an amount.")
    timestamp = utc_now()
    if action == "record_silence":
        if not case["deadline"] or case["deadline"] > timestamp[:10]:
            raise ValueError("The recorded planning deadline has not arrived.")
        if any(e["action"] == action and e.get("deadline") == case["deadline"]
               for e in case["timeline"]):
            raise ValueError("Silence is already recorded for this deadline. Set a new date to follow up.")
    if "deadline" in update:
        case["deadline"] = update["deadline"]
    details: dict[str, Any] = {"deadline": case["deadline"]}
    if monetary:
        # This is an attested cumulative demo amount, never an additive money counter.
        details["outcome"] = {
            "kind": "partial" if action == "partial_outcome" else "resolved",
            "amount_cents": update["amount_cents"], "currency": "EUR", "attested": True,
            "label": "Human-attested synthetic outcome; real recovered money remains EUR 0.00",
            "actor": actor, "timestamp": timestamp, "source": source,
            "evidence_reference": update["evidence_reference"],
        }
        case["outcome"] = copy.deepcopy(details["outcome"])
    if action == "reopen":
        case["outcome"] = None  # Prior outcomes remain in the append-only timeline.
    return append_event(
        case, action=action, status=target or case["status"], actor=actor, source=source,
        note=update["note"], evidence_reference=update["evidence_reference"],
        timestamp=timestamp, **details,
    )


def project_case(case: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(case)
    result.pop("requests", None)
    status = case["status"]
    deadline = case["deadline"]
    active = status in {"authorized", "pending_response", "needs_information"}
    overdue = bool(active and deadline and deadline <= utc_now()[:10])
    result["deadline_status"] = (
        "closed" if not active else "due" if overdue else "scheduled" if deadline else "not_set"
    )
    result["deadline_label"] = "Household planning date (UTC); not a statutory deadline"
    result["next_action"] = {
        "draft": "Review the recorded appliance and receipt facts.",
        "review": "Review an exact current draft and explicitly approve it. Nothing has been sent.",
        "authorized": "Set a planning deadline and start response tracking. Approval sent no email.",
        "pending_response": (
            "Planning date reached. Record whether a reply arrived and choose a follow-up date."
            if overdue else "Record a labeled reply or manual update. No mailbox is connected."
        ),
        "needs_information": "Add the requested evidence reference, then review the next response.",
        "rejected": "Review the recorded refusal and evidence. Reopen if you want to pursue it.",
        "resolved": "Review the attested outcome and its limits. Reopen if the issue remains.",
    }[status]
    result["allowed_actions"] = [action for action, (allowed, _) in TRANSITIONS.items()
                                 if status in allowed]
    return result
