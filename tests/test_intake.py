"""Intake domain planning and real API persistence, replay, isolation and failure contracts."""
from __future__ import annotations

import base64
import copy
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from hestia.adapters.storage import fresh_demo_state
from hestia.app.web import read_lambda_handler
from hestia.domain.intake import apply_changes, plan_records
from hestia.domain.metrics import summary_from_records
from tests import test_web
from tests.fakes import service_error
from tests.test_ocr import png
from tests.test_web import call, scoped_store, session

sandbox = test_web.sandbox
ROUTE = "/api/ingest/sync"
RECEIPT = {"kind": "receipt", "transaction_id": "out-001", "merchant": "Piraeus DIY Supplies",
           "amount_cents": 8550, "date": "2026-09-04", "receipt_id": "REAL-INPUT-REF"}
TRANSACTION = {"kind": "transaction", "transaction_id": "import-tx", "merchant": "My shop",
               "amount_cents": 5000, "date": "2026-09-12", "category": "Home"}
SUBSCRIPTION = {"kind": "subscription", "subscription_id": "import-sub", "service_name": "My plan",
                "monthly_cents": 1200, "category": "Productivity", "last_billed": "2026-09-12",
                "is_trial": True, "trial_end_date": "2026-09-20"}


def state(token):
    code, result = call("/api/state", token=token, method="GET")
    assert code == 200, result
    return result


def stage(token, rows=None, raw=None, route=ROUTE, mime="application/json"):
    body = {"operation": "stage", "records": rows or [RECEIPT]}
    if raw is not None:
        body = {"operation": "stage", "document_base64": base64.b64encode(raw).decode(),
                "mime_type": mime}
    code, result = call(route, body, token)
    assert code == 200, result
    return result["intake"]


def review(token, draft, rows=None):
    code, result = call(draft["route"], {"operation": "review", "intake_id": draft["id"],
                                      "records": rows or draft["records"]}, token)
    assert code == 200, result
    return result["intake"]


def approval(draft):
    return {"operation": "commit", "intake_id": draft["id"],
            "digest": draft["review"]["digest"], "confirmed": True}


def commit(token, draft):
    code, result = call(draft["route"], approval(draft), token)
    assert code == 200, result
    return result


def test_json_correction_exact_review_commit_and_reload_retain_real_input_provenance(sandbox):
    token = session()
    raw = json.dumps({"records": [{**RECEIPT, "amount_cents": 9999}]}).encode()
    staged = stage(token, raw=raw)
    assert state(token)["outflows"][0]["has_receipt"] is False
    reviewed = review(token, staged, [RECEIPT])
    plan = reviewed["review"]
    assert plan["original_records"][0]["amount_cents"] == 9999
    assert plan["corrected_records"][0]["amount_cents"] == 8550
    assert plan["changes"][0]["before"]["has_receipt"] is False
    assert plan["changes"][0]["after"]["receipt_id"] == RECEIPT["receipt_id"]
    assert staged["input_sha256"] == hashlib.sha256(raw).hexdigest()
    result = commit(token, reviewed)
    saved = state(token)
    assert result["state"] == saved
    assert saved["outflows"][0]["receipt_id"] == RECEIPT["receipt_id"]
    assert saved["intakes"][staged["id"]]["status"] == "committed"
    proof = saved["intake_provenance"][0]
    assert proof["input_sha256"] == staged["input_sha256"]
    assert proof["record_id"] == "out-001" and proof["actor"] == "demo_user"
    assert proof["digest"] == plan["digest"] and proof["mode"] == "synthetic"
    assert "document_base64" not in json.dumps(saved)
    assert saved["summary"]["missing_receipt_cents"] == 0
    assert saved["summary"]["real_recovered_cents"] == 0
    assert saved["appliances"] == fresh_demo_state()["appliances"]
    assert saved["dispatch_records"] == []


