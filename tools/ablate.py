"""Ablate synthetic detector outputs, not household outcomes or economic benefit.

Run in CI: python tools/ablate.py [--output NEW_REPORT.json]
Each variant skips one detector on identical fixture facts. JSON defaults to stdout.
"""
from __future__ import annotations

import argparse
import copy
import pathlib
import sys
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from tools.measure import (  # noqa: E402
    RULES,
    emit_report,
    fixture_identity,
    observe_fixture,
    run_benchmark,
    synthetic_fixture,
)


def run_ablation(fixture: dict[str, Any] | None = None) -> dict[str, Any]:
    facts = copy.deepcopy(synthetic_fixture() if fixture is None else fixture)
    baseline = run_benchmark(facts)
    rows = []
    for rule in RULES:
        variant_facts = copy.deepcopy(facts)
        identity = fixture_identity(variant_facts)
        observed = observe_fixture(variant_facts, excluded_rules=frozenset({rule}))
        unchanged = all(
            observed[other] == baseline["observations"][other] for other in RULES if other != rule
        )
        inputs_unchanged = (
            fixture_identity(variant_facts)["sha256"] == identity["sha256"]
            == baseline["fixture"]["sha256"]
        )
        disabled = observed[rule]
        baseline_count = baseline["observations"][rule]["flag_count"]
        rows.append({
            "rule": rule, "fixture_sha256": identity["sha256"],
            "baseline_flag_count": baseline_count,
            "without_rule_flag_count": disabled["flag_count"],
            "flag_count_difference": baseline_count - disabled["flag_count"],
            "observations_without_rule": observed,
            "excluded_detector_skipped": disabled.get("executed") is False,
            "unaffected_detectors_match": unchanged, "fixture_unchanged": inputs_unchanged,
            "check_passed": (
                unchanged and inputs_unchanged and disabled.get("executed") is False
                and disabled["flag_count"] == 0
            ),
        })
    return {
        "schema": "hestia/ablation/v2", "mode": "synthetic_detector_output_ablation",
        "baseline": baseline, "ablations": rows,
        "ablation_checks_match": (
            baseline["fixture_expectations_match"] and all(row["check_passed"] for row in rows)
        ),
        "economic_benefit": None, "time_benefit": None, "model_benefit": None,
        "limitations": (
            "A detector exclusion measures only the loss of its own output on identical "
            "synthetic facts. It does not simulate household decisions or measure effectiveness, "
            "money recovered, time saved, legal remedies or model benefit. Unrelated outputs "
            "and the input fingerprint are compared for each variant."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, help="Create a new JSON report; never overwrite")
    args = parser.parse_args(argv)
    data = run_ablation()
    emit_report(data, args.output)
    return 0 if data["ablation_checks_match"] else 1


if __name__ == "__main__":
    sys.exit(main())
