"""Timing, currency and exact-preview regressions for offline CI only."""
from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, datetime
from unittest.mock import Mock

import pytest

from hestia.agents.sentinel import draft_bedrock_claim_notice, run_household_audit
from hestia.agents.tools import check_appliance_warranty_tool, draft_statutory_claim_letter
from hestia.domain.warranties import (
    LEGAL_SOURCES_CHECKED_ON,
    ApplianceWarranty,
    evaluate_repair_claim,
    format_repair_amount,
)
from tests import test_web
from tests.test_web import approval, call, prepared, scoped_store, session

sandbox = test_web.sandbox


def warranty(**changes):
    facts = {
        "item_name": "Household washer", "serial_number": "SYNTHETIC-01",
        "purchase_date": date(2024, 1, 1), "delivery_date": date(2024, 2, 29),
        "defect_date": date(2026, 2, 28), "jurisdiction": "DE",
        "seller_is_business": True, "consumer_purchase": True,
        "receipt_reference": "FIXTURE-PURCHASE", "currency": "EUR",
        "commercial_start_date": date(2024, 1, 1), "commercial_months": 36,
        "commercial_terms_reference": "FIXTURE-GUARANTEE-TERMS",
    }
    return ApplianceWarranty(**(facts | changes))


@pytest.mark.parametrize(("defect", "expected"), [
    (date(2024, 2, 28), "before_start"),
    (date(2024, 2, 29), "within_recorded_window"),
    (date(2026, 2, 27), "within_recorded_window"),
    (date(2026, 2, 28), "within_recorded_window"),
    (date(2026, 3, 1), "after_recorded_window"),
])
def test_delivery_and_leap_day_boundaries_are_screening_only(defect, expected):
    result = evaluate_repair_claim(warranty(defect_date=defect), date(2026, 3, 5), 18500)
    assert result.statutory_expiry_date == date(2026, 2, 28)
    assert result.statutory_timing == expected
    assert result.review_required and result.entitlement_status == "not_determined"
    assert result.is_covered is False and result.claimable_amount_cents == 0


def test_long_commercial_term_does_not_extend_statutory_ground():
    result = evaluate_repair_claim(
        warranty(defect_date=date(2026, 9, 1)), date(2026, 9, 2), 18500,
    )
    assert result.statutory_expiry_date == date(2026, 2, 28)
    assert result.commercial_expiry_date == date(2027, 1, 1)
    assert result.statutory_timing == "after_recorded_window"
    assert result.commercial_timing == "within_recorded_window"
    assert result.claimable_amount_cents == 0
    assert "commercial_terms_and_guarantor_review_required" in result.review_reasons


@pytest.mark.parametrize(("repair", "expected"), [
    (date(2023, 12, 31), "before_start"),
    (date(2024, 1, 1), "within_recorded_window"),
    (date(2027, 1, 1), "within_recorded_window"),
    (date(2027, 1, 2), "after_recorded_window"),
])
def test_commercial_calendar_boundaries_do_not_determine_coverage(repair, expected):
    result = evaluate_repair_claim(warranty(), repair, 1)
    assert result.commercial_timing == expected
    assert result.is_covered is False and result.claimable_amount_cents == 0


def test_repair_after_boundary_does_not_replace_defect_manifestation_date():
    result = evaluate_repair_claim(warranty(commercial_months=0), date(2026, 3, 15), 18500)
    assert result.statutory_timing == "within_recorded_window"
    assert result.commercial_expiry_date is None
    assert result.commercial_timing == "unknown"
    assert result.review_required
    assert "neither establish nor exclude" in result.reason


def test_missing_delivery_and_terms_are_not_inferred_from_purchase_or_default_months():
    record = ApplianceWarranty("Washer", "SN", date(2025, 1, 1))
    result = evaluate_repair_claim(record, date(2026, 1, 1), 18500)
    assert result.statutory_expiry_date is None and result.commercial_expiry_date is None
    assert result.statutory_timing == result.commercial_timing == "unknown"
    assert set(result.missing_facts) == {
        "delivery_date", "jurisdiction", "seller_is_business", "consumer_purchase",
        "defect_date", "currency", "receipt_reference", "commercial_start_date",
        "commercial_terms_reference",
    }
    assert "jurisdiction_unknown" in result.review_reasons


@pytest.mark.parametrize("field", [
    "purchase_date", "delivery_date", "defect_date", "jurisdiction", "seller_is_business",
    "consumer_purchase", "currency", "commercial_start_date",
])
def test_each_missing_fact_is_explicit_and_never_establishes_entitlement(field):
    result = evaluate_repair_claim(warranty(**{field: None}), date(2026, 3, 5), 99)
    assert field in result.missing_facts
    assert result.is_covered is False and result.claimable_amount_cents == 0
    assert result.review_required


def test_missing_purchase_and_repair_dates_still_allow_safe_review_draft():
    record = warranty(purchase_date=None)
    result = evaluate_repair_claim(record, None, 99)
    assert {"purchase_date", "repair_date"} <= set(result.missing_facts)
    with pytest.raises(ValueError, match="purchase date"):
        record.get_expiry_date()
    letter = draft_statutory_claim_letter(record, None, 99, "Reported noise", "Household")
    assert "Recorded purchase date: not provided" in letter
    assert "Recorded repair date: not provided" in letter


