"""Protected lifecycle with the real API handler and conditional persistence boundary."""
from __future__ import annotations

import copy
import json
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

from hestia.app.web import read_lambda_handler
from tests import test_web
from tests.fakes import service_error
from tests.test_web import approval, call, prepared, scoped_store, session

sandbox = test_web.sandbox


def state(token):
    code, result = call("/api/state", token=token, method="GET")
    assert code == 200, result
    return result


def authorized(token):
    draft = prepared(token)
    code, result = call("/api/action/claim", approval(draft), token)
    assert code == 200, result
    return result["state"]["cases"][0]


def payload(case, action="start_tracking", **kwargs):
    return {
        "case_id": case["id"], "expected_revision": case["revision"],
        "request_id": uuid.uuid4().hex, "action": action, "source": "manual_update",
        "note": "Synthetic household test report", "evidence_reference": "FIXTURE-CASE-EVIDENCE",
        **({"deadline": "2026-10-01"} if action == "start_tracking" else {}), **kwargs,
    }


def save(token, case, action="start_tracking", **kwargs):
    code, result = call("/api/case/update", payload(case, action, **kwargs), token)
    assert code == 200, result
    assert result["case"] == result["state"]["cases"][0]
    return result["case"]


def test_prepare_approval_replay_and_reset_keep_one_durable_case(sandbox):
    token = session()
    draft = prepared(token)
    reviewed = state(token)["cases"][0]
    assert reviewed["status"] == "review"
    assert [e["status"] for e in reviewed["timeline"]] == ["draft", "review"]
    assert reviewed["facts"]["receipt_reference"] == "REC-2024-BOSCH-88"
    code, result = call("/api/action/claim", approval(draft), token)
    assert code == 200
    case = result["state"]["cases"][0]
    assert case["status"] == "authorized" and case["outcome"] is None
    assert case["notice"]["notice"] == draft["notice"]
    assert case["approval"]["digest"] == draft["digest"]
    assert case["approval"]["record_id"] == result["dispatch_record"]["id"]
    replay = call("/api/action/claim", approval(draft), token)[1]
    assert replay["state"] == result["state"]
    # Additional drafts are review copies; they cannot silently replace authorization.
    newer = prepared(token)
    assert newer["id"] != draft["id"]
    assert state(token)["cases"][0]["notice"] == case["notice"]
    assert call("/api/action/claim", approval(newer), token)[0] == 409
    before_reset = state(token)
    assert call("/api/action/reset", {}, token)[0] == 200
    assert state(token)["cases"] == before_reset["cases"]
    assert state(token)["dispatch_records"] == before_reset["dispatch_records"]
    raw = scoped_store(token).load_state(create=False)
    assert "requests" in raw["cases"][0]
    assert "requests" not in state(token)["cases"][0]
    assert "approval_token" not in json.dumps(raw["cases"])


def test_full_functional_lifecycle_persists_provenance_and_never_claims_real_money(sandbox):
    token = session()
    c = save(token, authorized(token))
    c = save(token, c, "reply", source="synthetic_reply",
             note="Fixture merchant acknowledges review")
    assert c["status"] == "pending_response"
    c = save(token, c, "request_information", source="synthetic_reply")
    assert c["status"] == "needs_information"
    c = save(token, c, "add_evidence", evidence_reference="FIXTURE-REPAIR-INVOICE")
    c = save(token, c, "partial_outcome", amount_cents=4900, attested=True)
    c = save(token, c, "resolve", amount_cents=4900, attested=True)
    assert c["status"] == "resolved" and c["outcome"]["amount_cents"] == 4900
    assert state(token)["cases"][0] == c
    assert all(e["evidence_reference"] and e["actor"] and e["timestamp"] for e in c["timeline"])
    assert c["timeline"][4]["source"] == "synthetic_reply"
    assert c["timeline"][-1]["source"] == "manual_update"
    assert c["real_recovered_cents"] == 0
    assert state(token)["summary"]["unclaimed_recovery_cents"] == 18500
    assert state(token)["dispatch_records"][0]["delivery_status"] == "SIMULATED"
    previous = copy.deepcopy(c["timeline"])
    c = save(token, c, "reopen", deadline="2026-10-05")
    assert c["timeline"][:-1] == previous and c["status"] == "pending_response"


def test_identical_retry_is_idempotent_changed_content_conflicts_and_stale_write_fails(sandbox):
    token = session()
    c = authorized(token)
    request = payload(c)
    code, result = call("/api/case/update", request, token)
    assert code == 200 and result["replayed"] is False
    replay = call("/api/case/update", request, token)[1]
    assert replay["replayed"] is True and replay["event_id"] == result["event_id"]
    assert replay["state"] == result["state"]
    assert call("/api/case/update", {**request, "note": "Altered content"}, token)[0] == 409
    assert call("/api/case/update", {**request, "request_id": uuid.uuid4().hex}, token)[0] == 409
    assert state(token) == result["state"]


