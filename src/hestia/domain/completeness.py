"""Household financial completeness and missing documentation engine.

Adapted from enterprise completeness principles for everyday domestic life:
- Identifies major bank debits with no archived receipt or warranty proof.
- Reconciles utility bills against seasonal baselines to detect leakages or billing spikes.
- Prepares annual tax-deductible healthcare and education documentation bundles.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class HouseholdGapKind(StrEnum):
    MISSING_RECEIPT = "missing_receipt"
    UTILITY_SPIKE = "utility_spike"
    UNMATCHED_REIMBURSEMENT = "unmatched_reimbursement"


@dataclass(frozen=True)
class HouseholdGap:
    """An unbacked expense, billing anomaly, or missing proof."""

    kind: HouseholdGapKind
    merchant: str
    amount_cents: int
    date_observed: date
    evidence: str
    recommendation: str


@dataclass(frozen=True)
class HouseholdCompletenessReport:
    """Summary of household record completeness and potential recovery."""

    gaps: tuple[HouseholdGap, ...]
    total_unbacked_cents: int
    potential_savings_cents: int

    @property
    def is_complete(self) -> bool:
        return len(self.gaps) == 0


def audit_missing_receipts(
    bank_transactions: list[dict[str, object]],
    saved_receipt_merchants: set[str],
    min_amount_cents: int = 5000,  # Focus on items > 50 EUR
) -> list[HouseholdGap]:
    """Find significant bank debits that lack a digital receipt or warranty proof."""
    gaps: list[HouseholdGap] = []
    for tx in bank_transactions:
        merchant = str(tx.get("merchant", "unknown"))
        cents = int(tx.get("amount_cents", 0))
        tx_date = tx.get("date")
        if not isinstance(tx_date, date):
            tx_date = date.today()

        saved_merchants_lower = {m.lower() for m in saved_receipt_merchants}
        if merchant.lower() not in saved_merchants_lower and cents >= min_amount_cents:
            gaps.append(
                HouseholdGap(
                    kind=HouseholdGapKind.MISSING_RECEIPT,
                    merchant=merchant,
                    amount_cents=cents,
                    date_observed=tx_date,
                    evidence=(
                        f"Major expense of {cents/100:.2f} at {merchant} "
                        "has no saved receipt or warranty slip."
                    ),
                    recommendation=(
                        "Photograph or upload receipt to protect warranty "
                        "and insurance eligibility."
                    ),
                )
            )
    return gaps


def audit_utility_spike(
    utility_name: str,
    baseline_cents: int,
    current_bill_cents: int,
    bill_date: date,
    threshold_pct: float = 30.0,
) -> HouseholdGap | None:
    """Flag sudden abnormal spikes in household utility charges (water, electric, gas)."""
    if baseline_cents > 0 and current_bill_cents > baseline_cents:
        increase_pct = ((current_bill_cents - baseline_cents) / baseline_cents) * 100.0
        if increase_pct >= threshold_pct:
            excess_cents = current_bill_cents - baseline_cents
            return HouseholdGap(
                kind=HouseholdGapKind.UTILITY_SPIKE,
                merchant=utility_name,
                amount_cents=excess_cents,
                date_observed=bill_date,
                evidence=(
                    f"{utility_name} bill jumped to {current_bill_cents/100:.2f} "
                    f"(+{increase_pct:.1f}% above {baseline_cents/100:.2f} baseline)."
                ),
                recommendation=(
                    "Inspect for water pipe leaks, faulty appliances, "
                    "or billing meter read error."
                ),
            )
    return None
