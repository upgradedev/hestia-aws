import React, { useState } from 'react';
import { recordedRepairCost } from '../displayFacts';
import { ApplianceWarranty, PaymentOutflow, SubscriptionTracker } from '../types';

interface HouseholdInventoryProps {
  appliances: ApplianceWarranty[];
  outflows: PaymentOutflow[];
  subscriptions: SubscriptionTracker[];
  onSelectItemForClaim: (item: ApplianceWarranty) => void;
  onRequestUploadReceipt?: (outflow: PaymentOutflow) => void;
}

export const HouseholdInventory: React.FC<HouseholdInventoryProps> = ({
  appliances,
  outflows,
  subscriptions,
  onSelectItemForClaim,
  onRequestUploadReceipt,
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
            className={`px-3 py-1 rounded-md transition-all font-medium cursor-pointer ${
              activeTab === 'appliances'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Appliances
          </button>
          <button
            onClick={() => setActiveTab('outflows')}
            className={`px-3 py-1 rounded-md transition-all font-medium cursor-pointer ${
              activeTab === 'outflows'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Recorded Outflows
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-3 py-1 rounded-md transition-all font-medium cursor-pointer ${
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
              <span>Recorded warranty terms; not a legal determination</span>
              <span className="text-amber-300 font-mono">Review facts</span>
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
                            REPAIR RECORDED
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-mono">Eligibility unconfirmed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 bg-slate-900/60 rounded-lg p-2.5 border border-white/5 mb-3">
                    <div>
                      <span className="text-slate-500 text-[10px] block">PURCHASED:</span>
                      <span>{app.purchase_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">RETAILER:</span>
                      <span className="truncate block">{app.seller_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">STORE WARRANTY:</span>
                      <span className="text-slate-300">{app.commercial_warranty_months} months recorded; terms require review</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">EU STATUTORY:</span>
                      <span className="text-slate-300">{app.legal_statutory_months > 0 ? `${app.legal_statutory_months} months recorded` : 'Not recorded'}; eligibility unconfirmed</span>
                    </div>
                  </div>

                  {isDefective && (
                    <div className="mt-2 pt-2 border-t border-rose-500/20 flex items-center justify-between">
                      <span className="text-xs text-rose-300 font-mono">{recordedRepairCost(app.repair_amount_cents)}</span>
                      <button
                        onClick={() => onSelectItemForClaim(app)}
                        className="py-1 px-3 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs cursor-pointer shadow transition-all"
                      >
                        Review Recorded Facts &rarr;
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
              <span className="text-amber-400 font-mono">≥ €50 Reference Review</span>
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
                          Receipt Reference Linked
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
                    <button
                      onClick={() => onRequestUploadReceipt && onRequestUploadReceipt(tx)}
                      className="underline text-amber-400 hover:text-amber-300 font-bold ml-2 shrink-0 cursor-pointer"
                    >
                      Upload & Link &rarr;
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
                      {sub.price_creep_pct > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          +{sub.price_creep_pct}% HIKE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Category: {sub.category} &bull; Next: {sub.next_billing_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-200 font-mono">€{sub.current_monthly_eur.toFixed(2)}/mo</span>
                    {sub.initial_monthly_eur && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        was €{sub.initial_monthly_eur.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
