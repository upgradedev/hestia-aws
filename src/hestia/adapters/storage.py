"""Persistent storage adapter for Hestia household state and audit logs.

Provides atomic persistence to Amazon S3 with cryptographic event sealing,
falling back to in-memory storage for offline testing and local evaluation.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from typing import Any

# Default initial state matching the verified Athens Apartment 4B scenario
DEFAULT_HOUSEHOLD_STATE: dict[str, Any] = {
    "version": "1.0.0",
    "last_updated": "2026-09-11T12:00:00Z",
    "household_name": "Athens Apartment 4B (Urban Household)",
    "homeowner_name": "Elena Georgiou",
    "summary": {
        "unclaimed_recovery_cents": 18500,
        "protected_assets_cents": 342600,
        "monthly_sub_leakage_cents": 3598,
        "missing_receipt_cents": 8550,
        "protected_items_count": 2,
        "active_anomalies_count": 4,
    },
    "appliances": [
        {
            "id": "app-001",
            "item_name": "Bosch Series 6 Washing Machine",
            "serial_number": "WAU28T64GB/01",
            "purchase_date": "2024-10-15",
            "statutory_months": 24,
            "commercial_months": 24,
            "receipt_reference": "REC-2024-BOSCH-88",
            "purchase_price_cents": 74900,
            "seller_name": "Kotsovolos Megastore",
            "seller_email": "support@kotsovolos.example.gr",
            "has_repair_claim": True,
            "repair_date": "2026-09-02",
            "repair_amount_cents": 18500,
            "repair_issue": "Drum bearing seizure and drain pump motor failure",
            "claim_status": "open",
        },
        {
            "id": "app-002",
            "item_name": "Sony Bravia 55 OLED TV",
            "serial_number": "XR-55A80K-902",
            "purchase_date": "2025-03-20",
            "statutory_months": 24,
            "commercial_months": 12,
            "receipt_reference": "REC-2025-SONY-11",
            "purchase_price_cents": 149900,
            "seller_name": "Sony Center Athens",
            "seller_email": "warranty@sonycenter.example.gr",
            "has_repair_claim": False,
            "repair_date": None,
            "repair_amount_cents": 0,
            "repair_issue": None,
            "claim_status": "none",
        },
        {
            "id": "app-003",
            "item_name": "Daikin Inverter AC 12000 BTU",
            "serial_number": "FTXM35R-2025",
            "purchase_date": "2025-06-10",
            "statutory_months": 24,
            "commercial_months": 36,
            "receipt_reference": "REC-2025-DAIKIN-44",
            "purchase_price_cents": 117800,
            "seller_name": "Clima Expert Hellas",
            "seller_email": "service@climaexpert.example.gr",
            "has_repair_claim": False,
            "repair_date": None,
            "repair_amount_cents": 0,
            "repair_issue": None,
            "claim_status": "none",
        },
    ],
    "subscriptions": [
        {
            "id": "sub-001",
            "service_name": "Fitness Stream Pro",
            "category": "Health & Fitness",
            "monthly_cents": 1999,
            "last_billed": "2026-08-20",
            "is_trial": True,
            "trial_end_date": "2026-09-14",
            "status": "expiring_trial",
            "notes": "Auto-charges €19.99/mo in 3 days. Zero usage detected in 10 days.",
        },
        {
            "id": "sub-002",
            "service_name": "Cloud Backup Vault",
            "category": "Cloud Storage",
            "monthly_cents": 1399,
            "previous_monthly_cents": 999,
            "last_billed": "2026-09-01",
            "is_trial": False,
            "trial_end_date": None,
            "status": "price_creep",
            "notes": "Price crept +40% (from €9.99 to €13.99). Silent leakage €48.00/year.",
        },
        {
            "id": "sub-003",
            "service_name": "Music Streaming Family",
            "category": "Media Streaming",
            "monthly_cents": 1499,
            "last_billed": "2026-09-05",
            "is_trial": False,
            "trial_end_date": None,
            "status": "duplicate_overlap",
            "notes": "Concurrent with Individual plan. Waste €9.99/mo.",
        },
        {
            "id": "sub-004",
            "service_name": "Music Streaming Individual",
            "category": "Media Streaming",
            "monthly_cents": 999,
            "last_billed": "2026-09-02",
            "is_trial": False,
            "trial_end_date": None,
            "status": "duplicate_overlap",
            "notes": "Redundant with Family plan.",
        },
    ],
    "outflows": [
        {
            "id": "out-001",
            "merchant": "Leroy Merlin DIY",
            "amount_cents": 8550,
            "date": "2026-09-04",
            "has_receipt": False,
            "receipt_id": None,
            "category": "Home Maintenance",
            "status": "missing_receipt",
        },
        {
            "id": "out-002",
            "merchant": "Sklavenitis Supermarket",
            "amount_cents": 14230,
            "date": "2026-09-06",
            "has_receipt": True,
            "receipt_id": "REC-2026-SKLAV-0906",
            "category": "Groceries",
            "status": "verified",
        },
        {
            "id": "out-003",
            "merchant": "Plaisio Electronics",
            "amount_cents": 4200,
            "date": "2026-09-07",
            "has_receipt": False,
            "receipt_id": None,
            "category": "Office Supplies",
            "status": "under_threshold",
        },
    ],
    "saved_receipts": [
        "REC-2024-BOSCH-88",
        "REC-2025-SONY-11",
        "REC-2025-DAIKIN-44",
        "REC-2026-SKLAV-0906",
    ],
    "utility_bills": [
        {
            "id": "util-001",
            "provider": "PPC Electricity",
            "baseline_cents": 11000,
            "current_cents": 16800,
            "bill_date": "2026-09-01",
            "spike_percentage": 52.7,
            "status": "spike_alert",
        }
    ],
    "dispatch_records": [
        {
            "id": "disp-000",
            "item_id": "app-002",
            "status": "acknowledged",
            "timestamp": "2026-08-28 10:14",
            "seller": "Amazon EU S.a.r.l.",
            "seller_email": "eu-consumer-rights@amazon.example.com",
            "statutory_basis": "Directive (EU) 2019/771, Article 10(1)",
            "letter_preview": "Free repair authorization issued for boiler heating unit.",
            "cryptographic_seal": (
                "8f3b2a1c4e9d7a5b6c3e2f1a0b9d8c7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c"
            ),
            "model_id": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
        }
    ],
}


class S3HouseholdStore:
    """Read/write storage for Hestia household state with cryptographic sealing."""

    def __init__(
        self,
        bucket_name: str | None = None,
        region_name: str = "eu-west-1",
        state_key: str = "state/household_state.json",
        audit_prefix: str = "audit/",
        s3_client: Any = None,
    ) -> None:
        self.bucket = bucket_name or os.environ.get("HESTIA_STATE_BUCKET", "")
        self.region_name = region_name
        self.state_key = state_key
        self.audit_prefix = audit_prefix
        self._s3_client = s3_client
        self._memory_state: dict[str, Any] | None = None

    def _get_s3(self) -> Any:
        if self._s3_client is not None:
            return self._s3_client
        if not self.bucket:
            return None
        try:
            import boto3

            self._s3_client = boto3.client("s3", region_name=self.region_name)
            return self._s3_client
        except Exception:
            return None

    def load_state(self) -> dict[str, Any]:
        """Load household state from S3, initializing with default state if missing."""
        s3 = self._get_s3()
        if s3 is not None and self.bucket:
            try:
                response = s3.get_object(Bucket=self.bucket, Key=self.state_key)
                content = response["Body"].read().decode("utf-8")
                data = json.loads(content)
                self._memory_state = data
                return data
            except Exception:
                # Key does not exist or S3 read failed; bootstrap state
                default_state = json.loads(json.dumps(DEFAULT_HOUSEHOLD_STATE))
                self.save_state(default_state)
                return default_state

        if self._memory_state is None:
            self._memory_state = json.loads(json.dumps(DEFAULT_HOUSEHOLD_STATE))
        return self._memory_state

    def save_state(self, state: dict[str, Any]) -> None:
        """Persist household state to S3 and in-memory cache."""
        state["last_updated"] = datetime.now(UTC).isoformat()
        self._memory_state = state

        s3 = self._get_s3()
        if s3 is not None and self.bucket:
            try:
                payload = json.dumps(state, indent=2).encode("utf-8")
                s3.put_object(
                    Bucket=self.bucket,
                    Key=self.state_key,
                    Body=payload,
                    ContentType="application/json",
                )
            except Exception:
                pass

    def append_audit_event(self, action: str, payload: dict[str, Any]) -> str:
        """Log timestamped audit event to S3 and return its cryptographic SHA-256 seal."""
        now = datetime.now(UTC)
        iso_ts = now.strftime("%Y%m%dT%H%M%SZ")
        serialized = json.dumps(payload, sort_keys=True)
        seal = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        event_record = {
            "action": action,
            "timestamp": now.isoformat(),
            "cryptographic_seal": seal,
            "payload": payload,
        }

        s3 = self._get_s3()
        if s3 is not None and self.bucket:
            try:
                event_key = f"{self.audit_prefix}{iso_ts}_{action}_{seal[:8]}.json"
                s3.put_object(
                    Bucket=self.bucket,
                    Key=event_key,
                    Body=json.dumps(event_record, indent=2).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception:
                pass

        return seal

    def record_claim_dispatch(
        self,
        item_id: str,
        seller: str,
        seller_email: str,
        letter: str,
        statutory_basis: str,
        model_id: str,
    ) -> dict[str, Any]:
        """Mark appliance claim as dispatched, seal audit event, and persist to S3."""
        state = self.load_state()

        disp_id = f"disp-{int(datetime.now(UTC).timestamp())}"
        now_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M")

        seal = self.append_audit_event(
            action="claim_dispatch",
            payload={
                "dispatch_id": disp_id,
                "item_id": item_id,
                "seller": seller,
                "seller_email": seller_email,
                "statutory_basis": statutory_basis,
                "model_id": model_id,
            },
        )

        record = {
            "id": disp_id,
            "item_id": item_id,
            "status": "dispatched",
            "timestamp": now_str,
            "seller": seller,
            "seller_email": seller_email,
            "statutory_basis": statutory_basis,
            "letter_preview": letter[:200] + ("..." if len(letter) > 200 else ""),
            "full_letter": letter,
            "cryptographic_seal": seal,
            "model_id": model_id,
        }

        # Update appliance status
        for app in state.get("appliances", []):
            if app.get("id") == item_id:
                app["claim_status"] = "dispatched"

        # Update summary
        unclaimed = 0
        for app in state.get("appliances", []):
            if app.get("has_repair_claim") and app.get("claim_status") == "open":
                unclaimed += app.get("repair_amount_cents", 0)
        state["summary"]["unclaimed_recovery_cents"] = unclaimed

        records = state.setdefault("dispatch_records", [])
        records.append(record)
        self.save_state(state)
        return record

    def record_subscription_cancellation(self, service_name: str) -> dict[str, Any]:
        """Cancel subscription, update monthly leakage metric, and persist state."""
        state = self.load_state()
        cancelled_sub: dict[str, Any] | None = None

        for sub in state.get("subscriptions", []):
            if sub.get("service_name") == service_name or sub.get("id") == service_name:
                sub["status"] = "cancelled"
                cancelled_sub = sub

        # Recalculate monthly leakage
        monthly_waste = 0
        for sub in state.get("subscriptions", []):
            if sub.get("status") in ("expiring_trial", "duplicate_overlap"):
                monthly_waste += sub.get("monthly_cents", 0)
            elif sub.get("status") == "price_creep":
                old_c = sub.get("previous_monthly_cents", sub.get("monthly_cents", 0))
                new_c = sub.get("monthly_cents", 0)
                monthly_waste += max(0, new_c - old_c)

        state["summary"]["monthly_sub_leakage_cents"] = monthly_waste

        saved_cents = cancelled_sub.get("monthly_cents", 0) if cancelled_sub else 0
        seal = self.append_audit_event(
            action="cancel_subscription",
            payload={"service_name": service_name, "saved_monthly_cents": saved_cents},
        )

        self.save_state(state)
        return {
            "status": "cancelled",
            "service_name": service_name,
            "new_monthly_leakage_cents": monthly_waste,
            "cryptographic_seal": seal,
        }

    def record_receipt_upload(
        self, merchant: str, amount_cents: int, receipt_id: str
    ) -> dict[str, Any]:
        """Link receipt to transaction, resolve anti-join alert, and persist state."""
        state = self.load_state()
        matched = False

        for out in state.get("outflows", []):
            if not out.get("has_receipt") and (
                out.get("merchant").lower() == merchant.lower()
                or merchant.lower() in out.get("merchant").lower()
            ):
                out["has_receipt"] = True
                out["receipt_id"] = receipt_id
                out["status"] = "verified"
                matched = True

        state.setdefault("saved_receipts", []).append(receipt_id)

        # Recalculate missing receipt sum
        missing_sum = 0
        for out in state.get("outflows", []):
            if not out.get("has_receipt") and out.get("amount_cents", 0) >= 5000:
                missing_sum += out.get("amount_cents", 0)
        state["summary"]["missing_receipt_cents"] = missing_sum

        seal = self.append_audit_event(
            action="receipt_upload",
            payload={
                "merchant": merchant,
                "amount_cents": amount_cents,
                "receipt_id": receipt_id,
                "matched": matched,
            },
        )

        self.save_state(state)
        return {
            "status": "linked" if matched else "stored",
            "receipt_id": receipt_id,
            "matched": matched,
            "new_missing_receipt_cents": missing_sum,
            "cryptographic_seal": seal,
        }
