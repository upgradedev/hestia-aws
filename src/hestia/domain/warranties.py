"""Appliance and consumer electronics warranty verification engine.

Enforces statutory consumer guarantees (e.g. EU Directive 2019/771/EU 2-year mandatory
conformity period) alongside commercial manufacturer guarantees. Matches repair charges
against active warranties to prevent out-of-pocket expenses.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class WarrantyStatus(StrEnum):
    ACTIVE = "active"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"


@dataclass(frozen=True)
class ApplianceWarranty:
    """Registered household appliance or electronic product warranty."""

    item_name: str
    serial_number: str
    purchase_date: date
    statutory_months: int = 24  # Standard 2-year statutory guarantee
    commercial_months: int = 24  # Additional manufacturer guarantee if applicable
    receipt_reference: str = ""

    @property
    def total_months(self) -> int:
        return max(self.statutory_months, self.commercial_months)

    def get_expiry_date(self) -> date:
        """Calculate exact expiration date."""
        year = self.purchase_date.year + (self.total_months // 12)
        month = self.purchase_date.month + (self.total_months % 12)
        if month > 12:
            year += 1
            month -= 12
        day = min(self.purchase_date.day, 28)
        return date(year, month, day)

    def check_status(self, current_date: date) -> tuple[WarrantyStatus, int]:
        """Return warranty status and days remaining (negative if expired)."""
        expiry = self.get_expiry_date()
        days_left = (expiry - current_date).days
        if days_left < 0:
            return WarrantyStatus.EXPIRED, days_left
        if days_left <= 60:
            return WarrantyStatus.EXPIRING_SOON, days_left
        return WarrantyStatus.ACTIVE, days_left


@dataclass(frozen=True)
class RepairReimbursementCheck:
    """Evaluates whether an out-of-pocket repair should be reimbursed by the manufacturer."""

    item_name: str
    repair_date: date
    repair_amount_cents: int
    is_covered: bool
    reason: str
    claimable_amount_cents: int


def evaluate_repair_claim(
    warranty: ApplianceWarranty,
    repair_date: date,
    repair_amount_cents: int,
) -> RepairReimbursementCheck:
    """Evaluate whether a repair invoice falls inside the active warranty window."""
    expiry = warranty.get_expiry_date()
    if warranty.purchase_date <= repair_date <= expiry:
        return RepairReimbursementCheck(
            item_name=warranty.item_name,
            repair_date=repair_date,
            repair_amount_cents=repair_amount_cents,
            is_covered=True,
            reason=(
                f"Repair on {repair_date} occurred within the active warranty period "
                f"(expires {expiry}). Reimbursable under statutory conformity guarantee."
            ),
            claimable_amount_cents=repair_amount_cents,
        )

    return RepairReimbursementCheck(
        item_name=warranty.item_name,
        repair_date=repair_date,
        repair_amount_cents=repair_amount_cents,
        is_covered=False,
        reason=f"Repair on {repair_date} occurred after warranty expired on {expiry}.",
        claimable_amount_cents=0,
    )
