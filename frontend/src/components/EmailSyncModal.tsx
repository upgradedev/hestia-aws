import React from 'react';

interface EmailSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const EmailSyncModal: React.FC<EmailSyncModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = React.useState<'idle' | 'scanning' | 'done'>('idle');
  const [progress, setProgress] = React.useState<number>(0);
  const [currentAction, setCurrentAction] = React.useState<string>('');

  if (!isOpen) return null;

  const handleStartSync = () => {
    setStep('scanning');
    setProgress(15);
    setCurrentAction('Connecting to simulated OAuth mailbox & PSD2 card telemetry...');

    setTimeout(() => {
      setProgress(45);
      setCurrentAction('Found 14 e-invoices: MediaMarkt, Amazon EU, IKEA, Stadtwerke München...');
    }, 600);

    setTimeout(() => {
      setProgress(75);
      setCurrentAction('Running PII Gate: Masking IBANs, card tokens, and home address...');
    }, 1200);

    setTimeout(() => {
      setProgress(100);
      setCurrentAction('Reconciliation Complete: 4 appliances registered, €185 claimable defect found!');
      setStep('done');
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0d121c] border border-amber-500/30 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Instant E-Invoice Ingest</h3>
              <p className="text-xs text-slate-400">Overcoming Day 1 Cold-Start &bull; Zero Manual Typing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-mono p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        {step === 'idle' && (
          <div className="space-y-4 text-xs text-slate-300">
            <p className="leading-relaxed">
              In real production, nobody wants to type serial numbers. Hestia connects read-only to your receipt inbox (Amazon, MediaMarkt, IKEA) and bank feed to populate your Asset Vault in under 2 seconds.
            </p>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/5 space-y-2 font-mono text-[11px]">
              <div className="text-amber-400 font-bold uppercase">Simulated Telemetry Sources:</div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Gmail / Outlook e-invoice feed (MediaMarkt #REC-BOSCH-9921)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>PSD2 Open Banking Card Stream (IKEA €85.00 outlay)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Stadtwerke München Utility PDF (Cold Water Q3 bill)</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleStartSync}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Simulate 1-Click Ingest (1.8s)</span>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div className="space-y-5 py-4 text-center">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto"></div>
            <div className="space-y-2">
              <div className="text-sm font-bold text-white font-mono">{progress}% Complete</div>
              <p className="text-xs text-amber-300 font-mono animate-pulse">{currentAction}</p>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-5 text-center py-2 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl font-bold mx-auto">
              ✓
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">Ingestion Complete!</h4>
              <p className="text-xs text-slate-300">
                14 documents parsed &bull; 4 household assets registered &bull; 1 statutory defect flagged
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900/90 border border-white/5 text-left font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase">Protected Capital</span>
                <div className="text-sm font-bold text-emerald-400">€3,426.00</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase">Unclaimed Cash</span>
                <div className="text-sm font-bold text-rose-400">€185.00</div>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onComplete();
              }}
              className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>View Resolved Action Center</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
