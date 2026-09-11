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
    ApplianceWarranty,
    WarrantyStatus,
    evaluate_repair_claim,
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
    """Evaluate warranty validity and repair claim coverage for an appliance."""
    status, days = warranty.check_status(current_date)
    expiry = warranty.get_expiry_date()

    if status == WarrantyStatus.EXPIRED:
        msg = f"{warranty.item_name} warranty EXPIRED on {expiry} ({abs(days)} days ago)."
    elif status == WarrantyStatus.EXPIRING_SOON:
        msg = f"{warranty.item_name} warranty EXPIRING SOON on {expiry} ({days} days remaining)."
    else:
        msg = f"{warranty.item_name} warranty ACTIVE until {expiry} ({days} days remaining)."

    if repair_date is not None and repair_amount_cents > 0:
        claim = evaluate_repair_claim(warranty, repair_date, repair_amount_cents)
        if claim.is_covered:
            msg += (
                f"\nREIMBURSABLE: Repair on {repair_date} of €{repair_amount_cents/100:.2f} "
                f"falls within coverage. Claimable: €{claim.claimable_amount_cents/100:.2f}."
            )
        else:
            msg += f"\nNOT COVERED: Repair on {repair_date} is outside warranty window."

    return msg


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
    repair_date: date,
    repair_amount_cents: int,
    issue_description: str,
    homeowner_name: str,
) -> str:
    """Draft a legally grounded reimbursement request under EU Directive 2019/771/EU."""
    claim = evaluate_repair_claim(warranty, repair_date, repair_amount_cents)
    if not claim.is_covered:
        return (
            f"Cannot draft reimbursement letter: Repair date {repair_date} "
            f"falls outside active warranty window (expires {warranty.get_expiry_date()})."
        )

    amount_fmt = f"€{repair_amount_cents/100:.2f}"
    expiry_fmt = str(warranty.get_expiry_date())
    receipt_ref = warranty.receipt_reference or "On File"

    lines = [
        f"Subject: Formal Reimbursement Request: Statutory Guarantee ({warranty.item_name})",
        "",
        "Dear Customer Relations / Service Department,",
        "",
        (
            f"I am writing to formally request reimbursement of repair costs incurred for "
            f"my {warranty.item_name} (Serial Number: {warranty.serial_number}), "
            f"purchased on {warranty.purchase_date}."
        ),
        "",
        (
            f"On {repair_date}, the unit suffered a non-conformity failure ({issue_description}), "
            f"requiring repair services totaling {amount_fmt}."
        ),
        "",
        (
            "Under the mandatory provisions of EU Directive 2019/771/EU (transposed into national "
            "consumer sales law), consumers are entitled to repair or replacement free of charge "
            "for lack of conformity appearing within the 2-year statutory period."
        ),
        "",
        (
            f"Because this fault manifested within the statutory conformity window (active through "
            f"{expiry_fmt}), the costs of repair cannot be borne by the consumer."
        ),
        "",
        "Attached:",
        f"1. Proof of purchase / invoice ({receipt_ref}).",
        f"2. Itemized repair technician receipt for {amount_fmt}.",
        "",
        "Please confirm receipt and arrangement for reimbursement within 14 calendar days.",
        "",
        "Sincerely,",
        homeowner_name,
    ]
    return "\n".join(lines)

