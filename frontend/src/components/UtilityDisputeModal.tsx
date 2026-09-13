import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { UtilityBill } from '../api';

interface UtilityDisputeModalProps {
  isOpen: boolean; onClose: () => void; bill: UtilityBill | null; homeownerName: string; enabled: boolean;
  onDispute: (provider: string, excessCents: number) => Promise<void>;
}
export function UtilityDisputeModal({ isOpen, onClose, bill, homeownerName, enabled, onDispute }: UtilityDisputeModalProps) {
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
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="utility-title" className="modal max-w-xl">
        <div className="modal-head">
          <div>
            <h3 id="utility-title" className="font-bold">Utility bill above baseline</h3>
            <p className="text-xs muted">Review request recorded in this demo space; no provider is contacted</p>
          </div>
          <button onClick={onClose} disabled={pending} aria-label="Close utility review" className="btn btn-quiet btn-sm text-lg">&times;</button>
        </div>
        <div className="modal-body space-y-4 text-sm">
          {bill ? <>
            <div className="inset p-3 grid grid-cols-2 gap-3 text-xs">
              <div><span className="faint uppercase block">Householder</span><span className="font-semibold">{homeownerName}</span></div>
              <div><span className="faint uppercase block">Provider</span><span className="font-semibold">{bill.provider}</span></div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm border-t border-b border-[var(--line)] py-3">
              <div><dt className="faint text-xs">Bill date</dt><dd className="font-medium">{bill.bill_date}</dd></div>
              <div><dt className="faint text-xs">Recorded amount</dt><dd className="font-medium mono">€{(bill.current_cents / 100).toFixed(2)}</dd></div>
              <div><dt className="faint text-xs">Baseline</dt><dd className="font-medium mono">€{(bill.baseline_cents / 100).toFixed(2)}</dd></div>
              <div><dt className="faint text-xs">Difference for review</dt><dd className="font-medium mono">€{(excess / 100).toFixed(2)}</dd></div>
            </dl>
            <p className="muted">No meter inspection, legal demand, or provider response has been verified. A comparison does not establish a billing error.</p>
          </> : <p role="alert" className="note-alert">No utility bill is available for review.</p>}
          {error && <p role="alert" className="note-alert">{error}</p>}
          {confirmed && <p role="status" data-testid="utility-result" className="note-ok">Simulated request recorded. No provider was contacted; the original bill alert remains pending.</p>}
          {!enabled && !confirmed && <p className="note-alert">Start or refresh your demo space before continuing.</p>}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={pending} className="btn btn-quiet btn-sm">Cancel</button>
          <button onClick={() => { void submit(); }} disabled={!enabled || !bill || pending || confirmed} data-testid="approve-utility" className="btn btn-primary">{confirmed ? 'Request recorded' : pending ? 'Recording…' : 'Record a meter review request'}</button>
        </div>
      </div>
    </div>
  );
}
