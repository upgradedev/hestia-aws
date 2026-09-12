"""HE1-HE4 API contract: real failures, exact approval, bounded isolated demo."""
from __future__ import annotations

import base64
import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from hestia.adapters.storage import S3HouseholdStore
from hestia.app import api
from hestia.app.access import authorize_demo
from hestia.app.web import build_audit, lambda_handler, read_lambda_handler, render_html
from tests.fakes import ConditionalS3, service_error


def call(route, body=None, token=None, method="POST", **overrides):
    event = {
        "rawPath": route, "requestContext": {"http": {"method": method}},
        "headers": {"Content-Type": "application/json"},
    }
    if body is not None:
        event["body"] = json.dumps(body)
    if token is not None:
        event["headers"]["Authorization"] = "Bearer " + token
    if "raw_body" in overrides:
        event["body"] = overrides.pop("raw_body")
    event.update(overrides)
    response = lambda_handler(event, None)
    return response["statusCode"], json.loads(response["body"])


@pytest.fixture
def sandbox(monkeypatch):
    s3 = ConditionalS3()
    monkeypatch.setenv("HESTIA_DEMO_SECRET", "synthetic-ci-key-only-not-a-deployed-secret")
    monkeypatch.setattr(api, "store_for", lambda scope: S3HouseholdStore(
        bucket_name="synthetic-test-bucket", workspace_id=scope, s3_client=s3,
    ))
    return s3


def session():
    code, data = call("/api/demo/session", {})
    assert code == 201, data
    return data["token"]


def prepared(token):
    code, data = call("/api/action/claim/prepare", {"item_id": "app-001"}, token)
    assert code == 200, data
    return data["draft"]


def approval(draft):
    return {"draft_id": draft["id"], "digest": draft["digest"],
            "approval_token": draft["approval_token"]}


def scoped_store(token):
    return api.store_for(authorize_demo({"authorization": "Bearer " + token}).workspace_id)


def test_readonly_root_health_preview_make_no_cloud_calls():
    response = lambda_handler({"rawPath": "/", "httpMethod": "GET"}, None)
    assert response["statusCode"] == 200
    assert "HESTIA AWS" in response["body"]
    code, data = call("/healthz", method="GET")
    assert code == 200
    assert data["live_send"] is False and data["live_model"] is False
    code, state = call("/api/state", method="GET")
    assert code == 200 and state["read_only_preview"] is True
    assert state["dispatch_records"] == []
    assert "drafts" not in state


def test_reader_function_rejects_writes_even_with_a_valid_capability(sandbox):
    token = session()
    event = {"path": "/api/demo/session", "httpMethod": "POST",
             "headers": {"Authorization": "Bearer " + token}, "body": "{}"}
    assert read_lambda_handler(event, None)["statusCode"] == 405
    event.update(path="/api/state", httpMethod="GET")
    assert read_lambda_handler(event, None)["statusCode"] == 200


def test_build_and_static_preview_remain_available(monkeypatch):
    digest, data = build_audit("family_flat")
    assert digest.total_reimbursable_cents == 18500
    assert len(data["warranties"]) == 2
    assert "Bosch Series 6" in render_html()
    import hestia.app.web as web
    scenario = dict(web.SCENARIOS["family_flat"])
    scenario["repairs"] = []
    monkeypatch.setitem(web.SCENARIOS, "no-repair", scenario)
    assert "HESTIA AWS" in render_html("no-repair")


@pytest.mark.parametrize("path", [
    "/api/action/claim", "/action/claim", "/api/action/claim/prepare",
    "/api/action/cancel", "/action/cancel_trial", "/api/action/utility_dispute",
    "/action/utility_dispute", "/api/action/reset", "/action/reset",
    "/api/action/receipt", "/api/receipt/scan", "/receipt/scan", "/api/ingest/sync",
    "/ingest/sync", "/api/outbox/dispatch", "/outbox/dispatch", "/outbox/status",
])
def test_anonymous_mutations_and_aliases_denied(path):
    code, result = call(path, {"item_id": "app-001"})
    assert code == 401
    assert result["status"] == "error"


def test_missing_signing_key_or_storage_no_implicit_fallback(monkeypatch):
    assert call("/api/demo/session", {})[0] == 503
    monkeypatch.setenv("HESTIA_DEMO_SECRET", "synthetic-ci-key-only-not-a-deployed-secret")
    assert call("/api/demo/session", {})[0] == 503