def test_png_manual_facts_and_same_bytes_replay_have_no_canned_metadata(sandbox):
    token = session()
    draft = stage(token, raw=png(), mime="image/png", route="/api/receipt/scan")
    assert draft["records"] == [] and draft["confidence_score"] is None
    result = commit(token, review(token, draft, [RECEIPT]))
    replay = stage(token, raw=png(), mime="image/png", route="/api/receipt/scan")
    assert replay == result["intake"]
    assert state(token)["version_seq"] == result["state"]["version_seq"]


def test_partial_batch_creates_stable_ids_and_receipt_link_in_one_conditional_write(sandbox):
    token = session()
    rows = [TRANSACTION, {**RECEIPT, "transaction_id": "import-tx", "merchant": "My shop",
                         "amount_cents": 5000, "date": "2026-09-12"},
            {**TRANSACTION, "transaction_id": "zero-tx", "amount_cents": 0}, SUBSCRIPTION]
    result = commit(token, review(token, stage(token, rows)))
    assert result["intake"]["result"] == {"ready": 3, "duplicate": 0, "error": 1}
    saved = state(token)
    assert next(o for o in saved["outflows"] if o["id"] == "import-tx")["has_receipt"]
    assert not any(o["id"] == "zero-tx" for o in saved["outflows"])
    assert saved["subscriptions"][-1]["id"] == "import-sub"
    assert len(saved["intake_provenance"]) == 3
    assert saved["summary"]["monthly_recurring_cents"] == sum(
        s["monthly_cents"] for s in saved["subscriptions"]
    )


def test_duplicate_records_and_replay_do_not_overwrite_or_multiply_history(sandbox):
    token = session()
    draft = review(token, stage(token, [TRANSACTION, TRANSACTION]))
    result = commit(token, draft)
    assert result["intake"]["result"] == {"ready": 1, "duplicate": 1, "error": 0}
    before = state(token)
    assert commit(token, draft)["replayed"] is True
    assert state(token) == before
    other = stage(token, raw=json.dumps({"records": [TRANSACTION]}).encode())
    duplicate = commit(token, review(token, other))
    assert duplicate["intake"]["result"]["duplicate"] == 1
    assert len(duplicate["state"]["intake_provenance"]) == 1


def test_digest_consent_stale_state_and_postcommit_edit_rejected(sandbox):
    token = session()
    draft = review(token, stage(token))
    before = state(token)
    assert call(ROUTE, {**approval(draft), "confirmed": False}, token)[0] == 422
    assert call(ROUTE, {**approval(draft), "digest": "a" * 64}, token)[0] == 409
    assert call(ROUTE, {**approval(draft), "model_id": "paid"}, token)[0] == 400
    assert state(token) == before
    changed = review(token, draft, [{**RECEIPT, "receipt_id": "CORRECTED-ID"}])
    assert call(ROUTE, approval(draft), token)[0] == 409
    stage(token, [TRANSACTION])
    assert call(ROUTE, approval(changed), token)[0] == 409
    final = review(token, changed, changed["review"]["corrected_records"])
    commit(token, final)
    assert call(ROUTE, {"operation": "review", "intake_id": final["id"],
                        "records": [RECEIPT]}, token)[0] == 409


def test_lost_write_response_is_reconciled_by_exact_replay(sandbox):
    token = session()
    draft = review(token, stage(token))
    sandbox.lose_response = True
    assert call(ROUTE, approval(draft), token)[0] == 503
    persisted = state(token)
    result = commit(token, draft)
    assert result["replayed"] and result["state"] == persisted
    assert len(persisted["intake_provenance"]) == 1


def test_storage_failure_never_commits_valid_subset_or_audit(sandbox):
    token = session()
    draft = review(token, stage(token, [TRANSACTION, RECEIPT]))
    before = state(token)
    sandbox.write_error = service_error("AccessDenied")
    assert call(ROUTE, approval(draft), token)[0] == 503
    assert state(token) == before