def test_uncertain_storage_commit_can_only_be_reconciled_or_replayed_once(sandbox):
    token = session()
    request = payload(authorized(token))
    sandbox.lose_response = True
    assert call("/api/case/update", request, token)[0] == 503
    recovered = state(token)
    assert recovered["cases"][0]["status"] == "pending_response"
    code, replay = call("/api/case/update", request, token)
    assert code == 200 and replay["replayed"] is True
    assert replay["state"] == recovered
    assert [e["action"] for e in recovered["cases"][0]["timeline"]].count("start_tracking") == 1


def test_failed_storage_does_not_advance_lifecycle(sandbox):
    token = session()
    c = authorized(token)
    before = state(token)
    sandbox.write_error = service_error("AccessDenied")
    assert call("/api/case/update", payload(c), token)[0] == 503
    assert state(token) == before


def test_concurrent_distinct_updates_have_one_winner_and_atomic_audit(sandbox):
    token = session()
    c = authorized(token)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: call("/api/case/update", payload(c), token), range(3)))
    assert [code for code, _ in results].count(200) == 1
    assert [code for code, _ in results].count(409) == 2
    final = state(token)
    assert final["cases"][0]["revision"] == c["revision"] + 1
    assert sum(e["action"] == "case_update" for e in final["audit_events"]) == 1


def test_reader_anonymous_tamper_and_cross_session_cannot_write_case(sandbox):
    token, other = session(), session()
    request = payload(authorized(token))
    before = state(token)
    assert call("/api/case/update", request)[0] == 401
    forged = token[:-1] + ("0" if token[-1] != "0" else "1")
    assert call("/api/case/update", request, forged)[0] == 401
    assert call("/api/case/update", request, other)[0] == 404
    response = read_lambda_handler({"rawPath": "/api/case/update", "httpMethod": "POST",
                                    "headers": {"Authorization": "Bearer " + token},
                                    "body": json.dumps(request)}, None)
    assert response["statusCode"] == 405
    assert state(token) == before and state(other)["cases"] == []


@pytest.mark.parametrize("patch", [
    {"actor": "merchant"}, {"timestamp": "2026-09-12"}, {"mode": "live"},
    {"workspace_id": "f" * 32}, {"evidence_reference": ""}, {"note": "\nInjected"},
    {"note": "x" * 2001}, {"request_id": "malformed"}, {"case_id": "../state"},
    {"expected_revision": True}, {"expected_revision": 0}, {"deadline": "2026-02-30"},
    {"deadline": "20260919"},
])
def test_invalid_or_forged_provenance_never_persists(sandbox, patch):
    token = session()
    request = payload(authorized(token))
    before = state(token)
    assert call("/api/case/update", {**request, **patch}, token)[0] == 400
    assert state(token) == before


def test_outcome_cannot_skip_attestation_or_include_delivery_claim(sandbox):
    token = session()
    c = save(token, authorized(token))
    before = state(token)
    assert call("/api/case/update", payload(c, "resolve", amount_cents=18500), token)[0] == 422
    assert call("/api/case/update", payload(c, "resolve", amount_cents=18500,
                                          attested=True, delivered=True), token)[0] == 400
    assert state(token) == before


def test_existing_workspace_without_cases_is_not_migrated_by_read(sandbox):
    token = session()
    store = scoped_store(token)
    raw = store.load_state(create=False)
    raw.pop("cases")
    store.save_state(raw)
    before_calls = len(sandbox.calls)
    assert state(token)["cases"] == []
    assert all(operation == "get" for operation, _ in sandbox.calls[before_calls:])
    assert "cases" not in scoped_store(token).load_state(create=False)
    assert authorized(token)["status"] == "authorized"


def test_store_reset_retains_cases_and_quota_remains_enforced(sandbox):
    token = session()
    c = authorized(token)
    store = scoped_store(token)
    store.reset_state()
    assert state(token)["cases"][0] == c
    raw = store.load_state(create=False)
    raw["action_count"] = 40
    store.save_state(raw)
    before = state(token)
    assert call("/api/case/update", payload(c), token)[0] == 429
    assert state(token) == before


def test_case_route_is_writer_only_and_retains_explicit_denials():
    from infra.hestia_api_stack import template
    resources = template()["Resources"]
    routes = [r["Properties"] for r in resources.values()
              if r["Type"] == "AWS::ApiGatewayV2::Route"]
    case_route = next(r for r in routes if r["RouteKey"] == "POST /api/case/update")
    assert case_route["Target"] == {"Fn::Sub": "integrations/${Integration}"}
    assert next(r for r in routes if r["RouteKey"] == "$default")["Target"] == {
        "Fn::Sub": "integrations/${ReaderIntegration}",
    }
    for name in ["Role", "ReaderRole"]:
        statements = resources[name]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
        denied = [s for s in statements if s["Effect"] == "Deny"]
        assert any("ses:*" in s["Action"] for s in denied)
    reader = resources["ReaderRole"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
    assert any(s["Effect"] == "Deny" and "s3:PutObject" in s["Action"] for s in reader)
    assert any(s["Effect"] == "Deny" and "bedrock:*" in s["Action"] for s in reader)
    writer = resources["Role"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
    # Owner-approved bounded model access (2026-09-13): the writer may invoke one profile.
    assert not any(s["Effect"] == "Deny" and "bedrock:*" in s["Action"] for s in writer)
    assert any(s["Effect"] == "Allow" and s["Action"] == [
        "bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"] for s in writer)
