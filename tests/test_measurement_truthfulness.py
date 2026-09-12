"""CI-only checks for synthetic measurements, detector ablation and immutable output."""
from __future__ import annotations

import copy
import json
from dataclasses import replace
from datetime import date
from unittest.mock import Mock

import pytest

from tools import ablate, measure


def test_measurement_executes_fixed_fixture_and_reports_distinct_observations():
    result = measure.run_benchmark()
    assert result["schema"] == "hestia/measurement/v2"
    assert result["mode"] == "deterministic_synthetic_fixture"
    assert result["fixture_expectations_match"] is True
    assert len(result["checks"]) == 6
    assert all(row["observed"] == row["expected"] and row["passed"] for row in result["checks"])
    observed = result["observations"]
    assert observed["warranty_review"]["recorded_repair_amount_cents"] == 18500
    assert observed["warranty_review"]["claimable_amount_cents"] == 0
    assert observed["warranty_review"]["entitlement_status"] == "not_determined"
    assert observed["price_change"]["monthly_difference_cents"] == 400
    assert observed["trial_date"]["recorded_monthly_cents"] == 3499
    assert observed["receipt_match"]["recorded_outlay_cents"] == [8500]
    assert observed["utility_comparison"]["difference_cents"] == 5400
    assert result["real_recovery_cents"] is None
    assert result["time_saved_seconds"] is None and result["model_benefit"] is None
    for old_claim in ("all_invariants_held", "total_economic_exposure_guarded_cents",
                      "headline_recovery_cents", "trial_annual_exposure_cents"):
        assert old_claim not in result


def test_mutated_fixture_cannot_inherit_a_pass_or_original_input_identity():
    fixture = measure.synthetic_fixture()
    fixture["price_history"] = ("Synthetic storage", 1399, 1399)
    original = copy.deepcopy(fixture)
    result = measure.run_benchmark(fixture)
    row = next(check for check in result["checks"] if check["rule"] == "price_change")
    assert row["observed"] == {"flag_count": 0, "monthly_difference_cents": 0}
    assert row["expected"] == {"flag_count": 1, "monthly_difference_cents": 400}
    assert row["passed"] is False and result["fixture_expectations_match"] is False
    assert result["fixture"]["sha256"] != measure.run_benchmark()["fixture"]["sha256"]
    assert result["fixture"]["facts"]["price_history"] == ["Synthetic storage", 1399, 1399]
    assert fixture == original


def test_detector_regression_fails_named_check_instead_of_claiming_all_invariants(monkeypatch):
    original = measure.evaluate_repair_claim

    def incorrect_entitlement(*args, **kwargs):
        return replace(original(*args, **kwargs), is_covered=True, claimable_amount_cents=18500)

    monkeypatch.setattr(measure, "evaluate_repair_claim", incorrect_entitlement)
    result = measure.run_benchmark()
    row = next(check for check in result["checks"] if check["rule"] == "warranty_review")
    assert row["passed"] is False
    assert row["observed"]["claimable_amount_cents"] == 18500
    assert row["expected"]["claimable_amount_cents"] == 0
    assert result["fixture_expectations_match"] is False


def test_ablation_skips_actual_detector_call_and_preserves_unrelated_outputs(monkeypatch):
    skipped = Mock(side_effect=AssertionError("Excluded detector must not execute"))
    monkeypatch.setattr(measure, "audit_price_creep", skipped)
    result = measure.observe_fixture(
        measure.synthetic_fixture(), excluded_rules=frozenset({"price_change"}),
    )
    skipped.assert_not_called()
    assert result["price_change"] == {"flag_count": 0, "executed": False}
    assert result["trial_date"]["flag_count"] == 1
    assert result["utility_comparison"]["difference_cents"] == 5400


def test_each_ablation_executes_baseline_and_variants_on_identical_facts(monkeypatch):
    price = Mock(wraps=measure.audit_price_creep)
    monkeypatch.setattr(measure, "audit_price_creep", price)
    fixture = measure.synthetic_fixture()
    original = copy.deepcopy(fixture)
    result = ablate.run_ablation(fixture)
    # Baseline plus five variants; the sixth variant excludes the price detector.
    assert price.call_count == 6
    assert result["ablation_checks_match"] is True
    assert len(result["ablations"]) == 6
    for row in result["ablations"]:
        assert row["baseline_flag_count"] == 1 and row["without_rule_flag_count"] == 0
        assert row["flag_count_difference"] == 1
        assert row["excluded_detector_skipped"] and row["unaffected_detectors_match"]
        assert row["fixture_unchanged"] and row["check_passed"]
        assert row["fixture_sha256"] == result["baseline"]["fixture"]["sha256"]
        assert "economic_delta_eur" not in row and "held" not in row
    assert result["economic_benefit"] is None
    assert result["time_benefit"] is None and result["model_benefit"] is None
    assert fixture == original


