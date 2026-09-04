"""Tests for Hestia subscription anomaly and leakage auditor."""

from datetime import date

from hestia.domain.subscriptions import (
    SubscriptionAnomaly,
    SubscriptionCharge,
    audit_price_creep,
    audit_trial_expiry,
    detect_duplicates,
)


def test_audit_price_creep():
    result = audit_price_creep(
        service_name="Cloud Backup Pro",
        previous_cents=999,
        current_cents=1399,
    )
    assert result is not None
    assert result.anomaly == SubscriptionAnomaly.PRICE_CREEP
    assert result.monthly_impact_cents == 400
    assert "+40.0% increase" in result.evidence


def test_audit_no_price_creep():
    result = audit_price_creep(
        service_name="Flat Rate Service",
        previous_cents=1000,
        current_cents=1000,
    )
    assert result is None


def test_audit_trial_expiry_warning():
    trial = SubscriptionCharge(
        service_name="Gym App Free Trial",
        category="fitness",
        monthly_cents=2999,
        last_billed=date(2026, 8, 25),
        is_trial=True,
        trial_end_date=date(2026, 9, 8),
    )
    # Today is 2026-09-04 -> 4 days left in trial
    result = audit_trial_expiry(trial, current_date=date(2026, 9, 4))
    assert result is not None
    assert result.anomaly == SubscriptionAnomaly.TRIAL_EXPIRING
    assert result.monthly_impact_cents == 2999
    assert "expires in 4 days" in result.evidence


def test_detect_duplicate_streaming_subscriptions():
    charges = [
        SubscriptionCharge(
            service_name="MovieStream Plus",
            category="streaming",
            monthly_cents=1499,
            last_billed=date(2026, 9, 1),
        ),
        SubscriptionCharge(
            service_name="CinemaWorld Unlimited",
            category="streaming",
            monthly_cents=1199,
            last_billed=date(2026, 9, 2),
        ),
    ]
    dups = detect_duplicates(charges)
    assert len(dups) == 1
    assert dups[0].anomaly == SubscriptionAnomaly.DUPLICATE_SERVICE
    assert "Multiple active 'streaming' subscriptions detected" in dups[0].evidence


def test_audit_trial_expiry_distant_or_non_trial():
    trial_distant = SubscriptionCharge(
        service_name="Cloud SaaS",
        category="software",
        monthly_cents=1000,
        last_billed=date(2026, 8, 1),
        is_trial=True,
        trial_end_date=date(2026, 9, 30),  # 26 days away
    )
    assert audit_trial_expiry(trial_distant, date(2026, 9, 4)) is None

    non_trial = SubscriptionCharge(
        service_name="Standard Sub",
        category="software",
        monthly_cents=1000,
        last_billed=date(2026, 8, 1),
        is_trial=False,
    )
    assert audit_trial_expiry(non_trial, date(2026, 9, 4)) is None

