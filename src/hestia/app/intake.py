"""Scoped stage/review/confirm intake over existing routes and conditional state writes."""
from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any

from hestia.adapters.storage import S3HouseholdStore
from hestia.app.access import APIError
from hestia.app.claims import charge_action, public_state, require_fields, text_field
from hestia.domain.intake import apply_changes, plan_records
from hestia.domain.ocr import (
    canonical_bytes,
    content_hash,
    extract_receipt_metadata,
    validate_records,
)


def intake_action(store: S3HouseholdStore, body: dict[str, Any], route: str) -> dict[str, Any]:
    operation = body.get("operation")
    # Legacy requests cannot trigger a default import or provider call.
    if operation is None:
        raise APIError(501, "Provider integration is not enabled. Use explicit manual intake.")
    state = store.load_state(create=False)
    drafts = state.setdefault("intakes", {})
    replayed = False
    if operation == "stage":
        if "records" in body:
            require_fields(body, {"operation", "records"})
            records = validate_records(body["records"])
            source = {"input_sha256": content_hash(records), "records": copy.deepcopy(records),
                      "source": "manual_entry", "mime_type": "application/json",
                      "byte_count": len(canonical_bytes(records)), "ocr_status": "unavailable",
                      "confidence_score": None}
        else:
            require_fields(body, {"operation", "document_base64", "mime_type"})
            source = extract_receipt_metadata(image_base64=body["document_base64"],
                                              mime_type=body["mime_type"])
        identity = "intake-" + content_hash({"source": source["source"],
                                            "hash": source["input_sha256"], "route": route})[:32]
        if identity in drafts:
            draft, replayed = drafts[identity], True
        else:
            if len(drafts) >= 8:
                raise APIError(429, "Intake limit reached for this isolated session")
            draft = {"id": identity, **source, "route": route, "status": "staged",
                     "created_at": datetime.now(UTC).isoformat(), "review": None}
            drafts[identity] = draft
    elif operation in ("review", "commit"):
        required = ({"operation", "intake_id", "records"} if operation == "review"
                    else {"operation", "intake_id", "digest", "confirmed"})
        require_fields(body, required)
        draft = drafts.get(text_field(body, "intake_id", 80))
        if draft is None or draft["route"] != route:
            raise APIError(404, "Intake not found in this session and route")
        if operation == "review":
            if draft["status"] == "committed":
                raise APIError(409, "This intake was already committed; its evidence is retained")
            records = validate_records(body["records"])
            plan = {"input_sha256": draft["input_sha256"],
                    "source_version": state["version_seq"] + 1,
                    "original_records": draft["records"], "corrected_records": records,
                    "changes": plan_records(state, records)}
            draft["review"] = {**plan, "digest": content_hash(plan)}
            draft["status"] = "review"
        else:
            review = draft["review"]
            if body["confirmed"] is not True:
                raise APIError(422, "Explicit consent to these exact facts is required")
            if review is None or body["digest"] != review["digest"]:
                raise APIError(409, "Reviewed facts differ; review and confirm again")
            if draft["status"] == "committed":
                replayed = True
            else:
                if state["version_seq"] != review["source_version"]:
                    raise APIError(409, "Workspace changed; review the current facts again")
                if not any(c["status"] in ("ready", "duplicate") for c in review["changes"]):
                    raise APIError(422, "No valid records to import; correct the listed errors")
                apply_changes(state, review["changes"])
                draft["status"] = "committed"
                draft["committed_at"] = datetime.now(UTC).isoformat()
                draft["actor"] = "demo_user"
                draft["mode"] = "synthetic"
                draft["result"] = {
                    status: sum(c["status"] == status for c in review["changes"])
                    for status in ("ready", "duplicate", "error")
                }
                # Provenance lives separately so one batch's transaction/receipt pair is atomic.
                for change in review["changes"]:
                    if change["status"] == "ready":
                        state.setdefault("intake_provenance", []).append({
                            "intake_id": draft["id"], "input_sha256": draft["input_sha256"],
                            "digest": review["digest"], "source": draft["source"],
                            "record_id": change["record_id"], "collection": change["collection"],
                            "row": change["index"], "actor": "demo_user", "mode": "synthetic",
                            "timestamp": draft["committed_at"],
                        })
    else:
        raise APIError(400, "Use stage, review or commit")
    if not replayed:
        charge_action(state)
        store.add_audit_event(state, "intake_" + operation, {
            "intake_id": draft["id"], "input_sha256": draft["input_sha256"],
            "digest": (draft.get("review") or {}).get("digest"), "mode": "synthetic",
        })
        store.save_state(state)
    # save_state replaces state; read the persisted draft rather than its previous reference.
    return {"status": "simulated", "intake": state["intakes"][draft["id"]],
            "replayed": replayed, "state": public_state(state)}
