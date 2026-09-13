"""Bounded, session-scoped Strands review route with server-side cost limits."""
from __future__ import annotations

import os
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from hestia.adapters.storage import S3HouseholdStore
from hestia.agents.household_agent import (
    DEFAULT_MODEL_ID,
    MAX_OUTPUT_TOKENS,
    AgentOutcome,
    framework_version,
    run_live_agent,
    run_tools_only,
)
from hestia.app.claims import charge_action, public_state, require_fields

SESSION_CAP_DEFAULT = 3
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
