"""Read-only synthetic scenario preview and the existing AWS Lambda API boundary."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from html import escape
from typing import Any

from hestia.agents.sentinel import (
    HouseholdAuditDigest,
    run_household_audit,
)
from hestia.agents.tools import draft_statutory_claim_letter
from hestia.app.api import handle_api, response
from hestia.domain.subscriptions import SubscriptionCharge
from hestia.domain.warranties import ApplianceWarranty

# Explicit synthetic records, independent of any live household or deployed state.
SCENARIOS: dict[str, dict[str, Any]] = {
    "family_flat": {
        "title": "Athens Apartment 4B (Urban Household)",
        "current_date": date(2026, 9, 10),
        "currency": "EUR",
        "warranties": [
            ApplianceWarranty(
                item_name="Bosch Series 6 Washing Machine",
                serial_number="WAU28T64GB/01",
                purchase_date=date(2024, 10, 15),
                statutory_months=24,
                commercial_months=24,
                receipt_reference="REC-2024-BOSCH-88",
                currency="EUR",
            ),
            ApplianceWarranty(
                item_name="Sony Bravia 55 OLED TV",
                serial_number="XR-55A80K-902",
                purchase_date=date(2025, 3, 20),
                statutory_months=24,
                commercial_months=12,
                receipt_reference="REC-2025-SONY-11",
                currency="EUR",
            ),
        ],
        "repairs": [
            (
                ApplianceWarranty(
                    item_name="Bosch Series 6 Washing Machine",
                    serial_number="WAU28T64GB/01",
                    purchase_date=date(2024, 10, 15),
                    statutory_months=24,
                    commercial_months=24,
                    receipt_reference="REC-2024-BOSCH-88",
                    currency="EUR",
                ),
                date(2026, 9, 2),
                18500,  # €185.00
            )
        ],
        "subscriptions": [
            SubscriptionCharge(
                service_name="Cloud Backup Vault",
                category="Storage",
                monthly_cents=1399,
                last_billed=date(2026, 9, 1),
            ),
            SubscriptionCharge(
                service_name="Fitness Stream Pro",
                category="Health",
                monthly_cents=1999,
                last_billed=date(2026, 8, 20),
                is_trial=True,
                trial_end_date=date(2026, 9, 14),
            ),
            SubscriptionCharge(
                service_name="Music Streaming Family",
                category="Media",
                monthly_cents=1499,
                last_billed=date(2026, 9, 5),
            ),
            SubscriptionCharge(
                service_name="Music Streaming Individual",
                category="Media",
                monthly_cents=999,
                last_billed=date(2026, 9, 2),
            ),
        ],
        "price_histories": [
            ("Cloud Backup Vault", 999, 1399),  # 40% creep
        ],
        "bank_transactions": [
            {"merchant": "Piraeus DIY Supplies", "amount_cents": 8550, "date": date(2026, 9, 4)},
            {"merchant": "Neighbourhood Supermarket", "amount_cents": 14230,
             "date": date(2026, 9, 6)},
            {"merchant": "Plaisio Electronics", "amount_cents": 4200, "date": date(2026, 9, 7)},
        ],
        "saved_receipts": {"Neighbourhood Supermarket"},
        "utility_bills": [
            ("City Electricity Supply", 11000, 16800, date(2026, 9, 1)),  # 52% surge
        ],
        "homeowner_name": "Elena Georgiou",
        "repair_issue": "Drum bearing seizure and drain pump motor failure",
    }
}


def build_audit(scenario_key: str = "family_flat") -> tuple[HouseholdAuditDigest, dict[str, Any]]:
    data = SCENARIOS.get(scenario_key, SCENARIOS["family_flat"])
    digest = run_household_audit(
        warranties=data["warranties"],
        repairs=data["repairs"],
        subscriptions=data["subscriptions"],
        price_histories=data["price_histories"],
        bank_transactions=data["bank_transactions"],
        saved_receipts=data["saved_receipts"],
        utility_bills=data["utility_bills"],
        current_date=data["current_date"],
    )
    return digest, data


def _text(value: object) -> str:
    return escape(str(value), quote=True)


def _money(cents: int, currency: str | None) -> str:
    """Format recorded hundredths without converting or inventing a currency."""
    if type(cents) is not int:
        raise ValueError("Scenario amounts must be integer minor units.")
    if currency not in {"EUR", "USD", "GBP"}:
        return f"{cents} minor units (currency/scale unverified)"
    sign = "-" if cents < 0 else ""
    whole, fraction = divmod(abs(cents), 100)
    return f"{currency} {sign}{whole}.{fraction:02d}"


def _card(title: object, *lines: object) -> str:
    return (
        '<article class="item-card"><h3>' + _text(title) + "</h3>"
        + "".join("<p>" + _text(line) + "</p>" for line in lines) + "</article>"
    )


def render_html(scenario_key: str = "family_flat", approved_action: str | None = None) -> str:
    """Render only recorded synthetic facts; the legacy approval argument grants no authority."""
    digest, data = build_audit(scenario_key)
    currency = data.get("currency")
    current_date = data["current_date"]
    inventories = []
    for warranty in data["warranties"]:
        inventories.append(_card(
            warranty.item_name,
            f"Serial: {warranty.serial_number or 'not provided'}",
            f"Recorded purchase date: {warranty.purchase_date or 'not provided'}",
            f"Recorded delivery date: {warranty.delivery_date or 'not provided'}",
            f"Jurisdiction: {warranty.jurisdiction or 'unknown'}; legal review required.",
            "Statutory delivery-based screening boundary: "
            f"{warranty.get_statutory_expiry_date() or 'unknown'}",
            "Commercial terms-based screening boundary: "
            f"{warranty.get_commercial_expiry_date() or 'unknown'}",
            "Timing is not a determination of coverage or a deadline for exercising rights.",
        ))
    for charge in data["subscriptions"]:
        lines = [
            f"Recorded monthly charge: {_money(charge.monthly_cents, currency)}",
            f"Recorded billing date: {charge.last_billed}; category: {charge.category}",
        ]
        if charge.is_trial:
            lines.append(f"Recorded trial end: {charge.trial_end_date or 'not provided'}")
            if charge.trial_end_date is not None:
                days = (charge.trial_end_date - current_date).days
                lines.append(f"{days} days from the scenario date; renewal terms not verified.")
        lines.append("Usage and whether the household needs this service have not been assessed.")
        inventories.append(_card(charge.service_name, *lines))
    for tx in data["bank_transactions"]:
        inventories.append(_card(
            tx["merchant"], f"Recorded outlay: {_money(tx['amount_cents'], currency)}",
            f"Recorded transaction date: {tx.get('date') or 'not provided'}",
        ))

    reviews = []
    for repair in digest.repairs_requiring_review:
        reviews.append(_card(
            repair.item_name,
            f"Repair record needing review: {_money(repair.repair_amount_cents, repair.currency)}",
            f"Recorded repair date: {repair.repair_date or 'not provided'}",
            repair.reason,
            "Missing facts: " + (", ".join(repair.missing_facts) or "none in the timing record"),
            "Coverage and any reimbursement remain undetermined, not denied.",
        ))
    for flag in digest.subscription_anomalies:
        reviews.append(_card(
            flag.service_name, f"Rule flag: {flag.anomaly.value}",
            f"Flagged monthly amount: {_money(flag.monthly_impact_cents, currency)}",
            "This is a review signal. Category overlap does not establish redundancy; "
            "a trial fee or price increase is not measured waste or savings.",
        ))
    for name, previous, current in data["price_histories"]:
        reviews.append(_card(
            name, f"Recorded price comparison: {_money(previous, currency)} "
            f"to {_money(current, currency)}",
            f"Monthly difference: {_money(current - previous, currency)}",
            "Notification, consent and future billing have not been assessed.",
        ))
    for gap in digest.missing_receipt_gaps:
        reviews.append(_card(
            gap.merchant, f"Unmatched receipt record: {_money(gap.amount_cents, currency)}",
            f"Transaction date: {gap.date_observed}",
            "No merchant-name match in the scenario receipt index. This does not determine "
            "whether other evidence exists or whether insurance or warranty rights are valid.",
        ))
    for name, baseline, bill, billed_on in data["utility_bills"]:
        percentage = (
            f"{Decimal(bill - baseline) * 100 / Decimal(baseline):.1f}%"
            if baseline > 0 else "unknown (no positive baseline)"
        )
        flagged = any(
            gap.merchant == name and gap.date_observed == billed_on
            for gap in digest.utility_spikes
        )
        reviews.append(_card(
            name, f"Recorded bill: {_money(bill, currency)} on {billed_on}",
            f"Recorded baseline: {_money(baseline, currency)}; change: {percentage}",
            f"Rule flag: {'review requested' if flagged else 'no spike flag'}",
            "A comparison does not establish a billing error or its cause.",
        ))

    letters = []
    for warranty, repair_date, amount in data["repairs"]:
        letter = draft_statutory_claim_letter(
            warranty, repair_date, amount, data["repair_issue"], data["homeowner_name"],
        )
        letters.append(
            '<article class="item-card"><h3>Illustrative evidence review request</h3>'
            '<p>No approval, delivery or financial outcome is recorded here.</p>'
            '<pre class="letter-box">' + _text(letter) + "</pre></article>"
        )
    outlays = sum(tx["amount_cents"] for tx in data["bank_transactions"])
    inventory_html = "".join(inventories) or "<p>No inventory records in this scenario.</p>"
    review_html = "".join(reviews) or "<p>No review flags from the supplied scenario.</p>"
    letter_html = "".join(letters) or (
        "<p>No repair record available for an illustrative request.</p>"
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HESTIA AWS: Synthetic household review</title>
<style>
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #0d1117; color: #c9d1d9;
  font: 15px/1.6 system-ui, sans-serif; overflow-wrap: anywhere; }}
header, main, footer {{ max-width: 1440px; margin: auto; padding: 24px; }}
h1, h2, h3 {{ color: #f0f6fc; line-height: 1.3; }}
h1 {{ margin-bottom: 8px; }} h2 {{ font-size: 19px; }} h3 {{ font-size: 16px; }}
a {{ color: #8ac7ff; }} a:focus-visible {{ outline: 3px solid #e3b341; outline-offset: 4px; }}
.banner, .metric, .item-card {{ background: #161b22; border: 1px solid #30363d;
  border-radius: 8px; padding: 16px; margin-bottom: 14px; }}
.banner {{ border-color: #e3b341; }}
.metrics {{ display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }}
.metric strong {{ display: block; font-size: 22px; color: #f0f6fc; }}
.columns {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }}
p {{ margin: 8px 0; }} .letter-box {{ white-space: pre-wrap; overflow-wrap: anywhere;
  font: 12px/1.6 ui-monospace, monospace; }}
footer {{ border-top: 1px solid #30363d; color: #a0a8b3; }}
@media (max-width: 1000px) {{ .columns {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<header>
<h1>HESTIA AWS</h1>
<p>Household financial, warranty and subscription review</p>
<p>{_text(data['title'])} | Scenario date: {_text(current_date)}</p>
<div class="banner"><strong>Read-only synthetic illustration.</strong>
<p>This page runs deterministic rules on the scenario below. No account is connected and no
model inference, email, provider action or financial recovery occurs on this page.</p>
<a href="https://drusjukc9d4oc.cloudfront.net/">Open the Hestia application</a>
to begin an isolated demo session and review an exact server-prepared notice.</div>
</header>
<main>
<div class="metrics">
<div class="metric">Repair records needing review
<strong>{len(digest.repairs_requiring_review)}</strong>
Amounts are recorded costs, not entitlements.</div>
<div class="metric">Subscription review flags
<strong>{len(digest.subscription_anomalies)}</strong>
Signals may overlap; no savings total is inferred.</div>
<div class="metric">Recorded household outlays
<strong>{_text(_money(outlays, currency))}</strong>
{len(data['bank_transactions'])} synthetic transactions; no live feed.</div>
<div class="metric">Coverage and reimbursement
<strong>Undetermined</strong>Missing facts require review; rights have not been denied.</div>
</div>
<div class="columns">
<section><h2>1. Recorded household facts</h2>{inventory_html}</section>
<section><h2>2. Deterministic review signals</h2>{review_html}</section>
<section><h2>3. Illustrative review requests</h2>
<p>Approval and dispatch are unavailable on this read-only page.</p>{letter_html}</section>
</div>
</main>
<footer>Hestia AWS | Synthetic fixture only. Legal eligibility, real outcomes,
model accuracy and time savings are not measured by this preview.</footer>
</body>
</html>
"""


def read_lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Reader Lambda cannot execute mutations even through an unexpected route."""
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "GET").upper()
    if method not in ("GET", "OPTIONS"):
        return response(405, {"status": "error", "message": "This endpoint is read-only."})
    return lambda_handler(event, context)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Public HTML is read-only; every API and legacy mutation uses one boundary."""
    path = event.get("rawPath") or event.get("path") or "/"
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "GET").upper()
    if path == "/" and method == "GET":
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"},
            "body": render_html(scenario_key="family_flat"),
        }
    return handle_api(event)