@pytest.mark.parametrize("field", ["seller_is_business", "consumer_purchase"])
def test_known_false_scope_is_not_mistaken_for_missing_or_eligible(field):
    result = evaluate_repair_claim(warranty(**{field: False}), date(2026, 3, 5), 99)
    assert field not in result.missing_facts
    assert "consumer_sale_scope_not_established" in result.review_reasons
    assert result.review_required


@pytest.mark.parametrize("changes", [
    {"delivery_date": date(2023, 1, 1)},
    {"defect_date": date(2023, 12, 31)},
    {"defect_date": date(2026, 4, 1)},
])
def test_contradictory_dates_require_correction(changes):
    result = evaluate_repair_claim(warranty(**changes), date(2026, 3, 5), 99)
    assert "inconsistent_dates" in result.review_reasons
    assert result.claimable_amount_cents == 0


@pytest.mark.parametrize("purchase", [date(2026, 7, 30), date(2026, 7, 31), date(2026, 8, 1)])
def test_repair_directive_transition_is_reviewed_not_automatically_applied(purchase):
    record = warranty(
        purchase_date=purchase, delivery_date=date(2026, 8, 5), defect_date=date(2026, 9, 1),
    )
    result = evaluate_repair_claim(record, date(2026, 9, 2), 18500)
    assert result.statutory_expiry_date == date(2028, 8, 5)
    assert "repair_extensions_and_contract_transition_review_required" in result.review_reasons
    assert "2024/1799" in result.to_public_dict()["limitations"]
    assert result.claimable_amount_cents == 0


@pytest.mark.parametrize(("amount", "currency", "expected"), [
    (1, "EUR", "EUR 0.01"), (105, "USD", "USD 1.05"), (999, "GBP", "GBP 9.99"),
    (9007199254740993, "EUR", "EUR 90071992547409.93"),
    (18500, None, "18500 minor units (currency/scale requires review)"),
    (18500, "JPY", "18500 minor units (currency/scale requires review)"),
])
def test_currency_scale_is_explicit_and_integer_amounts_are_exact(amount, currency, expected):
    assert format_repair_amount(amount, currency) == expected
    result = evaluate_repair_claim(warranty(currency=currency), date(2026, 3, 5), amount)
    assert result.repair_amount_cents == amount and result.currency == currency
    assert result.claimable_amount_cents == 0


@pytest.mark.parametrize("amount", [-1, 0, True, 1.25, "18500", None])
def test_invalid_amounts_are_not_silently_coerced(amount):
    with pytest.raises(ValueError, match="positive integer"):
        evaluate_repair_claim(warranty(), date(2026, 3, 5), amount)


@pytest.mark.parametrize("changes", [
    {"statutory_months": -1}, {"commercial_months": True}, {"statutory_months": 1.5},
    {"commercial_months": 1201}, {"delivery_date": "2024-01-01"},
    {"purchase_date": datetime(2024, 1, 1)}, {"seller_is_business": "true"},
    {"consumer_purchase": 1}, {"jurisdiction": " "}, {"currency": 123},
    {"commercial_terms_reference": None},
])
def test_malformed_record_types_require_correction(changes):
    with pytest.raises(ValueError):
        warranty(**changes)


def test_zero_periods_and_calendar_overflow_never_establish_expiry():
    result = evaluate_repair_claim(
        warranty(statutory_months=0, commercial_months=0), date(2026, 3, 5), 99,
    )
    assert result.statutory_expiry_date is None and result.commercial_expiry_date is None
    assert "statutory_period_not_recorded" in result.review_reasons
    with pytest.raises(ValueError, match="supported calendar"):
        warranty(delivery_date=date(9999, 12, 31)).get_statutory_expiry_date()


def test_current_redress_is_information_only_and_old_platform_is_closed():
    letter = draft_statutory_claim_letter(warranty(), date(2026, 3, 5), 99, "Noise", "Household")
    assert "https://consumer-redress.ec.europa.eu/index_en" in letter
    assert "EU ODR platform closed on 20 July 2025" in letter
    assert "check their jurisdiction and participation rules" in letter
    assert "Attached:" not in letter and "100% reimbursable" not in letter
    public = evaluate_repair_claim(warranty(), date(2026, 3, 5), 99).to_public_dict()
    assert public["sources_checked_on"] == LEGAL_SOURCES_CHECKED_ON == "2026-09-12"
    assert "https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng" in public["sources"]
    assert json.loads(json.dumps(public))["statutory_expiry_date"] == "2026-02-28"


def test_untrusted_model_cannot_inject_entitlement_or_obsolete_redress():
    agent = Mock(return_value="100% reimbursable. File with EU ODR today.")
    result = draft_bedrock_claim_notice(
        warranty(), date(2026, 3, 5), 99, "Noise", "Household", agent_override=agent,
    )
    agent.assert_not_called()
    assert "100% reimbursable" not in result["notice"]
    assert "File with EU ODR today" not in result["notice"]
    assert result["approval_required"] and result["legal_assessment"]["review_required"]


