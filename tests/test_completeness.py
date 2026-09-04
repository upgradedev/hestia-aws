"""Tests for Hestia household completeness and utility leakage."""

from datetime import date

from hestia.domain.completeness import (
    HouseholdGapKind,
    audit_missing_receipts,
    audit_utility_spike,
)


def test_audit_missing_receipts():
    txs: list[dict[str, object]] = [
        # No receipt, >50 EUR
        {"merchant": "MediaMarkt", "amount_cents": 12000, "date": date(2026, 9, 1)},
        {"merchant": "CoffeeShop", "amount_cents": 450, "date": date(2026, 9, 2)},
        # Receipt on file
        {"merchant": "IKEA", "amount_cents": 25000, "date": date(2026, 9, 3)},
    ]
    saved_merchants = {"IKEA"}

    gaps = audit_missing_receipts(txs, saved_merchants)
    assert len(gaps) == 1
    assert gaps[0].kind == HouseholdGapKind.MISSING_RECEIPT
    assert gaps[0].merchant == "MediaMarkt"
    assert gaps[0].amount_cents == 12000


def test_audit_utility_spike_detected():
    gap = audit_utility_spike(
        utility_name="Water Supply Co",
        baseline_cents=4500,  # 45.00 EUR
        current_bill_cents=9500,  # 95.00 EUR (>100% increase)
        bill_date=date(2026, 9, 1),
    )
    assert gap is not None
    assert gap.kind == HouseholdGapKind.UTILITY_SPIKE
    assert gap.amount_cents == 5000
    assert "jumped to 95.00" in gap.evidence


def test_audit_utility_normal():
    gap = audit_utility_spike(
        utility_name="Electric Grid",
        baseline_cents=10000,
        current_bill_cents=10500,  # +5%
        bill_date=date(2026, 9, 1),
    )
    assert gap is None


def test_household_completeness_report():
    from hestia.domain.completeness import HouseholdCompletenessReport

    report_empty = HouseholdCompletenessReport(
        gaps=(),
        total_unbacked_cents=0,
        potential_savings_cents=0,
    )
    assert report_empty.is_complete is True


def test_audit_missing_receipts_fallback_date():
    txs: list[dict[str, object]] = [
        {"merchant": "Target", "amount_cents": 8000, "date": "2026-09-01"},
    ]
    gaps = audit_missing_receipts(txs, set())
    assert len(gaps) == 1
    assert gaps[0].date_observed == date.today()

