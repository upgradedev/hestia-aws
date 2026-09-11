import React from 'react';
import { Locale } from '../types';

interface LandingPageProps {
  locale: Locale;
  onLaunchCockpit: () => void;
  onOpenSyncModal: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  locale,
  onLaunchCockpit,
  onOpenSyncModal,
}) => {
  const [selectedFeature, setSelectedFeature] = React.useState<number>(0);

  const features = [
    {
      id: 'warranties',
      title: 'Statutory 2-Year Warranty Shield',
      badge: 'Directive (EU) 2019/771 & BGB § 437',
      stat: '€185.00 Recovered',
      description:
        'Retailers claim commercial guarantees expire after 12 months. Under European law, sellers are strictly liable for lack of conformity for 24 months. Hestia drafts formal statutory claims with exact legal grounds.',
      tagColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      accentBorder: 'border-emerald-500/40 hover:border-emerald-400',
    },
    {
      id: 'subscriptions',
      title: 'Stealth Price Creep & Trial Interceptor',
      badge: 'Directive 93/13/EEC Unfair Terms',
      stat: '€48.00/yr Saved',
      description:
        'Cloud and streaming services quietly increase debit amounts by 20% to 40% without explicit affirmative assent. Hestia flags unannounced price hikes and kills free trials 48 hours before auto-renewal.',
      tagColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      accentBorder: 'border-purple-500/40 hover:border-purple-400',
    },
    {
      id: 'receipts',
      title: 'Receipt Anti-Join & Multimodal OCR',
      badge: 'Amazon Bedrock Vision',
      stat: '100% Tax & Warranty Proof',
      description:
        'Bank statements prove money left your account, but not serial numbers. When major outlays (>€50) lack receipts, Hestia alerts you before thermal ink fades and preserves proof on encrypted AWS S3.',
      tagColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      accentBorder: 'border-amber-500/40 hover:border-amber-400',
    },
    {
      id: 'utilities',
      title: 'Domestic Utility Anomaly Radar',
      badge: 'AVBWasserV § 18 Recalibration',
      stat: '€54.00 Excess Disputed',
      description:
        'Sudden +60% utility spikes often trace to faulty utility company meters or silent underground leaks. Hestia runs leakage diagnostics and issues formal meter verification demands.',
      tagColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
      accentBorder: 'border-cyan-500/40 hover:border-cyan-400',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#070a0f] text-slate-100 overflow-x-hidden selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background Subtle Gradient Glows (Parallax Feel) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-amber-500/15 via-orange-600/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[600px] left-10 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[1200px] right-10 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. HERO SECTION */}
      <section className="pt-12 sm:pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center">
        {/* Regulatory Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/30 shadow-lg shadow-amber-500/10 text-xs font-mono text-amber-300 mb-8 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>AUTONOMOUS HOUSEHOLD SENTINEL // DIRECTIVE (EU) 2019/771 & RIGHT TO REPAIR</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.1] mb-6">
          Stop Silent Money Leaks <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 bg-clip-text text-transparent">
            In Your Household.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed mb-10">
          European consumer law guarantees 24 months of strict retailer warranty on appliances. Free trials sneak into annual renewals. Hestia runs quietly in the background on AWS Serverless, auditing receipts and bills against statutory law, and surfaces only when money is ready to recover.
        </p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-16">
          <button
            onClick={onLaunchCockpit}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2.5 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            <span>Launch Live Cockpit</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={onOpenSyncModal}
            className="w-full sm:w-auto px-6 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm border border-white/10 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Simulate E-Invoice Ingest</span>
          </button>
        </div>

        {/* Live Household Metric Ticker */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto p-4 sm:p-6 rounded-2xl bg-[#0c1017]/80 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="text-left p-2 sm:p-3 border-r border-white/5 last:border-0">
            <div className="text-[11px] font-mono text-rose-400 uppercase font-bold">Unclaimed Warranty</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">€185.00</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Bosch repair reimbursable</div>
          </div>
          <div className="text-left p-2 sm:p-3 sm:border-r border-white/5 last:border-0">
            <div className="text-[11px] font-mono text-purple-400 uppercase font-bold">Expiring Free Trial</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">€29.99/mo</div>
            <div className="text-[11px] text-slate-400 mt-0.5">FitPulse 48h to auto-debit</div>
          </div>
          <div className="text-left p-2 sm:p-3 border-r border-white/5 last:border-0">
            <div className="text-[11px] font-mono text-cyan-400 uppercase font-bold">Meter Anomaly</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">€54.00</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Stadtwerke München spike</div>
          </div>
          <div className="text-left p-2 sm:p-3">
            <div className="text-[11px] font-mono text-emerald-400 uppercase font-bold">Protected Assets</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">€3,426.00</div>
            <div className="text-[11px] text-slate-400 mt-0.5">4 appliances under 2yr law</div>
          </div>
        </div>
      </section>

      {/* 2. THE 3-SECOND CLARITY: THREE SILENT LEAKS */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Why European Families Lose €500 - €1,200 Every Year
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-xl mx-auto">
            Traditional budgeting apps tell you where your money went. Hestia enforces statutory rights to get it back.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Problem Card 1 */}
          <div className="p-6 rounded-2xl bg-[#0d121c] border border-white/10 hover:border-rose-500/40 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold">
              §
            </div>
            <h3 className="text-base font-bold text-white">The Expired Guarantee Illusion</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Stores tell you their warranty is 1 year. Under Directive 2019/771/EU and German BGB § 437, the retailer is strictly liable for 24 months. Millions pay out-of-pocket for repairs they do not legally owe.
            </p>
          </div>

          {/* Problem Card 2 */}
          <div className="p-6 rounded-2xl bg-[#0d121c] border border-white/10 hover:border-purple-500/40 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">Stealth Price Hikes & Zombie Trials</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Subscriptions raise prices by €2 to €4 unannounced. Free trials turn into non-refundable monthly debits. Under Directive 93/13/EEC, unilateral fee changes without consent violate consumer protection.
            </p>
          </div>

          {/* Problem Card 3 */}
          <div className="p-6 rounded-2xl bg-[#0d121c] border border-white/10 hover:border-amber-500/40 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">The Fading Thermal Receipt Trap</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Paper thermal receipts fade completely after 6 months. When an expensive dishwasher breaks in year two, without a preserved invoice with serials, the store rejects all statutory claims.
            </p>
          </div>
        </div>
      </section>

      {/* 3. HOW HESTIA WORKS: THE 3-STEP PIPELINE */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-white/10">
        <div className="text-center mb-12">
          <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
            The Autonomous Architecture
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
            Zero Chatbots. Pure Return-of-Control.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="p-6 rounded-2xl bg-[#0a0f18] border border-white/10 space-y-3 relative">
            <span className="text-xs font-mono text-slate-500 font-bold">STEP 01 // INGEST</span>
            <h3 className="text-base font-bold text-white">Passive Background Sweep</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Monitors bank outflows and parsed invoices. PII sanitizers mask credit card digits and IBANs before any reasoning takes place.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0a0f18] border border-white/10 space-y-3 relative">
            <span className="text-xs font-mono text-amber-400 font-bold">STEP 02 // RECONCILE</span>
            <h3 className="text-base font-bold text-white">Deterministic Legal Math</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Python domain models calculate exact 24-month statutory horizons (BGB § 437) and flag anti-joins (>€50 unbacked transactions) with zero hallucinations.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0a0f18] border border-emerald-500/40 space-y-3 relative shadow-lg shadow-emerald-950/20">
            <span className="text-xs font-mono text-emerald-400 font-bold">STEP 03 // RETURN-OF-CONTROL</span>
            <h3 className="text-base font-bold text-white">1-Click Human Approval</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Hestia stops at a human consent gate. You review the drafted legal demand, click Approve, and the cryptographic dispute record seals to S3.
            </p>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE FEATURE SELECTOR */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto border-t border-white/10">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Explore the 4 Domestic Shields
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Click any shield below to preview how Hestia executes protection.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {features.map((feat, idx) => (
            <button
              key={feat.id}
              onClick={() => setSelectedFeature(idx)}
              className={`p-4 rounded-xl text-left transition-all cursor-pointer border ${
                selectedFeature === idx
                  ? 'bg-[#121927] border-amber-400 shadow-lg shadow-amber-500/10'
                  : 'bg-[#0a0e16] border-white/10 hover:border-white/20'
              }`}
            >
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${feat.tagColor}`}>
                {feat.stat}
              </span>
              <h4 className="text-sm font-bold text-white mt-2.5">{feat.title}</h4>
            </button>
          ))}
        </div>

        {/* Selected Feature Deep Dive Box */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0e1422] border border-amber-500/30 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <span className="text-xs font-mono text-amber-300 font-bold uppercase">
              {features[selectedFeature].badge}
            </span>
            <h3 className="text-xl font-bold text-white">{features[selectedFeature].title}</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {features[selectedFeature].description}
            </p>
          </div>
          <button
            onClick={onLaunchCockpit}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 shrink-0 cursor-pointer transition-all"
          >
            Test in Live Cockpit →
          </button>
        </div>
      </section>

      {/* 5. COMPARISON TABLE */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-white/10">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            How Hestia Compares
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1017]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-slate-900/60 font-mono text-slate-400 uppercase text-[11px]">
              <tr>
                <th className="p-4">Capability</th>
                <th className="p-4 text-slate-500">Dumb Budgeting Apps</th>
                <th className="p-4 text-slate-500">Generic Chat AI</th>
                <th className="p-4 text-amber-400 font-bold">Hestia Sentinel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              <tr>
                <td className="p-4 font-bold text-white">Statutory 2-Year Warranty Audit</td>
                <td className="p-4 text-rose-400">✗ None</td>
                <td className="p-4 text-amber-400">Requires manual prompt</td>
                <td className="p-4 text-emerald-400 font-bold">✓ Autonomous EU Law Engine</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Legal Notice Drafting</td>
                <td className="p-4 text-rose-400">✗ None</td>
                <td className="p-4 text-rose-400">Prone to hallucinations</td>
                <td className="p-4 text-emerald-400 font-bold">✓ Pre-drafted Art. 10 Notice</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Zero Mathematical Errors</td>
                <td className="p-4 text-emerald-400">✓ Excel math</td>
                <td className="p-4 text-rose-400">✗ Common token math bugs</td>
                <td className="p-4 text-emerald-400 font-bold">✓ Pure Integer Cents Math</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Human Return-of-Control Gate</td>
                <td className="p-4 text-slate-500">N/A</td>
                <td className="p-4 text-rose-400">Unbounded or chat-only</td>
                <td className="p-4 text-emerald-400 font-bold">✓ Zero Silent Actions</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. CALL TO ACTION & FOOTER */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center border-t border-white/10">
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-4">
          Ready to See It Live?
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 mb-8 max-w-md mx-auto">
          Experience Elena Weber's live operations cockpit hosted on AWS CloudFront. Zero sign-up, zero login required.
        </p>
        <button
          onClick={onLaunchCockpit}
          className="px-10 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 transition-all cursor-pointer"
        >
          Open Elena's Operations Cockpit
        </button>
        <div className="mt-12 text-[11px] text-slate-500 font-mono">
          Hestia Autonomous Household Sentinel &bull; Directive (EU) 2019/771 &bull; 100% Serverless AWS
        </div>
      </footer>

      {/* 7. MOBILE STICKY BOTTOM BAR (Mobile Ergonomics) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 p-3 bg-[#0a0d14]/95 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-between gap-3 shadow-2xl">
        <div>
          <div className="text-[10px] font-mono text-amber-400 uppercase font-bold">Elena Weber Cockpit</div>
          <div className="text-xs font-bold text-white">€185.00 To Claim</div>
        </div>
        <button
          onClick={onLaunchCockpit}
          className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 cursor-pointer"
        >
          Open Cockpit →
        </button>
      </div>
    </div>
  );
};
