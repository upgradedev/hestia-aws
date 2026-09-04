"""Household recurring subscription and zombie charge auditor.

Detects hidden financial leakage in family finances:
- Stealth price creeping (unannounced month-over-month price hikes).
- Free trial expiration warnings before non-refundable annual lock-in.
- Duplicate subscriptions across family members.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class SubscriptionAnomaly(StrEnum):
    PRICE_CREEP = "price_creep"
    TRIAL_EXPIRING = "trial_expiring"
    DUPLICATE_SERVICE = "duplicate_service"
    ZOMBIE_INACTIVE = "zombie_inactive"


@dataclass(frozen=True)
class SubscriptionCharge:
    """A recurring monthly or annual household subscription."""

    service_name: str
    category: str  # "streaming", "software", "fitness", "telecom"
    monthly_cents: int
    last_billed: date
    is_trial: bool = False
    trial_end_date: date | None = None
    frequency_months: int = 1


@dataclass(frozen=True)
class SubscriptionAuditResult:
    """Outcome of subscription audit with identified anomalies and savings."""

    service_name: str
    anomaly: SubscriptionAnomaly
    monthly_impact_cents: int
    evidence: str
    recommended_action: str


def audit_price_creep(
    service_name: str,
    previous_cents: int,
    current_cents: int,
) -> SubscriptionAuditResult | None:
    """Flag stealth month-over-month price increases."""
    if current_cents > previous_cents:
        delta = current_cents - previous_cents
        pct = (delta / previous_cents) * 100.0 if previous_cents > 0 else 0.0
        return SubscriptionAuditResult(
            service_name=service_name,
            anomaly=SubscriptionAnomaly.PRICE_CREEP,
            monthly_impact_cents=delta,
            evidence=(
                f"{service_name} increased from {previous_cents/100:.2f} "
                f"to {current_cents/100:.2f} (+{pct:.1f}% increase)."
            ),
            recommended_action="Review subscription tier or cancel if unused.",
        )
    return None


def audit_trial_expiry(
    charge: SubscriptionCharge,
    current_date: date,
) -> SubscriptionAuditResult | None:
    """Warn before a free trial converts to a paid subscription."""
    if charge.is_trial and charge.trial_end_date is not None:
        days_left = (charge.trial_end_date - current_date).days
        if 0 <= days_left <= 7:
            return SubscriptionAuditResult(
                service_name=charge.service_name,
                anomaly=SubscriptionAnomaly.TRIAL_EXPIRING,
                monthly_impact_cents=charge.monthly_cents,
                evidence=(
                    f"Free trial for {charge.service_name} expires in {days_left} days "
                    f"on {charge.trial_end_date}. Auto-renews at {charge.monthly_cents/100:.2f}/mo."
                ),
                recommended_action=(
                    "Cancel trial before renewal date if you do not wish to be billed."
                ),
            )
    return None


def detect_duplicates(
    charges: list[SubscriptionCharge],
) -> list[SubscriptionAuditResult]:
    """Identify redundant services in the same category."""
    results: list[SubscriptionAuditResult] = []
    seen: dict[str, SubscriptionCharge] = {}

    for c in charges:
        key = c.category.lower()
        if key in seen:
            prior = seen[key]
            results.append(
                SubscriptionAuditResult(
                    service_name=c.service_name,
                    anomaly=SubscriptionAnomaly.DUPLICATE_SERVICE,
                    monthly_impact_cents=c.monthly_cents,
                    evidence=(
                        f"Multiple active {c.category!r} subscriptions detected: "
                        f"{prior.service_name} and {c.service_name}."
                    ),
                    recommended_action=(
                        f"Consider consolidating {c.category} services to save "
                        f"{c.monthly_cents/100:.2f}/mo."
                    ),
                )
            )
        else:
            seen[key] = c

    return results
