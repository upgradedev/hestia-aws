"""HTTP boundary for synthetic workspaces. No production write or provider authority."""
from __future__ import annotations

import base64
import binascii
import json
import os
import re
from datetime import UTC, datetime
from typing import Any

from hestia.adapters.storage import (
    S3HouseholdStore,
    StateMissing,
    StorageConflict,
    StorageError,
    fresh_demo_state,
    preserve_intake,
)
from hestia.app.access import APIError, authorize_demo, issue_demo_access
from hestia.app.cases import update_case
from hestia.app.claims import (
    approve_claim,
    charge_action,
    prepare_claim,
    public_state,
    require_fields,
    text_field,
)
from hestia.app.intake import intake_action
from hestia.domain.mcts import LegalNegotiationMCTS
from hestia.domain.metrics import summary_from_records
from hestia.domain.ocr import content_hash

MAX_BODY_BYTES = 32768
HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}
ALIASES = {
    "/action/claim": "/api/action/claim",
    "/action/cancel_trial": "/api/action/cancel",
    "/action/utility_dispute": "/api/action/utility_dispute",
    "/action/reset": "/api/action/reset",
    "/receipt/scan": "/api/receipt/scan",
    "/ingest/sync": "/api/ingest/sync",
    "/simulation/mcts": "/api/simulation/mcts",
    "/outbox/status": "/api/outbox/status",
    "/outbox/dispatch": "/api/outbox/dispatch",
}
PROTECTED_GET = {"/api/state", "/api/outbox/status"}
PROTECTED_POST = {
    "/api/action/claim/prepare", "/api/action/claim", "/api/action/cancel",
    "/api/action/utility_dispute", "/api/action/reset", "/api/action/receipt",
    "/api/receipt/scan", "/api/ingest/sync", "/api/outbox/dispatch",
    "/api/outbox/status",
    "/api/case/update",
}


def response(status: int, data: Any) -> dict[str, Any]:
    # Project all API state responses, including claim/case responses and legacy stored snapshots.
    if isinstance(data, dict):
        state = data.get("state", data)
        if isinstance(state, dict) and "outflows" in state and "version_seq" in state:
            state["summary"] = summary_from_records(state)
    return {"statusCode": status, "headers": HEADERS, "body": json.dumps(data, allow_nan=False)}


def store_for(workspace_id: str) -> S3HouseholdStore:
    if not os.environ.get("HESTIA_STATE_BUCKET"):
        raise APIError(503, "Persistent demo storage is not configured. No change was saved.")
    return S3HouseholdStore(workspace_id=workspace_id)


def _headers(event: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in (event.get("headers") or {}).items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise APIError(400, "Invalid request headers.")
        key = key.lower()
        if key in result or "\r" in value or "\n" in value:
            raise APIError(400, "Ambiguous request headers.")
        result[key] = value
    for key, values in (event.get("multiValueHeaders") or {}).items():
        if not isinstance(key, str) or not isinstance(values, list) or len(values) != 1:
            raise APIError(400, "Ambiguous request headers.")
        value = values[0]
        key = key.lower()
        if not isinstance(value, str) or "\r" in value or "\n" in value:
            raise APIError(400, "Invalid request headers.")
        if key in result and result[key] != value:
            raise APIError(400, "Ambiguous request headers.")
        result[key] = value
    return result


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate field")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Non-finite JSON number")


