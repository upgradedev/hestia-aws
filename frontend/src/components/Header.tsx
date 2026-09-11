import React from 'react';
import { HouseholdSummary, ActiveTab } from '../types';

interface HeaderProps {
  summary: HouseholdSummary;
  liveApiOnline: boolean;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onStartTour: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  summary,
  liveApiOnline,
  activeTab,
  onSelectTab,
  onStartTour,
}) => {
  return (
    <header className="border-b border-white/10 bg-[#0c1017]/90 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              Elena Weber &bull; Munich Household &bull; Directive 2019/771/EU Statutory Sentinel
            </p>
          </div>
        </div>

        {/* Top-Level Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-medium">
          <button
            onClick={() => onSelectTab('cockpit')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cockpit'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Operations Cockpit</span>
          </button>

          <button
            onClick={() => onSelectTab('journeys')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'journeys'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>User Journeys (4)</span>
          </button>

          <button
            onClick={() => onSelectTab('gtm')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gtm'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="20" x2="12" y2="10" />
              <line x1="18" y1="20" x2="18" y2="4" />
              <line x1="6" y1="20" x2="6" y2="16" />
            </svg>
            <span>GTM & Economics</span>
          </button>

          <button
            onClick={() => onSelectTab('architecture')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'architecture'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>Bedrock Architecture</span>
          </button>
        </div>

        {/* Global Impact Metrics & Tour Launcher */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={onStartTour}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Guided Tour</span>
          </button>

          <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-rose-300 font-semibold">Unclaimed Recovery</span>
            <span className="text-sm font-bold text-rose-400 font-mono">€{summary.potential_recovery_eur.toFixed(2)}</span>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-white/5 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Protected Assets</span>
            <span className="text-sm font-bold text-slate-200 font-mono">€{summary.protected_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
