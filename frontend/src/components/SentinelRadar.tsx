import React, { useState } from 'react';
import { SentinelAlert } from '../types';

interface SentinelRadarProps {
  alerts: SentinelAlert[];
  onSelectAlert: (alert: SentinelAlert) => void;
  selectedAlertId: string | null;
}

export const SentinelRadar: React.FC<SentinelRadarProps> = ({
  alerts,
  onSelectAlert,
  selectedAlertId,
}) => {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');

  const filteredAlerts = alerts.filter((alt) => {
    if (filter === 'all') return true;
    return alt.severity === filter;
  });

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col h-full border border-white/10 shadow-xl shadow-black/40">
      {/* Column Header with Radar Animation */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
        <div className="flex items-center gap-3">
          {/* Animated Radar Sweep Graphic */}
          <div className="relative w-9 h-9 rounded-full bg-slate-900 border border-amber-500/40 flex items-center justify-center overflow-hidden shadow-inner shadow-amber-500/10">
            {/* Concentric rings */}
            <div className="absolute inset-1.5 rounded-full border border-amber-500/20"></div>
            <div className="absolute inset-3 rounded-full border border-amber-500/30"></div>
            {/* Crosshairs */}
            <div className="absolute w-full h-[1px] bg-amber-500/20"></div>
            <div className="absolute h-full w-[1px] bg-amber-500/20"></div>
            {/* Rotating radar beam */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-400/20 to-transparent animate-radar origin-center"></div>
            {/* Blip */}
            <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></div>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">ANALYSIS // 02</span>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Recorded Evidence Radar
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                SNAPSHOT
              </span>
            </h2>
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex p-0.5 rounded-lg bg-slate-900/90 border border-white/5 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              filter === 'all' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({alerts.length})
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              filter === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Critical
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              filter === 'warning' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Warnings
          </button>
        </div>
      </div>

      {/* Live Alerts Stream */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredAlerts.map((alert) => {
          const isSelected = selectedAlertId === alert.id;
          const isCritical = alert.severity === 'critical';

          return (
            <div
              key={alert.id}
              onClick={() => onSelectAlert(alert)}
              role="button" tabIndex={0} aria-pressed={isSelected}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectAlert(alert); } }}
              className={`glass-card glass-card-interactive rounded-xl p-4 cursor-pointer border transition-all ${
                isSelected
                  ? 'border-amber-400 bg-slate-800/80 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/40'
                  : isCritical
                  ? 'border-rose-500/30 bg-rose-950/10 hover:border-rose-500/60'
                  : 'border-white/5 hover:border-amber-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isCritical ? 'bg-rose-500 animate-ping' : 'bg-amber-500'
                    }`}
                  ></span>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isCritical
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {alert.category.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">{alert.timestamp}</span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-400 font-mono">
                    €{alert.potential_savings_eur.toFixed(2)} recorded exposure
                  </span>
                </div>
              </div>

              <h3 className="text-sm font-bold text-white mb-1.5 leading-snug">{alert.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">{alert.description}</p>

              {alert.statutory_basis && (
                <div className="p-2 rounded bg-slate-900/90 border border-white/5 text-[11px] font-mono text-indigo-300 flex items-start gap-1.5 mb-2.5">
                  <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>{alert.statutory_basis}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
                <span className="text-slate-400 font-mono text-[11px]">Return-of-Control Action</span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-semibold group-hover:text-amber-300">
                  {alert.action_label}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
