"""Execute a fixed synthetic detector fixture; no recovery, time or model benefit is measured.

Run in CI: python tools/measure.py [--output NEW_REPORT.json]
Default output is JSON on stdout. Existing files and historical proof are never overwritten.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import sys
from dataclasses import asdict, is_dataclass
from datetime import date
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from hestia.domain.completeness import (  # noqa: E402
    audit_missing_receipts,
    audit_utility_spike,
)
from hestia.domain.subscriptions import (  # noqa: E402
    SubscriptionCharge,
    audit_price_creep,
    audit_trial_expiry,
    detect_duplicates,
)
from hestia.domain.warranties import (  # noqa: E402
    ApplianceWarranty,
    evaluate_repair_claim,
)

RULES = ("warranty_review", "price_change", "trial_date", "category_overlap",
         "receipt_match", "utility_comparison")

# Independently pinned expectations for synthetic_fixture(), not derived from detector outputs.
EXPECTED = {
    "warranty_review": {
        "flag_count": 1, "review_required": True, "is_covered": False,
        "claimable_amount_cents": 0, "entitlement_status": "not_determined",
        "recorded_repair_amount_cents": 18500, "currency": "EUR",
    },
    "price_change": {"flag_count": 1, "monthly_difference_cents": 400},
    "trial_date": {"flag_count": 1, "recorded_monthly_cents": 3499},
    "category_overlap": {"flag_count": 1, "flagged_monthly_cents": [1299]},
    "receipt_match": {"flag_count": 1, "recorded_outlay_cents": [8500]},
    "utility_comparison": {"flag_count": 1, "difference_cents": 5400},
}


def synthetic_fixture() -> dict[str, Any]:
    return {
        "scenario_date": date(2026, 9, 11), "currency": "EUR",
        "warranty": ApplianceWarranty(
            "Synthetic washing machine", "FIXTURE-WASHER-01", date(2024, 11, 15),
            commercial_months=12, receipt_reference="FIXTURE-RECEIPT-01", currency="EUR",
        ),
        "repair_date": date(2026, 9, 2), "repair_amount_cents": 18500,
        "price_history": ("Synthetic storage", 999, 1399),
        "trial": SubscriptionCharge(
            "Synthetic fitness", "fitness", 3499, date(2026, 9, 5),
            is_trial=True, trial_end_date=date(2026, 9, 14),
        ),
        "overlapping_charges": [
            SubscriptionCharge("Synthetic stream A", "streaming", 1599, date(2026, 9, 1)),
            SubscriptionCharge("Synthetic stream B", "streaming", 1299, date(2026, 9, 3)),
        ],
        "transactions": [
            {"merchant": "Synthetic furniture", "amount_cents": 8500, "date": date(2026, 9, 8)},
            {"merchant": "Synthetic grocer", "amount_cents": 1840, "date": date(2026, 9, 9)},
        ],
        "receipt_merchants": ["Synthetic grocer"],
        "utility": ("Synthetic water", 8800, 14200, date(2026, 9, 10)),
    }


def _json_default(value: object) -> object:
    if isinstance(value, date):
        return value.isoformat()
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    raise TypeError(f"Unsupported fixture type: {type(value).__name__}")


def fixture_identity(fixture: dict[str, Any]) -> dict[str, Any]:
    content = json.dumps(fixture, default=_json_default, sort_keys=True, allow_nan=False)
    return {
        "id": "hestia/synthetic-detector-fixture/v2",
        "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "facts": json.loads(content),
    }


def observe_fixture(
    fixture: dict[str, Any], *, excluded_rules: frozenset[str] = frozenset(),
) -> dict[str, dict[str, Any]]:
    """Execute selected detectors on the same facts; exclusions truly skip their calls."""
    if excluded_rules - set(RULES):
        raise ValueError("Unknown detector exclusion.")
    observed: dict[str, dict[str, Any]] = {
        rule: {"flag_count": 0, "executed": False} for rule in RULES if rule in excluded_rules
    }
    if "warranty_review" not in excluded_rules:
        check = evaluate_repair_claim(
            fixture["warranty"], fixture["repair_date"], fixture["repair_amount_cents"],
        )
        observed["warranty_review"] = {
            "flag_count": int(check.review_required), "review_required": check.review_required,
            "is_covered": check.is_covered, "claimable_amount_cents": check.claimable_amount_cents,
            "entitlement_status": check.entitlement_status,
            "recorded_repair_amount_cents": check.repair_amount_cents, "currency": check.currency,
        }
    if "price_change" not in excluded_rules:
        result = audit_price_creep(*fixture["price_history"])
        observed["price_change"] = {
            "flag_count": int(result is not None),
            "monthly_difference_cents": result.monthly_impact_cents if result else 0,
        }
    if "trial_date" not in excluded_rules:
        result = audit_trial_expiry(fixture["trial"], fixture["scenario_date"])
        observed["trial_date"] = {
            "flag_count": int(result is not None),
            "recorded_monthly_cents": result.monthly_impact_cents if result else 0,
        }
    if "category_overlap" not in excluded_rules:
        duplicates = detect_duplicates(fixture["overlapping_charges"])
        observed["category_overlap"] = {
            "flag_count": len(duplicates),
            "flagged_monthly_cents": [result.monthly_impact_cents for result in duplicates],
        }
    if "receipt_match" not in excluded_rules:
        gaps = audit_missing_receipts(
            fixture["transactions"], set(fixture["receipt_merchants"]), min_amount_cents=5000,
        )
        observed["receipt_match"] = {
            "flag_count": len(gaps), "recorded_outlay_cents": [gap.amount_cents for gap in gaps],
        }
    if "utility_comparison" not in excluded_rules:
        gap = audit_utility_spike(*fixture["utility"])
        observed["utility_comparison"] = {
            "flag_count": int(gap is not None), "difference_cents": gap.amount_cents if gap else 0,
        }
    return observed


def run_benchmark(fixture: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compatibility name for fixed-fixture checks, not a benchmark of product outcomes."""
    facts = copy.deepcopy(synthetic_fixture() if fixture is None else fixture)
    identity = fixture_identity(facts)
    observed = observe_fixture(facts)
    checks = [
        {"rule": rule, "expected": copy.deepcopy(EXPECTED[rule]), "observed": observed[rule],
         "passed": observed[rule] == EXPECTED[rule]}
        for rule in RULES
    ]
    return {
        "schema": "hestia/measurement/v2", "mode": "deterministic_synthetic_fixture",
        "fixture": identity, "observations": observed, "checks": checks,
        "fixture_expectations_match": all(check["passed"] for check in checks),
        "real_recovery_cents": None, "time_saved_seconds": None, "model_benefit": None,
        "limitations": (
            "Only the named detector outputs are checked against this fixed fixture. "
            "Repair costs, monthly differences, scheduled fees and unmatched outlays have distinct "
            "meanings and are not summed. A flag is not entitlement, waste, savings or recovery. "
            "No live household, provider, model, legal outcome or elapsed-time benefit is evaluated."
        ),
    }


def emit_report(data: dict[str, Any], output: pathlib.Path | None = None) -> None:
    payload = json.dumps(data, indent=2, sort_keys=True, allow_nan=False) + "\n"
    if output is None:
        print(payload, end="")
        return
    target = output.resolve()
    historical = {REPO_ROOT / "docs" / name for name in ("measurement.json", "ablation.json")}
    if target in historical:
        raise ValueError("Historical evidence paths are reserved; choose a new report path.")
    # Exclusive creation also prevents overwriting any existing report or symlink.
    with target.open("x", encoding="utf-8") as report:
        report.write(payload)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, help="Create a new JSON report; never overwrite")
    args = parser.parse_args(argv)
    data = run_benchmark()
    emit_report(data, args.output)
    return 0 if data["fixture_expectations_match"] else 1


if __name__ == "__main__":
    sys.exit(main())
