"""HE10 static claims regression; CI-only, with an explicit source write-set.

This does not scan submission/video/Builder assets, other UI components, or immutable
measurement artifacts. It verifies authored claims, not providers, law or deployment.
"""

import re
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CLAIM_SURFACES = (
    "README.md",
    "docs/assurance.md",
    "docs/BEDROCK_AGENTCORE_ARCHITECTURE.md",
    "frontend/src/components/ArchitectureView.tsx",
    "frontend/src/components/GtmInvestorView.tsx",
    "frontend/src/components/UserJourneysView.tsx",
    "frontend/src/data/seedData.ts",
)
UNSUPPORTED_CLAIMS = (
    r"\b100%\s+(?:test|statement|branch)\s+(?:and branch\s+)?coverage",
    r"\bZero Hallucinations Guarantee\b",
    r"\bzero arithmetic hallucinations\b",
    r"\bHeadline Out-of-Pocket Recovery\b",
    r"\bTotal Solved Value\b",
    r"\b\d+(?:\.\d+)?%\s+(?:P\(Settle\)|Settle)",
    r"\b(?:Gross Margin|High API Margin):\s*~?\d",
    r"\b(?:8\.2x ROI|500,000 Paying Households|220M EU Households)\b",
    r"\bAutomated AWS SES Raw Dispatch\b",
    r"\bEU ODR ESCALATION\b",
    r"\bsolved autonomously by Hestia\b",
    r"\bproves (?:the 24-month|fault is 100%)",
    r"\bNothing\. No user account, no login, no session cookie",
)


def claim_violations(text: str) -> list[str]:
    return [pattern for pattern in UNSUPPORTED_CLAIMS if re.search(pattern, text, re.I)]


@pytest.mark.parametrize("relative_path", CLAIM_SURFACES)
def test_owned_claim_surfaces_do_not_restore_unsupported_detail(relative_path: str) -> None:
    text = (ROOT / relative_path).read_text(encoding="utf-8")
    assert not claim_violations(text), relative_path


@pytest.mark.parametrize("claim", (
    "Headline Out-of-Pocket Recovery: 185 EUR",
    "Total Solved Value: 406.99 EUR",
    "Gross Margin: ~88%",
    "92% Settle",
    "Automated AWS SES Raw Dispatch",
    "EU ODR ESCALATION",
))
def test_a_safe_banner_cannot_hide_a_false_detailed_claim(claim: str) -> None:
    # Deliberately bad copy proves this guard rejects contradictory detail.
    text = "Simulation only. No email sent or real recovery.\nDetailed card: " + claim
    assert claim_violations(text)


def test_synthetic_amounts_and_explicit_unknowns_are_allowed() -> None:
    assert not claim_violations(
        "Synthetic amount: 185.00 EUR. Gross margin: unmeasured. "
        "SES: disabled. AgentCore: not connected. Legal eligibility requires review."
    )


@pytest.mark.parametrize("relative_path", CLAIM_SURFACES[:3])
def test_docs_bind_source_observations_and_preserve_evidence_limits(relative_path: str) -> None:
    text = (ROOT / relative_path).read_text(encoding="utf-8")
    assert "39e148536080e0957cc36dbd3ca8ea6b74785800" in text
    assert "git show " in text
    assert "2026-09-12" in text
    assert "unmeasured" in text.lower()
    assert "independent human uat" in text.lower()


def test_readme_keeps_history_and_integration_testbook_explicit() -> None:
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    assert '<a id="integration-testbook"></a>' in text
    assert "| Requirement | Targeted regression evidence | Integration receipt |" in text
    assert "docs/measurement.json" in text and "docs/ablation.json" in text
    assert "remain unchanged" in text and "not regenerated" in text
    assert "tests/test_claims_inventory.py" in text
    assert "frontend/tests/claims-inventory.spec.ts" in text
    assert "NOT_RUN" in text
    assert "Public licensing is an unresolved owner decision" in text
    assert not re.search(r"\]\((?:\./)?LICENSE(?:\.\w+)?\)", text)
    assert "img.shields.io/badge/licence-Apache" not in text


def test_static_stories_are_not_execution_results_and_keep_navigation_ids() -> None:
    text = (ROOT / "frontend/src/data/seedData.ts").read_text(encoding="utf-8")
    stories = text.split("export const CORE_USER_JOURNEYS: UserJourney[] =", 1)[1]
    for journey_id in (
        "journey-warranty-recovery", "journey-subscription-creep",
        "journey-receipt-antijoin", "journey-utility-surge",
    ):
        assert f"id: '{journey_id}'" in stories
    assert "completed: true" not in stories
    assert "Synthetic scenario:" in stories
    assert "actual OCR stays disabled" in stories
    assert "no email sent" in stories
