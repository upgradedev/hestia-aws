"""HE10 static claims regression; CI-only, with an explicit source write-set.

It verifies authored claims in the judge-facing files and the four UI copy files, not
providers, law or deployment. Immutable measurement artifacts are pinned elsewhere.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# The release evidence lives in exactly one document; the others link to it.
EVIDENCE_DOC = "docs/deployment.md"
EVIDENCE_SHA = "2b8a531148b8bd923bdede5c2fb9f198e7095e69"
EVIDENCE_DATE = "2026-09-13"
TESTBOOK_DOC = "docs/testing.md"
LIMIT_DOCS = ("docs/architecture.md", "docs/assurance.md", "docs/testing.md", "docs/deployment.md")
CLAIM_SURFACES = (
    "README.md",
    "docs/architecture.md",
    "docs/assurance.md",
    "docs/deployment.md",
    "docs/strands-agents.md",
    "docs/testing.md",
    "docs/devpost-submission.md",
    "docs/builder-aws-article.md",
    "docs/video-script.md",
    "video/narration.json",
    "frontend/src/components/AboutView.tsx",
    "frontend/src/components/Landing.tsx",
    "frontend/src/components/SentinelHome.tsx",
    "frontend/src/components/AgentBriefing.tsx",
)
MARKDOWN_SURFACES = tuple(path for path in CLAIM_SURFACES if path.endswith(".md"))
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
    # Stale claims from earlier drafts that no longer describe the product.
    r"claude 3\.5 haiku",
    r"claude-3-5-haiku",
    r"agentcore powers",
    r"\breact 18\b",
    r"\bmerkle\b",
    r"\b71 unit\b",
    r"\b37 unit\b",
    r"100% statement",
    r"100% branch",
    r"under 50 ?ms",
    r"\$0\.00 idle",
    r"\bairtight\b",
    r"zero mathematical hallucinations",
    r"pre-llm pii",
    r"\b3-column\b",
    r"\bmediamarkt\b",
    r"\bmunich\b",
)
# Relative targets of markdown links and HTML src/href attributes.
RELATIVE_LINK = re.compile(r"(?:\]\(|src=\"|href=\")(?!https?://|#|mailto:)([^)\"#\s]+)")


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
    "Powered by Claude 3.5 Haiku on Bedrock",
    "AgentCore powers the claim drafter",
    "71 unit and integration tests with 100% statement coverage",
    "a cryptographic Merkle proof badge",
    "Latency remains under 50ms",
    "legally airtight demand letter",
    "Elena manages a home in Munich; the notice goes to MediaMarkt",
))
def test_a_safe_banner_cannot_hide_a_false_detailed_claim(claim: str) -> None:
    # Deliberately bad copy proves this guard rejects contradictory detail.
    text = "Simulation only. No email sent or real recovery.\nDetailed card: " + claim
    assert claim_violations(text)


def test_synthetic_amounts_and_explicit_unknowns_are_allowed() -> None:
    assert not claim_violations(
        "Synthetic amount: 185.00 EUR. Gross margin: unmeasured. "
        "SES: not connected. AgentCore: not connected. Legal eligibility requires review. "
        "Claude Haiku 4.5 through Amazon Bedrock, 3 reviews per demo space. React 19."
    )


def test_release_evidence_is_bound_to_one_revision_in_one_document() -> None:
    text = (ROOT / EVIDENCE_DOC).read_text(encoding="utf-8")
    assert EVIDENCE_SHA in text
    assert "git show " in text
    assert EVIDENCE_DATE in text
    assert "https://github.com/upgradedev/hestia-aws/actions/runs/" in text
    for relative_path in MARKDOWN_SURFACES:
        if relative_path != EVIDENCE_DOC:
            other = (ROOT / relative_path).read_text(encoding="utf-8")
            assert EVIDENCE_SHA not in other, relative_path


@pytest.mark.parametrize("relative_path", LIMIT_DOCS)
def test_docs_keep_evidence_limits_and_link_the_release_evidence(relative_path: str) -> None:
    text = (ROOT / relative_path).read_text(encoding="utf-8")
    assert "unmeasured" in text.lower()
    assert "independent human uat" in text.lower()
    if relative_path != EVIDENCE_DOC:
        assert "deployment.md" in text


def test_testbook_keeps_history_and_integration_evidence_explicit() -> None:
    text = (ROOT / TESTBOOK_DOC).read_text(encoding="utf-8")
    assert '<a id="integration-testbook"></a>' in text
    assert "| Requirement | Targeted regression evidence | Integration receipt |" in text
    assert "docs/measurement.json" in text and "docs/ablation.json" in text
    assert "remain unchanged" in text and "not regenerated" in text
    assert "tests/test_claims_inventory.py" in text
    assert "frontend/tests/claims-inventory.spec.ts" in text
    assert "NOT_RUN" in text


def test_readme_states_the_license_and_the_evidence_limits_and_links_the_detail() -> None:
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Public licensing is an unresolved owner decision" not in text
    assert "MIT" in text
    assert re.search(r"\]\((?:\./)?LICENSE\)", text)
    assert "img.shields.io/badge/licence-Apache" not in text
    assert "NOT_RUN" in text and "unmeasured" in text
    for doc in ("docs/architecture.md", "docs/strands-agents.md", "docs/testing.md",
                "docs/deployment.md", "docs/assurance.md"):
        assert f"({doc}" in text, doc


@pytest.mark.parametrize("relative_path", MARKDOWN_SURFACES)
def test_relative_links_in_judge_facing_docs_resolve(relative_path: str) -> None:
    source = ROOT / relative_path
    targets = RELATIVE_LINK.findall(source.read_text(encoding="utf-8"))
    missing = [target for target in targets if not (source.parent / target).exists()]
    assert not missing, (relative_path, missing)


def test_license_file_is_mit_and_names_the_owner() -> None:
    text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    assert text.startswith("MIT License")
    assert "Copyright (c) 2026 Efthimios Fousekis" in text
    assert 'THE SOFTWARE IS PROVIDED "AS IS"' in text


def test_about_view_states_disconnected_providers_and_the_live_model_boundary() -> None:
    text = (ROOT / "frontend/src/components/AboutView.tsx").read_text(encoding="utf-8")
    for label in (
        "PSD2 bank feeds: not connected",
        "Mailbox / retailer sync: not connected",
        "AgentCore runtime: not connected",
        "Managed Guardrails: not connected",
    ):
        assert label in text
    assert "Bedrock inference: disabled" not in text
    assert "Independent human UAT" in text and "NOT_RUN" in text


def test_narration_keeps_the_seven_beats_the_capture_journey_expects() -> None:
    import json

    spec = json.loads((ROOT / "video/narration.json").read_text(encoding="utf-8"))
    assert spec["schemaVersion"] == "hestia.submission-video/v1"
    assert [segment["id"] for segment in spec["segments"]] == [
        "hook", "surface", "trigger", "live", "sponsor", "evidence", "close",
    ]
    for segment in spec["segments"]:
        for field in ("captionText", "speechText"):
            assert 20 <= len(segment[field]) <= 800
            assert "—" not in segment[field]
    closing = spec["segments"][-1]["captionText"]
    assert "drusjukc9d4oc.cloudfront.net" in closing
