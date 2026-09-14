"""Bounded, session-scoped Strands review route with server-side cost limits."""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from hestia.adapters.storage import S3HouseholdStore
from hestia.agents.household_agent import (
    DEFAULT_MODEL_ID,
    MAX_EXTRACT_CHARS,
    MAX_OUTPUT_TOKENS,
    AgentOutcome,
    ExtractionOutcome,
    framework_version,
    run_live_agent,
    run_text_extraction,
    run_tools_only,
)
from hestia.app.access import APIError
from hestia.app.claims import charge_action, public_state, require_fields
from hestia.domain.ocr import content_hash

SESSION_CAP_DEFAULT = 3
EXTRACT_SESSION_CAP_DEFAULT = 3
DAILY_CAP_DEFAULT = 200
BRIEFINGS_KEPT = 5


def agent_config() -> dict[str, Any]:
    """Configuration as seen by health checks; executing the model still needs IAM."""
    live = os.environ.get("HESTIA_LIVE_MODEL", "") == "bedrock"
    return {
        "live_model": live,
        "model_id": os.environ.get("HESTIA_BEDROCK_MODEL_ID", DEFAULT_MODEL_ID) if live else None,
        "framework": framework_version(),
        "session_cap": int(os.environ.get("HESTIA_AGENT_SESSION_CAP", SESSION_CAP_DEFAULT)),
        "extract_session_cap": int(os.environ.get("HESTIA_AGENT_EXTRACT_SESSION_CAP",
                                                  EXTRACT_SESSION_CAP_DEFAULT)),
        "daily_cap": int(os.environ.get("HESTIA_AGENT_DAILY_CAP", DAILY_CAP_DEFAULT)),
        "max_output_tokens": int(os.environ.get("HESTIA_AGENT_MAX_TOKENS", MAX_OUTPUT_TOKENS)),
        "region": os.environ.get("HESTIA_BEDROCK_REGION", "eu-west-1"),
    }


def agent_review(
    store: S3HouseholdStore, body: dict[str, Any],
    live_runner: Callable[..., AgentOutcome] | None = None,
) -> dict[str, Any]:
    require_fields(body, set())
    config = agent_config()
    state = store.load_state(create=False)
    today = date.today()
    used = int(state.get("agent_calls", 0) or 0)
    outcome: AgentOutcome
    if not config["live_model"]:
        outcome = run_tools_only(state, today, "model_not_configured")
    elif used >= config["session_cap"]:
        outcome = run_tools_only(state, today, "session_cap")
    else:
        allowed, _count = store.increment_daily_counter("agent-review", config["daily_cap"])
        if allowed is None:
            outcome = run_tools_only(state, today, "budget_unconfirmed")
        elif not allowed:
            outcome = run_tools_only(state, today, "daily_cap")
        else:
            state["agent_calls"] = used + 1  # count every attempt that may incur cost
            runner = live_runner or run_live_agent
            outcome = runner(
                state, today, model_id=config["model_id"], region_name=config["region"],
                max_tokens=config["max_output_tokens"],
            )
    charge_action(state)
    record = {
        "id": "brief-" + uuid.uuid4().hex, "timestamp": datetime.now(UTC).isoformat(),
        **outcome.to_record(),
        "session_calls_used": int(state.get("agent_calls", 0) or 0),
        "session_cap": config["session_cap"], "daily_cap": config["daily_cap"],
        "real_recovered_cents": 0,
    }
    briefings = state.setdefault("agent_briefings", [])
    briefings.append(record)
    del briefings[:-BRIEFINGS_KEPT]
    store.add_audit_event(state, "agent_review", {
        "briefing_id": record["id"], "mode": record["mode"], "model_id": record["model_id"],
        "withheld": record["withheld"], "tool_calls": [c["tool"] for c in record["tool_calls"]],
        "usage": record["usage"], "reason": record["reason"],
    })
    store.save_state(state)
    return {"status": "simulated", "briefing": record, "state": public_state(state)}


