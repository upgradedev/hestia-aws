"""Household Financial Sentinel Agent coordinator.

Synthesizes warranty rights, subscription audits, and completeness checks into
an actionable weekly household digest and claim preparation action plan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from hestia.agents.tools import (
    audit_subscriptions_tool,
    check_appliance_warranty_tool,
    check_completeness_tool,
    draft_statutory_claim_letter,
)
from hestia.domain.completeness import (
    HouseholdGap,
    audit_missing_receipts,
    audit_utility_spike,
)
from hestia.domain.subscriptions import (
    SubscriptionAuditResult,
    SubscriptionCharge,
    audit_price_creep,
    audit_trial_expiry,
    detect_duplicates,
)
from hestia.domain.warranties import (
    ApplianceWarranty,
    RepairReimbursementCheck,
    WarrantyStatus,
    evaluate_repair_claim,
)


@dataclass(frozen=True)
class HouseholdAuditDigest:
    """Consolidated weekly or monthly financial health report for the home."""

    warranties_expiring_soon: tuple[ApplianceWarranty, ...]
    reimbursable_repairs: tuple[RepairReimbursementCheck, ...]
    subscription_anomalies: tuple[SubscriptionAuditResult, ...]
    missing_receipt_gaps: tuple[HouseholdGap, ...]
    utility_spikes: tuple[HouseholdGap, ...]
    total_reimbursable_cents: int
    monthly_subscription_waste_cents: int

    @property
    def has_urgent_actions(self) -> bool:
        return (
            len(self.reimbursable_repairs) > 0
            or len(self.warranties_expiring_soon) > 0
            or len(self.subscription_anomalies) > 0
        )


def run_household_audit(
    warranties: list[ApplianceWarranty],
    repairs: list[tuple[ApplianceWarranty, date, int]],  # (warranty, repair_date, amount_cents)
    subscriptions: list[SubscriptionCharge],
    price_histories: list[tuple[str, int, int]],  # (service, old_cents, new_cents)
    bank_transactions: list[dict[str, object]],
    saved_receipts: set[str],
    utility_bills: list[tuple[str, int, int, date]],  # (name, baseline, current, date)
    current_date: date,
) -> HouseholdAuditDigest:
    """Execute a comprehensive scan across all household financial risk areas."""
    # 1. Warranty inspection
    expiring_soon: list[ApplianceWarranty] = []
    for w in warranties:
        status, _ = w.check_status(current_date)
        if status == WarrantyStatus.EXPIRING_SOON:
            expiring_soon.append(w)

    reimbursable: list[RepairReimbursementCheck] = []
    for w, r_date, amount in repairs:
        check = evaluate_repair_claim(w, r_date, amount)
        if check.is_covered:
            reimbursable.append(check)

    # 2. Subscription inspection
    sub_anomalies: list[SubscriptionAuditResult] = []
    for charge in subscriptions:
        trial_warn = audit_trial_expiry(charge, current_date)
        if trial_warn is not None:
            sub_anomalies.append(trial_warn)

    for name, old_c, new_c in price_histories:
        creep = audit_price_creep(name, old_c, new_c)
        if creep is not None:
            sub_anomalies.append(creep)

    sub_anomalies.extend(detect_duplicates(subscriptions))

    # 3. Completeness & utility inspection
    missing_receipts = audit_missing_receipts(bank_transactions, saved_receipts)
    utility_spikes: list[HouseholdGap] = []
    for name, baseline, current, b_date in utility_bills:
        spike = audit_utility_spike(name, baseline, current, b_date)
        if spike is not None:
            utility_spikes.append(spike)

    total_reimbursable = sum(r.claimable_amount_cents for r in reimbursable)
    monthly_waste = sum(a.monthly_impact_cents for a in sub_anomalies)

    return HouseholdAuditDigest(
        warranties_expiring_soon=tuple(expiring_soon),
        reimbursable_repairs=tuple(reimbursable),
        subscription_anomalies=tuple(sub_anomalies),
        missing_receipt_gaps=tuple(missing_receipts),
        utility_spikes=tuple(utility_spikes),
        total_reimbursable_cents=total_reimbursable,
        monthly_subscription_waste_cents=monthly_waste,
    )


def sanitize_pii(text: str) -> str:
    """Mask payment cards and IBANs before language model ingestion."""
    # Mask IBAN patterns
    text = re.sub(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", "[REDACTED_IBAN]", text)
    # Mask 16-digit card patterns
    text = re.sub(r"\b(?:\d[ -]*?){13,19}\b", "[REDACTED_CARD]", text)
    return text


def create_strands_sentinel_agent(
    model_id: str = "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    region_name: str = "eu-west-1",
) -> Any:
    """Instantiate an AWS Strands agent connected to Amazon Bedrock."""
    try:
        from strands import Agent
        from strands.models import BedrockModel

        model = BedrockModel(model_id=model_id, region_name=region_name)
        system_prompt = (
            "You are Hestia, an autonomous Household Economic and Statutory Warranty Sentinel. "
            "Your legal basis is EU Directive 2019/771/EU (consumer guarantee). "
            "You protect households against retailer pushback and subscription creep. "
            "Always produce legally precise, polite, and actionable notices."
        )
        return Agent(
            model=model,
            tools=[
                check_appliance_warranty_tool,
                audit_subscriptions_tool,
                check_completeness_tool,
            ],
            system_prompt=system_prompt,
        )
    except Exception:
        return None


def draft_bedrock_claim_notice(
    warranty: ApplianceWarranty,
    repair_date: date,
    repair_amount_cents: int,
    issue_description: str,
    homeowner_name: str,
    seller_name: str = "Retailer Customer Relations",
    seller_email: str = "service@retailer.example.com",
    model_id: str = "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    region_name: str = "eu-west-1",
    agent_override: Any = None,
) -> dict[str, Any]:
    """Draft a legally grounded reimbursement notice using AWS Strands and Bedrock.

    Falls back cleanly to the deterministic statutory drafter if Bedrock is unreachable.
    """
    sanitized_issue = sanitize_pii(issue_description)
    sanitized_homeowner = sanitize_pii(homeowner_name)
    sanitized_seller = sanitize_pii(seller_name)

    agent = agent_override
    if agent is None:
        agent = create_strands_sentinel_agent(model_id=model_id, region_name=region_name)

    notice_text = ""
    used_model = model_id
    framework = "AWS Strands Agents SDK"

    exp_date = str(warranty.get_expiry_date())
    prompt = (
        f"Draft formal statutory reimbursement claim under EU Directive 2019/771/EU:\n"
        f"- Homeowner: {sanitized_homeowner}\n"
        f"- Seller: {sanitized_seller} ({seller_email})\n"
        f"- Appliance: {warranty.item_name} (Serial: {warranty.serial_number})\n"
        f"- Purchase Date: {warranty.purchase_date}\n"
        f"- Repair Date: {repair_date}\n"
        f"- Out-of-Pocket Cost: €{repair_amount_cents/100:.2f}\n"
        f"- Manifested Defect: {sanitized_issue}\n"
        f"- Statutory Window: 24m guarantee active through {exp_date}\n"
        f"Demand reimbursement within 14 calendar days."
    )

    if agent is not None:
        try:
            response = agent(prompt)
            notice_text = str(response).strip()
        except Exception:
            notice_text = ""
    else:
        try:
            import boto3

            client = boto3.client("bedrock-runtime", region_name=region_name)
            system = [{
                "text": (
                    "You are Hestia, an autonomous Household Economic Sentinel under EU Directive "
                    "2019/771/EU. Draft concise statutory reimbursement notices."
                )
            }]
            messages = [{"role": "user", "content": [{"text": prompt}]}]
            resp = client.converse(modelId=model_id, system=system, messages=messages)
            notice_text = resp["output"]["message"]["content"][0]["text"].strip()
            framework = "Amazon Bedrock AgentCore"
        except Exception:
            notice_text = ""

    if not notice_text:
        used_model = f"{model_id} (deterministic fallback)"
        notice_text = draft_statutory_claim_letter(
            warranty=warranty,
            repair_date=repair_date,
            repair_amount_cents=repair_amount_cents,
            issue_description=sanitized_issue,
            homeowner_name=sanitized_homeowner,
        )

    return {
        "notice": notice_text,
        "model_id": used_model,
        "statutory_basis": "Directive (EU) 2019/771, Article 10(1)",
        "framework": framework,
        "seller": seller_name,
        "seller_email": seller_email,
    }

