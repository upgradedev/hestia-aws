import React from 'react';
import { HouseholdSummary, ActiveTab, Locale } from '../types';

interface HeaderProps {
  summary: HouseholdSummary;
  liveApiOnline: boolean;
  householdName: string;
  resetDisabled: boolean;
  activeTab: ActiveTab;
  pendingActionsCount: number;
  locale: Locale;
  onToggleLocale: () => void;
  onResetDemo: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSyncModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  summary,
  liveApiOnline,
  householdName,
  resetDisabled,
  activeTab,
  pendingActionsCount,
  locale,
  onToggleLocale,
  onResetDemo,
  onSelectTab,
  onOpenSyncModal,
}) => {
  return (
    <header className="border-b border-white/10 bg-[#0a0d14]/95 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-[1500px] mx-auto px-4 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Persona Identity */}
        <div 
          onClick={() => onSelectTab('landing')}
          className="flex items-center gap-3 cursor-pointer group"
          title="Return to Hestia Landing Page"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-[1px] shadow-lg shadow-amber-500/20 shrink-0 group-hover:scale-105 transition-transform">
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
                {liveApiOnline ? 'Server preview · Simulation' : 'Preview unavailable'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {householdName}
            </p>
          </div>
        </div>

        {/* Intuitive SaaS Top Tabs */}
        <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => onSelectTab('landing')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'landing'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Landing</span>
          </button>

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

        {/* Global Impact Summary Pill & Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Simulated Ingest Sync Button */}
          {onOpenSyncModal && (
            <button
              onClick={onOpenSyncModal}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-[11px] font-mono border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Invoice sync is not enabled in this demo"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="hidden sm:inline">Sync Invoices</span>
            </button>
          )}

          {/* Quick Reset Demo Button */}
          <button
            onClick={onResetDemo}
            disabled={resetDisabled}
            data-testid="reset-demo"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-[11px] font-mono border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Reset this isolated demo; audit history is retained"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className="hidden sm:inline">Reset Demo</span>
          </button>

          {/* Locale Toggle */}
          <button
            onClick={onToggleLocale}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
            title="Toggle Language (EN / DE)"
          >
            <span className={locale === 'en' ? 'text-amber-400 font-bold' : 'text-slate-400'}>EN</span>
            <span className="text-slate-500">|</span>
            <span className={locale === 'de' ? 'text-amber-400 font-bold' : 'text-slate-400'}>DE</span>
          </button>

          <div className="hidden lg:block text-right pl-1 border-l border-white/10">
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
