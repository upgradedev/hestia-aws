import React from 'react';
import { HouseholdSummary } from '../types';

interface HeaderProps {
  summary: HouseholdSummary;
  liveApiOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({ summary, liveApiOnline }) => {
  return (
    <header className="border-b border-white/10 bg-[#0c1017]/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3.5">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-[1px] shadow-lg shadow-amber-500/20">
            <div className="w-full h-full rounded-[11px] bg-[#0c1017] flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                HESTIA <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">AWS SENTINEL</span>
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                liveApiOnline 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${liveApiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                {liveApiOnline ? 'AWS Lambda Live' : 'Autonomous Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Household Economic Sentinel &bull; Directive 2019/771/EU Statutory Warranty Radar
            </p>
          </div>
        </div>

        {/* Global Impact Metrics */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-white/5 flex items-center gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Protected Assets</span>
            <span className="text-sm font-bold text-slate-200 font-mono">€{summary.protected_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 shadow-sm shadow-rose-500/10">
            <span className="text-[11px] uppercase tracking-wider text-rose-300 font-semibold flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Unclaimed Recovery
            </span>
            <span className="text-sm font-bold text-rose-400 font-mono">€{summary.potential_recovery_eur.toFixed(2)}</span>
          </div>

          <div className="px-3.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">Sub Creep</span>
            <span className="text-sm font-bold text-amber-400 font-mono">€{summary.leakage_detected_monthly_eur.toFixed(2)}/mo</span>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            2019/771/EU Art. 10
          </div>
        </div>
      </div>
    </header>
  );
};
