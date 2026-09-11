import React, { useState } from 'react';
import { CORE_USER_JOURNEYS } from '../data/seedData';

interface UserJourneysViewProps {
  onSelectJourneyToSimulate: (journeyId: string) => void;
}

export const UserJourneysView: React.FC<UserJourneysViewProps> = ({
  onSelectJourneyToSimulate,
}) => {
  const [activeJourneyId, setActiveJourneyId] = useState<string>(CORE_USER_JOURNEYS[0].id);

  const activeJourney = CORE_USER_JOURNEYS.find((j) => j.id === activeJourneyId) || CORE_USER_JOURNEYS[0];

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/30 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
                PRODUCT ROADMAP & HUMAN VALIDATION
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                4 REAL-WORLD DOMESTIC JOURNEYS
              </span>
            </div>
            <h2 className="text-xl font-black text-white">
              Everyday Domestic Leakage Scenarios
            </h2>
            <p className="text-xs lg:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Real families in Germany and the EU bleed wealth through opaque merchant practices, deceptive 1-year guarantee claims, and fragmented receipt silos. Below are the 4 canonical user journeys solved autonomously by Hestia.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-white/10 text-right">
              <div className="text-[10px] uppercase font-mono text-slate-400">Total Solved Value</div>
              <div className="text-base font-bold text-emerald-400 font-mono">€406.99 / household</div>
            </div>
          </div>
        </div>

        {/* Journey Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          {CORE_USER_JOURNEYS.map((j, idx) => {
            const isSelected = j.id === activeJourneyId;
            return (
              <button
                key={j.id}
                onClick={() => setActiveJourneyId(j.id)}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                    : 'border-white/5 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-slate-400">JOURNEY 0{idx + 1}</span>
                  <span className="text-[10px] font-bold font-mono text-emerald-400">+€{j.financialImpactEur.toFixed(2)}</span>
                </div>
                <div className="text-xs font-bold text-white line-clamp-1">{j.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{j.badge}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Deep-Dive Card for Active Journey */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1-col: Problem & Legal Framework */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                {activeJourney.badge}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Impact: €{activeJourney.financialImpactEur.toFixed(2)}
              </span>
            </div>

            <h3 className="text-lg font-bold text-white">{activeJourney.title}</h3>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Target Persona
              </span>
              <div className="text-xs font-semibold text-slate-200">{activeJourney.persona}</div>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 block mb-1 font-bold">
                The Real Problem
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">{activeJourney.problemStatement}</p>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block mb-1 font-bold">
                Autonomous Hestia Resolution
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">{activeJourney.resolution}</p>
            </div>

            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-300">
              <div className="text-[10px] text-slate-400 uppercase mb-0.5">Statutory Legal Citation</div>
              <div>{activeJourney.legalCitation}</div>
            </div>
          </div>

          <button
            onClick={() => onSelectJourneyToSimulate(activeJourney.id)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>Load & Test in Operations Cockpit</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Right 2-cols: Step-by-Step Technical Mechanism Timeline */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Autonomous Execution Pipeline</span>
                <span className="text-xs text-slate-400 font-mono">({activeJourney.steps.length} Steps)</span>
              </h4>
              <span className="text-xs text-slate-400 font-mono">AWS Bedrock &bull; Return-of-Control Gate</span>
            </div>

            <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10">
              {activeJourney.steps.map((s, idx) => (
                <div key={s.id} className="relative pl-9 flex flex-col gap-1">
                  <div className={`absolute left-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                    s.completed
                      ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300'
                      : 'bg-amber-500/20 border-2 border-amber-400 text-amber-300'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-bold text-white">{s.title}</h5>
                    {s.economicDeltaEur && (
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        +€{s.economicDeltaEur.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{s.description}</p>

                  <div className="mt-1 p-2 rounded-lg bg-slate-900/90 border border-white/5 text-[11px] font-mono text-slate-400 flex items-center gap-2">
                    <span className="text-amber-400 font-bold uppercase text-[10px]">Mechanism:</span>
                    <span>{s.technicalMechanism}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>Zero Hallucinations Guarantee</span>
            <span className="font-mono text-emerald-400">Human-in-the-Loop Gate Mandated</span>
          </div>
        </div>
      </div>
    </div>
  );
};
