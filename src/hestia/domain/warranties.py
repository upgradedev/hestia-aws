"""Warranty timing and evidence screening, never a determination of legal entitlement.

Statutory seller liability and commercial guarantor obligations are separate grounds.
Calendar arithmetic does not establish conformity, applicable national law or a remedy.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

LEGAL_SOURCES_CHECKED_ON = "2026-09-12"
LEGAL_SOURCES = (
    "https://eur-lex.europa.eu/eli/dir/2019/771/oj/eng",
    "https://eur-lex.europa.eu/eli/dir/2024/1799/oj/eng",
    "https://europa.eu/youreurope/citizens/consumers/shopping/guarantees-returns/index_en.htm",
    "https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng",
    "https://consumer-redress.ec.europa.eu/index_en",
)
REDRESS_GUIDANCE = (
    "Ask the seller to review the evidence and available remedy first. For unresolved disputes, "
    "consult the Commission Consumer Redress Portal for relevant ADR bodies and check their "
    "jurisdiction and participation rules: https://consumer-redress.ec.europa.eu/index_en. "
    "The EU ODR platform closed on 20 July 2025 and no longer accepts complaints."
)
REMEDY_LIMITATIONS = (
    "Review applicable national law, seller/consumer status, conformity evidence, notification "
    "and the seller's opportunity to provide a remedy. Repair or replacement and any price "
    "reduction, termination or reimbursement depend on their legal conditions. A paid repair "
    "invoice does not establish entitlement to repayment. Check national periods, second-hand "
    "and digital-goods rules, and repair extensions, including Directive (EU) 2024/1799 and "
    "its contract-date transitional rules. No automatic extension or denial is calculated here."
)
# Amounts named *_cents use hundredths. Other currency scales require a separate contract.
CENT_CURRENCIES = frozenset({"EUR", "GBP", "USD"})


def _date_fact(value: date | None, name: str) -> None:
    if value is not None and type(value) is not date:
        raise ValueError(f"{name} must be a calendar date or None.")


def _add_months(start: date, months: int) -> date:
    year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
    if not 1 <= year <= 9999:
        raise ValueError("Warranty reminder date is outside the supported calendar.")
    month += 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def format_repair_amount(amount_cents: int, currency: str | None) -> str:
    """Never invent a currency or apply a two-decimal scale to an unsupported currency."""
    if type(amount_cents) is not int or amount_cents <= 0:
        raise ValueError("Repair amount must be positive integer minor units.")
    if currency in CENT_CURRENCIES:
        return f"{currency} {amount_cents // 100}.{amount_cents % 100:02d}"
    return f"{amount_cents} minor units (currency/scale requires review)"


class WarrantyStatus(StrEnum):
    ACTIVE = "active"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"


@dataclass(frozen=True)
class ApplianceWarranty:
    """Registered household appliance or electronic product warranty."""

    item_name: str
    serial_number: str
    purchase_date: date | None
    statutory_months: int = 24  # Screening input, not a validated national-law period
    commercial_months: int = 24  # Legacy default is not evidence of commercial terms
    receipt_reference: str = ""
    delivery_date: date | None = None
    jurisdiction: str | None = None
    seller_is_business: bool | None = None
    consumer_purchase: bool | None = None
    defect_date: date | None = None
    commercial_start_date: date | None = None
    commercial_terms_reference: str = ""
    currency: str | None = None

    def __post_init__(self) -> None:
        for name in ("purchase_date", "delivery_date", "defect_date", "commercial_start_date"):
            _date_fact(getattr(self, name), name)
        for name in ("statutory_months", "commercial_months"):
            value = getattr(self, name)
            if type(value) is not int or not 0 <= value <= 1200:
                raise ValueError(f"{name} must be an integer between 0 and 1200.")
        for name in ("seller_is_business", "consumer_purchase"):
            value = getattr(self, name)
            if value is not None and type(value) is not bool:
                raise ValueError(f"{name} must be a boolean or None.")
        for name in ("jurisdiction", "currency"):
            value = getattr(self, name)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise ValueError(f"{name} must be nonempty text or None.")
        for name in ("item_name", "serial_number", "receipt_reference", "commercial_terms_reference"):
            if not isinstance(getattr(self, name), str):
                raise ValueError(f"{name} must be text.")

    @property
    def total_months(self) -> int:
        """Legacy reminder span only. Never use this maximum as a legal ground."""
        return max(self.statutory_months, self.commercial_months)

    def get_statutory_expiry_date(self) -> date | None:
        """Delivery-based screening boundary, subject to national rules and extensions."""
        if self.delivery_date is None or not self.statutory_months:
            return None
        return _add_months(self.delivery_date, self.statutory_months)

    def get_commercial_expiry_date(self) -> date | None:
        """Separate recorded commercial boundary; terms still need substantive review."""
        if (self.commercial_start_date is None or not self.commercial_months
                or not self.commercial_terms_reference.strip()):
            return None
        return _add_months(self.commercial_start_date, self.commercial_months)

    def get_expiry_date(self) -> date:
        """Deprecated purchase-based reminder for old callers, not a legal expiry date."""
        if self.purchase_date is None:
            raise ValueError("A purchase date is required for the legacy reminder.")
        return _add_months(self.purchase_date, self.total_months)

    def check_status(self, current_date: date) -> tuple[WarrantyStatus, int]:
        """Return legacy reminder status only; this does not establish coverage."""
        expiry = self.get_expiry_date()
        days_left = (expiry - current_date).days
        if days_left < 0:
            return WarrantyStatus.EXPIRED, days_left
        if days_left <= 60:
            return WarrantyStatus.EXPIRING_SOON, days_left
        return WarrantyStatus.ACTIVE, days_left


@dataclass(frozen=True)
class RepairReimbursementCheck:
    """Evidence review result. Legacy false/zero mean undetermined, not rights denied."""

    item_name: str
    repair_date: date | None
    repair_amount_cents: int
    is_covered: bool
    reason: str
    claimable_amount_cents: int
    review_required: bool = True
    entitlement_status: str = "not_determined"
    statutory_expiry_date: date | None = None
    commercial_expiry_date: date | None = None
    statutory_timing: str = "unknown"
    commercial_timing: str = "unknown"
    missing_facts: tuple[str, ...] = ()
    review_reasons: tuple[str, ...] = ()
    currency: str | None = None

    def to_public_dict(self) -> dict[str, object]:
        """JSON-safe additive contract for exact-content previews and downstream UI."""
        return {
            "review_required": self.review_required, "entitlement_status": self.entitlement_status,
            "is_covered": self.is_covered, "claimable_amount_cents": self.claimable_amount_cents,
            "recorded_repair_amount_cents": self.repair_amount_cents, "currency": self.currency,
            "statutory_expiry_date": (
                self.statutory_expiry_date.isoformat() if self.statutory_expiry_date else None
            ),
            "commercial_expiry_date": (
                self.commercial_expiry_date.isoformat() if self.commercial_expiry_date else None
            ),
            "statutory_timing": self.statutory_timing, "commercial_timing": self.commercial_timing,
            "statutory_event_basis": "defect_date", "commercial_event_basis": "repair_date",
            "missing_facts": list(self.missing_facts), "review_reasons": list(self.review_reasons),
            "reason": self.reason, "limitations": REMEDY_LIMITATIONS,
            "redress_guidance": REDRESS_GUIDANCE, "sources": list(LEGAL_SOURCES),
            "sources_checked_on": LEGAL_SOURCES_CHECKED_ON,
        }


def _timing(event: date | None, start: date | None, end: date | None) -> str:
    if event is None or start is None or end is None:
        return "unknown"
    if event < start:
        return "before_start"
    return "within_recorded_window" if event <= end else "after_recorded_window"


def evaluate_repair_claim(
    warranty: ApplianceWarranty,
    repair_date: date | None,
    repair_amount_cents: int,
) -> RepairReimbursementCheck:
    """Screen recorded facts without deriving entitlement or a refund from dates."""
    _date_fact(repair_date, "repair_date")
    format_repair_amount(repair_amount_cents, warranty.currency)
    missing = [name for name in (
        "purchase_date", "delivery_date", "jurisdiction", "seller_is_business",
        "consumer_purchase", "defect_date", "currency",
    ) if getattr(warranty, name) is None]
    if repair_date is None:
        missing.append("repair_date")
    if not warranty.receipt_reference.strip():
        missing.append("receipt_reference")
    if warranty.commercial_months:
        if warranty.commercial_start_date is None:
            missing.append("commercial_start_date")
        if not warranty.commercial_terms_reference.strip():
            missing.append("commercial_terms_reference")
    reasons = ["national_law_and_remedy_review_required", "conformity_evidence_review_required",
               "seller_notification_and_repair_authorization_review_required",
               "repair_extensions_and_contract_transition_review_required"]
    if warranty.jurisdiction is None:
        reasons.append("jurisdiction_unknown")
    if warranty.seller_is_business is False or warranty.consumer_purchase is False:
        reasons.append("consumer_sale_scope_not_established")
    if warranty.currency not in CENT_CURRENCIES:
        reasons.append("currency_or_scale_unverified")
    if warranty.commercial_months:
        reasons.append("commercial_terms_and_guarantor_review_required")
    if not warranty.statutory_months:
        reasons.append("statutory_period_not_recorded")
    for earlier, later in (
        (warranty.purchase_date, warranty.delivery_date),
        (warranty.purchase_date, repair_date),
        (warranty.delivery_date, warranty.defect_date),
        (warranty.delivery_date, repair_date),
        (warranty.defect_date, repair_date),
    ):
        if earlier is not None and later is not None and earlier > later:
            reasons.append("inconsistent_dates")
            break
    statutory_end = warranty.get_statutory_expiry_date()
    commercial_end = warranty.get_commercial_expiry_date()
    return RepairReimbursementCheck(
        item_name=warranty.item_name, repair_date=repair_date,
        repair_amount_cents=repair_amount_cents, is_covered=False, claimable_amount_cents=0,
        reason=("Review required. Statutory and commercial grounds are separate. Recorded dates "
                "neither establish nor exclude entitlement; no reimbursement amount is determined."),
        statutory_expiry_date=statutory_end, commercial_expiry_date=commercial_end,
        statutory_timing=_timing(warranty.defect_date, warranty.delivery_date, statutory_end),
        commercial_timing=_timing(repair_date, warranty.commercial_start_date, commercial_end),
        missing_facts=tuple(missing), review_reasons=tuple(reasons), currency=warranty.currency,
    )
