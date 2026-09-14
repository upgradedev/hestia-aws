"""HE10 static claims regression; CI-only, with an explicit source write-set.

It verifies authored claims in the judge-facing files and UI copy, not providers, law
or deployment. Historical measurement artifacts must label their limits in place.
"""

import hashlib
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# The release evidence lives in exactly one document; the others link to it.
EVIDENCE_DOC = "docs/deployment.md"
EVIDENCE_SHA = "f8694a0e2e95df688e46e53c9a3e2e9da090e401"
EVIDENCE_DATE = "2026-09-14"
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
    "video/youtube_meta.py",
    "frontend/src/components/AboutView.tsx",
    "frontend/src/components/Landing.tsx",
    "frontend/src/components/SentinelHome.tsx",
    "frontend/src/components/AgentBriefing.tsx",
    "frontend/src/components/IntakePanel.tsx",
    "frontend/src/components/ReceiptUploadModal.tsx",
    "frontend/src/components/RegistryModal.tsx",
    "frontend/src/components/TopBar.tsx",
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
    r"\btrial that converts on the 14th\b",
    r"\bfree trial converts on the 14th\b",
    r"\bnothing is saved until\b",
    r"\bbefore anything is saved\b",
    r"\bnothing is (?:ever )?sent(?: to anyone)?\b",
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
    "A free trial converts on the 14th",
    "Nothing is sent to anyone",
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
    assert "\n## Integration testbook\n" in text
    assert "| Requirement | Targeted regression evidence | Integration receipt |" in text
    assert "docs/measurement.json" in text and "docs/ablation.json" in text
    assert "original payloads" in text and "retained verbatim" in text
    assert "tests/test_claims_inventory.py" in text
    assert "frontend/tests/claims-inventory.spec.ts" in text
    assert "NOT_RUN" in text


@pytest.mark.parametrize(("relative_path", "payload_sha256"), (
    ("docs/measurement.json", "10e9202faf768100c64cf496cf2010773de7f7b7ec31cea9d13b27d8d20ede06"),
    ("docs/ablation.json", "0b3bc0ec4734a0c6fa2e2c530891f19028df9a090203893e06bb7c2ae8076166"),
))
def test_historical_measurement_artifacts_warn_in_place(
    relative_path: str, payload_sha256: str,
) -> None:
    artifact = json.loads((ROOT / relative_path).read_text(encoding="utf-8"))
    assert artifact["artifact_status"] == "superseded_historical_synthetic_output"
    warning = artifact["warning"].lower()
    for boundary in ("not current release evidence", "legal entitlement", "money recovered"):
        assert boundary in warning
    payload = json.dumps(artifact["historical_output"], sort_keys=True,
                         separators=(",", ":")).encode()
    assert hashlib.sha256(payload).hexdigest() == payload_sha256


def test_public_copy_keeps_data_handling_boundaries_visible() -> None:
    for relative_path in (
        "README.md", "frontend/src/components/Landing.tsx",
        "frontend/src/components/TopBar.tsx",
    ):
        text = (ROOT / relative_path).read_text(encoding="utf-8").lower()
        assert "not automatically deleted" in text, relative_path
        assert "fictional" in text and "non-sensitive" in text, relative_path
    registry = (ROOT / "frontend/src/components/RegistryModal.tsx").read_text(encoding="utf-8")
    assert "sent to Hestia's model on Amazon Bedrock" in registry
    assert "but not the raw text" in registry


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


def test_narration_keeps_the_fifteen_scenes_of_the_published_video() -> None:
    import json

    spec = json.loads((ROOT / "video/narration.json").read_text(encoding="utf-8"))
    assert spec["schemaVersion"] == "hestia.submission-video/v2"
    assert [segment["id"] for segment in spec["segments"]] == [
        "intro", "elena", "moment", "pile", "solution", "aws", "agents", "open",
        "home", "paste", "review", "notice", "case", "about", "close",
    ]
    for segment in spec["segments"]:
        for field in ("captionText", "speechText"):
            assert 20 <= len(segment[field]) <= 800
            assert "—" not in segment[field]
    closing = spec["segments"][-1]["captionText"]
    assert "open source" in closing
    assert "live demo" in closing
