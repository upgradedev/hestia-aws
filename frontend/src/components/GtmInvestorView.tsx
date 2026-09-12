import React from 'react';

export const GtmInvestorView: React.FC = () => {
  return (
    <div className="space-y-8" data-testid="commercial-claims">
      {/* Top Value Prop Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/30 p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
            COMMERCIAL HYPOTHESES & EVIDENCE GAPS
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
            DISCOVERY STAGE
          </span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
          A household review workflow to validate
        </h2>
        <p className="text-xs lg:text-sm text-slate-300 mt-2 max-w-4xl leading-relaxed">
          The proposed audience is households organising appliance receipts, recurring charges and repair follow-up. The source demonstrates review, explicit simulated approval and case history. Demand, pricing and household outcomes still need evidence; no paid model or bank connection is active.
        </p>
      </div>

      {/* Market Sizing TAM / SAM / SOM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-6 border border-white/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">TOTAL ADDRESSABLE MARKET</div>
          <div className="text-3xl font-black text-white font-mono mt-1">Unknown</div>
          <div className="text-xs font-semibold text-amber-400 mt-1">No sourced household cohort</div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Market size is unknown. Establish a dated household population, a defined segment and evidence of the problem before estimating spend.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-amber-500/30 bg-amber-950/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">SERVICEABLE ADDRESSABLE MARKET</div>
          <div className="text-3xl font-black text-amber-400 font-mono mt-1">Unknown</div>
          <div className="text-xs font-semibold text-white mt-1">Segment hypothesis</div>
          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            Start with households managing an appliance repair and scattered proof of purchase. Reach, willingness to try and supported jurisdictions are unverified.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-emerald-950/10 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">OBTAINABLE MARKET</div>
          <div className="text-3xl font-black text-emerald-400 font-mono mt-1">Unknown</div>
          <div className="text-xs font-semibold text-white mt-1">No acquisition cohort</div>
          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            There is no acquisition or conversion sample here. A forecast needs observed funnel data, retention and a validated price.
          </p>
        </div>
      </div>

      {/* Dual Revenue Engine: B2C vs B2B2C */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stream 1: B2C Consumer SaaS */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                HYPOTHESIS 01 // HOUSEHOLD PLAN
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                Direct to Homeowner
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mt-3">Proposed household subscription</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              A possible plan would help people organise review and follow-up. Bank feeds are not connected and actual receipt OCR is disabled.
            </p>

            <div className="mt-4 space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-white">Demo review workflow</div>
                  <div className="text-slate-400 text-[11px]">Synthetic facts, exact notice review and simulated case history</div>
                </div>
                <span className="font-mono text-slate-400">Implemented source</span>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-white">Paid plan: not offered</div>
                  <div className="text-slate-300 text-[11px]">Price and scope need validation; OCR and provider dispatch are disabled</div>
                </div>
                <span className="font-mono text-amber-400 font-bold">ROI unmeasured</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>Acquisition cost: unknown</span>
            <span className="text-emerald-400">Lifetime value: unknown</span>
          </div>
        </div>

        {/* Stream 2: B2B2C Embedded Neobank API */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                HYPOTHESIS 02 // PARTNER WORKFLOW
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                Neobanks & Insurtech
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mt-3">Proposed embedded review workflow</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              A future partner could expose review and follow-up inside its own product. No partner deployment, agreement or SDK integration is evidenced here.
            </p>

            <div className="mt-4 space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-white">Per-user pricing: unknown</div>
                  <div className="text-slate-400 text-[11px]">Requires partner discovery and a reviewed integration contract</div>
                </div>
                <span className="font-mono text-indigo-400">Cost unmeasured</span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-white">Outcome-based pricing: unvalidated</div>
                  <div className="text-slate-300 text-[11px]">Would require independently verified outcomes and legal review</div>
                </div>
                <span className="font-mono text-emerald-400 font-bold">No revenue evidence</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>Churn effect: unmeasured</span>
            <span className="text-indigo-400">API margin: unmeasured</span>
          </div>
        </div>
      </div>

      {/* Unit Economics & AWS Serverless Margins */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/10 mb-4">
          <h3 className="text-base font-bold text-white">
            Unit economics: evidence still needed
          </h3>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            Gross margin: unmeasured
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">Validated price / user</div>
            <div className="text-lg font-bold text-white font-mono mt-1">Unknown</div>
            <div className="text-[10px] text-slate-500 mt-0.5">No pricing study</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">Cost per completed case</div>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">Unmeasured</div>
            <div className="text-[10px] text-slate-500 mt-0.5">No billed workload sample</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">Blended CAC</div>
            <div className="text-lg font-bold text-amber-400 font-mono mt-1">Unknown</div>
            <div className="text-[10px] text-slate-500 mt-0.5">No acquisition cohort</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="text-[10px] font-mono text-slate-400 uppercase">LTV / CAC Ratio</div>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">Unknown</div>
            <div className="text-[10px] text-slate-500 mt-0.5">No retention cohort</div>
          </div>
        </div>
      </div>

      {/* European Regulatory & Data Moat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 border border-indigo-500/20 p-6 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider text-indigo-400">
            Legal applicability: review required
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            A useful review workflow needs the purchase facts, defect history, jurisdiction and available evidence. Deterministic date calculations and generated text do not establish a remedy, legal certification or a defensible market position.
          </p>
          <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-[11px] font-mono text-indigo-300">
            Official references and jurisdiction-specific review pending
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/20 p-6 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider text-emerald-400">
            Merchant outcomes: no measured cohort
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Simulated approvals and user-entered outcomes cannot establish merchant settlement rates. A future study needs consent, independently verified replies, sample definitions and observation dates.
          </p>
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-center">
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">Settlement</div>
              <div className="text-emerald-400 font-bold">Unknown</div>
              <div className="text-slate-500 text-[10px]">No verified cohort</div>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">Duration</div>
              <div className="text-emerald-400 font-bold">Unmeasured</div>
              <div className="text-slate-500 text-[10px]">No timed cohort</div>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-white/5">
              <div className="text-slate-400 text-[10px]">Real recovery</div>
              <div className="text-emerald-400 font-bold">Unmeasured</div>
              <div className="text-slate-500 text-[10px]">No receipt cohort</div>
            </div>
          </div>
        </div>
      </div>

      {/* B2B2C Embedded Neobank API Sandbox */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
              PROPOSED PARTNER CONTRACT
            </span>
            <h3 className="text-base font-bold text-white">
              Partner payload illustration: not connected
            </h3>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            No partner endpoint deployed
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-[#080b10] border border-white/10 space-y-2">
            <span className="text-slate-400 uppercase text-[10px]">Synthetic input sketch; no request sent</span>
            <pre className="text-indigo-300 overflow-x-auto leading-relaxed">
{`{
  "mode": "synthetic_example",
  "partner_id": "example-partner",
  "subject_reference": "fictional-household",
  "outflow": {
    "merchant": "Example appliance shop",
    "amount_cents": 18500,
    "mcc": "5732",
    "currency": "EUR"
  }
}`}
            </pre>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080b10] border border-emerald-500/30 space-y-2">
            <span className="text-emerald-400 uppercase text-[10px]">Proposed response shape; not a runtime result</span>
            <pre className="text-emerald-300 overflow-x-auto leading-relaxed">
{`{
  "mode": "synthetic_example",
  "connection": "not_connected",
  "legal_eligibility": "requires_review",
  "verified_recovery_eur": null,
  "next_step": "review_supplied_facts"
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