def test_negative_fixture_ablation_reports_zero_output_differences_where_no_flag_exists():
    fixture = measure.synthetic_fixture()
    fixture.update(
        scenario_date=date(2026, 10, 1), price_history=("Synthetic storage", 1399, 1399),
        receipt_merchants=["Synthetic furniture", "Synthetic grocer"],
        utility=("Synthetic water", 8800, 8800, date(2026, 9, 10)),
    )
    fixture["overlapping_charges"] = fixture["overlapping_charges"][:1]
    result = ablate.run_ablation(fixture)
    differences = {row["rule"]: row["flag_count_difference"] for row in result["ablations"]}
    assert differences == {
        "warranty_review": 1, "price_change": 0, "trial_date": 0,
        "category_overlap": 0, "receipt_match": 0, "utility_comparison": 0,
    }
    assert result["baseline"]["fixture_expectations_match"] is False
    assert result["ablation_checks_match"] is False


@pytest.mark.parametrize("mutation", ["output", "input"])
def test_ablation_detects_unrelated_output_or_input_mutation(monkeypatch, mutation):
    original = ablate.observe_fixture

    def changed(fixture, *, excluded_rules):
        observed = original(fixture, excluded_rules=excluded_rules)
        if "trial_date" in excluded_rules:
            if mutation == "output":
                observed["price_change"]["monthly_difference_cents"] = 999
            else:
                fixture["scenario_date"] = date(2020, 1, 1)
        return observed

    monkeypatch.setattr(ablate, "observe_fixture", changed)
    result = ablate.run_ablation()
    row = next(row for row in result["ablations"] if row["rule"] == "trial_date")
    assert row["check_passed"] is False and result["ablation_checks_match"] is False
    if mutation == "output":
        assert row["unaffected_detectors_match"] is False
    else:
        assert row["fixture_unchanged"] is False


@pytest.mark.parametrize("tool", [measure, ablate])
def test_cli_default_is_json_stdout_without_creating_files(tool, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    assert tool.main([]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["schema"].endswith("/v2")
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("tool", [measure, ablate])
def test_cli_can_create_explicit_new_ci_artifact(tool, tmp_path, capsys):
    target = tmp_path / "new-ci-evidence.json"
    assert tool.main(["--output", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["schema"].endswith("/v2")
    assert capsys.readouterr().out == ""
    original = target.read_bytes()
    with pytest.raises(FileExistsError):
        tool.main(["--output", str(target)])
    assert target.read_bytes() == original


@pytest.mark.parametrize("tool", [measure, ablate])
@pytest.mark.parametrize("name", ["measurement.json", "ablation.json"])
def test_cli_refuses_historical_proof_paths_even_when_explicitly_selected(
    tool, name, tmp_path, monkeypatch,
):
    monkeypatch.setattr(measure, "REPO_ROOT", tmp_path)
    directory = tmp_path / "docs"
    directory.mkdir()
    target = directory / name
    target.write_bytes(b"retained historical proof")
    with pytest.raises(ValueError, match="Historical evidence paths are reserved"):
        tool.main(["--output", str(target)])
    assert target.read_bytes() == b"retained historical proof"


@pytest.mark.parametrize("tool", [measure, ablate])
def test_cli_returns_failure_with_observed_regression_in_json(tool, monkeypatch, capsys):
    monkeypatch.setattr(measure, "audit_price_creep", lambda *args: None)
    assert tool.main([]) == 1
    report = json.loads(capsys.readouterr().out)
    baseline = report.get("baseline", report)
    assert baseline["fixture_expectations_match"] is False
    price = next(row for row in baseline["checks"] if row["rule"] == "price_change")
    assert price["observed"]["flag_count"] == 0 and price["passed"] is False


@pytest.mark.parametrize("tool", [measure, ablate])
def test_execution_exception_never_creates_a_success_artifact(tool, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(measure, "audit_price_creep", Mock(side_effect=ValueError("broken fixture")))
    target = tmp_path / "unexecuted-report.json"
    with pytest.raises(ValueError, match="broken fixture"):
        tool.main(["--output", str(target)])
    assert not target.exists() and capsys.readouterr().out == ""


def test_unknown_exclusion_and_unserializable_fixture_fail_explicitly():
    with pytest.raises(ValueError, match="Unknown detector"):
        measure.observe_fixture(measure.synthetic_fixture(), excluded_rules=frozenset({"typo"}))
    with pytest.raises(TypeError, match="Unsupported fixture type"):
        measure.fixture_identity({"unsupported": object()})
