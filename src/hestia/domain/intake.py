"""Deterministic import plans. IDs and reviewed facts, never merchant heuristics."""
from __future__ import annotations

import copy
import re
from datetime import date
from typing import Any

from hestia.domain.ocr import validate_records


def _text(row: dict[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ValueError(f"Provide {key}")
    return value


def _id(row: dict[str, Any], key: str) -> str:
    value = _text(row, key)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", value):
        raise ValueError(f"Invalid stable {key}")
    return value


def _date(row: dict[str, Any], key: str) -> str:
    value = _text(row, key)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"Use YYYY-MM-DD for {key}")
    date.fromisoformat(value)
    return value


def _cents(row: dict[str, Any], key: str) -> int:
    value = row.get(key)
    if type(value) is not int or not 0 < value <= 10000000:
        raise ValueError(f"Provide positive integer {key}; unknown/zero amounts need review")
    return value


def plan_records(state: dict[str, Any], records: Any) -> list[dict[str, Any]]:
    records = validate_records(records)
    candidate = copy.deepcopy(state)
    results: list[dict[str, Any]] = []
    for index, row in enumerate(records):
        try:
            change = _plan_row(candidate, row)
            apply_changes(candidate, [change])
            results.append({"index": index, **change})
        except ValueError as exc:
            results.append({"index": index, "status": "error", "message": str(exc)})
    return results


def _plan_row(state: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    kind = row.get("kind")
    if kind in ("receipt", "transaction"):
        fields = {"kind", "transaction_id", "merchant", "amount_cents", "date"}
        fields |= {"receipt_id"} if kind == "receipt" else {"category"}
        if set(row) != fields:
            raise ValueError("Receipt/transaction fields are incomplete or unsupported")
        identity = _id(row, "transaction_id")
        facts = {"merchant": _text(row, "merchant"), "amount_cents": _cents(row, "amount_cents"),
                 "date": _date(row, "date")}
        existing = next((o for o in state["outflows"] if o["id"] == identity), None)
        if kind == "receipt":
            if existing is None:
                raise ValueError("Transaction ID not found; import its transaction first")
            if any(existing[k] != v for k, v in facts.items()):
                raise ValueError("Receipt facts differ from the selected transaction; correct them")
            receipt_id = _id(row, "receipt_id")
            if existing.get("has_receipt") and existing.get("receipt_id") != receipt_id:
                raise ValueError("Transaction already links another receipt")
            if receipt_id in state["saved_receipts"] and existing.get("receipt_id") != receipt_id:
                raise ValueError("Receipt ID already belongs to another record")
            after = {**existing, "has_receipt": True, "receipt_id": receipt_id,
                     "status": "manually_recorded"}
        else:
            after = {"id": identity, **facts, "category": _text(row, "category"),
                     "has_receipt": False, "receipt_id": None,
                     "status": "missing_receipt" if facts["amount_cents"] >= 5000
                     else "under_threshold"}
        collection = "outflows"
    elif kind == "subscription":
        required = {"kind", "subscription_id", "service_name", "category", "monthly_cents",
                    "last_billed", "is_trial"}
        if not required <= row.keys() or not row.keys() <= required | {
            "previous_monthly_cents", "trial_end_date",
        }:
            raise ValueError("Subscription fields are incomplete or unsupported")
        identity = _id(row, "subscription_id")
        if type(row["is_trial"]) is not bool:
            raise ValueError("is_trial must be boolean")
        after = {"id": identity, "service_name": _text(row, "service_name"),
                 "category": _text(row, "category"), "monthly_cents": _cents(row, "monthly_cents"),
                 "last_billed": _date(row, "last_billed"), "is_trial": row["is_trial"],
                 "trial_end_date": _date(row, "trial_end_date") if row["is_trial"] else None,
                 "status": "expiring_trial" if row["is_trial"] else "active"}
        if "previous_monthly_cents" in row:
            after["previous_monthly_cents"] = _cents(row, "previous_monthly_cents")
            if not row["is_trial"] and after["monthly_cents"] > after["previous_monthly_cents"]:
                after["status"] = "price_creep"
        if not row["is_trial"] and row.get("trial_end_date") is not None:
            raise ValueError("Non-trial subscription must not include a trial date")
        collection = "subscriptions"
        existing = next((s for s in state[collection] if s["id"] == identity), None)
    else:
        raise ValueError("Supported kinds are receipt, transaction and subscription")
    if kind != "receipt" and existing is not None:
        # Dedupe compares imported facts, retaining receipt links and action history.
        ignored = {"has_receipt", "receipt_id", "status"}
        if any(existing.get(k) != v for k, v in after.items() if k not in ignored):
            raise ValueError("Stable ID already has different facts; no overwrite was planned")
        after = copy.deepcopy(existing)
    duplicate = existing == after or (kind == "receipt" and existing.get("has_receipt")
                                      and existing.get("receipt_id") == after["receipt_id"])
    return {"status": "duplicate" if duplicate else "ready", "collection": collection,
            "record_id": identity, "before": copy.deepcopy(existing),
            "after": copy.deepcopy(existing if duplicate else after)}


def apply_changes(state: dict[str, Any], changes: list[dict[str, Any]]) -> None:
    for change in changes:
        if change["status"] != "ready":
            continue
        records = state[change["collection"]]
        current = next((r for r in records if r["id"] == change["record_id"]), None)
        if current != change["before"]:
            raise ValueError("Canonical facts changed; review again")
        if current is None:
            records.append(copy.deepcopy(change["after"]))
        else:
            current.clear()
            current.update(copy.deepcopy(change["after"]))
        receipt_id = change["after"].get("receipt_id")
        if receipt_id and receipt_id not in state["saved_receipts"]:
            state["saved_receipts"].append(receipt_id)
