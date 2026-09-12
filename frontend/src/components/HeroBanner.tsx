import React from 'react';
import { ActiveTab } from '../types';

interface HeroBannerProps {
  onStartTour: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onDismiss: () => void;
  isDismissed: boolean;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onStartTour,
  onSelectTab,
  onDismiss,
  isDismissed,
}) => {
  if (isDismissed) {
    return (
      <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Hestia household review. Open your isolated snapshot to inspect recorded facts.</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onStartTour}
            className="text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1 cursor-pointer"
          >
            Launch Guided Product Tour
          </button>
          <span className="text-slate-600">&bull;</span>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Show Overview Banner
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/95 to-amber-950/20 border border-amber-500/20 p-5 lg:p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
              AWS Agents for Humans Hackathon
            </span>
            <span className="text-xs text-slate-400 font-mono">Everyday Agents Track</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-amber-300 font-mono">Synthetic Household Example</span>
          </div>

          <h2 className="text-xl lg:text-2xl font-black tracking-tight text-white mb-2">
            The Autonomous Household Economic Sentinel
          </h2>
          <p className="text-xs lg:text-sm text-slate-300 leading-relaxed">
            Review household purchase records, subscription changes and missing receipt references in one place. Inspect the exact notice before approving a simulation, then track the case to a documented outcome. Live model inference, provider contact and legal eligibility are not established by this demo.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="text-[10px] font-mono text-amber-400 font-bold uppercase">01 // Statutory Law</div>
              <div className="text-xs font-semibold text-white mt-0.5">Warranty Facts Review</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Directive 2019/771/EU</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="text-[10px] font-mono text-purple-400 font-bold uppercase">02 // Sub Defense</div>
              <div className="text-xs font-semibold text-white mt-0.5">Creep & Trial Traps</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Recorded price changes</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">03 // Proof Vault</div>
              <div className="text-xs font-semibold text-white mt-0.5">Receipt Anti-Join</div>
              <div className="text-[11px] text-slate-400 mt-0.5">≥€50 Reference Review</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="text-[10px] font-mono text-sky-400 font-bold uppercase">04 // Human Gate</div>
              <div className="text-xs font-semibold text-white mt-0.5">Return-of-Control</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Zero silent actions</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 lg:w-64">
          <button
            onClick={onStartTour}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Start Guided 5-Step Tour</span>
          </button>

          <button
            onClick={() => onSelectTab('journeys')}
            className="w-full py-2 px-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-200 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Inspect 4 User Journeys</span>
          </button>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
            <button
              onClick={() => onSelectTab('gtm')}
              className="text-amber-400/90 hover:text-amber-300 underline cursor-pointer"
            >
              GTM & Unit Economics
            </button>
            <button
              onClick={onDismiss}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              Hide Banner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