def test_session_isolation_and_exact_preview_approval_reload(sandbox):
    first, second = session(), session()
    draft = prepared(first)
    request = approval(draft)
    assert "Elena Georgiou" in draft["notice"]
    assert draft["seller_email"] in draft["notice"]
    assert "185.00" in draft["notice"] and draft["amount_cents"] == 18500
    assert call("/api/action/claim", request, second)[0] == 404
    code, result = call("/api/action/claim", request, first)
    assert code == 200 and result["status"] == "simulated"
    record = result["dispatch_record"]
    assert record["full_letter"] == draft["notice"]
    assert record["seller_email"] == draft["seller_email"]
    assert record["cryptographic_seal"] == draft["digest"]
    assert record["delivery_status"] == "SIMULATED" and record["ses_message_id"] is None
    assert result["state"]["summary"]["unclaimed_recovery_cents"] == 18500
    assert result["state"]["appliances"][0]["claim_status"] == "open"
    assert "drafts" not in result["state"]
    code, reloaded = call("/api/state", token=first, method="GET")
    assert code == 200 and reloaded["dispatch_records"] == [record]
    assert call("/api/state", token=second, method="GET")[1]["dispatch_records"] == []
    code, repeated = call("/api/action/claim", request, first)
    assert code == 200 and repeated["replayed"] is True
    assert repeated["dispatch_record"] == record
    assert len(repeated["state"]["dispatch_records"]) == 1
    outbox = call("/api/outbox/status", token=first, method="GET")[1]["outbox"]
    assert outbox["delivered_count"] == 0


@pytest.mark.parametrize("changes", [
    {"digest": "f" * 64}, {"approval_token": "e" * 64},
    {"seller_email": "other@example.com"}, {"amount_cents": 1},
    {"notice": "unapproved"}, {"item_id": "app-002"},
    {"draft_id": "../outbox/admin"},
])
def test_tampered_approval_rejected_without_record(sandbox, changes):
    token = session()
    request = {**approval(prepared(token)), **changes}
    code, _ = call("/api/action/claim", request, token)
    assert code in (400, 403, 404)
    assert call("/api/state", token=token, method="GET")[1]["dispatch_records"] == []


def test_unknown_zero_and_invalid_item_never_fall_back(sandbox):
    token = session()
    assert call("/api/action/claim/prepare", {"item_id": "app-unknown"}, token)[0] == 404
    assert call("/api/action/claim/prepare", {"item_id": "app-002"}, token)[0] == 422
    assert call("/api/action/claim", {"item_id": "app-001"}, token)[0] == 400


@pytest.mark.parametrize("field,value", [
    ("seller_email", "other@example.com"), ("repair_amount_cents", 9900),
    ("receipt_reference", "REPLACED"), ("repair_issue", "Changed"),
])
def test_changed_evidence_invalidates_draft(sandbox, field, value):
    token = session()
    draft = prepared(token)
    store = scoped_store(token)
    state = store.load_state(create=False)
    state["appliances"][0][field] = value
    store.save_state(state)
    assert call("/api/action/claim", approval(draft), token)[0] == 409


def test_expired_draft_and_expired_or_forged_session(sandbox, monkeypatch):
    import hestia.app.access as access
    import hestia.app.claims as claims
    token = session()
    draft = prepared(token)
    with monkeypatch.context() as clock:
        clock.setattr(claims.time, "time", lambda: draft["expires_at"])
        assert call("/api/action/claim", approval(draft), token)[0] == 409
    expiry = int(token.split(".")[2])
    monkeypatch.setattr(access.time, "time", lambda: expiry)
    assert call("/api/state", token=token, method="GET")[0] == 401
    for invalid in ("random", token[:-1] + ("0" if token[-1] != "0" else "1")):
        assert call("/api/state", token=invalid, method="GET")[0] == 401


def test_parallel_approval_and_lost_commit_response_do_not_duplicate(sandbox):
    token = session()
    request = approval(prepared(token))
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: call("/api/action/claim", request, token), range(4)))
    assert all(code in (200, 409) for code, _ in results)
    assert sum(code == 200 for code, _ in results) >= 1
    assert len(call("/api/state", token=token, method="GET")[1]["dispatch_records"]) == 1
    token = session()
    request = approval(prepared(token))
    sandbox.lose_response = True
    assert call("/api/action/claim", request, token)[0] == 503
    code, result = call("/api/action/claim", request, token)
    assert code == 200 and result["replayed"] is True
    assert len(result["state"]["dispatch_records"]) == 1


def test_failed_persistence_and_access_denied_not_success(sandbox):
    token = session()
    request = approval(prepared(token))
    sandbox.write_error = service_error("AccessDenied")
    code, result = call("/api/action/claim", request, token)
    assert code == 503 and result["status"] == "error"
    assert scoped_store(token).load_state()["dispatch_records"] == []
    sandbox.read_error = service_error("AccessDenied")
    assert call("/api/state", token=token, method="GET")[0] == 503


@pytest.mark.parametrize("raw", ["{bad", "[]", "null", "true", '{"item_id":NaN}',
                                    '{"item_id":"app-001","item_id":"app-002"}'])
def test_malformed_json_never_mutates(sandbox, raw):
    token = session()
    assert call("/api/action/claim/prepare", token=token, raw_body=raw)[0] == 400
    code, _ = call("/api/action/claim/prepare", token=token,
                   **{"body": None})  # Missing item is not a default appliance.
    assert code == 400