def test_audit_keeps_reviewable_repairs_and_independent_deadline_reminders():
    first = warranty(defect_date=date(2026, 2, 1))
    second = replace(first, item_name="Other washer", currency="USD", purchase_date=None)
    digest = run_household_audit(
        [first, second], [(first, date(2026, 2, 2), 18500), (second, date(2026, 2, 2), 9900)],
        [], [], [], set(), [], date(2026, 2, 10),
    )
    assert len(digest.warranties_expiring_soon) == 2  # Commercial end is still 11 months away.
    assert [r.currency for r in digest.repairs_requiring_review] == ["EUR", "USD"]
    assert digest.reimbursable_repairs == () and digest.total_reimbursable_cents == 0
    assert digest.has_urgent_actions
    tool = check_appliance_warranty_tool(first, date(2026, 2, 10))
    assert "boundary 2026-02-28, 18 days" in tool and "boundary 2027-01-01" in tool


def update_item(token, **changes):
    store = scoped_store(token)
    state = store.load_state(create=False)
    state["appliances"][0].update(changes)
    store.save_state(state)


def test_api_preview_exposes_uncertainty_and_approval_records_only_exact_simulation(sandbox):
    token = session()
    draft = prepared(token)
    assessment = draft["legal_assessment"]
    assert assessment["review_required"] and assessment["entitlement_status"] == "not_determined"
    assert assessment["currency_source"] == "legacy_demo_eur"
    assert assessment["is_covered"] is False and assessment["claimable_amount_cents"] == 0
    assert {"delivery_date", "jurisdiction", "defect_date"} <= set(assessment["missing_facts"])
    assert "Recorded delivery date: not provided" in draft["notice"]
    assert "Recorded repair cost: EUR 185.00" in draft["notice"]
    assert "no longer accepts complaints" in draft["notice"]
    assert "drafts" not in call("/api/state", token=token, method="GET")[1]
    assert call("/api/action/claim", approval(draft), session())[0] == 404
    code, result = call("/api/action/claim", approval(draft), token)
    assert code == 200
    assert result["dispatch_record"]["full_letter"] == draft["notice"]
    assert result["state"]["cases"][0]["notice"]["legal_assessment"] == assessment
    assert result["state"]["cases"][0]["outcome"] is None
    assert result["state"]["cases"][0]["real_recovered_cents"] == 0
    assert result["dispatch_record"]["delivery_status"] == "SIMULATED"
    assert call("/api/action/claim", approval(draft), token)[1]["replayed"] is True


@pytest.mark.parametrize("field", ["notice", "legal_assessment"])
def test_api_legal_content_cannot_change_under_existing_approval_digest(sandbox, field):
    token = session()
    draft = prepared(token)
    store = scoped_store(token)
    state = store.load_state(create=False)
    payload = state["drafts"][draft["id"]]["payload"]
    if field == "notice":
        payload["notice"] += " Guarantee a full refund."
    else:
        payload["legal_assessment"]["claimable_amount_cents"] = 18500
    store.save_state(state)
    assert call("/api/action/claim", approval(draft), token)[0] == 403
    assert store.load_state(create=False)["dispatch_records"] == []


@pytest.mark.parametrize("changes", [
    {"currency": "USD"}, {"currency": "JPY"}, {"currency": None}, {"currency": ""},
    {"delivery_date": "2026-02-30"}, {"defect_date": "20260901"},
    {"purchase_date": 20240101}, {"seller_is_business": "true"},
    {"commercial_months": -1}, {"commercial_terms_reference": None},
])
def test_api_invalid_currency_or_facts_never_persist_a_draft(sandbox, changes):
    token = session()
    update_item(token, **changes)
    before = scoped_store(token).load_state(create=False)
    assert call("/api/action/claim/prepare", {"item_id": "app-001"}, token)[0] == 422
    assert scoped_store(token).load_state(create=False) == before


def test_api_uses_recorded_delivery_and_requires_fresh_approval_when_evidence_changes(sandbox):
    token = session()
    update_item(
        token, currency="EUR", delivery_date="2024-11-01", defect_date="2026-09-01",
        jurisdiction="GR", seller_is_business=True, consumer_purchase=True,
        commercial_start_date="2024-10-15", commercial_terms_reference="FIXTURE-TERMS",
        commercial_months=36,
    )
    draft = prepared(token)
    assessment = draft["legal_assessment"]
    assert assessment["currency_source"] == "recorded"
    assert assessment["statutory_expiry_date"] == "2026-11-01"
    assert assessment["commercial_expiry_date"] == "2027-10-15"
    assert assessment["missing_facts"] == [] and assessment["review_required"]
    update_item(token, delivery_date="2024-11-02")
    assert call("/api/action/claim", approval(draft), token)[0] == 409
    fresh = prepared(token)
    assert fresh["digest"] != draft["digest"]
    assert "2026-11-02" in fresh["notice"]
    assert call("/api/action/claim", approval(fresh), token)[0] == 200
