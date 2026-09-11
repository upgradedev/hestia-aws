import React, { useState } from 'react';
import { ApplianceWarranty, PaymentOutflow, SubscriptionTracker } from '../types';

interface HouseholdInventoryProps {
  appliances: ApplianceWarranty[];
  outflows: PaymentOutflow[];
  subscriptions: SubscriptionTracker[];
  onSelectItemForClaim: (item: ApplianceWarranty) => void;
}

export const HouseholdInventory: React.FC<HouseholdInventoryProps> = ({
  appliances,
  outflows,
  subscriptions,
  onSelectItemForClaim,
}) => {
  const [activeTab, setActiveTab] = useState<'appliances' | 'outflows' | 'subscriptions'>('appliances');

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col h-full border border-white/10 shadow-xl shadow-black/40">
      {/* Column Title & Tabs */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">FEEDS // 01</span>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            Household Inventory
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {activeTab === 'appliances' ? appliances.length : activeTab === 'outflows' ? outflows.length : subscriptions.length}
            </span>
          </h2>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-0.5 rounded-lg bg-slate-900/90 border border-white/5 text-xs">
          <button
            onClick={() => setActiveTab('appliances')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              activeTab === 'appliances'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Appliances
          </button>
          <button
            onClick={() => setActiveTab('outflows')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              activeTab === 'outflows'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bank Feeds
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              activeTab === 'subscriptions'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Recurring
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {/* TAB 1: APPLIANCES */}
        {activeTab === 'appliances' && (
          <>
            <div className="text-[11px] text-slate-400 px-1 pb-1 flex items-center justify-between">
              <span>Directive (EU) 2019/771 Statutory 2-Year Conformity Horizon</span>
              <span className="text-emerald-400 font-mono">24 Months Mandated</span>
            </div>
            {appliances.map((app) => {
              const isDefective = app.status === 'defect_reported';
              return (
                <div
                  key={app.id}
                  className={`glass-card rounded-xl p-4 transition-all border ${
                    isDefective
                      ? 'border-rose-500/40 bg-rose-950/20 shadow-lg shadow-rose-950/20'
                      : 'border-white/5 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{app.brand}</span>
                      <h3 className="text-sm font-semibold text-white leading-tight">{app.name}</h3>
                      <span className="text-xs text-slate-400 font-mono">Model: {app.model}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-200 font-mono">€{app.price_eur.toFixed(2)}</span>
                      <div className="mt-0.5">
                        {isDefective ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            DEFECT IN 24M WINDOW
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Covered
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Statutory Horizon Bar */}
                  <div className="space-y-1.5 my-3 pt-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Purchased: {app.purchase_date}</span>
                      <span className="text-slate-300">Seller: {app.seller_name}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500 w-3/4 rounded-l-full"></div>
                      <div className="h-full bg-amber-500 w-1/4 rounded-r-full"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Commercial (12m)</span>
                      <span className="text-amber-400/90 font-medium">Statutory EU Right (24m)</span>
                    </div>
                  </div>

                  {/* Defect Alert & ROC Trigger */}
                  {isDefective && (
                    <div className="mt-3 p-2.5 rounded-lg bg-rose-900/30 border border-rose-500/30 text-xs">
                      <p className="text-rose-200 text-[11px] leading-relaxed mb-2">
                        <strong className="text-rose-100 font-semibold">Reported Issue:</strong> {app.defect_description}
                      </p>
                      <button
                        onClick={() => onSelectItemForClaim(app)}
                        className="w-full py-1.5 px-3 rounded bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-medium text-xs shadow-md shadow-rose-900/40 flex items-center justify-center gap-1.5 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Review Pre-Drafted Claim Letter
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* TAB 2: BANK OUTFLOWS */}
        {activeTab === 'outflows' && (
          <>
            <div className="text-[11px] text-slate-400 px-1 pb-1 flex items-center justify-between">
              <span>Card Transactions & Anti-Join Sentinel</span>
              <span className="text-amber-400 font-mono">&gt; €50 Requires Proof</span>
            </div>
            {outflows.map((tx) => (
              <div
                key={tx.id}
                className={`glass-card rounded-xl p-3.5 border transition-all ${
                  !tx.has_receipt && tx.requires_receipt
                    ? 'border-amber-500/40 bg-amber-950/10'
                    : 'border-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">{tx.merchant}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span>{tx.timestamp}</span>
                      <span>&bull;</span>
                      <span>Card ending ••{tx.card_digits}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-200 font-mono">€{tx.amount_eur.toFixed(2)}</span>
                    <div className="mt-0.5">
                      {tx.has_receipt ? (
                        <span className="text-[10px] text-emerald-400 flex items-center justify-end gap-1 font-mono">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Receipt Matched
                        </span>
                      ) : tx.requires_receipt ? (
                        <span className="text-[10px] text-amber-400 font-semibold flex items-center justify-end gap-1 font-mono">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          Missing Invoice
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Under Threshold</span>
                      )}
                    </div>
                  </div>
                </div>

                {!tx.has_receipt && tx.requires_receipt && (
                  <div className="mt-2 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-center justify-between">
                    <span>{tx.flagged_reason}</span>
                    <button className="underline text-amber-400 hover:text-amber-300 font-medium ml-2 shrink-0">
                      Upload
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* TAB 3: RECURRING SUBSCRIPTIONS */}
        {activeTab === 'subscriptions' && (
          <>
            <div className="text-[11px] text-slate-400 px-1 pb-1 flex items-center justify-between">
              <span>Active Subscriptions & Free Trials</span>
              <span className="text-rose-400 font-mono">Leakage Detection</span>
            </div>
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className={`glass-card rounded-xl p-3.5 border transition-all ${
                  sub.is_trial
                    ? 'border-purple-500/40 bg-purple-950/15 shadow'
                    : sub.price_creep_pct > 0
                    ? 'border-amber-500/40 bg-amber-950/10'
                    : 'border-white/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-white">{sub.name}</h3>
                      {sub.is_trial && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          TRIAL
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {sub.is_trial ? (
                        <span className="text-purple-300 font-semibold">Expires {sub.trial_expires_at} (48h left)</span>
                      ) : (
                        <span>Next cycle: {sub.next_billing_date}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-200 font-mono">
                      {sub.is_trial ? `€${sub.renewal_cost_eur.toFixed(2)}/mo` : `€${sub.current_monthly_eur.toFixed(2)}/mo`}
                    </span>
                    {sub.price_creep_pct > 0 && (
                      <div className="text-[11px] text-amber-400 font-mono font-medium">
                        +{sub.price_creep_pct.toFixed(0)}% creep
                      </div>
                    )}
                  </div>
                </div>

                {sub.is_trial && (
                  <div className="mt-3 p-2 rounded bg-purple-900/30 border border-purple-500/30 flex items-center justify-between text-xs">
                    <span className="text-purple-200 text-[11px]">Auto-charges €{sub.renewal_cost_eur.toFixed(2)} in 48 hours</span>
                    <button className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium text-[11px] transition-all">
                      Cancel Trial
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
