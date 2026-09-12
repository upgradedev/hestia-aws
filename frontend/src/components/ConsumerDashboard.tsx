import React from 'react';
import { HouseholdSummary, SentinelAlert, DispatchRecord } from '../types';
import { errorMessage } from '../api';

interface ConsumerDashboardProps {
  summary: HouseholdSummary;
  alerts: SentinelAlert[];
  dispatchHistory: DispatchRecord[];
  onOpenNoticeModal: (itemId?: string) => void;
  householdName: string;
  snapshotVersion?: number;
  snapshotObservedAt?: string;
  actionsDisabled: boolean;
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
  householdName,
  snapshotVersion,
  snapshotObservedAt,
  actionsDisabled,
  onOpenNoticeModal,
  onCancelTrial,
  onOpenReceiptModal,
  onOpenUtilityDisputeModal,
  onViewAllAssets,
  onViewAllSubscriptions,
}) => {
  const [isProcessingSub, setIsProcessingSub] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const handleSubCancel = async (subId: string) => {
    if (isProcessingSub || actionsDisabled) return;
    setIsProcessingSub(true);
    setError(null); setMessage(null);
    try {
      const confirmed = await onCancelTrial(subId);
      if (!confirmed) throw new Error('The server did not confirm the request.');
      setMessage('Simulated cancellation request recorded. No provider subscription was cancelled; monthly risk is unchanged.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setIsProcessingSub(false);
    }
  };

  const warrantyAlert = alerts.find((a) => a.category === 'warranty_claim');
  const hasWarrantyAlert = !!warrantyAlert;
  const trialAlert = alerts.find((a) => a.action_type === 'cancel_trial');
  const priceCreepAlert = alerts.find((a) => a.category === 'price_creep' && a.action_type !== 'cancel_trial');
  const receiptAlert = alerts.find((a) => a.category === 'receipt_gap');
  const utilityAlert = alerts.find((a) => a.category === 'utility_surge');

  const pendingCount = alerts.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {actionsDisabled && <p className="text-xs text-amber-300">Begin or recover the isolated demo session to review and simulate actions.</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {message && <p role="status" className="text-amber-300">{message}</p>}
      <details data-testid="metric-definitions" className="text-xs text-slate-400">
        <summary className="cursor-pointer">Where these metrics come from</summary>
        <p className="mt-2">Source: canonical records in this synthetic household snapshot. Version {snapshotVersion ?? 'unavailable'}; observed {snapshotObservedAt ?? 'unavailable'}.</p>
        <p>Repair costs sum open recorded repairs. Purchase value sums recorded appliance prices, not insured value. Monthly subscription exposure includes trial charges and positive price changes. Missing receipts sum unlinked outflows of at least €50. None of these amounts is money recovered.</p>
      </details>
      {/* 1. TOP 3-SECOND METRIC CARDS (Clear, Large Numbers, Zero Jargon) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Money to Claim */}
        <div className="rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900/90 to-slate-900 border border-rose-500/30 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
              Recorded Repair Costs
            </span>
            {hasWarrantyAlert && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
            )}
          </div>
          <div data-testid="recovery-amount" className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{summary.potential_recovery_eur.toFixed(2)}
          </div>
          <p className="text-xs text-amber-300 mt-2">Evidence to review, not an entitlement or money recovered.</p>
          <p className="text-xs text-slate-300 mt-2">
            {hasWarrantyAlert
              ? warrantyAlert?.description
              : 'No open repair claim in this snapshot'}
          </p>
        </div>

        {/* Metric 2: Protected Goods */}
        <div
          onClick={onViewAllAssets}
          role="button" tabIndex={0} aria-label="View recorded household assets"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onViewAllAssets(); } }}
          className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-850 border border-white/10 p-5 shadow-xl hover:border-amber-400/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-amber-300">
              Recorded Appliances
            </span>
            <span className="text-xs font-mono text-amber-300 font-bold">Review required</span>
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{summary.protected_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{summary.active_warranties_count} recorded household assets</span>
            <span className="text-amber-400 underline font-medium">View vault &rarr;</span>
          </p>
        </div>

        {/* Metric 3: Subscription Leakage Risk */}
        <div
          onClick={onViewAllSubscriptions}
          role="button" tabIndex={0} aria-label="Review recorded subscriptions"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onViewAllSubscriptions(); } }}
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
            <span>{trialAlert ? 'Trial requires review' : 'Recurring expenses in this snapshot'}</span>
            <span className="text-purple-400 underline font-medium">Audit &rarr;</span>
          </p>
        </div>

        {/* Metric 4: Receipts Missing Proof */}
        <div
          onClick={onOpenReceiptModal}
          role="button" tabIndex={0} aria-label="Review missing receipt evidence"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenReceiptModal(); } }}
          className="rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/30 p-5 shadow-xl hover:border-amber-400/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Missing Receipt Proof
            </span>
            <span className="text-xs font-mono text-amber-400">Recorded Outlays ≥ €50</span>
          </div>
          <div className="text-3xl lg:text-4xl font-black text-white font-mono mt-2">
            €{(summary.missing_receipts_eur ?? 0).toFixed(2)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{alerts.filter(a => a.category === 'receipt_gap').length} purchases need a receipt reference</span>
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
                      RECORDED REPAIR // ELIGIBILITY UNCONFIRMED
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {warrantyAlert?.title}
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-emerald-400 self-start sm:self-auto">
                  €{warrantyAlert?.potential_savings_eur.toFixed(2)}
                </span>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                <p>
                  {warrantyAlert?.description}
                </p>
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 text-[11px] text-slate-300">
                  <strong className="text-amber-300">Review required:</strong> Request a server preview using the selected appliance's recorded facts. Simulation does not establish legal eligibility or record money recovered.
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => onOpenNoticeModal(warrantyAlert?.item_id)}
                  disabled={actionsDisabled || !warrantyAlert?.item_id}
                  data-testid="review-claim"
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>{warrantyAlert?.action_label}</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">Exact preview before approval</span>
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
                      TRIAL EXPIRATION REVIEW
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {trialAlert.title}
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-purple-300 self-start sm:self-auto">
                  €{trialAlert.potential_savings_eur.toFixed(2)}/mo
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {trialAlert.description}
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => { if (trialAlert.item_id) void handleSubCancel(trialAlert.item_id); }}
                  disabled={isProcessingSub || actionsDisabled || !trialAlert.item_id}
                  data-testid="cancel-trial"
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isProcessingSub ? (
                    <span>Recording simulated request...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>Simulate Cancellation Request</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] text-slate-500 font-mono">No provider cancellation</span>
              </div>
            </div>
          )}

          {/* Action Card 2b: Stealth Price Creep Audit */}
          {priceCreepAlert && (
            <div className="rounded-2xl bg-[#0e1420] border border-amber-500/30 p-6 shadow-xl space-y-4 hover:border-amber-400 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs">
                    EUR
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                      RECORDED SUBSCRIPTION PRICE CHANGE
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {priceCreepAlert.title}
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-amber-300 self-start sm:self-auto">
                  +€{(priceCreepAlert.potential_savings_eur * 12).toFixed(2)}/yr
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {priceCreepAlert.description}
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
                  <span>Review Subscription Facts</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">No provider change confirmed</span>
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
                      RECEIPT REFERENCE // ≥ €50 OUTLAY
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {receiptAlert.title}
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-amber-300 self-start sm:self-auto">
                  €{receiptAlert.potential_savings_eur.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {receiptAlert.description}
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
                  <span>Receipt Options (Scanning Unavailable)</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">Manual demo link available</span>
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
                      DOMESTIC OVERHEAD // BILL REVIEW
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {utilityAlert.title}
                    </h3>
                  </div>
                </div>
                <span className="text-lg font-black font-mono text-cyan-300 self-start sm:self-auto">
                  €{utilityAlert.potential_savings_eur.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {utilityAlert.description}
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onOpenUtilityDisputeModal}
                  disabled={actionsDisabled}
                  data-testid="review-utility"
                  className="w-full sm:w-auto flex-1 min-h-[44px] py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                  </svg>
                  <span>Review Recorded Utility Difference</span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono">Simulated request only</span>
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
              <h3 className="text-base font-bold text-white">No Pending Items in This Snapshot</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                This synthetic snapshot is not evidence of provider contact, payment, or legal protection.
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
                Household Evidence Status
              </h4>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                Demo snapshot
              </span>
            </div>

            <p data-testid="dashboard-real-recovery" className="text-sm text-slate-300">Real recovered money: €0.00. Provider delivery and legal eligibility are unconfirmed.</p>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Purchase and repair facts require review</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Review purchase records and supporting evidence. This demo does not determine legal entitlement.
              </p>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-white/10 flex items-center justify-between">
              <span>{householdName}</span>
              <span className="text-amber-400 font-bold">Simulation</span>
            </div>
          </div>

          {/* Verified Dispatches & Audit Trail */}
          <div className="rounded-2xl bg-[#0c1017] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Recent Dispute Audit Log
              </h4>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                Server records
              </span>
            </div>

            <div className="space-y-3" data-testid="dispatch-history">
              {dispatchHistory.length === 0 && <p className="text-xs text-slate-400">No recorded approvals in this session.</p>}
              {dispatchHistory.map((d) => (
                <div key={d.id} data-testid="dispatch-record" className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white">{d.seller}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        {d.status === 'accepted' ? 'Accepted by provider; delivery unconfirmed' : d.status === 'unknown' ? 'Unknown outcome' : d.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300">{d.letter_preview}</p>
                  <p className="text-[10px] text-slate-400">{d.seller_email} · {d.id}</p>
                  {d.status === 'simulated' && <p className="text-[10px] text-amber-300">Simulation only. No email sent or recovery recorded.</p>}
                  {d.historical_status && <p className="text-[10px] text-amber-300">Historical label: {d.historical_status}. Outcome unverified.</p>}
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
