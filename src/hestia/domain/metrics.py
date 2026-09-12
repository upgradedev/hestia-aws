"""Recorded amounts with explicit provenance; no inferred recovery or cancellation."""
from __future__ import annotations

from typing import Any


def summary_from_records(state: dict[str, Any]) -> dict[str, Any]:
    appliances = state["appliances"]
    subscriptions = [s for s in state["subscriptions"] if s.get("status") != "cancelled"]
    gaps = [o for o in state["outflows"] if not o["has_receipt"] and o["amount_cents"] >= 5000]
    repairs = [a for a in appliances if a.get("has_repair_claim")
               and a.get("claim_status") not in ("reimbursed", "settled")]
    amount = sum(a.get("repair_amount_cents") or 0 for a in repairs)
    increases = sum(max(0, s["monthly_cents"] - s.get("previous_monthly_cents", s["monthly_cents"]))
                    for s in subscriptions)
    return {
        # Legacy names retained as aliases for documented amounts, never earned money.
        "unclaimed_recovery_cents": amount,
        "documented_repair_cost_cents": None if any(a.get("repair_amount_cents") is None
                                                    for a in repairs) else amount,
        "real_recovered_cents": 0,
        "protected_assets_cents": sum(a["purchase_price_cents"] for a in appliances),
        "protected_items_count": len(appliances),
        "monthly_sub_leakage_cents": increases,
        "monthly_recurring_cents": sum(s["monthly_cents"] for s in subscriptions),
        "missing_receipt_cents": sum(o["amount_cents"] for o in gaps),
        "active_anomalies_count": len(repairs) + len(gaps)
        + sum(s["is_trial"] or s.get("status") == "price_creep" for s in subscriptions)
        + sum(u.get("status") == "spike_alert" for u in state.get("utility_bills", [])),
        "source": "canonical-records", "observed_at": state["last_updated"],
        "state_version": state["version_seq"], "mode": "synthetic",
    }
