"""Tests for S3HouseholdStore persistent adapter."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

from hestia.adapters.storage import S3HouseholdStore


def test_in_memory_load_and_save():
    store = S3HouseholdStore(bucket_name="")
    state = store.load_state()
    assert state["household_name"] == "Athens Apartment 4B (Urban Household)"
    assert len(state["appliances"]) >= 2

    # Mutate and save
    state["household_name"] = "Patras Flat 2A"
    store.save_state(state)

    reloaded = store.load_state()
    assert reloaded["household_name"] == "Patras Flat 2A"


def test_s3_mock_load_success():
    mock_s3 = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"test_key": "test_val"}).encode("utf-8")
    mock_s3.get_object.return_value = {"Body": mock_body}

    store = S3HouseholdStore(bucket_name="test-bucket", s3_client=mock_s3)
    state = store.load_state()
    assert state == {"test_key": "test_val"}


def test_s3_mock_load_fallback_on_exception():
    mock_s3 = MagicMock()
    mock_s3.get_object.side_effect = Exception("NoSuchKey")

    store = S3HouseholdStore(bucket_name="test-bucket", s3_client=mock_s3)
    state = store.load_state()
    assert state["household_name"] == "Athens Apartment 4B (Urban Household)"
    assert mock_s3.put_object.called


def test_s3_save_state_exception_swallowed():
    mock_s3 = MagicMock()
    mock_s3.put_object.side_effect = Exception("S3 write error")

    store = S3HouseholdStore(bucket_name="test-bucket", s3_client=mock_s3)
    # Should not raise
    store.save_state({"test": 1})
    assert store._memory_state["test"] == 1


def test_s3_get_s3_real_client(monkeypatch):
    store = S3HouseholdStore(bucket_name="test-bucket")
    mock_boto = MagicMock()
    monkeypatch.setattr("boto3.client", mock_boto)
    client = store._get_s3()
    assert client == mock_boto.return_value


def test_s3_get_s3_fallback(monkeypatch):
    store = S3HouseholdStore(bucket_name="test-bucket")
    # Test when boto3 client creation fails
    monkeypatch.setattr("boto3.client", MagicMock(side_effect=Exception("No credentials")))
    assert store._get_s3() is None


def test_append_audit_event():
    mock_s3 = MagicMock()
    store = S3HouseholdStore(bucket_name="test-bucket", s3_client=mock_s3)

    seal = store.append_audit_event("test_action", {"foo": "bar"})
    assert len(seal) == 64
    assert mock_s3.put_object.called

    # S3 failure swallowed
    mock_s3.put_object.side_effect = Exception("PutObject failed")
    seal2 = store.append_audit_event("test_action", {"foo": "bar"})
    assert seal2 == seal


def test_record_claim_dispatch():
    store = S3HouseholdStore(bucket_name="")
    rec = store.record_claim_dispatch(
        item_id="app-001",
        seller="Kotsovolos Megastore",
        seller_email="support@kotsovolos.example.gr",
        letter="Formal statutory claim notice under EU Directive 2019/771/EU",
        statutory_basis="Directive (EU) 2019/771, Article 10(1)",
        model_id="eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    )
    assert rec["status"] == "dispatched"
    assert rec["item_id"] == "app-001"
    assert len(rec["cryptographic_seal"]) == 64

    # Check updated state
    state = store.load_state()
    app = next(a for a in state["appliances"] if a["id"] == "app-001")
    assert app["claim_status"] == "dispatched"
    assert state["summary"]["unclaimed_recovery_cents"] == 0


def test_record_subscription_cancellation():
    store = S3HouseholdStore(bucket_name="")
    # Cancel expiring trial
    res = store.record_subscription_cancellation("Fitness Stream Pro")
    assert res["status"] == "cancelled"
    assert res["service_name"] == "Fitness Stream Pro"

    state = store.load_state()
    sub = next(s for s in state["subscriptions"] if s["service_name"] == "Fitness Stream Pro")
    assert sub["status"] == "cancelled"

    # Cancel price creep sub
    res2 = store.record_subscription_cancellation("Cloud Backup Vault")
    assert res2["status"] == "cancelled"

    # Cancel non-existent service
    res4 = store.record_subscription_cancellation("NonExistent Service")
    assert res4["status"] == "cancelled"


def test_record_receipt_upload():
    store = S3HouseholdStore(bucket_name="")
    # Match existing missing receipt
    res = store.record_receipt_upload(
        merchant="Leroy Merlin DIY",
        amount_cents=8550,
        receipt_id="REC-2026-LEROY-TEST",
    )
    assert res["status"] == "linked"
    assert res["matched"] is True
    assert res["new_missing_receipt_cents"] == 0

    state = store.load_state()
    out = next(o for o in state["outflows"] if o["merchant"] == "Leroy Merlin DIY")
    assert out["has_receipt"] is True
    assert out["receipt_id"] == "REC-2026-LEROY-TEST"
    assert "REC-2026-LEROY-TEST" in state["saved_receipts"]

    # Upload unlinked receipt when another unbacked outflow >= 5000 exists
    state["outflows"].append({
        "id": "out-999",
        "merchant": "Mega Hardware",
        "amount_cents": 9500,
        "date": "2026-09-08",
        "has_receipt": False,
        "receipt_id": None,
        "category": "Home Maintenance",
        "status": "missing_receipt",
    })
    store.save_state(state)

    res2 = store.record_receipt_upload(
        merchant="Independent Bakery",
        amount_cents=1200,
        receipt_id="REC-2026-BAKERY-TEST",
    )
    assert res2["status"] == "stored"
    assert res2["matched"] is False
    assert res2["new_missing_receipt_cents"] == 9500


def test_record_claim_dispatch_with_remaining_open_claims():
    store = S3HouseholdStore(bucket_name="")
    state = store.load_state()
    # Add a second appliance with open repair claim
    state["appliances"].append({
        "id": "app-099",
        "item_name": "Espresso Machine",
        "serial_number": "ESP-99",
        "purchase_date": "2025-01-10",
        "statutory_months": 24,
        "commercial_months": 24,
        "receipt_reference": "REC-ESP",
        "purchase_price_cents": 45000,
        "seller_name": "Coffee Hub",
        "seller_email": "info@coffeehub.gr",
        "has_repair_claim": True,
        "repair_date": "2026-08-10",
        "repair_amount_cents": 8000,
        "repair_issue": "Pump pressure failure",
        "claim_status": "open",
    })
    store.save_state(state)

    rec = store.record_claim_dispatch(
        item_id="app-001",
        seller="Kotsovolos Megastore",
        seller_email="support@kotsovolos.example.gr",
        letter="Claim letter",
        statutory_basis="Directive (EU) 2019/771",
        model_id="eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    )
    assert rec["status"] == "dispatched"
    updated_state = store.load_state()
    assert updated_state["summary"]["unclaimed_recovery_cents"] == 8000


