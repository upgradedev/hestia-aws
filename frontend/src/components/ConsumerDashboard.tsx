import React from 'react';
import { HouseholdSummary, SentinelAlert, DispatchRecord } from '../types';

interface ConsumerDashboardProps {
  summary: HouseholdSummary;
  alerts: SentinelAlert[];
  dispatchHistory: DispatchRecord[];
  onOpenNoticeModal: () => void;
  onCancelTrial: (subId: string) => Promise<boolean>;
  onOpenReceiptModal: () => void;
  onOpenUtilityDisputeModal?: () => void;
  onViewAllAssets: () => void;
  onViewAllSubscriptions: () => void;
}

export const ConsumerDashboard: React.FC<ConsumerDashboardProps> = ({
  summary,
  alerts,
  dispatchHistory,
  onOpenNoticeModal,
  onCancelTrial,
  onOpenReceiptModal,
  onOpenUtilityDisputeModal,
  onViewAllAssets,
  onViewAllSubscriptions,
}) => {
  const [isProcessingSub, setIsProcessingSub] = React.useState(false);

  const handleSubCancel = async (subId: string) => {
    setIsProcessingSub(true);
    try {
      await onCancelTrial(subId);
    } finally {
      setIsProcessingSub(false);
    }
  };

  const hasWarrantyAlert = alerts.some((a) => a.category === 'warranty_claim');
  const trialAlert = alerts.find((a) => a.action_type === 'cancel_trial');
  const priceCreepAlert = alerts.find((a) => a.category === 'price_creep' && a.action_type !== 'cancel_trial');
  const receiptAlert = alerts.find((a) => a.category === 'receipt_gap');
  const utilityAlert = alerts.find((a) => a.category === 'utility_surge');

  const pendingCount = alerts.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. TOP 3-SECOND METRIC CARDS (Clear, Large Numbers, Zero Jargon) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Money to Claim */}
        <div className="rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900/90 to-slate-900 border border-rose-500/30 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
              Money Waiting to Claim
            </span>
            {hasWarrantyAlert && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
            )}
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{summary.potential_recovery_eur.toFixed(2)}
          </div>
          <p className="text-xs text-slate-300 mt-2">
            {hasWarrantyAlert
              ? 'Bosch repair reimbursement ready for MediaMarkt'
              : 'All statutory repairs currently settled'}
          </p>
        </div>

        {/* Metric 2: Protected Goods */}
        <div
          onClick={onViewAllAssets}
          className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-850 border border-white/10 p-5 shadow-xl hover:border-amber-400/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-amber-300">
              Protected Appliances
            </span>
            <span className="text-xs font-mono text-emerald-400 font-bold">2-Year Law</span>
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{summary.protected_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{summary.active_warranties_count} household assets protected</span>
            <span className="text-amber-400 underline font-medium">View vault &rarr;</span>
          </p>
        </div>

        {/* Metric 3: Subscription Leakage Risk */}
        <div
          onClick={onViewAllSubscriptions}
          className="rounded-2xl bg-gradient-to-br from-purple-950/30 via-slate-900 to-slate-900 border border-purple-500/30 p-5 shadow-xl hover:border-purple-400/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
              Subscription Risk
            </span>
            <span className="text-xs font-mono text-purple-400">Monthly</span>
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{summary.leakage_detected_monthly_eur.toFixed(2)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{trialAlert ? '1 free trial expiring in 48h' : 'Recurring expenses audited'}</span>
            <span className="text-purple-400 underline font-medium">Audit &rarr;</span>
          </p>
        </div>

        {/* Metric 4: Receipts Missing Proof */}
        <div
          onClick={onOpenReceiptModal}
          className="rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/30 p-5 shadow-xl hover:border-amber-400/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Missing Receipt Proof
            </span>
            <span className="text-xs font-mono text-amber-400">Card Outlays &gt; €50</span>
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{receiptAlert ? '85.00' : '0.00'}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{receiptAlert ? '1 purchase needs invoice' : 'All receipts matched'}</span>
            <span className="text-amber-400 underline font-medium">Upload &rarr;</span>
          </p>
        </div>
      </div>

      {/* 2. MAIN SECTION: ACTION INBOX (What Needs Your Decision Today) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2-Cols: Priority Action Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">Action Center</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                {pendingCount} Items Need Decision
              </span>
            </div>
            <span className="text-xs text-slate-400">Zero actions taken without your click</span>
          </div>

          {/* Action Card 1: Statutory Warranty Repair Reimbursement */}
          {hasWarrantyAlert && (
            <div className="rounded-2xl bg-[#0e1420] border-2 border-rose-500/40 p-6 shadow-xl space-y-4 hover:border-rose-500 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-base">
                    €
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-rose-400 font-bold uppercase">
                      STATUTORY WARRANTY DEFECT // 24-MONTH HORIZON
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Claim €185.00 Repair Cost from MediaMarkt
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-emerald-400 self-start sm:self-auto">
                  +€185.00
                </span>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                <p>
                  Elena, your <strong>Bosch Serie 8 Washing Machine</strong> suffered a bearing failure at month 22. Store staff told you the 1-year guarantee was expired, and you paid <strong>€185.00</strong> out-of-pocket for repair.
                </p>
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 text-[11px] text-slate-300">
                  <strong className="text-amber-300">EU Law Protection:</strong> Under <strong>Directive (EU) 2019/771 Article 10(1)</strong> and German Civil Code BGB § 437, MediaMarkt is strictly liable for 24 months. Hestia has prepared an official reimbursement notice.
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onOpenNoticeModal}
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Review Legal Notice & Claim €185.00</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">14-day legal demand</span>
              </div>
            </div>
          )}

          {/* Action Card 2: Subscription Free Trial Lock-in */}
          {trialAlert && (
            <div className="rounded-2xl bg-[#0e1420] border border-purple-500/40 p-6 shadow-xl space-y-4 hover:border-purple-400 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-purple-400 font-bold uppercase">
                      TRIAL EXPIRATION ALERT // 48 HOURS LEFT
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Cancel FitPulse Pro Trial Before €29.99 Auto-Charge
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-purple-300 self-start sm:self-auto">
                  €29.99/mo
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Your 14-day trial of <strong>FitPulse Pro</strong> expires in 48 hours. If left uncancelled, your debit card ending ••4892 will be automatically debited for €29.99 every month.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => handleSubCancel(trialAlert.item_id || 'sub-002')}
                  disabled={isProcessingSub}
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isProcessingSub ? (
                    <span>Executing cancellation...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>1-Click Terminate Subscription</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] text-slate-500 font-mono">Zero cancellation fee</span>
              </div>
            </div>
          )}

          {/* Action Card 2b: Stealth Price Creep Audit */}
          {priceCreepAlert && (
            <div className="rounded-2xl bg-[#0e1420] border border-amber-500/30 p-6 shadow-xl space-y-4 hover:border-amber-400 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs">
                    +40%
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                      STEALTH PRICE CREEP // DIRECTIVE 93/13/EEC
                    </span>
                    <h3 className="text-base font-bold text-white">
                      CloudVault Pro Unannounced Monthly Price Hike
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-amber-300 self-start sm:self-auto">
                  +€48.00/yr
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                CloudVault Pro quietly increased your monthly debit from €9.99 to €13.99 (+40.0%). Under EU Directive 93/13/EEC on Unfair Terms, unilateral fee hikes without clear notification violate consumer rights.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onViewAllSubscriptions}
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Review Downgrade & Rejection Letter</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">BGB § 307 Protection</span>
              </div>
            </div>
          )}

          {/* Action Card 3: Missing Proof of Purchase (IKEA) */}
          {receiptAlert && (
            <div className="rounded-2xl bg-[#0e1420] border border-amber-500/40 p-6 shadow-xl space-y-4 hover:border-amber-400 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                      PROOF PRESERVATION // &gt; €50 OUTLAY
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Upload Receipt for €85.00 IKEA Purchase
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-amber-300 self-start sm:self-auto">
                  €85.00
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                You paid €85.00 at <strong>IKEA Eching München</strong> on Sept 9. Card charges alone do not specify product serials. Without an itemized receipt, statutory warranty claims will be refused if defects occur.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onOpenReceiptModal}
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  <span>Upload & Scan Receipt (Amazon Bedrock OCR)</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">Secures 2-year warranty</span>
              </div>
            </div>
          )}

          {/* Action Card 4: Utility Anomaly & Meter Dispute */}
          {utilityAlert && (
            <div className="rounded-2xl bg-[#0e1420] border border-cyan-500/40 p-6 shadow-xl space-y-4 hover:border-cyan-400 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase">
                      DOMESTIC OVERHEAD // WATER METER SURGE (+61.4%)
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Dispute €54.00 Excess Water Bill from Stadtwerke München
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-cyan-300 self-start sm:self-auto">
                  +€54.00
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Stadtwerke München Q3 water invoice reached <strong>€142.00</strong> versus your seasonal baseline of <strong>€88.00</strong> (+61.4%). Domestic leakage diagnostic confirmed zero interior leaks during the billing period.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onOpenUtilityDisputeModal}
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                  </svg>
                  <span>Review Meter Calibration Demand & Checklist</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">AVBWasserV § 18 Demand</span>
              </div>
            </div>
          )}

          {pendingCount === 0 && (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">All Household Actions Resolved!</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Your household wealth is fully protected. All warranties are logged, stealth subscriptions are blocked, and proofs are vaulted.
              </p>
            </div>
          )}
        </div>

        {/* Right 1-Col: Protection Status & Verified Activity */}
        <div className="space-y-6">
          {/* Protection Score Card */}
          <div className="rounded-2xl bg-[#0c1017] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Household Shield Status
              </h4>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                94% Protected
              </span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2.5 rounded-full w-[94%]"></div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Statutory 2-Year Horizon Active</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                All consumer electronics purchased in Germany are protected by law until late 2026. Stores cannot refuse repairs.
              </p>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-white/10 flex items-center justify-between">
              <span>Elena Weber &bull; Munich, DE</span>
              <span className="text-emerald-400 font-bold">AWS Lambda Live</span>
            </div>
          </div>

          {/* Verified Dispatches & Audit Trail */}
          <div className="rounded-2xl bg-[#0c1017] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Recent Dispute Audit Log
              </h4>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                S3 Vault Sealed
              </span>
            </div>

            <div className="space-y-3">
              {dispatchHistory.map((d) => (
                <div key={d.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white">{d.seller}</span>
                    <span className="text-emerald-400 font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                      {d.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{d.letter_preview}</p>
                  <div className="text-[10px] text-slate-500 font-mono">{d.timestamp}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
