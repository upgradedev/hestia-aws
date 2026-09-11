import React from 'react';
import { HouseholdSummary, ActiveTab } from '../types';

interface HeaderProps {
  summary: HouseholdSummary;
  liveApiOnline: boolean;
  activeTab: ActiveTab;
  pendingActionsCount: number;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  summary,
  liveApiOnline,
  activeTab,
  pendingActionsCount,
  onSelectTab,
}) => {
  return (
    <header className="border-b border-white/10 bg-[#0a0d14]/95 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-[1500px] mx-auto px-4 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Persona Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-[1px] shadow-lg shadow-amber-500/20 shrink-0">
            <div className="w-full h-full rounded-[11px] bg-[#0c1017] flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">
                HESTIA
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                HOUSEHOLD SHIELD
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                liveApiOnline 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${liveApiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                {liveApiOnline ? 'AWS Live' : 'Offline Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Elena Weber &bull; Munich, Germany
            </p>
          </div>
        </div>

        {/* Intuitive SaaS Top Tabs */}
        <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => onSelectTab('overview')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Action Center</span>
            {pendingActionsCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'overview' ? 'bg-slate-950 text-amber-400' : 'bg-rose-500 text-white'
              }`}>
                {pendingActionsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab('vault')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'vault'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Asset Vault</span>
            <span className="text-[11px] font-mono opacity-80">({summary.active_warranties_count})</span>
          </button>

          <button
            onClick={() => onSelectTab('subscriptions')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'subscriptions'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Subscriptions</span>
          </button>

          <button
            onClick={() => onSelectTab('journeys')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'journeys'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>User Journeys</span>
          </button>

          <button
            onClick={() => onSelectTab('gtm')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'gtm'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Pitch & GTM</span>
          </button>

          <button
            onClick={() => onSelectTab('architecture')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'architecture'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>AWS Console</span>
          </button>
        </nav>

        {/* Global Impact Summary Pill */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Protected Capital</div>
            <div className="text-sm font-bold text-white font-mono">
              €{summary.protected_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