def _body(event: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    raw = event.get("body")
    if raw is None:
        return {}
    if not isinstance(raw, str) or len(raw) > MAX_BODY_BYTES * 2:
        raise APIError(413, "Request is too large.")
    try:
        content = (base64.b64decode(raw, validate=True)
                   if event.get("isBase64Encoded") else raw.encode())
        if len(content) > MAX_BODY_BYTES:
            raise APIError(413, "Request is too large.")
        if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            raise APIError(415, "Use application/json; form submissions cannot authorize actions.")
        data = json.loads(
            content.decode("utf-8"), object_pairs_hook=_object, parse_constant=_invalid_constant,
        )
        if not isinstance(data, dict):
            raise ValueError("Expected object")
        return data
    except (ValueError, UnicodeError, binascii.Error, RecursionError) as exc:
        raise APIError(400, "Malformed JSON request; no default action was taken.") from exc


def _record_local_action(
    store: S3HouseholdStore, path: str, body: dict[str, Any],
) -> dict[str, Any]:
    state = store.load_state(create=False)
    if path == "/api/action/reset":
        require_fields(body, set())
        fresh = fresh_demo_state()
        for key in ("version_seq", "drafts", "dispatch_records", "audit_events", "action_count"):
            fresh[key] = state[key]
        fresh["cases"] = state.get("cases", [])
        preserve_intake(state, fresh)
        fresh["generation"] = state.get("generation", 0) + 1
        state = fresh
        result = {"status": "simulated", "message": "Demo data reset; audit history retained."}
    elif path == "/api/action/cancel":
        require_fields(body, {"service_name"}, {"subscription_id", "expected_monthly_cents"})
        name = text_field(body, "service_name")
        matches = [s for s in state["subscriptions"]
                   if (s["id"] == body["subscription_id"] if "subscription_id" in body
                       else name in (s["id"], s["service_name"]))]
        if len(matches) > 1:
            raise APIError(409, "Ambiguous subscription name; use subscription_id")
        sub = matches[0] if matches else None
        if sub is None:
            raise APIError(404, "Subscription not found.")
        if name not in (sub["id"], sub["service_name"]) or (
            "expected_monthly_cents" in body and (
                type(body["expected_monthly_cents"]) is not int
                or body["expected_monthly_cents"] != sub["monthly_cents"]
            )
        ):
            raise APIError(409, "Subscription facts changed; review before requesting")
        if sub.get("demo_cancellation_requested"):
            return {"status": "simulated", "replayed": True, "state": public_state(state),
                    "result": {"status": "simulated", "service_name": name}}
        sub["demo_cancellation_requested"] = True
        sub["cancellation_request"] = {
            "subscription_id": sub["id"], "service_name": sub["service_name"],
            "monthly_cents": sub["monthly_cents"], "trial_end_date": sub.get("trial_end_date"),
            "status": "synthetic_requested", "actor": "demo_user",
            "requested_facts_hash": content_hash(body),
            "timestamp": datetime.now(UTC).isoformat(),
        }
        result = {"status": "simulated", "service_name": name,
                  "message": "Demo request recorded. No provider subscription was cancelled."}
    elif path == "/api/action/utility_dispute":
        require_fields(body, {"provider", "excess_cents"}, {"legal_basis"})
        provider = text_field(body, "provider")
        amount = body["excess_cents"]
        if type(amount) is not int or not 0 <= amount <= 10000000:
            raise APIError(400, "Invalid excess_cents.")
        bill = next((u for u in state["utility_bills"] if u["provider"] == provider), None)
        if bill is None:
            raise APIError(404, "Utility bill not found.")
        if amount != max(0, bill["current_cents"] - bill["baseline_cents"]):
            raise APIError(409, "Review the amount recorded in the utility bill.")
        if bill.get("demo_dispute_requested"):
            return {"status": "simulated", "replayed": True, "state": public_state(state),
                    "result": {"status": "simulated", "provider": provider}}
        bill["demo_dispute_requested"] = True
        result = {"status": "simulated", "provider": provider,
                  "message": "Demo request only; no provider was contacted."}
    else:
        require_fields(body, {"merchant", "amount_cents", "receipt_id"}, {"transaction_id"})
        merchant = text_field(body, "merchant")
        receipt_id = text_field(body, "receipt_id", 100)
        amount = body["amount_cents"]
        if type(amount) is not int or not 0 < amount <= 10000000:
            raise APIError(400, "Invalid amount_cents.")
        matches = [o for o in state["outflows"]
                   if o["merchant"] == merchant and o["amount_cents"] == amount
                   and ("transaction_id" not in body or o["id"] == body["transaction_id"])]
        if len(matches) > 1:
            raise APIError(409, "Ambiguous transaction; use transaction_id")
        outflow = matches[0] if matches else None
        if outflow is None:
            raise APIError(404, "No matching transaction; no fallback record was changed.")
        if outflow.get("has_receipt"):
            if outflow.get("receipt_id") != receipt_id:
                raise APIError(409, "This transaction already references another receipt.")
            return {"status": "simulated", "replayed": True, "state": public_state(state),
                    "result": {"status": "linked", "matched": True, "receipt_id": receipt_id}}
        if receipt_id in state["saved_receipts"]:
            raise APIError(409, "Receipt already belongs to another record.")
        outflow.update(has_receipt=True, receipt_id=receipt_id, status="manually_recorded")
        state.setdefault("intake_provenance", []).append({
            "record_id": outflow["id"], "collection": "outflows", "source": "manual_reference",
            "input_sha256": content_hash(body), "facts": dict(body), "actor": "demo_user",
            "mode": "synthetic",
            "timestamp": datetime.now(UTC).isoformat(),
        })
        state["saved_receipts"].append(receipt_id)
        state["summary"]["missing_receipt_cents"] = sum(
            o["amount_cents"] for o in state["outflows"]
            if not o["has_receipt"] and o["amount_cents"] >= 5000
        )
        result = {"status": "linked", "matched": True, "receipt_id": receipt_id,
                  "provenance": "user-recorded synthetic demo; not OCR verified"}
    charge_action(state)
    seal = store.add_audit_event(
        state, path.rsplit("/", 1)[-1], {"input": body, "mode": "simulated"},
    )
    store.save_state(state)
    return {"status": "simulated", "result": {**result, "cryptographic_seal": seal},
            "state": public_state(state)}


def handle_api(event: dict[str, Any]) -> dict[str, Any]:
    """One shared boundary covers every public and legacy path."""
    try:
        return _handle_api(event)
    except APIError as exc:
        return response(exc.status, {"status": "error", "message": str(exc)})
    except StorageConflict as exc:
        return response(409, {"status": "error", "message": str(exc)})
    except StateMissing as exc:
        return response(410, {"status": "error", "message": str(exc)})
    except StorageError:
        return response(503, {"status": "error", "message":
                              "Storage outcome unconfirmed. Reload; do not assume success."})
    except (ValueError, TypeError, KeyError, AttributeError):
        return response(400, {"status": "error", "message": "Invalid request or workspace data."})


def _handle_api(event: dict[str, Any]) -> dict[str, Any]:
    path = event.get("rawPath") or event.get("path") or "/"
    if event.get("rawPath") and event.get("path") and event["rawPath"] != event["path"]:
        raise APIError(400, "Ambiguous request path.")
    if not isinstance(path, str) or not re.fullmatch(r"/[A-Za-z0-9/_-]*", path):
        raise APIError(404, "Route not found.")
    path = ALIASES.get(path, path)
    http_method = event.get("requestContext", {}).get("http", {}).get("method")
    legacy_method = event.get("httpMethod")
    if http_method and legacy_method and http_method.upper() != legacy_method.upper():
        raise APIError(400, "Ambiguous request method.")
    method = (http_method or legacy_method or "GET").upper()
    headers = _headers(event)
    if method == "OPTIONS":
        return response(200, {})
    if method == "GET" and path == "/healthz":
        return response(200, {
            "status": "ok", "service": "hestia-aws", "version": "0.3.0",
            "commit": os.environ.get("HESTIA_COMMIT_SHA"), "mode": "simulated",
            "live_send": False, "live_model": False,
            "storage_configured": bool(os.environ.get("HESTIA_STATE_BUCKET")),
            "demo_sessions_configured": len(
                os.environ.get("HESTIA_DEMO_SECRET", "").encode(),
            ) >= 32,
        })
    if path == "/api/state" and method == "GET" and "authorization" not in headers:
        return response(200, {**public_state(fresh_demo_state()), "read_only_preview": True})
    if path == "/api/demo/session" and method == "POST":
        require_fields(_body(event, headers), set())
        token, access = issue_demo_access()
        state = store_for(access.workspace_id).create_workspace()
        return response(201, {"token": token, "expires_at": access.expires_at,
                              "mode": "simulated", "state": public_state(state)})
    if path == "/api/simulation/mcts" and method in ("GET", "POST"):
        # Explicit illustration only, bounded iterations, no external provider.
        return response(200, {**LegalNegotiationMCTS().search(iterations=100),
                              "mode": "illustrative", "empirical_success_rate": None})
    if not ((method == "GET" and path in PROTECTED_GET)
            or (method == "POST" and path in PROTECTED_POST)):
        raise APIError(404, "Route not found.")
    access = authorize_demo(headers)
    body = _body(event, headers) if method == "POST" else {}
    if path == "/api/outbox/dispatch":
        raise APIError(403, "Direct dispatch is disabled. Approve an exact prepared notice.")
    store = store_for(access.workspace_id)
    if path in ("/api/receipt/scan", "/api/ingest/sync"):
        try:
            return response(200, intake_action(store, body, path))
        except ValueError as exc:
            raise APIError(400, str(exc)) from exc
    if path == "/api/state":
        return response(200, public_state(store.load_state(create=False)))
    if path == "/api/outbox/status":
        require_fields(body, set())
        return response(200, {"status": "success", "outbox": store.get_outbox_status()})
    if path == "/api/action/claim/prepare":
        return response(200, prepare_claim(store, body, access.expires_at))
    if path == "/api/action/claim":
        return response(200, approve_claim(store, body))
    if path == "/api/case/update":
        return response(200, update_case(store, body))
    return response(200, _record_local_action(store, path, body))
