"""Bounded tool functions for the Hestia household sentinel agents.

Every tool provides deterministic, read-only inquiries into household financial state,
warranties, and subscriptions. The only draft operation produces an uncommitted proposal
requiring human-in-the-loop Return-of-Control before dispatch.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from hestia.domain.completeness import audit_missing_receipts, audit_utility_spike
from hestia.domain.subscriptions import (
    SubscriptionCharge,
    audit_price_creep,
    audit_trial_expiry,
    detect_duplicates,
)
from hestia.domain.warranties import (
    REDRESS_GUIDANCE,
    REMEDY_LIMITATIONS,
    ApplianceWarranty,
    evaluate_repair_claim,
    format_repair_amount,
)

try:
    from strands import tool as strands_tool
except ImportError:  # pragma: no cover
    def strands_tool(func: Any = None, **kwargs: Any) -> Any:
        if func is None:
            return lambda f: f
        return func


@strands_tool
def check_appliance_warranty_tool(
    warranty: ApplianceWarranty,
    current_date: date,
    repair_date: date | None = None,
    repair_amount_cents: int = 0,
) -> str:
    """Show separate recorded timing and missing evidence, never warranty entitlement."""
    lines = [f"{warranty.item_name}: REVIEW REQUIRED. No legal entitlement determined."]
    for ground, expiry in (
        ("Statutory delivery-based screening", warranty.get_statutory_expiry_date()),
        ("Commercial terms-based screening", warranty.get_commercial_expiry_date()),
    ):
        if expiry is None:
            lines.append(f"{ground}: unknown; start date, period or terms not recorded.")
        else:
            days = (expiry - current_date).days
            lines.append(f"{ground}: boundary {expiry}, {days} days from review date.")
    if warranty.purchase_date is not None:
        lines.append(
            f"Legacy purchase-based reminder: {warranty.get_expiry_date()}. "
            "This combined reminder is not a statutory or commercial entitlement."
        )
    if repair_amount_cents != 0:
        claim = evaluate_repair_claim(warranty, repair_date, repair_amount_cents)
        lines.extend([
            f"Recorded repair cost: {format_repair_amount(repair_amount_cents, warranty.currency)}.",
            claim.reason,
            "Missing facts: " + (", ".join(claim.missing_facts) or "none in the timing record"),
            "Review flags: " + ", ".join(claim.review_reasons),
        ])
    elif repair_date is not None:
        lines.append(f"Recorded repair date: {repair_date}; positive repair amount not provided.")
    lines.append(REMEDY_LIMITATIONS)
    return "\n".join(lines)


@strands_tool
def audit_subscriptions_tool(
    charges: list[SubscriptionCharge],
    current_date: date,
    price_histories: list[tuple[str, int, int]] | None = None,
) -> str:
    """Inspect active recurring subscriptions for price creep, trial expirations, and duplicates."""
    lines: list[str] = []

    # 1. Trial expiry
    for c in charges:
        warn = audit_trial_expiry(c, current_date)
        if warn is not None:
            lines.append(f"[TRIAL ALERT] {warn.evidence} Action: {warn.recommended_action}")

    # 2. Price creep
    if price_histories:
        for name, old_c, new_c in price_histories:
            creep = audit_price_creep(name, old_c, new_c)
            if creep is not None:
                lines.append(f"[PRICE HIKE] {creep.evidence}")

    # 3. Duplicates
    dups = detect_duplicates(charges)
    for d in dups:
        lines.append(f"[DUPLICATE] {d.evidence} Recommendation: {d.recommended_action}")

    if not lines:
        return "All subscriptions are operating within normal parameters. No leakage detected."

    return "\n".join(lines)


@strands_tool
def check_completeness_tool(
    bank_transactions: list[dict[str, object]],
    saved_receipt_merchants: set[str],
    utility_bills: list[tuple[str, int, int, date]] | None = None,
) -> str:
    """Audit unbacked household debit items and abnormal utility spikes."""
    lines: list[str] = []

    missing = audit_missing_receipts(bank_transactions, saved_receipt_merchants)
    for m in missing:
        lines.append(f"[MISSING RECEIPT] {m.evidence} Recommendation: {m.recommendation}")

    if utility_bills:
        for name, base, curr, b_date in utility_bills:
            spike = audit_utility_spike(name, base, curr, b_date)
            if spike is not None:
                lines.append(f"[UTILITY SPIKE] {spike.evidence} Action: {spike.recommendation}")

    if not lines:
        return "Household accounts fully reconciled. No unbacked expenses or utility surges."

    return "\n".join(lines)


def draft_statutory_claim_letter(
    warranty: ApplianceWarranty,
    repair_date: date | None,
    repair_amount_cents: int,
    issue_description: str,
    homeowner_name: str,
) -> str:
    """Prepare an evidence-bound review request; caller must obtain exact-content approval."""
    claim = evaluate_repair_claim(warranty, repair_date, repair_amount_cents)
    lines = [
        f"Subject: Repair evidence review request ({warranty.item_name})",
        "",
        "Dear Customer Relations / Service Department,",
        "",
        f"Please review the available remedy for {warranty.item_name}.",
        f"Recorded serial number: {warranty.serial_number or 'not provided'}.",
        f"Recorded purchase date: {warranty.purchase_date or 'not provided'}.",
        f"Recorded delivery date: {warranty.delivery_date or 'not provided'}.",
        f"Recorded jurisdiction: {warranty.jurisdiction or 'not provided'} (not verified).",
        f"Recorded defect date: {warranty.defect_date or 'not provided'}.",
        f"Recorded repair date: {repair_date or 'not provided'}.",
        f"Reported issue (household statement, not verified): {issue_description}.",
        f"Recorded repair cost: {format_repair_amount(repair_amount_cents, warranty.currency)}.",
        f"Receipt reference: {warranty.receipt_reference or 'not provided'} "
        "(reference only; attachment and contents not verified).",
        "",
        claim.reason,
        "Statutory delivery-based screening boundary: "
        f"{claim.statutory_expiry_date or 'unknown'}; defect timing: {claim.statutory_timing}.",
        f"Commercial screening boundary: {claim.commercial_expiry_date or 'unknown'}; "
        f"repair timing: {claim.commercial_timing}.",
        "Missing facts: " + (", ".join(claim.missing_facts) or "none in the timing record") + ".",
        "Review flags: " + ", ".join(claim.review_reasons) + ".",
        "",
        "General reference, subject to applicability: Directive (EU) 2019/771, Articles 10-17. "
        "Statutory seller liability and commercial guarantor terms require separate review.",
        REMEDY_LIMITATIONS,
        "",
        "Please explain the proposed remedy and any further evidence needed. "
        "No statutory response deadline is asserted by this draft.",
        REDRESS_GUIDANCE,
        "",
        "Sincerely,",
        homeowner_name,
    ]
    return "\n".join(lines)

