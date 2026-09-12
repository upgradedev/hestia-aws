"""Exact-content preparation and atomic simulated approval.

The public demo never invokes SES or a paid model. An approval records a synthetic
outcome, not legal eligibility, dispatch, delivery or money recovered.
"""
from __future__ import annotations

import copy
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from hestia.adapters.storage import S3HouseholdStore
from hestia.app.access import APIError

DRAFT_TTL = 600
MAX_ACTIONS = 40


def charge_action(state: dict[str, Any]) -> None:
    count = state.get("action_count", 0)
    if type(count) is not int or count >= MAX_ACTIONS:
        raise APIError(429, "Demo action limit reached. Start a new isolated session explicitly.")
    state["action_count"] = count + 1


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(state)
    result.pop("drafts", None)
    return result


def require_fields(
    body: dict[str, Any], required: set[str], optional: set[str] | None = None,
) -> None:
    if not required <= body.keys() or not body.keys() <= required | (optional or set()):
        raise APIError(400, "Unexpected or missing request fields.")


def text_field(body: dict[str, Any], key: str, limit: int = 200) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise APIError(400, f"Invalid {key}.")
    if any(ord(char) < 32 for char in value):
        raise APIError(400, f"Invalid control characters in {key}.")
    return value


def _digest(value: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode("utf-8")
    ).hexdigest()


def prepare_claim(
    store: S3HouseholdStore, body: dict[str, Any], session_expiry: int,
) -> dict[str, Any]:
    require_fields(body, {"item_id"})
    item_id = text_field(body, "item_id", 80)
    state = store.load_state(create=False)
    item = next((a for a in state["appliances"] if a["id"] == item_id), None)
    if item is None:
        raise APIError(404, "The selected appliance does not exist.")
    amount = item.get("repair_amount_cents")
    if not item.get("has_repair_claim") or type(amount) is not int or not 0 < amount <= 10000000:
        raise APIError(422, "No documented positive repair amount is available for this item.")
    charge_action(state)
    if len(state.get("drafts", {})) >= 16:
        raise APIError(429, "Draft limit reached for this isolated demo.")
    for key in ("seller_name", "seller_email", "item_name", "repair_issue", "receipt_reference"):
        text_field(item, key, 1000)
    homeowner = text_field(state, "homeowner_name")
    seller = item["seller_name"]
    recipient = item["seller_email"]
    if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", recipient):
        raise APIError(422, "The stored recipient address requires correction.")
    draft_id = "draft-" + uuid.uuid4().hex
    notice = (
        f"REVIEW COPY - SYNTHETIC DEMO, NOT SENT\n\n"
        f"From: {homeowner}\nTo: {seller} <{recipient}>\n"
        f"Subject: Repair review request for {item['item_name']}\n\n"
        f"Please review the repair record for {item['item_name']} "
        f"(receipt {item['receipt_reference']}).\n"
        f"Recorded purchase date: {item['purchase_date']}.\n"
        f"Recorded repair date: {item.get('repair_date') or 'not provided'}.\n"
        f"Reported issue: {item['repair_issue']}.\n"
        f"Recorded repair cost: EUR {amount / 100:.2f}.\n\n"
        f"I request a review of the available remedy and supporting evidence. "
        f"This draft does not determine legal eligibility or confirm reimbursement.\n\n"
        f"{homeowner}"
    )
    draft = {
        "id": draft_id, "item_id": item_id, "subject": f"Repair review: {item['item_name']}",
        "notice": notice, "seller": seller, "seller_email": recipient,
        "homeowner_name": homeowner, "amount_cents": amount, "currency": "EUR",
        "source_version": state["version_seq"] + 1,
        "generation": state.get("generation", 0), "workspace_id": store.workspace_id,
        "source_digest": _digest({"item": item, "homeowner": homeowner}),
        "expires_at": min(int(time.time()) + DRAFT_TTL, session_expiry),
        "model_id": "deterministic-review-template", "mode": "simulated",
        "statutory_basis": "Eligibility requires review; no legal entitlement determined",
    }
    digest = _digest(draft)
    approval = secrets.token_hex(32)
    state.setdefault("drafts", {})[draft_id] = {
        "payload": draft, "digest": digest,
        "approval_hash": hashlib.sha256(approval.encode()).hexdigest(),
        "consumed": False,
    }
    store.save_state(state)
    return {"status": "prepared", "draft": {**draft, "digest": digest, "approval_token": approval}}


def approve_claim(store: S3HouseholdStore, body: dict[str, Any]) -> dict[str, Any]:
    require_fields(body, {"draft_id", "digest", "approval_token"})
    draft_id = text_field(body, "draft_id", 80)
    digest = text_field(body, "digest", 64)
    token = text_field(body, "approval_token", 64)
    if not re.fullmatch(r"draft-[a-f0-9]{32}", draft_id) or any(
        not re.fullmatch(r"[a-f0-9]{64}", value) for value in (digest, token)
    ):
        raise APIError(400, "Invalid approval proof.")
    state = store.load_state(create=False)
    saved = state.get("drafts", {}).get(draft_id)
    if not isinstance(saved, dict):
        raise APIError(404, "Prepared notice not found in this session.")
    draft = saved["payload"]
    if (
        not hmac.compare_digest(saved["digest"], digest)
        or not hmac.compare_digest(_digest(draft), digest)
        or not hmac.compare_digest(
            saved["approval_hash"], hashlib.sha256(token.encode()).hexdigest(),
        )
        or draft["workspace_id"] != store.workspace_id
    ):
        raise APIError(403, "Approval does not match the prepared notice.")
    if saved["consumed"]:
        return {
            "status": "simulated", "dispatch_record": copy.deepcopy(saved["result"]),
            "state": public_state(state), "replayed": True,
        }
    if int(time.time()) >= draft["expires_at"]:
        raise APIError(409, "Prepared notice expired. Review a new draft.")
    item = next((a for a in state["appliances"] if a["id"] == draft["item_id"]), None)
    if (
        item is None
        or state["version_seq"] != draft["source_version"]
        or state.get("generation", 0) != draft["generation"]
        or _digest({"item": item, "homeowner": state["homeowner_name"]}) != draft["source_digest"]
    ):
        raise APIError(409, "Evidence changed after preview. Review a new draft.")
    charge_action(state)
    record = {
        "id": "disp-" + draft_id[6:], "item_id": draft["item_id"], "status": "simulated",
        "delivery_status": "SIMULATED", "ses_message_id": None,
        "timestamp": datetime.now(UTC).isoformat(), "seller": draft["seller"],
        "seller_email": draft["seller_email"], "subject": draft["subject"],
        "amount_cents": draft["amount_cents"], "currency": draft["currency"],
        "statutory_basis": draft["statutory_basis"], "letter_preview": draft["notice"][:200],
        "full_letter": draft["notice"], "cryptographic_seal": digest,
        "model_id": draft["model_id"], "mode": "simulated",
        "source_version": draft["source_version"],
    }
    # Consumption, exact artifact, audit and outcome share one CAS commit. No external send.
    saved.update(consumed=True, result=copy.deepcopy(record))
    state["dispatch_records"].append(record)
    store.add_audit_event(state, "simulated_claim_approval", {
        "draft_id": draft_id, "digest": digest, "dispatch_id": record["id"], "mode": "simulated",
    })
    # Approval does not resolve the original issue or reduce money at risk.
    store.save_state(state)
    return {"status": "simulated", "dispatch_record": record, "state": public_state(state)}
