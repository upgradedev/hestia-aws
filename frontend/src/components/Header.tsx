import React from 'react';
import type { HouseholdSummary, ActiveTab, Locale } from '../types';

interface HeaderProps {
  summary: HouseholdSummary; liveApiOnline: boolean; householdName: string; resetDisabled: boolean;
  activeTab: ActiveTab; pendingActionsCount: number; locale: Locale; onToggleLocale: () => void;
  onResetDemo: () => void; onSelectTab: (tab: ActiveTab) => void; onOpenSyncModal?: () => void;
}
export const Header: React.FC<HeaderProps> = ({ householdName, activeTab, onSelectTab, onOpenSyncModal, onResetDemo, resetDisabled }) => (
  <header className="border-b border-white/10 bg-[#0a0d14]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:block p-3 bg-amber-400 text-slate-950">Skip to household content</a>
    <div className="max-w-[1500px] mx-auto px-4 lg:px-8 py-4 flex flex-wrap justify-between gap-4 items-center">
      <button onClick={() => onSelectTab('landing')} className="text-left" aria-label="Hestia home">
        <span className="text-xl font-black text-amber-400 tracking-wide">HESTIA</span>
        <span className="block text-xs text-slate-400">{householdName}</span>
      </button>
      <nav aria-label="Household navigation" className="flex flex-wrap items-center gap-1 text-sm">
        {([['overview', 'Action Center'], ['cases', 'My cases'], ['vault', 'Asset Vault'], ['subscriptions', 'Subscriptions']] as const).map(([tab, label]) => (
          <button key={tab} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => onSelectTab(tab)}
            className={`px-3 py-2 rounded-xl ${activeTab === tab ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-white/10'}`}>{label}</button>
        ))}
        <details className="relative">
          <summary className="cursor-pointer px-3 py-2">About / Advanced</summary>
          <div className="absolute right-0 top-full z-40 w-56 bg-slate-900 border border-white/20 rounded-xl p-2 shadow-xl flex flex-col text-left gap-1">
            {([['journeys', 'User Journeys'], ['gtm', 'Pitch & GTM'], ['architecture', 'AWS Console']] as const).map(([tab, label]) => (
              <button className="p-3 text-left rounded-lg hover:bg-white/10" key={tab} onClick={() => onSelectTab(tab)}>{label}</button>
            ))}
            <button className="p-3 text-left rounded-lg hover:bg-white/10" onClick={onOpenSyncModal}>Sync Invoices</button>
          </div>
        </details>
      </nav>
      <button data-testid="reset-demo" disabled={resetDisabled} onClick={onResetDemo} title="Reset sample facts; case and approval history are retained"
        className="text-xs text-slate-400 border border-white/20 px-3 py-2 rounded-lg disabled:opacity-50">Reset sample facts</button>
    </div>
  </header>
);
