import React from 'react';
import { SubscriptionTracker, PaymentOutflow } from '../types';
import { errorMessage } from '../api';

interface SubscriptionsViewProps {
  subscriptions: SubscriptionTracker[];
  outflows: PaymentOutflow[];
  actionsDisabled: boolean;
  onCancelTrial: (subId: string) => Promise<boolean>;
  onOpenReceiptModal: () => void;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({
  subscriptions,
  outflows,
  actionsDisabled,
  onCancelTrial,
  onOpenReceiptModal,
}) => {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const handleCancel = async (id: string) => {
    if (pendingId || actionsDisabled) return;
    setPendingId(id); setError(null); setMessage(null);
    try {
      const confirmed = await onCancelTrial(id);
      if (!confirmed) throw new Error('The server did not confirm the request.');
      setMessage('Simulated cancellation request recorded. No provider subscription was cancelled; monthly risk is unchanged.');
    } catch (error) { setError(errorMessage(error)); }
    finally { setPendingId(null); }
  };
  return (
    <div className="space-y-8 animate-fade-in">
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {message && <p role="status" className="text-amber-300">{message}</p>}
      {/* Overview Header */}
      <div className="rounded-2xl bg-[#0e1420] border border-white/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider">
              DOMESTIC OUTFLOW AUDIT
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono border border-purple-500/30">
              ANTI-CREEP SENTINEL
            </span>
          </div>
          <h2 className="text-xl font-black text-white">
            Subscriptions, Stealth Price Hikes & Bank Feeds
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
            Hestia continuously audits recurring card charges for unannounced price creep and flags free trials before auto-renewal lock-ins.
          </p>
        </div>

        <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-right shrink-0">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Monthly Recurring</div>
          <div className="text-lg font-bold text-purple-300 font-mono">
            €{subscriptions.reduce((acc, s) => acc + s.current_monthly_eur, 0).toFixed(2)}/mo
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Active Subscriptions */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center justify-between pb-2 border-b border-white/10">
            <span>Recurring Subscriptions ({subscriptions.length})</span>
            <span className="text-xs text-slate-400 font-mono">Price Creep Detection</span>
          </h3>

          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className={`rounded-xl p-4 border transition-all ${
                  sub.is_trial
                    ? 'bg-purple-950/20 border-purple-500/40'
                    : sub.price_creep_pct > 0
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-[#0c1017] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{sub.name}</h4>
                      {sub.is_trial && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          TRIAL ENDING
                        </span>
                      )}
                      {sub.price_creep_pct > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          +{sub.price_creep_pct}% PRICE HIKE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-1">
                      Next renewal: {sub.next_billing_date}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-white font-mono">
                      €{sub.current_monthly_eur.toFixed(2)}/mo
                    </div>
                    {Boolean(sub.initial_monthly_eur && sub.initial_monthly_eur > 0) && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        was €{sub.initial_monthly_eur.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>

                {sub.is_trial && (
                  <div className="mt-3 pt-3 border-t border-purple-500/20 flex items-center justify-between">
                    <span className="text-xs text-purple-300">Will charge €{sub.renewal_cost_eur.toFixed(2)}/mo</span>
                    <button
                      onClick={() => { void handleCancel(sub.id); }}
                      disabled={actionsDisabled || !!pendingId}
                      className="py-1.5 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer shadow transition-all"
                    >
                      Simulate Cancellation Request
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Bank Card Outflows & Receipt Match */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center justify-between pb-2 border-b border-white/10">
            <span>Bank Card Transactions ({outflows.length})</span>
            <span className="text-xs text-slate-400 font-mono">Receipt Anti-Join &gt; €50</span>
          </h3>

          <div className="space-y-3">
            {outflows.map((tx) => (
              <div
                key={tx.id}
                className={`rounded-xl p-4 border transition-all ${
                  !tx.has_receipt && tx.requires_receipt
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-[#0c1017] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white">{tx.merchant}</h4>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {tx.timestamp} &bull; Card ending ••{tx.card_digits}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-white font-mono">€{tx.amount_eur.toFixed(2)}</div>
                    <div className="mt-0.5">
                      {tx.has_receipt ? (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">
                          Receipt Matched
                        </span>
                      ) : tx.requires_receipt ? (
                        <span className="text-[10px] text-rose-400 font-mono font-bold">
                          Proof Missing
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Under €50
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!tx.has_receipt && tx.requires_receipt && (
                  <div className="mt-3 pt-2 border-t border-amber-500/20 flex items-center justify-between">
                    <span className="text-xs text-amber-300/90">{tx.flagged_reason}</span>
                    <button
                      onClick={onOpenReceiptModal}
                      className="py-1 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow transition-all shrink-0 ml-2"
                    >
                      Upload Receipt
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
