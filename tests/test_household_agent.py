"""HE14: bounded Strands review route, deterministic tools, guards and cost limits."""
from __future__ import annotations

import json
import time
from datetime import date
from types import SimpleNamespace

import pytest

from hestia.adapters.storage import S3HouseholdStore, fresh_demo_state
from hestia.agents import household_agent as ha
from hestia.app import agent as agent_app
from hestia.app import api
from hestia.app.api import handle_api
from tests.fakes import ConditionalS3

TODAY = date(2026, 9, 13)
MODEL = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"


def call(path, body=None, token=None, method=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method or ("POST" if body is not None else "GET")}},
        "headers": headers,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    response = handle_api(event)
    return response["statusCode"], json.loads(response["body"])


def use(tool_id, name, params):
    return {"role": "assistant",
            "content": [{"toolUse": {"toolUseId": tool_id, "name": name, "input": params}}]}


def result(tool_id, text, status="success"):
    return {"role": "user", "content": [{"toolResult": {
        "toolUseId": tool_id, "status": status, "content": [{"text": text}]}}]}


class FixedDate(date):
    """The review route stamps its prompt with the current date; pin it to the fixture date."""

    @classmethod
    def today(cls):
        return cls(TODAY.year, TODAY.month, TODAY.day)


@pytest.fixture
def session(monkeypatch):
    monkeypatch.setattr(agent_app, "date", FixedDate)
    monkeypatch.setenv("HESTIA_DEMO_SECRET", "x" * 40)
    monkeypatch.delenv("HESTIA_LIVE_MODEL", raising=False)
    monkeypatch.setattr(api, "store_for",
                        lambda scope: S3HouseholdStore(bucket_name="", workspace_id=scope))
    S3HouseholdStore._states.clear()
    S3HouseholdStore._counters.clear()
    code, data = call("/api/demo/session", {})
    assert code == 201
    return data["token"]


def test_workspace_tools_read_recorded_facts_without_entitlement():
    state = fresh_demo_state(TODAY)
    tools = ha.tool_functions(state, TODAY)
    assert set(tools) == {"review_repair_evidence", "audit_subscriptions",
                          "check_receipts_and_utilities", "read_case_timeline"}
    repair = tools["review_repair_evidence"]("app-001")
    assert "REVIEW REQUIRED" in repair and "Kotsovolos" in repair
    assert "No saved case yet" in repair and "REIMBURSABLE" not in repair
    assert "No appliance with id" in tools["review_repair_evidence"]("app-999")
    subs = tools["audit_subscriptions"]()
    assert "[TRIAL ALERT]" in subs and "[PRICE HIKE]" in subs and "[DUPLICATE]" in subs
    receipts = tools["check_receipts_and_utilities"]()
    assert "[MISSING RECEIPT]" in receipts and "Leroy Merlin" in receipts
    assert "[UTILITY SPIKE]" in receipts
    assert "No case has been saved yet" in tools["read_case_timeline"]()


def test_strands_tool_wrappers_expose_schemas_from_signatures():
    tools = ha.strands_tools(fresh_demo_state(TODAY), TODAY)
    specs = {t.tool_spec["name"]: t.tool_spec for t in tools}
    assert specs["review_repair_evidence"]["inputSchema"]["json"]["required"] == ["appliance_id"]
    assert "never determines legal entitlement" in specs["review_repair_evidence"]["description"]
    assert "audit_subscriptions" in specs and "read_case_timeline" in specs


def test_tools_only_mode_runs_every_tool_and_has_no_narrative():
    outcome = ha.run_tools_only(fresh_demo_state(TODAY), TODAY, "model_not_configured")
    assert outcome.mode == "tools_only" and outcome.narrative is None
    assert [c.tool for c in outcome.tool_calls] == [
        "review_repair_evidence", "audit_subscriptions",
        "check_receipts_and_utilities", "read_case_timeline",
    ]
    assert outcome.tool_calls[0].input == {"appliance_id": "app-001"}
    assert outcome.reason == "model_not_configured" and outcome.model_id is None


