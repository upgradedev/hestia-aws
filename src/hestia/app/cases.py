"""Protected, conditional and replay-safe household case updates."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import date
from typing import Any

from hestia.adapters.storage import S3HouseholdStore
from hestia.app.access import APIError
from hestia.app.claims import charge_action, public_state, require_fields, text_field
from hestia.domain.cases import apply_update, project_case


def update_case(store: S3HouseholdStore, body: dict[str, Any]) -> dict[str, Any]:
    require_fields(body, {
        "case_id", "expected_revision", "request_id", "action", "source", "note",
        "evidence_reference",
    }, {"deadline", "amount_cents", "attested"})
    for key, limit in (("case_id", 37), ("request_id", 32), ("action", 40), ("source", 40),
                       ("note", 2000), ("evidence_reference", 200)):
        text_field(body, key, limit)
    if (not re.fullmatch(r"case-[a-f0-9]{32}", body["case_id"])
            or not re.fullmatch(r"[a-f0-9]{32}", body["request_id"])
            or type(body["expected_revision"]) is not int or body["expected_revision"] < 1):
        raise APIError(400, "Invalid case identity, request ID or expected revision.")
    if "deadline" in body:
        value = text_field(body, "deadline", 10)
        try:
            if date.fromisoformat(value).isoformat() != value:
                raise ValueError("Non-canonical date")
        except ValueError as exc:
            raise APIError(400, "Planning deadline must be a valid YYYY-MM-DD date.") from exc
    state = store.load_state(create=False)
    case = next((c for c in state.get("cases", []) if c["id"] == body["case_id"]), None)
    if case is None:
        raise APIError(404, "Case not found in this session.")
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    prior = case["requests"].get(body["request_id"])
    if prior:
        if not hmac.compare_digest(prior["digest"], digest):
            raise APIError(409, "This request ID already belongs to different content.")
        return {"status": "simulated", "replayed": True, "event_id": prior["event_id"],
                "case": project_case(case), "state": public_state(state)}
    if case["revision"] != body["expected_revision"]:
        raise APIError(409, "Case changed. Refresh and review its timeline before another update.")
    charge_action(state)
    try:
        event = apply_update(case, body, "household_session:" + store.workspace_id)
    except ValueError as exc:
        raise APIError(422, str(exc)) from exc
    case["requests"][body["request_id"]] = {"digest": digest, "event_id": event["id"]}
    store.add_audit_event(state, "case_update", {
        "case_id": case["id"], "event_id": event["id"], "request_digest": digest,
        "actor": event["actor"], "source": event["source"], "mode": "simulated",
    })
    store.save_state(state)
    persisted = next(c for c in state["cases"] if c["id"] == body["case_id"])
    return {"status": "simulated", "replayed": False, "event_id": event["id"],
            "case": project_case(persisted), "state": public_state(state)}
