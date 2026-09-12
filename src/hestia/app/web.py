"""Zero-dependency modern web application and AWS Lambda HTTP handler for Hestia.

Presents the Unified Household Operations Cockpit:
- Column 1: Household Inflows & Assets (Appliances, Subscriptions, Bank Transactions)
- Column 2: AI Sentinel Radar & Anomalies (EU 2019/771/EU Warranty Gaps, Creep, Anti-Join)
- Column 3: Return-of-Control (ROC) Command Center (Human Approval & Statutory Claim Dispatch)
"""

from __future__ import annotations

from datetime import date
from typing import Any

from hestia.agents.sentinel import (
    HouseholdAuditDigest,
    run_household_audit,
)
from hestia.agents.tools import draft_statutory_claim_letter
from hestia.app.api import handle_api, response
from hestia.domain.subscriptions import SubscriptionCharge
from hestia.domain.warranties import ApplianceWarranty

# Preset Demo Scenarios for Judges
SCENARIOS: dict[str, dict[str, Any]] = {
    "family_flat": {
        "title": "Athens Apartment 4B (Urban Household)",
        "current_date": date(2026, 9, 10),
        "warranties": [
            ApplianceWarranty(
                item_name="Bosch Series 6 Washing Machine",
                serial_number="WAU28T64GB/01",
                purchase_date=date(2024, 10, 15),
                statutory_months=24,
                commercial_months=24,
                receipt_reference="REC-2024-BOSCH-88",
            ),
            ApplianceWarranty(
                item_name="Sony Bravia 55 OLED TV",
                serial_number="XR-55A80K-902",
                purchase_date=date(2025, 3, 20),
                statutory_months=24,
                commercial_months=12,
                receipt_reference="REC-2025-SONY-11",
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
            {"merchant": "Leroy Merlin DIY", "amount_cents": 8550, "date": "2026-09-04"},
            {"merchant": "Sklavenitis Supermarket", "amount_cents": 14230, "date": "2026-09-06"},
            {"merchant": "Plaisio Electronics", "amount_cents": 4200, "date": "2026-09-07"},
        ],
        "saved_receipts": {"Sklavenitis Supermarket"},
        "utility_bills": [
            ("PPC Electricity", 11000, 16800, date(2026, 9, 1)),  # 52% surge
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


def render_html(scenario_key: str = "family_flat", approved_action: str | None = None) -> str:
    digest, data = build_audit(scenario_key)
    homeowner = data["homeowner_name"]
    outlays_total = sum(t["amount_cents"] for t in data["bank_transactions"]) / 100

    claim_letter = ""
    if data["repairs"]:
        w, r_date, r_cents = data["repairs"][0]
        claim_letter = draft_statutory_claim_letter(
            warranty=w,
            repair_date=r_date,
            repair_amount_cents=r_cents,
            issue_description=data["repair_issue"],
            homeowner_name=homeowner,
        )

    # A legacy rendering argument is not an authorization or execution receipt.
    action_banner = (
        '<div class="banner-success"><strong>Read-only synthetic illustration.</strong> '
        'No model inference, email, provider action or financial recovery occurs on this page. '
        '<a href="https://drusjukc9d4oc.cloudfront.net/">Open the Hestia application</a> '
        'to begin an isolated demo session and review an exact server-prepared notice.</div>'
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hestia AWS: Autonomous Household Financial Sentinel</title>

<style>
:root {{
  --bg: #0d1117;
  --surface: #161b22;
  --surface-raised: #21262d;
  --border: #30363d;
  --border-focus: #58a6ff;
  --text: #c9d1d9;
  --text-heading: #f0f6fc;
  --text-muted: #8b949e;
  --accent: #e3b341;
  --accent-soft: rgba(227, 179, 65, 0.15);
  --success: #3fb950;
  --success-soft: rgba(63, 185, 80, 0.15);
  --danger: #f85149;
  --danger-soft: rgba(248, 81, 73, 0.15);
  --warning: #d29922;
  --warning-soft: rgba(210, 153, 34, 0.15);
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SF Pro Display", sans-serif;
  line-height: 1.5;
  padding: 0;
  margin: 0;
  min-height: 100vh;
}}
header.topbar {{
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}}
.brand {{
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}}
.brand-badge {{
  background: var(--accent);
  color: #000;
  font-weight: 800;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}}
.brand-title {{
  color: var(--text-heading);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}}
.brand-sub {{
  color: var(--text-muted);
  font-size: 13px;
}}
.telemetry-pills {{
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}}
.pill {{
  background: var(--surface-raised);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 20px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}}
.pill.active {{
  border-color: var(--success);
  color: var(--success);
}}
.metrics-strip {{
  background: rgba(22, 27, 34, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 16px 28px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px;
}}
.metric-box {{
  border-left: 3px solid var(--accent);
  padding-left: 12px;
}}
.metric-box.danger {{ border-left-color: var(--danger); }}
.metric-box.success {{ border-left-color: var(--success); }}
.metric-label {{
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}}
.metric-value {{
  font-size: 22px;
  font-weight: 700;
  color: var(--text-heading);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}}
.metric-desc {{
  font-size: 11.5px;
  color: var(--text-muted);
}}
.container {{
  max-width: 1560px;
  margin: 0 auto;
  padding: 24px 28px 60px;
}}
.banner-success {{
  background: var(--success-soft);
  border: 1px solid var(--success);
  color: var(--text-heading);
  padding: 14px 18px;
  border-radius: 8px;
  margin-bottom: 22px;
  font-size: 13.5px;
}}
.digest-pill {{
  margin-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--success);
}}
.cockpit-grid {{
  display: grid;
  grid-template-columns: minmax(300px, 1.1fr) minmax(320px, 1.2fr) minmax(320px, 1.3fr);
  gap: 20px;
  align-items: start;
}}
@media (max-width: 1100px) {{
  .cockpit-grid {{ grid-template-columns: 1fr; }}
}}
.col-card {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  min-height: 520px;
}}
.col-header {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
  margin-bottom: 16px;
}}
.col-title {{
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--text-heading);
}}
.col-subtitle {{
  font-size: 11px;
  color: var(--text-muted);
}}
.item-card {{
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 12px 14px;
  margin-bottom: 12px;
  transition: border-color 0.15s, transform 0.15s;
}}
.item-card:hover {{
  border-color: var(--border-focus);
  transform: translateY(-1px);
}}
.item-card.alert-warn {{
  border-left: 3px solid var(--warning);
  background: var(--warning-soft);
}}
.item-card.alert-danger {{
  border-left: 3px solid var(--danger);
  background: var(--danger-soft);
}}
.item-card.alert-success {{
  border-left: 3px solid var(--success);
  background: var(--success-soft);
}}
.badge {{
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
}}
.b-warn {{ background: var(--warning); color: #000; }}
.b-danger {{ background: var(--danger); color: #fff; }}
.b-success {{ background: var(--success); color: #000; }}
.item-title {{
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text-heading);
  margin: 6px 0 2px;
}}
.item-meta {{
  font-size: 12px;
  color: var(--text-muted);
}}
.item-math {{
  font-size: 12px;
  font-weight: 600;
  color: var(--text-heading);
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}}
.letter-box {{
  background: #090d13;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  color: #adbac7;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin-top: 10px;
}}
.btn {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text-heading);
  font-size: 13px;
  font-weight: 600;
  padding: 9px 16px;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
}}
.btn:hover {{
  background: #2b313a;
  border-color: #8b949e;
}}
.btn.primary {{
  background: var(--success);
  border-color: var(--success);
  color: #000;
}}
.btn.primary:hover {{
  filter: brightness(1.1);
}}
.btn.danger {{
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}}
.btn.danger:hover {{
  filter: brightness(1.1);
}}
.roc-card {{
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}}
.roc-title {{
  color: var(--text-heading);
  font-size: 13.5px;
}}
footer.meta-bar {{
  margin-top: 36px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}}
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">
    <span class="brand-badge">Everyday Agent</span>
    <div>
      <div class="brand-title">HESTIA AWS</div>
      <div class="brand-sub">Household Financial, Warranty & Subscription Sentinel</div>
    </div>
  </div>
  <div class="telemetry-pills">
    <span class="pill">Read-only synthetic illustration</span>
    <span class="pill">Framework: AWS Strands Agents SDK</span>
    <span class="pill">Legal Engine: Directive 2019/771/EU</span>
  </div>
</header>

<div class="metrics-strip">
  <div class="metric-box success">
    <div class="metric-label">Recoverable Warranty Rights</div>
    <div class="metric-value">€{digest.total_reimbursable_cents/100:.2f}</div>
    <div class="metric-desc">Unclaimed statutory repair costs on file</div>
  </div>
  <div class="metric-box danger">
    <div class="metric-label">Identified Monthly Waste</div>
    <div class="metric-value">€{digest.monthly_subscription_waste_cents/100:.2f}/mo</div>
    <div class="metric-desc">Zombie subscriptions, price creep & trial traps</div>
  </div>
  <div class="metric-box">
    <div class="metric-label">Monitored Household Outlays</div>
    <div class="metric-value">€{outlays_total:.2f}</div>
    <div class="metric-desc">3 transactions scanned for anti-join completeness</div>
  </div>
  <div class="metric-box">
    <div class="metric-label">Return-of-Control Gate</div>
    <div class="metric-value">2 Decisions</div>
    <div class="metric-desc">Human sign-off required prior to dispatch</div>
  </div>
</div>

<div class="container">
  {action_banner}

  <div class="cockpit-grid">
    <!-- COLUMN 1: HOUSEHOLD INVENTORY & INPUT FEEDS -->
    <div class="col-card">
      <div class="col-header">
        <div>
          <div class="col-title">1. Household Inflows & Feeds</div>
          <div class="col-subtitle">Monitored assets, cards & recurring billing</div>
        </div>
      </div>

      <div class="item-card">
        <span class="badge b-warn">23 Mos Elapsed</span>
        <div class="item-title">Bosch Series 6 Washing Machine</div>
        <div class="item-meta">SN: WAU28T64GB/01 · Bought 2024-10-15</div>
        <div class="item-meta">Statutory 2-year guarantee ends 2026-10-15</div>
      </div>

      <div class="item-card">
        <span class="badge b-success">Protected</span>
        <div class="item-title">Sony Bravia 55 OLED TV</div>
        <div class="item-meta">SN: XR-55A80K-902 · Bought 2025-03-20</div>
        <div class="item-meta">Statutory conformity active (186 days left)</div>
      </div>

      <div class="item-card">
        <span class="badge b-danger">Active Creep</span>
        <div class="item-title">Cloud Backup Vault</div>
        <div class="item-meta">Billed €13.99 on 2026-09-01 (Stepped from €9.99)</div>
      </div>

      <div class="item-card">
        <span class="badge b-warn">Expiring Trial</span>
        <div class="item-title">Fitness Stream Pro</div>
        <div class="item-meta">Free trial expires 2026-09-14 (€19.99 auto-charge)</div>
      </div>

      <div class="item-card">
        <span class="badge b-danger">Duplicate Service</span>
        <div class="item-title">Music Streaming (Family & Individual)</div>
        <div class="item-meta">Overlapping category charges: €14.99 + €9.99</div>
      </div>
    </div>

    <!-- COLUMN 2: AI SENTINEL RADAR & ANOMALY DETECTION -->
    <div class="col-card">
      <div class="col-header">
        <div>
          <div class="col-title">2. AI Sentinel Radar</div>
          <div class="col-subtitle">Autonomous statutory & financial gap audits</div>
        </div>
      </div>

      <div class="item-card alert-danger">
        <span class="badge b-danger">Statutory Claim Open</span>
        <div class="item-title">EU 2019/771/EU Conformity Breach</div>
        <div class="item-meta">Bosch Washing Machine suffered bearing seizure on 2026-09-02.</div>
        <div class="item-math">Repair cost €185.00 paid out-of-pocket during guarantee window.</div>
        <div class="item-meta" style="margin-top:6px; color:var(--text-heading);">'
        'Action: Retailer legally required to reimburse full amount.</div>
      </div>

      <div class="item-card alert-warn">
        <span class="badge b-warn">Price Creep (+40%)</span>
        <div class="item-title">Unannounced Rate Hike</div>
        <div class="item-meta">Cloud Backup Vault increased charge from €9.99 to €13.99.</div>
        <div class="item-math">Annualized silent leakage: €48.00 / year.</div>
      </div>

      <div class="item-card alert-warn">
        <span class="badge b-warn">Missing Receipt Anti-Join</span>
        <div class="item-title">Outflow >€50 Without Tax Proof</div>
        <div class="item-meta">€85.50 outflow at Leroy Merlin has no linked receipt on file.</div>
        <div class="item-meta" style="margin-top:4px;">'
        'Risk: Home insurance and warranty proof invalid without invoice.</div>
      </div>

      <div class="item-card alert-danger">
        <span class="badge b-danger">Utility Surge (+52%)</span>
        <div class="item-title">Electricity Outlay Surge</div>
        <div class="item-meta">PPC Electricity billed €168.00 against €110 baseline (+52.7%).</div>
        <div class="item-meta" style="margin-top:4px;">'
        'Action: Check meter malfunction or thermal insulation loss.</div>
      </div>
    </div>

    <!-- COLUMN 3: RETURN-OF-CONTROL COMMAND CENTER -->
    <div class="col-card">
      <div class="col-header">
        <div>
          <div class="col-title">3. Return-of-Control (ROC)</div>
          <div class="col-subtitle">Human authorization before external dispatch</div>
        </div>
      </div>

      <div class="roc-card" style="margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong class="roc-title">Statutory Claim Dispatch (#1)</strong>
          <span class="badge b-success">€185.00 Claim</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin:8px 0;">
          This is an illustrative template, not an approved notice or a delivery receipt.
          Open the application to prepare and review an exact simulated notice:
        </p>

        <div class="letter-box">{claim_letter}</div>

        <p style="margin-top:14px;">Approval and dispatch are unavailable on this read-only page.</p>
      </div>

      <div class="roc-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong class="roc-title">Trial Expiry Intervention (#2)</strong>
          <span class="badge b-danger">Auto-bill in 3 Days</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin:8px 0;">
          Fitness Stream Pro free trial expires 2026-09-14. Zero watch activity observed in 10 days.
        </p>
        <p>Illustrative alert only. No subscription is cancelled and no savings are recorded.</p>
      </div>
    </div>
  </div>

  <footer class="meta-bar">
    <div>Hestia AWS · Everyday Agents Track · 100% Serverless on AWS Lambda</div>
    <div>Zero arithmetic hallucinations · Integer-precision math · Strands Agents SDK</div>
  </footer>
</div>

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

