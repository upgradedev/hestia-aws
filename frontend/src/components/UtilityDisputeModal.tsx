import React, { useState } from 'react';

interface UtilityDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispute: (provider: string, excessCents: number) => Promise<any>;
}

export const UtilityDisputeModal: React.FC<UtilityDisputeModalProps> = ({
  isOpen,
  onClose,
  onDispute,
}) => {
  if (!isOpen) return null;

  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [copied, setCopied] = useState(false);

  const noticeText = `FORMAL DEMAND FOR WATER METER CALIBRATION CHECK
Pursuant to AVBWasserV § 18 (Verordnung über Allgemeine Bedingungen für die Wasserversorgung)

CLAIMANT:
Elena Weber, Sendlinger Str. 42, 80331 München
Customer Account: SWM-WTR-882194

UTILITY SUPPLIER:
Stadtwerke München GmbH (SWM), Emmy-Noether-Straße 2, 80992 München

SUBJECT: Meter Verification Demand - Excessive Water Consumption Surge (Q3/2026)
BILL REFERENCE: SWM-INV-2026-0901 (€142.00 vs. €88.00 Baseline)
EXCESS SUM CONTESTED: €54.00 EUR

Dear Customer Service Team,

I hereby contest the quarterly water utility invoice dated 01.09.2026 showing an anomalous surge of +61.4% (142.00 EUR vs. 88.00 EUR seasonal baseline).

Internal domestic diagnostic inspection has confirmed:
1. Toilet tank flapper valves and overflow pipes show zero leakage.
2. Pressure testing across external spigots shows no pressure drop.
3. Domestic occupancy was reduced by 5 days during August due to vacation.

Pursuant to AVBWasserV § 18, I formally demand an immediate on-site calibration verification of cold water meter #MUC-8841-B. Under § 18 Abs. 2, pending verification of meter accuracy, the contested excess portion (€54.00 EUR) is held in provisional reserve.

Sincerely,
Elena Weber`;

  const handleSend = async () => {
    setIsDispatching(true);
    try {
      await onDispute('Stadtwerke Munich', 5400);
      setDispatched(true);
      setTimeout(() => {
        setIsDispatching(false);
        onClose();
      }, 1500);
    } catch {
      setIsDispatching(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(noticeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="max-w-2xl w-full bg-[#0d121c] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Utility Anomaly & Meter Recalibration Demand
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Stadtwerke München Water Surge (+61.4%) &bull; AVBWasserV § 18
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs flex items-center gap-1 border border-white/10"
              title="Copy to clipboard"
            >
              {copied ? (
                <span className="text-emerald-400 text-[11px]">Copied!</span>
              ) : (
                <span className="font-sans text-[11px]">Copy Text</span>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer text-lg leading-none ml-2"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono text-slate-300 leading-relaxed bg-[#080b10]">
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/20 grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Customer / Account</span>
              <span className="font-semibold text-slate-200">Elena Weber</span>
              <div className="text-slate-400 text-[10px]">SWM Account #882194</div>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Utility Provider</span>
              <span className="font-semibold text-slate-200">Stadtwerke München GmbH</span>
              <div className="text-slate-400 text-[10px]">kundenservice@swm.de</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-slate-300 space-y-1 text-[11px]">
            <div className="text-cyan-300 font-bold uppercase text-[10px]">Domestic Leakage Check Completed</div>
            <div>&bull; Toilet flapper valves & tank seals: <strong>Zero leak detected</strong></div>
            <div>&bull; Basement plumbing & garden outlets: <strong>Normal pressure integrity</strong></div>
            <div>&bull; Household status: <strong>5 days unoccupied during August vacation</strong></div>
          </div>

          <div className="border-t border-b border-white/10 py-2.5 text-slate-300">
            <div><strong>SUBJECT:</strong> Meter Verification Demand: Cold Water Meter #MUC-8841-B</div>
            <div><strong>STATUTORY GROUNDS:</strong> AVBWasserV § 18 (Verordnung über die Versorgung mit Wasser)</div>
            <div><strong>CONTESTED EXCESS:</strong> €54.00 EUR (Unjustified 61.4% surge over €88.00 baseline)</div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950 border border-white/5 text-[10px] text-slate-400">
            <strong>AVBWasserV § 18 Notice:</strong> The utility is legally mandated to test the metering apparatus upon consumer petition. If accuracy exceeds regulatory tolerance, billing must be retroactively adjusted to historical seasonal averages.
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-900 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleSend}
            disabled={isDispatching || dispatched}
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
          >
            {dispatched ? (
              <span>Demand Dispatched to SWM & Logged!</span>
            ) : isDispatching ? (
              <span>Sealing & Dispatching via Lambda...</span>
            ) : (
              <span>1-Click Authorize Meter Calibration Demand</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
