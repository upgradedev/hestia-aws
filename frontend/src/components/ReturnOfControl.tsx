import React, { useState } from 'react';
import { SentinelAlert, ApplianceWarranty, DispatchRecord } from '../types';
import { errorMessage } from '../api';

interface ReturnOfControlProps {
  selectedAlert: SentinelAlert | null;
  selectedAppliance: ApplianceWarranty | null;
  dispatchHistory: DispatchRecord[];
  onCancelTrial: (subId: string) => Promise<boolean>;
  onInspectDocument?: () => void;
}

export const ReturnOfControl: React.FC<ReturnOfControlProps> = ({
  selectedAlert,
  selectedAppliance,
  dispatchHistory,
  onCancelTrial,
  onInspectDocument,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeItem = selectedAppliance;
  const isWarrantyClaim = selectedAlert?.category === 'warranty_claim' || !!selectedAppliance;

  const handleApproveAction = async () => {
    setIsSubmitting(true);
    setSuccessMessage(null);
    setError(null);
    try {
      if (isWarrantyClaim) {
        if (!onInspectDocument) throw new Error('Open Action Center to review the exact server notice.');
        onInspectDocument();
      } else if (selectedAlert?.action_type === 'cancel_trial') {
        const subId = selectedAlert.item_id;
        if (!subId) throw new Error('Select a subscription from the current server state.');
        const ok = await onCancelTrial(subId);
        if (ok) {
          setSuccessMessage('Simulated request recorded. No provider subscription was cancelled.');
        } else throw new Error('The request was not confirmed.');
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col h-full border border-white/10 shadow-xl shadow-black/40">
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {/* Column Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">ACTION // 03</span>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            Return-of-Control (ROC)
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
              HUMAN GATE
            </span>
          </h2>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Review Recorded Facts
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2.5 animate-fade-in shadow-lg shadow-emerald-950/30">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Action Stage / Command Console */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {isWarrantyClaim && activeItem ? (
          <div className="space-y-3">
            <div className="glass-card rounded-xl p-4 border border-rose-500/30 bg-gradient-to-b from-rose-950/20 to-slate-900/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-300 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span>
                  SERVER PREVIEW REQUIRED
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  Value: €{activeItem.price_eur.toFixed(2)}
                </span>
              </div>

              <h3 className="text-sm font-bold text-white mb-1">
                Recorded Repair for {activeItem.brand} {activeItem.name}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Commercial guarantee terms and statutory rights are separate. Delivery facts, jurisdiction and the appropriate remedy require review; this snapshot does not establish entitlement.
              </p>

              {/* Pre-Drafted Formal Legal Letter Box */}
              <div className="rounded-lg bg-[#080b11] border border-white/10 p-3.5 font-mono text-[11px] text-slate-300 leading-relaxed max-h-48 overflow-y-auto shadow-inner">
                <div className="text-slate-400 border-b border-white/10 pb-2 mb-2">
                  <div><strong>TO:</strong> {activeItem.seller_name} &lt;{activeItem.seller_email}&gt;</div>
                  <div><strong>SUBJECT:</strong> Formal Notice of Lack of Conformity: {activeItem.model} (Invoice #{activeItem.receipt_id})</div>
                  <div><strong>LEGAL BASIS:</strong> Directive (EU) 2019/771, Article 10(1) & Article 13</div>
                </div>
                <p className="mb-2">Dear Customer Relations,</p>
                <p className="mb-2">
                  I hereby notify you of a lack of conformity regarding {activeItem.brand} {activeItem.name} (Model: {activeItem.model}), purchased on {activeItem.purchase_date} under Invoice #{activeItem.receipt_id}.
                </p>
                <p className="mb-2">
                  The goods exhibit the following defect: "{activeItem.defect_description || 'Functional failure'}".
                </p>
                <p className="mb-2">
                  Please review the recorded issue and supporting evidence. This illustration does not establish legal eligibility or authorize any external action.
                </p>
              </div>

              {/* Modal trigger link */}
              {onInspectDocument && (
                <div className="mt-2 text-right">
                  <button
                    onClick={onInspectDocument}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Review Exact Server-Prepared Notice</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                </div>
              )}

              {/* 1-Click Approve Dispatch Button */}
              <div className="mt-3 pt-2 border-t border-white/10">
                <button
                  onClick={handleApproveAction}
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Opening exact notice...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span>Review Server Notice Before Approval</span>
                    </>
                  )}
                </button>
                <div className="text-[10px] text-center text-slate-400 mt-2 font-mono">
                  Illustration only. Approval requires the exact server preview in Action Center.
                </div>
              </div>
            </div>
          </div>
        ) : selectedAlert?.action_type === 'cancel_trial' ? (
          <div className="glass-card rounded-xl p-4 border border-purple-500/30 bg-purple-950/15">
            <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold">
              SUBSCRIPTION DEFENSE
            </span>
            <h3 className="text-sm font-bold text-white mt-1 mb-1">
              {selectedAlert.title}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              {selectedAlert.description} This action records a simulation only; provider status does not change.
            </p>
            <button
              onClick={handleApproveAction}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Recording simulated request...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>Record Simulated Cancellation Request</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-6 border border-white/5 text-center flex flex-col items-center justify-center min-h-[220px]">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-400 mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-200">Awaiting Trigger</h3>
            <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
              Select an item or alert in Column 1 or 2 to inspect pre-drafted statutory notices or trigger ROC actions.
            </p>
          </div>
        )}

        {/* Audit Log / Dispute Timeline */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Dispute Audit Trail ({dispatchHistory.length})
            </span>
            <span className="text-[10px] text-slate-300 font-mono">Stored history; inspect exact receipts</span>
          </div>

          <div className="space-y-2">
            {dispatchHistory.map((rec) => (
              <div key={rec.id} className="p-2.5 rounded-lg bg-slate-900/80 border border-white/5 text-xs">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>{rec.timestamp}</span>
                  <span className="text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    {rec.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-200">{rec.seller}</div>
                <div className="text-[10px] text-slate-400 font-mono truncate">{rec.statutory_basis}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
