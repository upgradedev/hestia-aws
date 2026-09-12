import React from 'react';
import { ApplianceWarranty } from '../types';

interface AssetVaultViewProps {
  appliances: ApplianceWarranty[];
  actionsDisabled: boolean;
  snapshotDate: string;
  onOpenClaimModal: (app: ApplianceWarranty) => void;
}

export const AssetVaultView: React.FC<AssetVaultViewProps> = ({
  appliances,
  actionsDisabled,
  snapshotDate,
  onOpenClaimModal,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl bg-[#0e1420] border border-white/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
              HOUSEHOLD ASSET REGISTRY
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/30">
              DIRECTIVE (EU) 2019/771
            </span>
          </div>
          <h2 className="text-xl font-black text-white">
            Protected Household Goods & 24-Month Warranty Horizon
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
            These are the appliance facts from the current server snapshot. A recorded warranty duration is not a determination of legal eligibility; review the evidence before making a claim.
          </p>
        </div>

        <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-right shrink-0">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Protected Capital</div>
          <div className="text-lg font-bold text-emerald-400 font-mono">
            €{appliances.reduce((acc, a) => acc + a.price_eur, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Appliances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {appliances.map((app) => {
          const isDefective = app.status === 'defect_reported';
          const purchase = new Date(app.purchase_date);
          const reference = new Date(app.defect_reported_at ?? snapshotDate);
          const elapsedMonths = Math.max(0, (reference.getUTCFullYear() - purchase.getUTCFullYear()) * 12 + reference.getUTCMonth() - purchase.getUTCMonth() - (reference.getUTCDate() < purchase.getUTCDate() ? 1 : 0));
          const duration = app.legal_statutory_months;
          const pct = duration > 0 ? Math.min(100, elapsedMonths / duration * 100) : 0;

          return (
            <div
              key={app.id}
              className={`rounded-2xl p-6 border transition-all space-y-4 ${
                isDefective
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20'
                  : 'bg-[#0c1017] border-white/10 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                    {app.brand}
                  </span>
                  <h3 className="text-base font-bold text-white leading-snug">{app.name}</h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">Model: {app.model}</div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-base font-black text-white font-mono">€{app.price_eur.toFixed(2)}</div>
                  {isDefective ? (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      REPAIR RECORDED
                    </span>
                  ) : (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      PURCHASE RECORDED
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar of 24-Month Statutory Horizon */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Recorded Warranty Duration:</span>
                  <span className="text-slate-200 font-mono font-medium">
                    {elapsedMonths} full months at {isDefective ? 'repair' : 'snapshot'} / {duration} recorded
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${isDefective ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>

              {/* Metadata Details */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono p-3 rounded-xl bg-slate-900/90 border border-white/5 text-slate-300">
                <div>
                  <span className="text-slate-500 uppercase text-[10px] block">Purchased</span>
                  <span>{app.purchase_date}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase text-[10px] block">Merchant</span>
                  <span className="truncate block">{app.seller_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase text-[10px] block">Store Guarantee</span>
                  <span className="text-slate-300">{app.commercial_warranty_months} months recorded</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase text-[10px] block">EU Statutory Law</span>
                  <span className="text-slate-300">{duration} months; eligibility requires review</span>
                </div>
              </div>

              {/* Action Buttons */}
              {isDefective ? (
                <button
                  onClick={() => onOpenClaimModal(app)}
                  disabled={actionsDisabled}
                  data-testid={'review-appliance-' + app.id}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Enforce Free Repair / Reimbursement Notice</span>
                </button>
              ) : (
                <div className="text-[11px] text-slate-500 font-mono text-center pt-1">
                  Active monitoring &bull; Invoice #{app.receipt_id} securely vaulted
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
