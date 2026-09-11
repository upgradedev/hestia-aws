import React from 'react';

export const GtmInvestorView: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Top Value Prop Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/30 p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
            INVESTOR & GO-TO-MARKET ARCHITECTURE
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
            EUROPEAN REGULATORY MOAT
          </span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
          Commercializing the €38.4B Unclaimed Domestic Wealth Horizon
        </h2>
        <p className="text-xs lg:text-sm text-slate-300 mt-2 max-w-4xl leading-relaxed">
          While US fintechs focus purely on card subscription cancellations, European households operate under the most powerful consumer protection regime on earth: <strong className="text-white font-semibold">Directive (EU) 2019/771</strong> and the <strong className="text-white font-semibold">Right to Repair Directive (EU) 2024/1799</strong>. Hestia combines deterministic statutory knowledge with Amazon Bedrock to create the first autonomous domestic legal sentinel.
        </p>
      </div>

      {/* Market Sizing TAM / SAM / SOM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-6 border border-white/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">TOTAL ADDRESSABLE MARKET</div>
          <div className="text-3xl font-black text-white font-mono mt-1">€38.4B</div>
          <div className="text-xs font-semibold text-amber-400 mt-1">220M EU Households</div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Calculated at an average €175 per household annual economic leakage across expired warranties, hidden tier hikes, and unbacked outlays.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-amber-500/30 bg-amber-950/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">SERVICEABLE ADDRESSABLE MARKET</div>
          <div className="text-3xl font-black text-amber-400 font-mono mt-1">€4.2B</div>
          <div className="text-xs font-semibold text-white mt-1">24M Digital DACH + Western Europe</div>
          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            Tech-forward households utilizing Open Banking, digital neo-banks (N26, Revolut, Bunq), and active high-ticket domestic e-commerce.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-emerald-950/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">SERVICEABLE OBTAINABLE MARKET (Y3)</div>
          <div className="text-3xl font-black text-emerald-400 font-mono mt-1">€84M</div>
          <div className="text-xs font-semibold text-white mt-1">500,000 Paying Households / B2B2C Seats</div>
          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            Achieved through dual distribution: Direct consumer subscription (€49/year) plus embedded fintech API white-labeling.
          </p>
        </div>
      </div>

      {/* Dual Revenue Engine: B2C vs B2B2C */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stream 1: B2C Consumer SaaS */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                STREAM 01 // B2C FREEMIUM
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                Direct to Homeowner
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mt-3">Hestia Consumer Subscription</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Everyday consumers connect their bank feed or upload invoices for immediate detection.
            </p>

            <div className="mt-4 space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">Free Sentinel Tier (€0/mo)</div>
                  <div className="text-slate-400 text-[11px]">Asset catalog, calendar expiry alerts, receipt anti-join scanning</div>
                </div>
                <span className="font-mono text-slate-400">Top-of-Funnel</span>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">Hestia Pro (€4.99/mo or €49/yr)</div>
                  <div className="text-slate-300 text-[11px]">Autonomous Return-of-Control dispatches, formal legal notices, unlimited OCR</div>
                </div>
                <span className="font-mono text-amber-400 font-bold">8.2x ROI for User</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Target CAC: €18.50</span>
            <span className="text-emerald-400">Projected LTV: €152.00</span>
          </div>
        </div>

        {/* Stream 2: B2B2C Embedded Neobank API */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                STREAM 02 // B2B2C EMBEDDED API
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                Neobanks & Insurtech
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mt-3">Embedded Return-of-Control SDK</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              European neobanks (Revolut, N26, Bunq) white-label Hestia to reduce card churn and boost premium account stickiness.
            </p>

            <div className="mt-4 space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">Per-User License (€1.20 - €1.80/mo)</div>
                  <div className="text-slate-400 text-[11px]">Embedded directly inside banking app 'Card Perks' or 'Wealth Shield' tab</div>
                </div>
                <span className="font-mono text-indigo-400">Zero CAC</span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">Success-Fee Recovery Share (15%)</div>
                  <div className="text-slate-300 text-[11px]">Revenue split on successful out-of-pocket statutory reimbursements</div>
                </div>
                <span className="font-mono text-emerald-400 font-bold">Pure Upside</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Bank Churn Reduction: -14%</span>
            <span className="text-indigo-400">High API Margin: ~92%</span>
          </div>
        </div>
      </div>

      {/* Unit Economics & AWS Serverless Margins */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <h3 className="text-base font-bold text-white">
            Unit Economics & AWS Serverless Cost Profile
          </h3>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            Gross Margin: ~88%
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">Monthly Price / User</div>
            <div className="text-lg font-bold text-white font-mono mt-1">€4.99</div>
            <div className="text-[10px] text-slate-500 mt-0.5">B2C Subscription</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">AWS Serverless COGS</div>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">&lt;€0.04</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Bedrock Haiku + Lambda</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">Blended CAC</div>
            <div className="text-lg font-bold text-amber-400 font-mono mt-1">€18.50</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Payback in 3.8 months</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">LTV / CAC Ratio</div>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">8.2x</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Top Decile SaaS</div>
          </div>
        </div>
      </div>

      {/* European Regulatory & Data Moat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 border border-indigo-500/20 p-6 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider text-indigo-400">
            The Statutory Moat: Why US Big Tech Cannot Replicate
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            US competitors (Mint, Rocket Money, Copilot) are built purely around US card aggregators and voluntary merchant refund APIs. They have no concept of European statutory 24-month liability, reverse burden of proof periods, German Civil Code (BGB) § 437/439 rules, or European Order for Payment (EOP) procedures. Hestia is natively codified for European civil law.
          </p>
          <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-[11px] font-mono text-indigo-300">
            &bull; Directive (EU) 2019/771 &bull; Right to Repair (EU) 2024/1799 &bull; BGB § 437
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/20 p-6 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider text-emerald-400">
            Proprietary Merchant Intelligence Moat
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every sealed claim generates an empirical datapoint on merchant compliance cycles. At 100,000 households, Hestia becomes the proprietary intelligence benchmark for European retailer warranty adherence.
          </p>
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-center">
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">MediaMarkt</div>
              <div className="text-emerald-400 font-bold">92% Settle</div>
              <div className="text-slate-500 text-[10px]">8 days avg</div>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">Amazon EU</div>
              <div className="text-emerald-400 font-bold">98% Settle</div>
              <div className="text-slate-500 text-[10px]">48h avg</div>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">IKEA DE</div>
              <div className="text-emerald-400 font-bold">95% Settle</div>
              <div className="text-slate-500 text-[10px]">5 days avg</div>
            </div>
          </div>
        </div>
      </div>

      {/* B2B2C Embedded Neobank API Sandbox */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
              B2B2C EMBEDDED INTEGRATION
            </span>
            <h3 className="text-base font-bold text-white">
              Partner API Playground: Ingest PSD2 Card Feeds (Revolut / N26)
            </h3>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            POST /api/v1/partner/ingest_stream
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-[#080b10] border border-white/10 space-y-2">
            <span className="text-slate-400 uppercase text-[10px]">Inbound Neobank Telemetry (JSON)</span>
            <pre className="text-indigo-300 overflow-x-auto leading-relaxed">
{`{
  "partner_id": "revolut-eu-prod",
  "user_token": "usr_9941a82f",
  "outflow": {
    "merchant": "MediaMarkt Munich",
    "amount_cents": 18500,
    "mcc": "5732",
    "currency": "EUR"
  }
}`}
            </pre>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080b10] border border-emerald-500/30 space-y-2">
            <span className="text-emerald-400 uppercase text-[10px]">Hestia Return-of-Control Dispatch (Response)</span>
            <pre className="text-emerald-300 overflow-x-auto leading-relaxed">
{`{
  "status": "statutory_warranty_gap_detected",
  "eligible_directive": "2019/771/EU Article 10",
  "potential_recovery_eur": 185.00,
  "action_required": "human_roc_signature_gate",
  "in_app_card_prompt": "Claim €185 repair refund"
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

