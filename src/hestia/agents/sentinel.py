"""Household Financial Sentinel Agent coordinator.

Synthesizes warranty rights, subscription audits, and completeness checks into
an actionable weekly household digest and claim preparation action plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from hestia.domain.completeness import (
    HouseholdGap,
    audit_missing_receipts,
    audit_utility_spike,
)
from hestia.domain.subscriptions import (
    SubscriptionAuditResult,
    SubscriptionCharge,
    audit_price_creep,
    audit_trial_expiry,
    detect_duplicates,
)
from hestia.domain.warranties import (
    ApplianceWarranty,
    RepairReimbursementCheck,
    WarrantyStatus,
    evaluate_repair_claim,
)


@dataclass(frozen=True)
class HouseholdAuditDigest:
    """Consolidated weekly or monthly financial health report for the home."""

    warranties_expiring_soon: tuple[ApplianceWarranty, ...]
    reimbursable_repairs: tuple[RepairReimbursementCheck, ...]
    subscription_anomalies: tuple[SubscriptionAuditResult, ...]
    missing_receipt_gaps: tuple[HouseholdGap, ...]
    utility_spikes: tuple[HouseholdGap, ...]
    total_reimbursable_cents: int
    monthly_subscription_waste_cents: int

    @property
    def has_urgent_actions(self) -> bool:
        return (
            len(self.reimbursable_repairs) > 0
            or len(self.warranties_expiring_soon) > 0
            or len(self.subscription_anomalies) > 0
        )


def run_household_audit(
    warranties: list[ApplianceWarranty],
    repairs: list[tuple[ApplianceWarranty, date, int]],  # (warranty, repair_date, amount_cents)
    subscriptions: list[SubscriptionCharge],
    price_histories: list[tuple[str, int, int]],  # (service, old_cents, new_cents)
    bank_transactions: list[dict[str, object]],
    saved_receipts: set[str],
    utility_bills: list[tuple[str, int, int, date]],  # (name, baseline, current, date)
    current_date: date,
) -> HouseholdAuditDigest:
    """Execute a comprehensive scan across all household financial risk areas."""
    # 1. Warranty inspection
    expiring_soon: list[ApplianceWarranty] = []
    for w in warranties:
        status, _ = w.check_status(current_date)
        if status == WarrantyStatus.EXPIRING_SOON:
            expiring_soon.append(w)

    reimbursable: list[RepairReimbursementCheck] = []
    for w, r_date, amount in repairs:
        check = evaluate_repair_claim(w, r_date, amount)
        if check.is_covered:
            reimbursable.append(check)

    # 2. Subscription inspection
    sub_anomalies: list[SubscriptionAuditResult] = []
    for charge in subscriptions:
        trial_warn = audit_trial_expiry(charge, current_date)
        if trial_warn is not None:
            sub_anomalies.append(trial_warn)

    for name, old_c, new_c in price_histories:
        creep = audit_price_creep(name, old_c, new_c)
        if creep is not None:
            sub_anomalies.append(creep)

    sub_anomalies.extend(detect_duplicates(subscriptions))

    # 3. Completeness & utility inspection
    missing_receipts = audit_missing_receipts(bank_transactions, saved_receipts)
    utility_spikes: list[HouseholdGap] = []
    for name, baseline, current, b_date in utility_bills:
        spike = audit_utility_spike(name, baseline, current, b_date)
        if spike is not None:
            utility_spikes.append(spike)

    total_reimbursable = sum(r.claimable_amount_cents for r in reimbursable)
    monthly_waste = sum(a.monthly_impact_cents for a in sub_anomalies)

    return HouseholdAuditDigest(
        warranties_expiring_soon=tuple(expiring_soon),
        reimbursable_repairs=tuple(reimbursable),
        subscription_anomalies=tuple(sub_anomalies),
        missing_receipt_gaps=tuple(missing_receipts),
        utility_spikes=tuple(utility_spikes),
        total_reimbursable_cents=total_reimbursable,
        monthly_subscription_waste_cents=monthly_waste,
    )
