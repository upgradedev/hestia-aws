"""Unit tests for bounded Hestia agent tools."""

from __future__ import annotations

from datetime import date

from hestia.agents.tools import (
    audit_subscriptions_tool,
    check_appliance_warranty_tool,
    check_completeness_tool,
    draft_statutory_claim_letter,
)
from hestia.domain.subscriptions import SubscriptionCharge
from hestia.domain.warranties import ApplianceWarranty


def test_check_appliance_warranty_tool_active_and_covered() -> None:
    w = ApplianceWarranty(
        item_name="Bosch Dishwasher",
        serial_number="BOSCH-123",
        purchase_date=date(2025, 1, 1),
        statutory_months=24,
    )
    result = check_appliance_warranty_tool(
        warranty=w,
        current_date=date(2025, 6, 1),
        repair_date=date(2025, 5, 10),
        repair_amount_cents=12000,
    )
    assert "ACTIVE until 2027-01-01" in result
    assert "REIMBURSABLE: Repair on 2025-05-10 of €120.00" in result


def test_check_appliance_warranty_tool_expired_and_not_covered() -> None:
    w = ApplianceWarranty(
        item_name="Old Toaster",
        serial_number="TOAST-99",
        purchase_date=date(2022, 1, 1),
        statutory_months=24,
    )
    result = check_appliance_warranty_tool(
        warranty=w,
        current_date=date(2026, 9, 1),
        repair_date=date(2026, 8, 1),
        repair_amount_cents=5000,
    )
    assert "EXPIRED on 2024-01-01" in result
    assert "NOT COVERED" in result


def test_check_appliance_warranty_tool_expiring_soon() -> None:
    w = ApplianceWarranty(
        item_name="Dyson Vacuum",
        serial_number="DYS-7",
        purchase_date=date(2024, 10, 1),
        statutory_months=24,
    )
    result = check_appliance_warranty_tool(
        warranty=w,
        current_date=date(2026, 9, 4),
    )
    assert "EXPIRING SOON" in result


def test_audit_subscriptions_tool_with_anomalies() -> None:
    subs = [
        SubscriptionCharge(
            service_name="GymApp",
            category="fitness",
            monthly_cents=2999,
            last_billed=date(2026, 8, 25),
            is_trial=True,
            trial_end_date=date(2026, 9, 7),
        ),
        SubscriptionCharge(
            service_name="StreamX",
            category="streaming",
            monthly_cents=1499,
            last_billed=date(2026, 8, 1),
        ),
        SubscriptionCharge(
            service_name="StreamY",
            category="streaming",
            monthly_cents=1199,
            last_billed=date(2026, 8, 2),
        ),
    ]
    price_histories = [("CloudBackup", 999, 1499), ("FlatRate", 1000, 1000)]
    res = audit_subscriptions_tool(
        charges=subs,
        current_date=date(2026, 9, 4),
        price_histories=price_histories,
    )
    assert "[TRIAL ALERT]" in res
    assert "[PRICE HIKE]" in res
    assert "[DUPLICATE]" in res


def test_audit_subscriptions_tool_clean() -> None:
    res = audit_subscriptions_tool(
        charges=[],
        current_date=date(2026, 9, 4),
        price_histories=[],
    )
    assert "All subscriptions are operating within normal parameters" in res


def test_check_completeness_tool_with_gaps() -> None:
    txs: list[dict[str, object]] = [
        {"merchant": "Boutique", "amount_cents": 15000, "date": date(2026, 9, 1)},
    ]
    utility_bills = [
        ("Water Co", 4000, 9000, date(2026, 8, 30)),
        ("Normal Power", 5000, 5000, date(2026, 8, 30)),
    ]
    res = check_completeness_tool(
        bank_transactions=txs,
        saved_receipt_merchants=set(),
        utility_bills=utility_bills,
    )
    assert "[MISSING RECEIPT]" in res
    assert "[UTILITY SPIKE]" in res


def test_check_completeness_tool_clean() -> None:
    res = check_completeness_tool(
        bank_transactions=[],
        saved_receipt_merchants=set(),
        utility_bills=None,
    )
    assert "Household accounts fully reconciled" in res


def test_draft_statutory_claim_letter_covered() -> None:
    w = ApplianceWarranty(
        item_name="Miele Washing Machine",
        serial_number="WASH-7711",
        purchase_date=date(2025, 4, 15),
        statutory_months=24,
        receipt_reference="INV-MIELE-88",
    )
    letter = draft_statutory_claim_letter(
        warranty=w,
        repair_date=date(2026, 3, 10),
        repair_amount_cents=18000,
        issue_description="Drain pump failure during standard cycle",
        homeowner_name="Alex Smith",
    )
    assert "Subject: Formal Reimbursement Request" in letter
    assert "Miele Washing Machine" in letter
    assert "EU Directive 2019/771/EU" in letter
    assert "€180.00" in letter
    assert "Alex Smith" in letter


def test_draft_statutory_claim_letter_not_covered() -> None:
    w = ApplianceWarranty(
        item_name="Vintage Radio",
        serial_number="VR-1",
        purchase_date=date(2020, 1, 1),
        statutory_months=24,
    )
    res = draft_statutory_claim_letter(
        warranty=w,
        repair_date=date(2026, 3, 10),
        repair_amount_cents=5000,
        issue_description="Capacitor hum",
        homeowner_name="Alex Smith",
    )
    assert "Cannot draft reimbursement letter" in res