def test_gateway_encodings_headers_aliases_and_limits(sandbox):
    token = session()
    event = {
        "path": "/api/action/claim/prepare", "httpMethod": "POST",
        "headers": {"AUTHORIZATION": "Bearer " + token, "CONTENT-TYPE": "application/json"},
        "isBase64Encoded": True,
        "body": base64.b64encode(b'{"item_id":"app-001"}').decode(),
    }
    assert lambda_handler(event, None)["statusCode"] == 200
    event["body"] = "@@"
    assert lambda_handler(event, None)["statusCode"] == 400
    event.pop("isBase64Encoded")
    event["body"] = '{"item_id":"app-001"}'
    event["headers"]["Authorization"] = "Bearer " + token
    assert lambda_handler(event, None)["statusCode"] == 400
    del event["headers"]["Authorization"]
    event["headers"]["CONTENT-TYPE"] = "application/x-www-form-urlencoded"
    assert lambda_handler(event, None)["statusCode"] == 415
    event["headers"]["CONTENT-TYPE"] = "application/json"
    event["body"] = "x" * 70000
    assert lambda_handler(event, None)["statusCode"] == 413
    assert call("/api/action/%63laim", {}, token)[0] == 404
    assert call("/api/action/claim", {}, token, path="/action/reset")[0] == 400
    assert call("/api/action/claim", {}, token, httpMethod="GET")[0] == 400


def test_raw_dispatch_and_paid_integrations_cannot_be_activated(sandbox):
    token = session()
    for path in ("/api/outbox/dispatch", "/outbox/dispatch"):
        assert call(path, {"to_addr": "victim@example.com"}, token)[0] == 403
    for path in ("/api/receipt/scan", "/receipt/scan", "/api/ingest/sync", "/ingest/sync"):
        code, data = call(path, {"live_model": True}, token)
        assert code == 501 and data["status"] == "error"


def test_reset_invalidates_preview_but_preserves_consumption_and_limits(sandbox):
    token = session()
    request = approval(prepared(token))
    completed = call("/api/action/claim", request, token)[1]["dispatch_record"]
    stale = approval(prepared(token))
    code, reset = call("/api/action/reset", {}, token)
    assert code == 200
    assert reset["state"]["action_count"] == 4
    assert reset["state"]["dispatch_records"] == [completed]
    assert call("/api/action/claim", stale, token)[0] == 409
    assert call("/api/action/claim", request, token)[1]["replayed"] is True
    store = scoped_store(token)
    state = store.load_state()
    state["action_count"] = 40
    store.save_state(state)
    assert call("/api/action/reset", {}, token)[0] == 429
    assert call("/api/action/claim/prepare", {"item_id": "app-001"}, token)[0] == 429


def test_cancel_utility_and_manual_receipt_are_scoped_and_truthful(sandbox):
    token = session()
    initial = call("/api/state", token=token, method="GET")[1]
    body = {"service_name": "Fitness Stream Pro"}
    code, result = call("/api/action/cancel", body, token)
    assert code == 200 and result["result"]["status"] == "simulated"
    assert result["state"]["summary"] == initial["summary"]
    assert call("/api/action/cancel", body, token)[1]["replayed"] is True
    assert call("/api/action/cancel", {"service_name": "unknown"}, token)[0] == 404
    utility = {"provider": "PPC Electricity", "excess_cents": 5800}
    assert call("/api/action/utility_dispute", utility, token)[0] == 200
    assert call("/api/action/utility_dispute", utility, token)[1]["replayed"] is True
    assert call("/api/action/utility_dispute", {**utility, "excess_cents": -1}, token)[0] == 400
    receipt = {"merchant": "Leroy Merlin DIY", "amount_cents": 8550, "receipt_id": "SYNTHETIC"}
    code, linked = call("/api/action/receipt", receipt, token)
    assert code == 200 and linked["result"]["matched"] is True
    assert call("/api/action/receipt", receipt, token)[1]["replayed"] is True
    assert call("/api/action/receipt", {**receipt, "receipt_id": "OTHER"}, token)[0] == 409
    assert call("/api/action/receipt", {**receipt, "merchant": "Unknown"}, token)[0] == 404


def test_options_unknown_method_and_header_ambiguity(sandbox):
    code, _ = call("/api/state", method="OPTIONS")
    assert code == 200
    response = lambda_handler({"path": "/api/state", "httpMethod": "OPTIONS"}, None)
    assert "Access-Control-Allow-Origin" not in response["headers"]
    assert call("/unknown", {}, method="GET")[0] == 404
    assert call("/api/state", {}, method="PUT")[0] == 404
    token = session()
    event = {"path": "/api/state", "httpMethod": "GET",
             "headers": {"Authorization": "Bearer " + token},
             "multiValueHeaders": {"authorization": ["different", "duplicate"]}}
    assert lambda_handler(event, None)["statusCode"] == 400
    event["multiValueHeaders"] = {"authorization": ["Bearer " + token]}
    assert lambda_handler(event, None)["statusCode"] == 200


def test_mcts_remains_bounded_illustration():
    code, result = call("/api/simulation/mcts", method="GET")
    assert code == 200
    assert result["mode"] == "illustrative"
    assert result["empirical_success_rate"] is None