def test_distinct_concurrent_reviews_can_have_only_one_committed_plan(sandbox):
    token = session()
    draft = stage(token)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda value: call(ROUTE, {
            "operation": "review", "intake_id": draft["id"],
            "records": [{**RECEIPT, "receipt_id": value}],
        }, token), ["R-A", "R-B"]))
    successes = [r["intake"] for code, r in results if code == 200]
    assert successes and all(code in (200, 409) for code, _ in results)
    final = state(token)["intakes"][draft["id"]]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: call(ROUTE, approval(final), token), range(2)))
    assert any(code == 200 for code, _ in results)
    assert all(code in (200, 409) for code, _ in results)
    assert len(state(token)["intake_provenance"]) == 1


def test_authority_cross_session_route_and_legacy_empty_invariants(sandbox):
    token, other = session(), session()
    draft = review(token, stage(token))
    before = state(token)
    assert call(ROUTE, approval(draft))[0] == 401
    assert call(ROUTE, approval(draft), other)[0] == 404
    assert call("/api/receipt/scan", approval(draft), token)[0] == 404
    assert read_lambda_handler({"rawPath": ROUTE, "httpMethod": "POST",
                                "headers": {"Authorization": "Bearer " + token}}, None)[
        "statusCode"] == 405
    for path in [ROUTE, "/ingest/sync", "/api/receipt/scan", "/receipt/scan"]:
        assert call(path, {}, token)[0] == 501
        assert call(path, {"image_base64": "AAAA", "model_id": "paid"}, token)[0] == 501
    assert state(token) == before


def test_reset_retains_imports_provenance_replay_and_cancellation_request(sandbox):
    token = session()
    draft = review(token, stage(token, [TRANSACTION, SUBSCRIPTION]))
    commit(token, draft)
    code, result = call("/api/action/cancel", {"service_name": "My plan",
                       "subscription_id": "import-sub", "expected_monthly_cents": 1200}, token)
    assert code == 200
    saved = result["state"]
    request = saved["subscriptions"][-1]["cancellation_request"]
    assert request["status"] == "synthetic_requested" and request["monthly_cents"] == 1200
    assert saved["subscriptions"][-1]["status"] == "expiring_trial"
    call("/api/action/reset", {}, token)
    for key in ("outflows", "subscriptions", "intakes", "intake_provenance"):
        assert state(token)[key] == saved[key]
    scoped_store(token).reset_state()
    assert commit(token, draft)["replayed"]
    assert state(token)["subscriptions"] == saved["subscriptions"]


def test_ambiguous_legacy_joins_fail_but_stable_ids_select_exact_records(sandbox):
    token = session()
    store = scoped_store(token)
    raw = store.load_state(create=False)
    raw["outflows"].append({**raw["outflows"][0], "id": "out-other"})
    raw["subscriptions"].append({**raw["subscriptions"][0], "id": "sub-other"})
    store.save_state(raw)
    receipt = {"merchant": RECEIPT["merchant"], "amount_cents": 8550, "receipt_id": "MANUAL"}
    assert call("/api/action/receipt", receipt, token)[0] == 409
    result = call("/api/action/receipt", {**receipt, "transaction_id": "out-other"}, token)
    assert result[0] == 200
    assert not state(token)["outflows"][0]["has_receipt"]
    assert state(token)["outflows"][-1]["has_receipt"]
    name = raw["subscriptions"][0]["service_name"]
    assert call("/api/action/cancel", {"service_name": name}, token)[0] == 409
    assert call("/api/action/cancel", {"service_name": name, "subscription_id": "sub-other",
                                      "expected_monthly_cents": 1}, token)[0] == 409
    assert call("/api/action/cancel", {"service_name": name,
                                      "subscription_id": "sub-other"}, token)[0] == 200
    assert not state(token)["subscriptions"][0].get("demo_cancellation_requested")