@pytest.mark.parametrize("text", [
    "You are entitled to a full refund of €185.00; requires review.",
    "The seller must reimburse you. Review pending.",
    "Deadline of 14 days applies. Requires review.",
    "Recorded repair €185.00 and a €999.00 penalty requires review.",
    "Everything is fine.",
])
def test_guard_withholds_entitlement_claims_unknown_amounts_and_missing_review(text):
    assert ha.guard_narrative(text, ["Recorded repair cost: EUR 185.00."])


def test_guard_accepts_bounded_narrative_with_tool_amounts():
    outputs = ["Recorded repair cost: EUR 185.00.", "[PRICE HIKE] from EUR 9.99 to EUR 13.99"]
    text = ("What I checked\nRepair of €185.00 requires review; the price rose to €13.99.\n"
            "Decisions waiting for you\n- Review the exact notice draft in Hestia.\n"
            "Suggested next step\nOpen the case and review the draft.")
    assert ha.guard_narrative(text, outputs) == []


def test_extract_tool_calls_pairs_uses_with_results():
    messages = [
        use("t1", "audit_subscriptions", {}),
        result("t1", "[TRIAL ALERT] x"),
        use("t2", "review_repair_evidence", {"appliance_id": "app-001"}),
        result("t2", "boom", status="error"),
        {"role": "assistant", "content": [{"text": "done"}]},
    ]
    calls = ha.extract_tool_calls(messages)
    assert [(c.tool, c.status) for c in calls] == [
        ("audit_subscriptions", "success"), ("review_repair_evidence", "error"),
    ]
    assert calls[1].input == {"appliance_id": "app-001"} and calls[1].output == "boom"


class FakeAgent:
    """Stands in for a Strands Agent: records the prompt and returns a canned result."""

    def __init__(self, text, fail=False, hang=False):
        self.text, self.fail, self.hang = text, fail, hang
        self.messages = [
            use("a", "read_case_timeline", {}),
            result("a", "Recorded repair cost: EUR 185.00."),
        ]

    def __call__(self, prompt):
        assert "app-001" in prompt and "2026-09-13" in prompt
        if self.fail:
            raise RuntimeError("AccessDeniedException")
        if self.hang:
            time.sleep(2)
        return SimpleNamespace(
            message={"role": "assistant", "content": [{"text": self.text}]},
            stop_reason="end_turn",
            metrics=SimpleNamespace(accumulated_usage={"inputTokens": 1200, "outputTokens": 210}),
        )


GOOD = ("What I checked\nThe recorded repair of €185.00 requires review.\n"
        "Decisions waiting for you\n- Review the exact notice draft.\n"
        "Suggested next step\nOpen the case.")


def fake_factory(text, **kwargs):
    return lambda: FakeAgent(text, **kwargs)


def test_live_runner_returns_narrative_trace_and_usage():
    outcome = ha.run_live_agent(fresh_demo_state(TODAY), TODAY, agent_factory=fake_factory(GOOD))
    assert outcome.mode == "live_model" and outcome.model_id == ha.DEFAULT_MODEL_ID
    assert outcome.narrative == GOOD and outcome.withheld is False
    assert outcome.usage == {"input_tokens": 1200, "output_tokens": 210}
    assert [c.tool for c in outcome.tool_calls] == ["read_case_timeline"]
    assert outcome.stop_reason == "end_turn"


def test_live_runner_withholds_unsupported_narrative_but_keeps_trace():
    bad = "You are entitled to €185.00 back."
    outcome = ha.run_live_agent(fresh_demo_state(TODAY), TODAY, agent_factory=fake_factory(bad))
    assert outcome.mode == "live_model" and outcome.narrative is None and outcome.withheld
    assert any("unsupported claim" in r for r in outcome.withheld_reasons)
    assert outcome.tool_calls and outcome.usage["output_tokens"] == 210


