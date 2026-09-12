import React from 'react';
import type { Locale } from '../types';

interface LandingPageProps {
  locale: Locale; onLaunchCockpit: () => void; onOpenSyncModal: () => void; returning?: boolean;
}
export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchCockpit, returning }) => (
  <section className="max-w-6xl mx-auto px-5 py-8 sm:py-20 grid lg:grid-cols-2 gap-10 items-center" aria-labelledby="welcome-title">
    <div className="space-y-6">
      <p className="text-amber-300 text-sm font-semibold">For households facing a repair bill</p>
      <h1 id="welcome-title" className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">Your receipt is the start.<br />Keep the whole case together.</h1>
      <p className="text-base sm:text-lg text-slate-300 leading-relaxed">Review the facts, approve an exact repair notice, and keep replies, evidence and your next step in one saved timeline.</p>
      <button data-testid="launch-cockpit" onClick={onLaunchCockpit} className="px-6 py-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-base">
        {returning ? 'Continue your household case' : 'Review a sample household repair'} <span aria-hidden="true">→</span>
      </button>
      <p className="text-sm text-slate-400">Try the synthetic household. No inbox connection, OCR, paid model, email delivery or real reimbursement. You choose every case update.</p>
    </div>
    <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-slate-900 p-6 sm:p-8 space-y-6">
      <div className="flex justify-between items-center gap-3"><span className="text-xs uppercase tracking-widest text-amber-300">Sample repair case</span><span className="text-xs border border-white/20 rounded-full px-3 py-1">For review</span></div>
      <h2 className="text-2xl font-semibold">The washing machine broke.<br />The repair cost €185.</h2>
      <p className="text-slate-300">Can you ask the seller to review it? Start with the receipt and repair record. Hestia keeps the request and the eventual outcome connected.</p>
      <ol className="space-y-4 text-sm">
        <li><span className="text-amber-300 font-bold mr-3">01</span>Receipt and repair facts</li>
        <li><span className="text-amber-300 font-bold mr-3">02</span>Exact notice and your approval</li>
        <li><span className="text-amber-300 font-bold mr-3">03</span>Replies, deadlines and evidence of an outcome</li>
      </ol>
      <p className="border-t border-white/10 pt-4 text-xs text-slate-400">€185 is a recorded cost, not a promise of recovery. Legal eligibility needs separate review.</p>
    </div>
  </section>
);
