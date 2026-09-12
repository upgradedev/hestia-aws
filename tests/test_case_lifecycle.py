"""HE11 domain behavior: outcomes require evidence, not transport success."""
from __future__ import annotations

import copy

import pytest

from hestia.domain import cases


@pytest.fixture
def household_case(monkeypatch):
    monkeypatch.setattr(cases, "utc_now", lambda: "2026-09-12T12:30:00+00:00")
    return {
        "id": "case-" + "b" * 32, "item_id": "app-fixture", "title": "Fixture appliance",
        "status": "authorized", "revision": 1, "deadline": None, "outcome": None,
        "facts": {"repair_amount_cents": 23100}, "timeline": [], "requests": {},
        "real_recovered_cents": 0, "approval": {"digest": "a" * 64},
    }


def update(action, **kwargs):
    return {
        "action": action, "source": "manual_update", "note": "Household fixture report",
        "evidence_reference": "FIXTURE-REPAIR-231", **kwargs,
    }


def apply(c, action, **kwargs):
    return cases.apply_update(c, update(action, **kwargs), "household_session:fixture")


def test_authorization_is_not_response_or_recovery(household_case):
    c = household_case
    projection = cases.project_case(c)
    assert projection["status"] == "authorized"
    assert projection["outcome"] is None and projection["real_recovered_cents"] == 0
    assert "Approval sent no email" in projection["next_action"]
    assert projection["deadline_status"] == "not_set"
    assert "requests" not in projection
    assert "requests" in c


def test_reply_information_partial_resolution_and_reopen(household_case):
    c = household_case
    apply(c, "start_tracking", deadline="2026-09-19")
    assert c["status"] == "pending_response"
    apply(c, "reply", source="synthetic_reply")
    assert c["status"] == "pending_response" and c["outcome"] is None
    apply(c, "request_information", source="synthetic_reply")
    assert c["status"] == "needs_information"
    apply(c, "add_evidence", evidence_reference="FIXTURE-INVOICE-2")
    assert c["status"] == "pending_response"
    apply(c, "partial_outcome", amount_cents=5400, attested=True)
    assert c["status"] == "pending_response" and c["outcome"]["amount_cents"] == 5400
    apply(c, "resolve", amount_cents=5400, attested=True)
    assert c["status"] == "resolved" and c["outcome"]["amount_cents"] == 5400
    resolved = copy.deepcopy(c["timeline"][-1])
    apply(c, "reopen", deadline="2026-09-24")
    assert c["status"] == "pending_response" and c["outcome"] is None
    assert c["timeline"][-2] == resolved
    assert c["real_recovered_cents"] == 0
    assert all(e["actor"] == "household_session:fixture" for e in c["timeline"])
    assert all(e["timestamp"] == "2026-09-12T12:30:00+00:00" for e in c["timeline"])
    assert "not a merchant response" in c["timeline"][1]["source_label"]
    assert c["timeline"][3]["evidence_reference"] == "FIXTURE-INVOICE-2"


def test_refusal_requires_explicit_reopen_without_erasing_evidence(household_case):
    c = household_case
    apply(c, "start_tracking", deadline="2026-09-19")
    apply(c, "reject", source="synthetic_reply", evidence_reference="FIXTURE-REFUSAL")
    rejected = copy.deepcopy(c["timeline"][-1])
    assert cases.project_case(c)["allowed_actions"] == ["reopen"]
    with pytest.raises(ValueError):
        apply(c, "resolve", amount_cents=23100, attested=True)
    apply(c, "reopen", deadline="2026-09-21")
    assert c["timeline"][-2] == rejected
    assert c["approval"]["digest"] == "a" * 64


def test_due_date_is_read_projection_then_explicit_silence_event(household_case):
    c = household_case
    apply(c, "start_tracking", deadline="2026-09-11")
    before = copy.deepcopy(c)
    projected = cases.project_case(c)
    assert c == before
    assert projected["deadline_status"] == "due"
    assert "Planning date reached" in projected["next_action"]
    assert "statutory" in projected["deadline_label"]
    apply(c, "record_silence")
    assert c["status"] == "pending_response" and c["outcome"] is None
    with pytest.raises(ValueError, match="already recorded"):
        apply(c, "record_silence")
    apply(c, "set_deadline", deadline="2026-09-22")
    assert cases.project_case(c)["deadline_status"] == "scheduled"
    with pytest.raises(ValueError, match="has not arrived"):
        apply(c, "record_silence")


@pytest.mark.parametrize("amount", [-1, True, 1.5, "5400", None, 23101])
def test_invalid_outcome_amount_cannot_change_case(household_case, amount):
    c = household_case
    c["status"] = "pending_response"
    before = copy.deepcopy(c)
    with pytest.raises(ValueError, match="amount"):
        apply(c, "resolve", amount_cents=amount, attested=True)
    assert c == before


@pytest.mark.parametrize("action,extras", [
    ("resolve", {"amount_cents": 1200}),
    ("resolve", {"amount_cents": 1200, "attested": "true"}),
    ("partial_outcome", {"amount_cents": 0, "attested": True}),
    ("partial_outcome", {"amount_cents": 23100, "attested": True}),
    ("reply", {"amount_cents": 5400}),
    ("reply", {"attested": True}),
    ("reply", {"deadline": "2026-09-15"}),
    ("set_deadline", {}),
    ("add_evidence", {"source": "synthetic_reply"}),
    ("reply", {"source": "verified_merchant"}),
    ("send_success", {}),
])
def test_unsupported_or_unattested_updates_leave_case_unchanged(household_case, action, extras):
    c = household_case
    c["status"] = "pending_response"
    before = copy.deepcopy(c)
    with pytest.raises(ValueError):
        apply(c, action, **extras)
    assert c == before


@pytest.mark.parametrize("status", ["draft", "review", "authorized", "resolved", "rejected"])
@pytest.mark.parametrize("action", [
    "reply", "request_information", "add_evidence", "reject", "resolve",
])
def test_no_case_can_skip_approval_tracking_or_reopen(household_case, status, action):
    c = household_case
    c["status"] = status
    before = copy.deepcopy(c)
    with pytest.raises(ValueError):
        apply(c, action, amount_cents=23100, attested=True)
    assert c == before


def test_non_monetary_resolution_is_labeled_and_closed(household_case):
    c = household_case
    apply(c, "start_tracking", deadline="2026-09-20")
    apply(c, "resolve", amount_cents=0, attested=True, note="Synthetic repair completed")
    assert c["outcome"]["amount_cents"] == 0 and c["status"] == "resolved"
    assert cases.project_case(c)["deadline_status"] == "closed"
    assert "synthetic" in c["outcome"]["label"]
