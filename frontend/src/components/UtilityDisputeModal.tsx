import React, { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { UtilityBill } from '../api';

interface UtilityDisputeModalProps {
  isOpen: boolean; onClose: () => void; bill: UtilityBill | null; homeownerName: string; enabled: boolean;
  onDispute: (provider: string, excessCents: number) => Promise<void>;
}
export const UtilityDisputeModal: React.FC<UtilityDisputeModalProps> = ({ isOpen, onClose, bill, homeownerName, enabled, onDispute }) => {
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  if (!isOpen) return null;
  const excess = bill ? Math.max(0, bill.current_cents - bill.baseline_cents) : 0;
  const submit = async () => {
    if (!bill || !enabled || lock.current) return;
    lock.current = true; setPending(true);
    try { await onDispute(bill.provider, excess); setConfirmed(true); setError(null); }
    catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="utility-title" className="max-w-2xl w-full bg-[#0d121c] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
          <h3 id="utility-title" className="text-sm font-bold text-white">Utility Anomaly & Meter Recalibration Demand</h3>
          <button onClick={onClose} disabled={pending} aria-label="Close utility review" className="text-slate-400 hover:text-white p-1 text-lg">&times;</button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono text-slate-300 leading-relaxed bg-[#080b10]">
          <p className="text-cyan-300">Isolated demo request only. No provider will be contacted.</p>
          {bill ? <>
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/20 grid grid-cols-2 gap-3">
              <div>Householder: {homeownerName}</div><div>Provider: {bill.provider}</div>
            </div>
            <div className="border-t border-b border-white/10 py-2.5">
              <div>Bill date: {bill.bill_date}</div><div>Recorded amount: €{(bill.current_cents / 100).toFixed(2)}</div>
              <div>Baseline: €{(bill.baseline_cents / 100).toFixed(2)}</div><div>Excess for review: €{(excess / 100).toFixed(2)}</div>
            </div>
            <p>No meter inspection, legal demand, or provider response has been verified.</p>
          </> : <p role="alert">No utility bill is available for review.</p>}
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          {confirmed && <p role="status" data-testid="utility-result" className="text-emerald-300">Simulated request recorded. No provider was contacted; the original bill alert remains pending.</p>}
          {!enabled && !confirmed && <p className="text-amber-300">Begin or recover your isolated session before continuing.</p>}
        </div>
        <div className="px-6 py-4 bg-slate-900 border-t border-white/10 flex items-center justify-between">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs">Cancel</button>
          <button onClick={() => { void submit(); }} disabled={!enabled || !bill || pending || confirmed} data-testid="approve-utility" className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-xs disabled:opacity-50">{confirmed ? 'Simulated Request Recorded' : pending ? 'Recording...' : 'Simulate Meter Review Request'}</button>
        </div>
      </div>
    </div>
  );
};
