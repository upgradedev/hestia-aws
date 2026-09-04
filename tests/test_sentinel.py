"""Unit tests for the Hestia household sentinel agent coordinator."""

from __future__ import annotations

from datetime import date

from hestia.agents.sentinel import HouseholdAuditDigest, run_household_audit
from hestia.domain.subscriptions import SubscriptionCharge
from hestia.domain.warranties import ApplianceWarranty


def test_run_household_audit_comprehensive() -> None:
    current = date(2026, 9, 1)

    # 1. Warranties: one active expiring soon, one long active
    w_expiring = ApplianceWarranty(
        item_name="Bosch Dishwasher",
        serial_number="BOSCH-SN-9912",
        purchase_date=date(2024, 9, 20),
        statutory_months=24,
        receipt_reference="REC-001",
    )  # statutory expires 2026-09-20 (19 days left -> EXPIRING_SOON)

    w_recent = ApplianceWarranty(
        item_name="Samsung TV",
        serial_number="SAM-SN-8821",
        purchase_date=date(2026, 1, 1),
        statutory_months=24,
        receipt_reference="REC-002",
    )

    # 2. Repair claim: repair on Bosch dishwasher within warranty period + expired repair
    w_old = ApplianceWarranty(
        item_name="Old Blender",
        serial_number="OLD-1",
        purchase_date=date(2020, 1, 1),
        statutory_months=24,
    )
    repairs = [
        (w_expiring, date(2026, 8, 15), 15000),  # 150 EUR repair
        (w_old, date(2026, 8, 1), 4000),  # not covered
    ]

    # 3. Subscriptions: one trial expiring soon, duplicate streaming
    subs = [
        SubscriptionCharge(
            service_name="Cloud Backup Pro",
            category="software",
            monthly_cents=2999,
            last_billed=date(2026, 8, 4),
            is_trial=True,
            trial_end_date=date(2026, 9, 4),  # 3 days left
        ),
        SubscriptionCharge(
            service_name="StreamA",
            category="streaming",
            monthly_cents=1299,
            last_billed=date(2026, 8, 10),
        ),
        SubscriptionCharge(
            service_name="StreamB",
            category="streaming",
            monthly_cents=1599,
            last_billed=date(2026, 8, 12),
        ),
    ]

    # 4. Price history: Gym membership increased, flat subscription unchanged
    price_histories = [
        ("FitClub", 4500, 5500),  # 10 EUR creep
        ("FixedSaaS", 1000, 1000),  # unchanged
    ]


    # 5. Bank transactions: one with missing receipt, one with saved receipt
    txs: list[dict[str, object]] = [
        {
            "merchant": "IKEA",
            "amount_cents": 28000,
            "date": date(2026, 8, 25),
        },
        {
            "merchant": "Apple Store",
            "amount_cents": 99000,
            "date": date(2026, 8, 28),
        },
        {
            "merchant": "Corner Bakery",
            "amount_cents": 450,
            "date": date(2026, 8, 30),
        },
    ]
    saved_receipts = {"ikea"}

    # 6. Utility bills: 1 normal, 1 spike
    utility_bills = [
        ("Water Bill", 4000, 7500, date(2026, 8, 30)),  # 87.5% increase > 30% threshold
        ("Internet Bill", 3500, 3500, date(2026, 8, 28)),
    ]

    digest = run_household_audit(
        warranties=[w_expiring, w_recent],
        repairs=repairs,
        subscriptions=subs,
        price_histories=price_histories,
        bank_transactions=txs,
        saved_receipts=saved_receipts,
        utility_bills=utility_bills,
        current_date=current,
    )

    assert isinstance(digest, HouseholdAuditDigest)
    assert digest.has_urgent_actions is True

    # Check warranties expiring soon
    assert len(digest.warranties_expiring_soon) == 1
    assert digest.warranties_expiring_soon[0].item_name == "Bosch Dishwasher"

    # Check reimbursable repair
    assert len(digest.reimbursable_repairs) == 1
    assert digest.reimbursable_repairs[0].claimable_amount_cents == 15000
    assert digest.total_reimbursable_cents == 15000

    # Check subscriptions: trial expiry, duplicates (streaming), price creep
    # trial (1) + duplicate StreamB (1) + price creep (1) = 3 anomalies
    assert len(digest.subscription_anomalies) == 3
    assert digest.monthly_subscription_waste_cents > 0

    # Check missing receipts (Apple Store flagged; IKEA has receipt; Corner Bakery < 5000)
    assert len(digest.missing_receipt_gaps) == 1
    assert digest.missing_receipt_gaps[0].merchant == "Apple Store"

    # Check utility spikes (Water Bill)
    assert len(digest.utility_spikes) == 1
    assert "Water Bill" in digest.utility_spikes[0].merchant


def test_run_household_audit_empty() -> None:
    current = date(2026, 9, 1)
    digest = run_household_audit(
        warranties=[],
        repairs=[],
        subscriptions=[],
        price_histories=[],
        bank_transactions=[],
        saved_receipts=set(),
        utility_bills=[],
        current_date=current,
    )

    assert isinstance(digest, HouseholdAuditDigest)
    assert digest.has_urgent_actions is False
    assert digest.total_reimbursable_cents == 0
    assert digest.monthly_subscription_waste_cents == 0
    assert len(digest.warranties_expiring_soon) == 0
    assert len(digest.reimbursable_repairs) == 0
    assert len(digest.subscription_anomalies) == 0
    assert len(digest.missing_receipt_gaps) == 0
    assert len(digest.utility_spikes) == 0