def test_live_runner_failure_and_timeout_fall_back_to_deterministic_tools():
    failed = ha.run_live_agent(
        fresh_demo_state(TODAY), TODAY, agent_factory=fake_factory(GOOD, fail=True),
    )
    assert failed.mode == "tools_only" and failed.reason == "model_error:RuntimeError"
    assert failed.model_id == ha.DEFAULT_MODEL_ID and len(failed.tool_calls) == 4
    slow = ha.run_live_agent(
        fresh_demo_state(TODAY), TODAY, timeout_seconds=0.05,
        agent_factory=fake_factory(GOOD, hang=True),
    )
    assert slow.mode == "tools_only" and slow.reason == "model_timeout"


def test_daily_counter_is_conditional_and_fails_closed():
    s3 = ConditionalS3()
    store = S3HouseholdStore(bucket_name="bucket", workspace_id="a" * 32, s3_client=s3)
    day = "2026-09-13"
    assert store.increment_daily_counter("agent-review", 2, day=day) == (True, 1)
    assert store.increment_daily_counter("agent-review", 2, day=day) == (True, 2)
    assert store.increment_daily_counter("agent-review", 2, day=day) == (False, 2)
    key = ("bucket", "demo/workspaces/_usage/agent-review-2026-09-13.json")
    assert json.loads(s3.objects[key]["Body"])["count"] == 2
    puts = [c[1] for c in s3.calls if c[0] == "put"]
    assert all(("IfMatch" in put) or put.get("IfNoneMatch") == "*" for put in puts)
    s3.write_error = RuntimeError("down")
    assert store.increment_daily_counter("agent-review", 2, day="2026-09-14") == (None, 0)
    with pytest.raises(ValueError):
        store.increment_daily_counter("Bad Name!", 2)


def test_review_route_without_model_runs_tools_only_and_persists(session):
    code, data = call("/api/agent/review", {}, session)
    assert code == 200 and data["status"] == "simulated"
    briefing = data["briefing"]
    assert briefing["mode"] == "tools_only" and briefing["reason"] == "model_not_configured"
    assert briefing["narrative"] is None and len(briefing["tool_calls"]) == 4
    assert briefing["session_calls_used"] == 0 and briefing["real_recovered_cents"] == 0
    assert data["state"]["agent_briefings"][0]["id"] == briefing["id"]
    code, persisted = call("/api/state", token=session)
    assert persisted["agent_briefings"][0]["id"] == briefing["id"]
    assert persisted["audit_events"][-1]["action"] == "agent_review"
    assert call("/api/agent/review", {})[0] == 401
    assert call("/api/agent/review", {"extra": 1}, session)[0] == 400


def test_review_route_with_model_enforces_session_cap_and_records_usage(session, monkeypatch):
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    monkeypatch.setenv("HESTIA_AGENT_SESSION_CAP", "2")
    runs = []

    def fake_runner(state, today, **kwargs):
        runs.append(kwargs)
        return ha.run_live_agent(state, today, agent_factory=fake_factory(GOOD), **kwargs)

    monkeypatch.setattr(agent_app, "run_live_agent", fake_runner)
    first = call("/api/agent/review", {}, session)[1]["briefing"]
    assert first["mode"] == "live_model" and first["narrative"] == GOOD
    assert first["model_id"] == MODEL and first["session_calls_used"] == 1
    assert first["usage"] == {"input_tokens": 1200, "output_tokens": 210}
    assert runs[0]["max_tokens"] == ha.MAX_OUTPUT_TOKENS
    assert runs[0]["region_name"] == "eu-west-1"
    second = call("/api/agent/review", {}, session)[1]["briefing"]
    assert second["session_calls_used"] == 2
    third = call("/api/agent/review", {}, session)[1]["briefing"]
    assert third["mode"] == "tools_only" and third["reason"] == "session_cap"
    assert third["session_calls_used"] == 2 and len(runs) == 2
    state = call("/api/state", token=session)[1]
    assert len(state["agent_briefings"]) == 3 and state["agent_calls"] == 2