@pytest.mark.parametrize("row", [
    {**RECEIPT, "amount_cents": 0}, {**RECEIPT, "amount_cents": True},
    {**RECEIPT, "amount_cents": 10000001}, {**RECEIPT, "merchant": "wrong"},
    {**RECEIPT, "transaction_id": "missing"}, {**RECEIPT, "transaction_id": "../bad"},
    {**RECEIPT, "receipt_id": "REC-2025-SONY-11"}, {**RECEIPT, "date": "2026-02-30"},
    {**RECEIPT, "date": "20260912"}, {**RECEIPT, "date": ""},
    {**RECEIPT, "merchant": " "}, {**RECEIPT, "mode": "live"}, {"kind": "unknown"},
    {**TRANSACTION, "transaction_id": "out-001"},
    {**SUBSCRIPTION, "is_trial": "true"}, {**SUBSCRIPTION, "trial_end_date": None},
    {**SUBSCRIPTION, "actor": "merchant"},
    {**SUBSCRIPTION, "is_trial": False},
])
def test_invalid_rows_are_explicit_errors_without_mutation(row):
    original = fresh_demo_state()
    state_copy = copy.deepcopy(original)
    changes = plan_records(state_copy, [row])
    assert changes[0]["status"] == "error" and changes[0]["message"]
    apply_changes(state_copy, changes)
    assert state_copy == original


def test_plan_duplicate_receipt_collision_subscription_creep_and_changed_precondition():
    state_copy = fresh_demo_state()
    changes = plan_records(state_copy, [RECEIPT, RECEIPT])
    assert [c["status"] for c in changes] == ["ready", "duplicate"]
    apply_changes(state_copy, changes)
    assert plan_records(state_copy, [{**RECEIPT, "receipt_id": "other"}])[0]["status"] == "error"
    other = {**SUBSCRIPTION, "is_trial": False, "trial_end_date": None,
             "previous_monthly_cents": 1000}
    planned = plan_records(state_copy, [other])
    assert planned[0]["after"]["status"] == "price_creep"
    apply_changes(state_copy, planned)
    assert plan_records(state_copy, [other])[0]["status"] == "duplicate"
    original = fresh_demo_state()
    original["outflows"][0]["amount_cents"] = 100
    with pytest.raises(ValueError, match="changed"):
        apply_changes(original, changes)


def test_all_invalid_commit_and_intake_quota_are_visible_failures(sandbox):
    token = session()
    draft = review(token, stage(token, [{**RECEIPT, "amount_cents": 0}]))
    assert call(ROUTE, approval(draft), token)[0] == 422
    for index in range(7):
        stage(token, [{**TRANSACTION, "transaction_id": f"tx-{index}"}])
    assert call(ROUTE, {"operation": "stage", "records": [SUBSCRIPTION]}, token)[0] == 429
    assert call(ROUTE, {"operation": "delete"}, token)[0] == 400
    assert call(ROUTE, {"operation": "stage", "records": [SUBSCRIPTION],
                        "model_id": "paid"}, token)[0] == 400


def test_canonical_metric_projection_ignores_stale_summary_and_uses_inclusive_threshold(sandbox):
    original = fresh_demo_state()
    original["summary"] = {"unclaimed_recovery_cents": 9999999}
    original["appliances"][0]["repair_amount_cents"] = 7391
    original["outflows"][0]["amount_cents"] = 5000
    original["subscriptions"][0]["demo_cancellation_requested"] = True
    summary = summary_from_records(original)
    assert summary["documented_repair_cost_cents"] == 7391
    assert summary["unclaimed_recovery_cents"] == 7391
    assert summary["missing_receipt_cents"] == 5000 and summary["real_recovered_cents"] == 0
    assert summary["monthly_sub_leakage_cents"] == 400
    assert summary["source"] == "canonical-records" and summary["mode"] == "synthetic"
    token = session()
    store = scoped_store(token)
    raw = store.load_state(create=False)
    raw["appliances"][0]["repair_amount_cents"] = 7391
    store.save_state(raw)
    observed = state(token)
    assert observed["summary"]["documented_repair_cost_cents"] == 7391
    assert observed["summary"]["state_version"] == observed["version_seq"]
    assert observed["summary"]["observed_at"] == observed["last_updated"]
