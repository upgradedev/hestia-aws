"""Warranty reminder compatibility and evidence review guards."""

from datetime import date

from hestia.domain.warranties import (
    ApplianceWarranty,
    WarrantyStatus,
    evaluate_repair_claim,
)


def test_warranty_expiry_calculation():
    w = ApplianceWarranty(
        item_name="Bosch Dishwasher",
        serial_number="BOSCH-SN-8821",
        purchase_date=date(2024, 6, 15),
        statutory_months=24,
    )
    expiry = w.get_expiry_date()
    assert expiry == date(2026, 6, 15)


def test_warranty_status_active():
    w = ApplianceWarranty(
        item_name="LG OLED TV",
        serial_number="LG-9921",
        purchase_date=date(2025, 1, 1),
        statutory_months=24,
    )
    status, days = w.check_status(current_date=date(2025, 6, 1))
    assert status == WarrantyStatus.ACTIVE
    assert days > 60


def test_warranty_status_expiring_soon():
    w = ApplianceWarranty(
        item_name="Dyson Vacuum",
        serial_number="DYSON-44",
        purchase_date=date(2024, 10, 1),
        statutory_months=24,
    )
    # Expiry is 2026-10-01. On 2026-09-04, ~27 days left
    status, days = w.check_status(current_date=date(2026, 9, 4))
    assert status == WarrantyStatus.EXPIRING_SOON
    assert 0 <= days <= 60


def test_warranty_status_expired():
    w = ApplianceWarranty(
        item_name="Philips Toaster",
        serial_number="PHILIPS-12",
        purchase_date=date(2023, 1, 1),
        statutory_months=24,
    )
    status, days = w.check_status(current_date=date(2026, 9, 4))
    assert status == WarrantyStatus.EXPIRED
    assert days < 0


def test_evaluate_repair_claim_date_does_not_establish_coverage():
    w = ApplianceWarranty(
        item_name="Samsung Refrigerator",
        serial_number="SAM-REF-01",
        purchase_date=date(2025, 3, 1),
        statutory_months=24,
    )
    # Paid repair on 2026-02-10 (during warranty)
    claim = evaluate_repair_claim(
        warranty=w,
        repair_date=date(2026, 2, 10),
        repair_amount_cents=18500,  # 185.00 EUR
    )
    assert claim.is_covered is False
    assert claim.claimable_amount_cents == 0
    assert claim.review_required is True
    assert claim.entitlement_status == "not_determined"
    assert "delivery_date" in claim.missing_facts
    assert "jurisdiction" in claim.missing_facts
    assert claim.statutory_expiry_date is None
    assert "Review required" in claim.reason


def test_evaluate_repair_claim_does_not_deny_rights_after_legacy_reminder():
    w = ApplianceWarranty(
        item_name="DeLonghi Coffee Maker",
        serial_number="DL-77",
        purchase_date=date(2022, 1, 1),
        statutory_months=24,
    )
    claim = evaluate_repair_claim(
        warranty=w,
        repair_date=date(2025, 5, 10),
        repair_amount_cents=7500,
    )
    assert claim.is_covered is False
    assert claim.claimable_amount_cents == 0
    assert claim.review_required is True
    assert "neither establish nor exclude entitlement" in claim.reason


def test_warranty_expiry_month_rollover():
    w = ApplianceWarranty(
        item_name="Microwave",
        serial_number="MW-101",
        purchase_date=date(2024, 8, 10),
        statutory_months=18,
        commercial_months=0,
    )
    # 18 months -> 1 year + 6 months -> 2024+1 = 2025, month 8+6 = 14 -> 2026, month 2
    expiry = w.get_expiry_date()
    assert expiry == date(2026, 2, 10)


def test_warranty_expiry_month_end_31st():
    w = ApplianceWarranty(
        item_name="Smart Oven",
        serial_number="OVEN-31",
        purchase_date=date(2024, 10, 31),
        statutory_months=24,
    )
    # 24 months from Oct 31, 2024 is Oct 31, 2026 (not clamped to 28)
    expiry = w.get_expiry_date()
    assert expiry == date(2026, 10, 31)


def test_warranty_expiry_leap_year_rollover():
    w = ApplianceWarranty(
        item_name="Induction Hob",
        serial_number="HOB-29",
        purchase_date=date(2024, 2, 29),
        statutory_months=24,
    )
    # 24 months from Feb 29, 2024 (leap) is Feb 28, 2026 (non-leap)
    expiry = w.get_expiry_date()
    assert expiry == date(2026, 2, 28)