def test_review_route_daily_cap_and_unconfirmed_budget_fall_back(session, monkeypatch):
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    monkeypatch.setenv("HESTIA_AGENT_DAILY_CAP", "1")

    def runner(state, today, **kwargs):
        return ha.run_live_agent(state, today, agent_factory=fake_factory(GOOD))

    monkeypatch.setattr(agent_app, "run_live_agent", runner)
    assert call("/api/agent/review", {}, session)[1]["briefing"]["mode"] == "live_model"
    capped = call("/api/agent/review", {}, session)[1]["briefing"]
    assert capped["mode"] == "tools_only" and capped["reason"] == "daily_cap"
    monkeypatch.setattr(S3HouseholdStore, "increment_daily_counter", lambda *a, **k: (None, 0))
    unconfirmed = call("/api/agent/review", {}, session)[1]["briefing"]
    assert unconfirmed["reason"] == "budget_unconfirmed"


def test_reset_keeps_agent_usage_and_briefings(session):
    call("/api/agent/review", {}, session)
    code, data = call("/api/action/reset", {}, session)
    assert code == 200
    assert len(data["state"]["agent_briefings"]) == 1


def test_health_reports_model_configuration(monkeypatch):
    monkeypatch.delenv("HESTIA_LIVE_MODEL", raising=False)
    code, data = call("/healthz")
    assert data["live_model"] is False and data["model_id"] is None
    assert data["live_send"] is False and data["agent"]["session_cap"] == 3
    assert data["agent"]["framework"].startswith("strands-agents")
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    code, data = call("/healthz")
    assert data["live_model"] is True and data["model_id"] == MODEL
    assert data["live_send"] is False and data["mode"] == "simulated"


def test_guard_accepts_amounts_written_bare_or_in_cents_by_the_tools():
    tools = ha.tool_functions(fresh_demo_state(TODAY), TODAY)
    outputs = [tools["audit_subscriptions"](), tools["check_receipts_and_utilities"](),
               tools["review_repair_evidence"]("app-001")]
    text = ("What I checked\nCloud Backup Vault rose from €9.99 to €13.99; the trial renews at "
            "€19.99; the €85.50 outlay has no receipt; the €185.00 repair requires review.\n"
            "Decisions waiting for you\n- Review the exact notice draft in Hestia.\n"
            "Suggested next step\nOpen the case and review the draft.")
    assert ha.guard_narrative(text, outputs) == []
    assert ha.guard_narrative("A €1,399.00 fee requires review.", ["1399 minor units"]) == []
    assert ha.guard_narrative("A €14.00 fee requires review.", outputs)  # 14 only appears in dates
    assert ha.guard_narrative("A €777.77 fee requires review.", outputs)


def test_daily_counter_treats_access_denied_on_missing_key_as_absent_and_creates_atomically():
    s3 = ConditionalS3()
    s3.missing_without_list = True  # the deployed roles have no ListBucket authority
    store = S3HouseholdStore(bucket_name="bucket", workspace_id="b" * 32, s3_client=s3)
    assert store.increment_daily_counter("agent-review", 3, day="2026-09-13") == (True, 1)
    assert store.increment_daily_counter("agent-review", 3, day="2026-09-13") == (True, 2)
    first_put = next(c[1] for c in s3.calls if c[0] == "put")
    assert first_put["IfNoneMatch"] == "*"
    # A real permission failure on the create still fails closed.
    other = S3HouseholdStore(bucket_name="bucket", workspace_id="c" * 32, s3_client=s3)
    s3.write_error = RuntimeError("AccessDenied")
    assert other.increment_daily_counter("agent-review", 3, day="2026-09-14") == (None, 0)


def test_sample_trial_is_a_decision_on_the_day_a_copy_opens():
    output = ha.tool_functions(fresh_demo_state(TODAY), TODAY)["audit_subscriptions"]()
    assert "Fitness Stream Pro" in output and "expires in 3 days" in output