def agent_extract(
    store: S3HouseholdStore, body: dict[str, Any],
    live_runner: Callable[..., ExtractionOutcome] | None = None,
) -> dict[str, Any]:
    """Propose intake records from pasted text; the household reviews and confirms them."""
    require_fields(body, {"text"}, {"hint"})
    text = body.get("text")
    if (not isinstance(text, str) or not text.strip() or len(text) > MAX_EXTRACT_CHARS
            or any(ord(c) < 32 and c not in "\n\r\t" for c in text)):
        raise APIError(400, f"Paste 1 to {MAX_EXTRACT_CHARS} characters of plain text.")
    hint = body.get("hint", "auto")
    if hint not in ("auto", "receipt", "order", "statement"):
        raise APIError(400, "Unknown document hint.")
    config = agent_config()
    if not config["live_model"]:
        raise APIError(503, "Reading pasted text needs the model, which is not configured here. "
                            "Enter the facts manually instead.")
    state = store.load_state(create=False)
    route = "/api/ingest/sync"
    drafts = state.setdefault("intakes", {})
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    identity = "intake-" + content_hash({"source": "model_text_extraction", "hash": digest,
                                        "route": route})[:32]
    if identity in drafts:
        return {"status": "simulated", "intake": drafts[identity], "replayed": True,
                "state": public_state(state)}
    used = int(state.get("agent_extracts", 0) or 0)
    if used >= config["extract_session_cap"]:
        raise APIError(429, "This sample copy has used its text readings. "
                            "Enter the facts manually.")
    if len(drafts) >= 8:
        raise APIError(429, "Intake limit reached for this isolated session")
    allowed, _count = store.increment_daily_counter("agent-review", config["daily_cap"])
    if not allowed:
        raise APIError(503, "The shared model budget is used up or unconfirmed today. "
                            "Enter the facts manually instead.")
    state["agent_extracts"] = used + 1
    runner = live_runner or run_text_extraction
    outcome = runner(text, hint, model_id=config["model_id"], region_name=config["region"],
                     max_tokens=config["max_output_tokens"])
    charge_action(state)
    if outcome.mode != "live_model":
        # A client-side failure (throttled, unavailable, unreachable) never reached the model,
        # so the reading is handed back; a timeout or an unreadable reply stays counted.
        refunded = (outcome.reason or "").startswith("model_error:")
        if refunded:
            state["agent_extracts"] = used
        store.add_audit_event(state, "agent_extract", {"outcome": outcome.reason,
                                                       "input_sha256": digest,
                                                       "reading_counted": not refunded})
        store.save_state(state)
        print(json.dumps({"event": "agent_extract_failed", "reason": outcome.reason,
                          "duration_ms": outcome.duration_ms, "reading_counted": not refunded}))
        raise APIError(502, "The model could not read this text. No intake draft was "
                            "created; an audit record and the text hash were retained. "
                            + ("This attempt was not counted; try again in a moment "
                               "or enter the facts manually." if refunded else
                               "Enter the facts manually or try again later."))
    draft = {
        "id": identity, "input_sha256": digest, "byte_count": len(text.encode("utf-8")),
        "mime_type": "text/plain", "source": "model_text_extraction", "route": route,
        "status": "staged", "created_at": datetime.now(UTC).isoformat(), "review": None,
        "records": outcome.records, "ocr_status": "model_text", "confidence_score": None,
        "model_id": outcome.model_id, "usage": outcome.usage, "duration_ms": outcome.duration_ms,
        "message": "Proposed by the model from the pasted text. Review and correct every "
                   "fact before importing; nothing is verified.",
    }
    drafts[identity] = draft
    store.add_audit_event(state, "agent_extract", {
        "intake_id": identity, "input_sha256": digest, "records": len(outcome.records),
        "usage": outcome.usage, "model_id": outcome.model_id,
    })
    store.save_state(state)
    return {"status": "simulated", "intake": state["intakes"][identity], "replayed": False,
            "state": public_state(state)}
