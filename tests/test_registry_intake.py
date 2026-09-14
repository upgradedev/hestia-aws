"""Household registry: appliance and repair intake kinds, and model text extraction for review."""
from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest

from hestia.adapters.storage import S3HouseholdStore, fresh_demo_state
from hestia.agents import household_agent as ha
from hestia.app import agent as agent_app
from hestia.app import api
from hestia.app.api import handle_api
from hestia.domain.intake import plan_records

APPLIANCE = {
    "kind": "appliance", "appliance_id": "my-fridge", "item_name": "Fridge freezer",
    "brand": "Liebherr", "model_number": "CNsdd 5223", "purchase_date": "2025-11-02",
    "seller_name": "Local store", "seller_email": "service@localstore.example",
    "receipt_reference": "paper receipt 2025-11-02", "purchase_price_cents": 89900,
    "manual_url": "https://example.com/manual.pdf",
}
REPAIR = {"kind": "repair", "appliance_id": "my-fridge", "repair_date": "2026-09-10",
          "repair_amount_cents": 12000, "repair_issue": "Compressor stopped"}


def call(path, body=None, token=None, method=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    event = {"rawPath": path, "headers": headers,
             "requestContext": {"http": {"method": method or ("POST" if body is not None
                                                              else "GET")}}}
    if body is not None:
        event["body"] = json.dumps(body)
    response = handle_api(event)
    return response["statusCode"], json.loads(response["body"])


@pytest.fixture
def session(monkeypatch):
    monkeypatch.setenv("HESTIA_DEMO_SECRET", "x" * 40)
    monkeypatch.delenv("HESTIA_LIVE_MODEL", raising=False)
    monkeypatch.setattr(api, "store_for",
                        lambda scope: S3HouseholdStore(bucket_name="", workspace_id=scope))
    S3HouseholdStore._states.clear()
    S3HouseholdStore._counters.clear()
    code, data = call("/api/demo/session", {})
    assert code == 201
    return data["token"]


def test_appliance_plan_creates_a_registry_record_with_links_and_no_repair():
    state = fresh_demo_state()
    [change] = plan_records(state, [APPLIANCE])
    assert change["status"] == "ready" and change["collection"] == "appliances"
    after = change["after"]
    assert after["id"] == "my-fridge" and after["brand"] == "Liebherr"
    assert after["manual_url"] == "https://example.com/manual.pdf" and after["product_url"] == ""
    assert after["has_repair_claim"] is False and after["claim_status"] == "none"
    assert after["statutory_months"] == 24 and after["commercial_months"] == 0
    assert change["before"] is None


@pytest.mark.parametrize("bad, message", [
    ({**APPLIANCE, "seller_email": "not-an-email"}, "valid email"),
    ({**APPLIANCE, "manual_url": "ftp://x"}, "http(s) link"),
    ({**APPLIANCE, "purchase_date": "02/11/2025"}, "YYYY-MM-DD"),
    ({k: v for k, v in APPLIANCE.items() if k != "receipt_reference"}, "incomplete"),
    ({**APPLIANCE, "statutory_months": 500}, "0 to 120"),
])
def test_appliance_plan_rejects_bad_facts(bad, message):
    [change] = plan_records(fresh_demo_state(), [bad])
    assert change["status"] == "error" and message in change["message"]


def test_repair_plan_requires_the_appliance_and_no_open_case():
    state = fresh_demo_state()
    [missing] = plan_records(state, [REPAIR])
    assert missing["status"] == "error" and "add the appliance first" in missing["message"]
    [added] = plan_records(state, [APPLIANCE])
    from hestia.domain.intake import apply_changes
    apply_changes(state, [added])
    [change] = plan_records(state, [REPAIR])
    assert change["status"] == "ready"
    assert change["after"]["has_repair_claim"] is True and change["after"]["claim_status"] == "open"
    assert change["after"]["repair_amount_cents"] == 12000
    assert change["before"]["has_repair_claim"] is False
    [early] = plan_records(state, [{**REPAIR, "repair_date": "2020-01-01"}])
    assert early["status"] == "error" and "before the recorded purchase" in early["message"]
    state["cases"].append({"item_id": "my-fridge", "status": "authorized"})
    [blocked] = plan_records(state, [REPAIR])
    assert blocked["status"] == "error" and "open case" in blocked["message"]


def test_registry_route_adds_appliance_then_repair_and_the_notice_uses_it(session):
    def run(op, **extra):
        code, data = call("/api/ingest/sync", {"operation": op, **extra}, session)
        assert code == 200, data
        return data["intake"]
    staged = run("stage", records=[APPLIANCE])
    reviewed = run("review", intake_id=staged["id"], records=[APPLIANCE])
    assert reviewed["review"]["changes"][0]["status"] == "ready"
    run("commit", intake_id=staged["id"], digest=reviewed["review"]["digest"], confirmed=True)
    code, state = call("/api/state", token=session)
    fridge = next(a for a in state["appliances"] if a["id"] == "my-fridge")
    assert fridge["manual_url"].startswith("https://") and fridge["has_repair_claim"] is False
    staged = run("stage", records=[REPAIR])
    reviewed = run("review", intake_id=staged["id"], records=[REPAIR])
    run("commit", intake_id=staged["id"], digest=reviewed["review"]["digest"], confirmed=True)
    code, prepared = call("/api/action/claim/prepare", {"item_id": "my-fridge"}, session)
    assert code == 200, prepared
    assert prepared["draft"]["amount_cents"] == 12000
    assert "Compressor stopped" in prepared["draft"]["notice"]
    assert "service@localstore.example" in prepared["draft"]["notice"]
    # A second repair on an appliance whose case is now open is refused at review time.
    second = {**REPAIR, "repair_amount_cents": 13000}
    code, again = call("/api/ingest/sync", {"operation": "stage", "records": [second]}, session)
    assert code == 200, again
    code, plan = call("/api/ingest/sync", {"operation": "review", "records": [second],
                                          "intake_id": again["intake"]["id"]}, session)
    assert code == 200, plan
    assert plan["intake"]["review"]["changes"][0]["status"] == "error"
    assert "open case" in plan["intake"]["review"]["changes"][0]["message"]


def test_reset_keeps_registry_appliances(session):
    def run(op, **extra):
        return call("/api/ingest/sync", {"operation": op, **extra}, session)[1]["intake"]
    staged = run("stage", records=[APPLIANCE])
    reviewed = run("review", intake_id=staged["id"], records=[APPLIANCE])
    run("commit", intake_id=staged["id"], digest=reviewed["review"]["digest"], confirmed=True)
    edited = {**APPLIANCE, "appliance_id": "app-002", "item_name": "Renamed TV"}
    staged = run("stage", records=[edited])
    reviewed = run("review", intake_id=staged["id"], records=[edited])
    run("commit", intake_id=staged["id"], digest=reviewed["review"]["digest"], confirmed=True)
    code, data = call("/api/action/reset", {}, session)
    assert code == 200
    kept = {a["id"]: a for a in data["state"]["appliances"]}
    assert kept["my-fridge"]["manual_url"] == "https://example.com/manual.pdf"
    assert kept["app-002"]["item_name"] == "Sony Bravia 55 OLED TV"  # sample facts restored
    assert len(kept) == 4


def test_normalise_extracted_keeps_only_known_kinds_and_keys():
    payload = {"records": [
        {"kind": "appliance", "appliance_id": "tv", "item_name": "TV",
         "purchase_price_cents": 49900.0, "seller_email": "shop@example.com", "made_up": "x",
         "purchase_date": None},
        {"kind": "transaction", "transaction_id": "t1", "merchant": "Shop", "amount_cents": 500,
         "date": "2026-09-01", "category": "Home"},
        {"kind": "subscription", "subscription_id": "s1", "service_name": "Plan",
         "category": "Media", "monthly_cents": 999, "last_billed": "2026-09-01"},
        {"kind": "mystery"}, "junk",
    ]}
    rows = ha.normalise_extracted(payload)
    assert rows[0] == {"kind": "appliance", "appliance_id": "tv", "item_name": "TV",
                       "purchase_price_cents": 49900, "seller_email": "shop@example.com"}
    assert rows[1]["merchant"] == "Shop" and rows[2]["is_trial"] is False and len(rows) == 3
    assert ha.normalise_extracted({"records": "no"}) == []
    assert ha.parse_extraction_text('Sure:\n```json\n{"records": []}\n```') == {"records": []}
    with pytest.raises(ValueError):
        ha.parse_extraction_text("no json here")


class FakeExtractor:
    def __init__(self, reply, fail=False):
        self.reply, self.fail = reply, fail

    def __call__(self, prompt):
        assert "Document type hint" in prompt
        if self.fail:
            raise RuntimeError("ThrottlingException")
        return SimpleNamespace(message={"role": "assistant", "content": [{"text": self.reply}]},
                               stop_reason="end_turn",
                               metrics=SimpleNamespace(accumulated_usage={"inputTokens": 800,
                                                                          "outputTokens": 120}))


REPLY = json.dumps({"records": [{**{k: v for k, v in APPLIANCE.items() if k != "manual_url"}}]})


def fake_runner(reply, fail=False):
    def runner(text, hint, **_kwargs):
        return ha.run_text_extraction(text, hint, agent_factory=lambda: FakeExtractor(reply, fail))
    return runner


def test_text_extraction_runner_returns_records_or_unavailable():
    good = ha.run_text_extraction("Order 123 Liebherr fridge", "order",
                                  agent_factory=lambda: FakeExtractor(REPLY))
    assert good.mode == "live_model" and good.records[0]["appliance_id"] == "my-fridge"
    assert good.usage == {"input_tokens": 800, "output_tokens": 120}
    bad = ha.run_text_extraction("x", "auto", agent_factory=lambda: FakeExtractor("nope"))
    assert bad.mode == "unavailable" and bad.reason == "unparseable_reply"
    failed = ha.run_text_extraction("x", "auto",
                                    agent_factory=lambda: FakeExtractor(REPLY, fail=True))
    assert failed.mode == "unavailable" and failed.reason == "model_error:RuntimeError"


def test_extract_route_without_model_fails_closed_with_a_visible_reason(session):
    code, data = call("/api/agent/extract", {"text": "Order 123"}, session)
    assert code == 503 and "not configured" in data["message"]
    assert call("/api/agent/extract", {"text": ""}, session)[0] == 400
    assert call("/api/agent/extract", {"text": "x", "hint": "weird"}, session)[0] == 400
    assert call("/api/agent/extract", {"text": "x"})[0] == 401


def test_extract_route_stages_a_reviewable_draft_and_enforces_caps(session, monkeypatch):
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    monkeypatch.setenv("HESTIA_AGENT_EXTRACT_SESSION_CAP", "1")
    monkeypatch.setattr(agent_app, "run_text_extraction", fake_runner(REPLY))
    order = {"text": "Order 123 Liebherr fridge", "hint": "order"}
    code, data = call("/api/agent/extract", order, session)
    assert code == 200, data
    draft = data["intake"]
    assert draft["source"] == "model_text_extraction" and draft["ocr_status"] == "model_text"
    assert draft["records"][0]["appliance_id"] == "my-fridge" and draft["confidence_score"] is None
    assert data["state"]["agent_extracts"] == 1
    # The same text replays the same draft without a second model call or cap charge.
    code, again = call("/api/agent/extract", order, session)
    assert again["replayed"] is True and again["intake"]["id"] == draft["id"]
    # Review and commit through the existing intake contract, then the appliance exists.
    code, reviewed = call("/api/ingest/sync", {"operation": "review", "intake_id": draft["id"],
                                              "records": draft["records"]}, session)
    assert reviewed["intake"]["review"]["changes"][0]["status"] == "ready"
    code, done = call("/api/ingest/sync", {"operation": "commit", "intake_id": draft["id"],
                                          "digest": reviewed["intake"]["review"]["digest"],
                                          "confirmed": True}, session)
    assert any(a["id"] == "my-fridge" for a in done["state"]["appliances"])
    code, capped = call("/api/agent/extract", {"text": "Another receipt"}, session)
    assert code == 429


def test_extract_route_reports_model_failure_without_saving_records(session, monkeypatch):
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    monkeypatch.setattr(agent_app, "run_text_extraction", fake_runner(REPLY, fail=True))
    code, data = call("/api/agent/extract", {"text": "Order 123"}, session)
    assert code == 502 and "No intake draft was created" in data["message"]
    assert "audit record and the text hash were retained" in data["message"]
    assert "not counted" in data["message"]
    code, state = call("/api/state", token=session)
    # The client-side failure never reached the model: the reading is handed back.
    assert state["intakes"] == {} and state["agent_extracts"] == 0
    payload = state["audit_events"][-1]["payload"]
    assert payload["reading_counted"] is False
    assert payload["input_sha256"] == hashlib.sha256(b"Order 123").hexdigest()
    assert "Order 123" not in json.dumps(payload)


def test_extract_route_keeps_the_charge_when_the_model_timed_out(session, monkeypatch):
    monkeypatch.setenv("HESTIA_LIVE_MODEL", "bedrock")
    monkeypatch.setattr(agent_app, "run_text_extraction",
                        lambda text, hint, **_k: ha.ExtractionOutcome(
                            "unavailable", "model-x", "strands-agents", reason="model_timeout",
                            duration_ms=20000))
    code, data = call("/api/agent/extract", {"text": "Order 123"}, session)
    assert code == 502 and "not counted" not in data["message"]
    code, state = call("/api/state", token=session)
    assert state["intakes"] == {} and state["agent_extracts"] == 1
    assert state["audit_events"][-1]["payload"]["reading_counted"] is True


def test_text_extraction_runner_times_out_a_slow_model():
    import time as clock

    class SlowAgent:
        def __call__(self, prompt):
            clock.sleep(0.3)
            return None

    slow = ha.run_text_extraction("x", "auto", timeout_seconds=0.05, agent_factory=SlowAgent)
    assert slow.mode == "unavailable" and slow.reason == "model_timeout"


def test_health_reports_extract_cap(monkeypatch):
    monkeypatch.delenv("HESTIA_LIVE_MODEL", raising=False)
    code, data = call("/healthz")
    assert data["agent"]["extract_session_cap"] == 3
