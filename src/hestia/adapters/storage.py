"""Persistent storage adapter for Hestia household state and audit logs.

Uses conditional Amazon S3 writes and explicit in-memory mode for CI.
Storage failures never fall back to a successful in-memory mutation.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import threading
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from hestia.domain.metrics import summary_from_records

# Default initial state matching the verified Athens Apartment 4B scenario
DEFAULT_HOUSEHOLD_STATE: dict[str, Any] = {
    "version": "1.0.0",
    "version_seq": 1,
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
            "brand": "Bosch",
            "model_number": "WAU28T64GB",
            "serial_number": "WAU28T64GB/01",
            "purchase_date": "2024-10-15",
            "statutory_months": 24,
            "commercial_months": 24,
            "receipt_reference": "REC-2024-BOSCH-88",
            "purchase_price_cents": 74900,
            "seller_name": "Acropolis Appliance Store",
            "seller_email": "support@acropolis-appliances.example.gr",
            "has_repair_claim": True,
            "repair_date": "2026-09-02",
            "repair_amount_cents": 18500,
            "repair_issue": "Drum bearing seizure and drain pump motor failure",
            "claim_status": "open",
        },
        {
            "id": "app-002",
            "item_name": "Sony Bravia 55 OLED TV",
            "brand": "Sony",
            "model_number": "XR-55A80K",
            "serial_number": "XR-55A80K-902",
            "purchase_date": "2025-03-20",
            "statutory_months": 24,
            "commercial_months": 12,
            "receipt_reference": "REC-2025-SONY-11",
            "purchase_price_cents": 149900,
            "seller_name": "Plaka TV and Audio",
            "seller_email": "warranty@plaka-tv-audio.example.gr",
            "has_repair_claim": False,
            "repair_date": None,
            "repair_amount_cents": 0,
            "repair_issue": None,
            "claim_status": "none",
        },
        {
            "id": "app-003",
            "item_name": "Daikin Inverter AC 12000 BTU",
            "brand": "Daikin",
            "model_number": "FTXM35R",
            "serial_number": "FTXM35R-2025",
            "purchase_date": "2025-06-10",
            "statutory_months": 24,
            "commercial_months": 36,
            "receipt_reference": "REC-2025-DAIKIN-44",
            "purchase_price_cents": 117800,
            "seller_name": "Lycabettus Climate Services",
            "seller_email": "service@lycabettus-climate.example.gr",
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
            "trial_end_date": None,  # fresh_demo_state sets it relative to the day a copy opens
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
            "merchant": "Piraeus DIY Supplies",
            "amount_cents": 8550,
            "date": "2026-09-04",
            "has_receipt": False,
            "receipt_id": None,
            "category": "Home Maintenance",
            "status": "missing_receipt",
        },
        {
            "id": "out-002",
            "merchant": "Neighbourhood Supermarket",
            "amount_cents": 14230,
            "date": "2026-09-06",
            "has_receipt": True,
            "receipt_id": "REC-2026-MARKET-0906",
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
        "REC-2026-MARKET-0906",
    ],
    "utility_bills": [
        {
            "id": "util-001",
            "provider": "City Electricity Supply",
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


class StorageError(RuntimeError):
    """Persistence failed; no success or fallback may be inferred."""


class StorageConflict(StorageError):
    """A conditional write lost a race. Reload before making another decision."""


class StateMissing(StorageError):
    """The scoped workspace no longer exists."""


class S3HouseholdStore:
    """Scoped conditional state writes; explicit in-memory mode is for CI only."""

    _states: dict[str, dict[str, Any]] = {}
    _counters: dict[str, int] = {}
    _lock = threading.RLock()
    MAX_STATE_BYTES = 262144

    def __init__(
        self,
        bucket_name: str | None = None,
        region_name: str = "eu-west-1",
        workspace_id: str | None = None,
        s3_client: Any = None,
    ) -> None:
        self.bucket = (os.environ.get("HESTIA_STATE_BUCKET", "")
                       if bucket_name is None else bucket_name)
        self.region_name = region_name
        if workspace_id is None:
            if self.bucket:
                raise ValueError("A trusted workspace scope is required for S3")
            workspace_id = uuid.uuid4().hex
        if not re.fullmatch(r"[a-f0-9]{32}", workspace_id):
            raise ValueError("Invalid workspace scope")
        self.workspace_id = workspace_id
        self.prefix = f"demo/workspaces/{workspace_id}/"
        self.state_key = self.prefix + "state.json"
        self.audit_prefix = self.prefix + "audit/"
        self.outbox_prefix = self.prefix + "outbox/"
        self._s3_client = s3_client
        self._etag: str | None = None
        self._loaded_version: int | None = None

    def _get_s3(self) -> Any:
        if not self.bucket:
            return None
        if self._s3_client is None:
            try:
                import boto3

                self._s3_client = boto3.client("s3", region_name=self.region_name)
            except Exception as exc:
                raise StorageError("Storage is unavailable") from exc
        return self._s3_client

    @staticmethod
    def _error_code(exc: Exception) -> str:
        response = getattr(exc, "response", {})
        return str(response.get("Error", {}).get("Code", ""))

    @staticmethod
    def _validate(data: Any) -> None:
        if (
            not isinstance(data, dict)
            or type(data.get("version_seq")) is not int
            or data["version_seq"] < 1
            or not isinstance(data.get("summary"), dict)
            or any(not isinstance(data.get(key), list) for key in
                   ("appliances", "subscriptions", "outflows", "dispatch_records"))
        ):
            raise StorageError("Stored workspace is invalid; it was not reset")

    def create_workspace(self) -> dict[str, Any]:
        """Reserve a freshly server-generated scope without a speculative GET.

        S3 hides missing keys behind AccessDenied without ListBucket authority.
        An atomic create proves absence; a collision never grants existing state
        to a newly issued capability, and an unreadable object is never replaced.
        """
        data = fresh_demo_state()
        s3 = self._get_s3()
        if s3 is None:
            with self._lock:
                if self.workspace_id in self._states:
                    raise StorageConflict("Workspace scope is already reserved")
                self._states[self.workspace_id] = copy.deepcopy(data)
                self._loaded_version = data["version_seq"]
        else:
            try:
                response = s3.put_object(
                    Bucket=self.bucket, Key=self.state_key, Body=self._encode(data),
                    ContentType="application/json", IfNoneMatch="*",
                )
            except Exception as exc:
                if self._error_code(exc) in ("PreconditionFailed", "ConditionalRequestConflict"):
                    raise StorageConflict("Workspace scope is already reserved") from exc
                raise StorageError("Workspace creation is unconfirmed") from exc
            self._capture(response, data)
        return copy.deepcopy(data)

    def load_state(self, *, create: bool = True) -> dict[str, Any]:
        s3 = self._get_s3()
        if s3 is None:
            with self._lock:
                data = self._states.get(self.workspace_id)
                if data is None:
                    if not create:
                        raise StateMissing("Workspace not found")
                    data = fresh_demo_state()
                    self._states[self.workspace_id] = copy.deepcopy(data)
                self._validate(data)
                self._loaded_version = data["version_seq"]
                return copy.deepcopy(data)
        try:
            response = s3.get_object(Bucket=self.bucket, Key=self.state_key)
        except Exception as exc:
            if self._error_code(exc) != "NoSuchKey":
                raise StorageError("Workspace could not be read; it was not reset") from exc
            if not create:
                raise StateMissing("Workspace not found") from exc
            data = fresh_demo_state()
            try:
                response = s3.put_object(
                    Bucket=self.bucket, Key=self.state_key, Body=self._encode(data),
                    ContentType="application/json", IfNoneMatch="*",
                )
            except Exception as write_exc:
                if self._error_code(write_exc) in (
                    "PreconditionFailed", "ConditionalRequestConflict",
                ):
                    return self.load_state(create=False)
                raise StorageError("Workspace creation is unconfirmed") from write_exc
            self._capture(response, data)
            return copy.deepcopy(data)
        try:
            content = response["Body"].read(self.MAX_STATE_BYTES + 1)
            if len(content) > self.MAX_STATE_BYTES:
                raise StorageError("Stored workspace exceeds its size limit")
            data = json.loads(content.decode("utf-8"))
            self._validate(data)
        except Exception as exc:
            raise StorageError("Stored workspace is unreadable; it was not reset") from exc
        self._capture(response, data)
        return copy.deepcopy(data)

    def _capture(self, response: dict[str, Any], data: dict[str, Any]) -> None:
        etag = response.get("ETag")
        if not isinstance(etag, str) or not etag:
            raise StorageError("Missing storage revision; outcome must be reconciled")
        self._etag = etag
        self._loaded_version = data["version_seq"]

    def _encode(self, state: dict[str, Any]) -> bytes:
        payload = json.dumps(
            state, ensure_ascii=False, allow_nan=False, sort_keys=True,
        ).encode("utf-8")
        if len(payload) > self.MAX_STATE_BYTES:
            raise StorageError("Workspace size limit reached")
        return payload

    def save_state(self, state: dict[str, Any]) -> None:
        self._validate(state)
        expected = state["version_seq"]
        if self._loaded_version is None or expected != self._loaded_version:
            raise StorageConflict("Reload the workspace before saving")
        candidate = copy.deepcopy(state)
        candidate["version_seq"] = expected + 1
        candidate["last_updated"] = datetime.now(UTC).isoformat()
        candidate["summary"] = summary_from_records(candidate)
        payload = self._encode(candidate)
        s3 = self._get_s3()
        if s3 is None:
            with self._lock:
                current = self._states.get(self.workspace_id)
                if current is None or current["version_seq"] != expected:
                    raise StorageConflict("Workspace changed; reload before retrying")
                self._states[self.workspace_id] = copy.deepcopy(candidate)
        else:
            if self._etag is None:
                raise StorageConflict("Missing expected storage revision")
            try:
                response = s3.put_object(
                    Bucket=self.bucket, Key=self.state_key, Body=payload,
                    ContentType="application/json", IfMatch=self._etag,
                )
            except Exception as exc:
                if self._error_code(exc) in ("PreconditionFailed", "ConditionalRequestConflict"):
                    raise StorageConflict("Workspace changed; reload before retrying") from exc
                raise StorageError("Save outcome is unconfirmed; reload before retrying") from exc
            self._capture(response, candidate)
        self._loaded_version = candidate["version_seq"]
        state.clear()
        state.update(candidate)

    def append_audit_event(self, action: str, payload: dict[str, Any]) -> str:
        state = self.load_state(create=False)
        seal = self.add_audit_event(state, action, payload)
        self.save_state(state)
        return seal

    @staticmethod
    def add_audit_event(state: dict[str, Any], action: str, payload: dict[str, Any]) -> str:
        """Audit and business state commit together; a hash is not a WORM certificate."""
        seal = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
        state.setdefault("audit_events", []).append({
            "id": uuid.uuid4().hex, "action": action, "timestamp": datetime.now(UTC).isoformat(),
            "cryptographic_seal": seal, "payload": copy.deepcopy(payload),
        })
        return seal

    def increment_daily_counter(
        self, name: str, limit: int, day: str | None = None,
    ) -> tuple[bool | None, int]:
        """Reserve one unit of a shared daily budget with conditional writes.

        Returns (allowed, count). ``allowed`` is None when the budget could not be
        confirmed; callers must then treat the paid action as unavailable.
        """
        if not re.fullmatch(r"[a-z0-9-]{1,40}", name):
            raise ValueError("Invalid counter name")
        day = day or datetime.now(UTC).date().isoformat()
        key = f"demo/workspaces/_usage/{name}-{day}.json"
        s3 = self._get_s3()
        if s3 is None:
            with self._lock:
                count = self._counters.get(key, 0)
                if count >= limit:
                    return False, count
                self._counters[key] = count + 1
                return True, count + 1
        for _attempt in range(4):
            try:
                try:
                    response = s3.get_object(Bucket=self.bucket, Key=key)
                except Exception as exc:
                    # Without ListBucket a missing key reads as AccessDenied; only an atomic
                    # create proves absence. A collision means it exists: read it again.
                    if self._error_code(exc) not in ("NoSuchKey", "AccessDenied"):
                        raise
                    try:
                        s3.put_object(Bucket=self.bucket, Key=key, ContentType="application/json",
                                      Body=json.dumps({"count": 1, "day": day}).encode("utf-8"),
                                      IfNoneMatch="*")
                    except Exception as create_exc:
                        if self._error_code(create_exc) in (
                            "PreconditionFailed", "ConditionalRequestConflict",
                        ):
                            continue
                        raise
                    return True, 1
                stored = json.loads(response["Body"].read(4096).decode("utf-8"))
                count = int(stored.get("count", 0))
                if count >= limit:
                    return False, count
                s3.put_object(Bucket=self.bucket, Key=key, ContentType="application/json",
                              Body=json.dumps({"count": count + 1, "day": day}).encode("utf-8"),
                              IfMatch=response["ETag"])
                return True, count + 1
            except Exception as exc:
                if self._error_code(exc) in ("PreconditionFailed", "ConditionalRequestConflict"):
                    continue
                return None, 0
        return None, 0

    def get_outbox_status(self) -> dict[str, Any]:
        state = self.load_state(create=False)
        dispatches = state.get("dispatch_records", [])
        return {
            "outbox_prefix": self.outbox_prefix, "total_outbox_records": len(dispatches),
            "delivered_count": 0, "records": dispatches,
            "ses_telemetry": {"status": "disabled", "mode": "simulated"},
        }

    def record_claim_dispatch(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise PermissionError("Use an exact prepared claim and its one-use approval")

    def save_outbox_email(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise PermissionError("Direct outbox writes cannot authorize transport")

    def record_ingest_batch(self, invoices_count: int = 14) -> dict[str, Any]:
        raise NotImplementedError("Receipt sync is not connected; no invoices were imported")

    def reset_state(self) -> dict[str, Any]:
        state = self.load_state(create=False)
        fresh = fresh_demo_state()
        # Preserve receipts, consumed tokens, revisions and quotas across a demo reset.
        for key in ("version_seq", "drafts", "dispatch_records", "audit_events", "action_count",
                    "agent_calls", "agent_briefings", "agent_extracts"):
            fresh[key] = copy.deepcopy(state.get(key, fresh.get(key)))
        fresh["cases"] = copy.deepcopy(state.get("cases", []))
        preserve_intake(state, fresh)
        fresh["generation"] = state.get("generation", 0) + 1
        fresh["reset_seal"] = self.add_audit_event(fresh, "demo_reset", {"simulated": True})
        self.save_state(fresh)
        return fresh


SAMPLE_TRIAL_DAYS_LEFT = 3


def fresh_demo_state(today: date | None = None) -> dict[str, Any]:
    state = copy.deepcopy(DEFAULT_HOUSEHOLD_STATE)
    # The sample trial always ends a few days after the copy opens, so the agent review and
    # Home both show it as a decision on any day, not only in the week of a fixed date.
    trial_end = (today or date.today()) + timedelta(days=SAMPLE_TRIAL_DAYS_LEFT)
    for sub in state["subscriptions"]:
        if sub["id"] == "sub-001":
            sub["trial_end_date"] = trial_end.isoformat()
    # Historical seed text is an illustration, not a provider delivery receipt.
    state["dispatch_records"] = []
    state.update(
        mode="simulated", drafts={}, cases=[], audit_events=[], action_count=0, generation=0,
        agent_calls=0, agent_briefings=[], agent_extracts=0,
    )
    state["summary"] = summary_from_records(state)
    return state


def preserve_intake(state: dict[str, Any], fresh: dict[str, Any]) -> None:
    """Reset cannot detach imported evidence, replay records or synthetic requests."""
    for key in ("outflows", "subscriptions", "saved_receipts", "intakes", "intake_provenance"):
        if key in state:
            fresh[key] = copy.deepcopy(state[key])
    # Sample appliances return to their sample facts; the household's own appliances stay.
    sample_ids = {a["id"] for a in fresh["appliances"]}
    fresh["appliances"].extend(copy.deepcopy(a) for a in state.get("appliances", [])
                               if a.get("id") not in sample_ids)
