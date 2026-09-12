import React, { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { PaymentOutflow } from '../types';
import { IntakePanel } from './IntakePanel';
import type { IntakePanelProps } from './IntakePanel';

interface ReceiptUploadModalProps {
  isOpen: boolean; onClose: () => void; outflows: PaymentOutflow[]; enabled: boolean;
  onReceiptMatched: (outflowId: string, receiptId: string) => Promise<void>;
  intake: Omit<IntakePanelProps, 'route' | 'initialRecords'>;
}
export const ReceiptUploadModal: React.FC<ReceiptUploadModalProps> = ({ isOpen, onClose, outflows, enabled, onReceiptMatched, intake }) => {
  const [outflowId, setOutflowId] = useState(() => outflows.find(o => !o.has_receipt)?.id ?? '');
  const [receiptId, setReceiptId] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  if (!isOpen) return null;
  const submit = async () => {
    if (!enabled || lock.current || !outflowId || !receiptId.trim()) return;
    lock.current = true; setPending(true);
    try { await onReceiptMatched(outflowId, receiptId.trim()); setConfirmed(true); setError(null); }
    catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="max-w-xl w-full max-h-[90vh] overflow-y-auto bg-[#0d121c] border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col">
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
          <h3 id="receipt-title" className="text-sm font-bold text-white">Receipt Anti-Join & Proof Vault</h3>
          <button onClick={onClose} disabled={pending} aria-label="Close receipt options" className="text-slate-400 hover:text-white p-1 text-lg">&times;</button>
        </div>
        <div className="p-6 space-y-4 text-xs text-slate-300">
          <p role="status" className="p-3 rounded-xl border border-amber-500/30 text-amber-300">Receipt scanning is not enabled in this demo. Manual document import is available below; no OCR or new appliance creation.</p>
          <p>For this isolated demo, you can manually record a receipt reference against an existing transaction. This does not verify the receipt.</p>
          <label className="block">Transaction
            <select value={outflowId} onChange={event => setOutflowId(event.target.value)} disabled={pending || confirmed || !enabled} className="mt-1 w-full bg-slate-900 border border-white/20 rounded-lg p-2" data-testid="receipt-outflow">
              <option value="">Select a transaction</option>
              {outflows.filter(o => !o.has_receipt).map(o => <option key={o.id} value={o.id}>{o.merchant} · €{o.amount_eur.toFixed(2)} · {o.timestamp}</option>)}
            </select>
          </label>
          <label className="block">Receipt reference
            <input value={receiptId} onChange={event => setReceiptId(event.target.value)} disabled={pending || confirmed || !enabled} maxLength={100} data-testid="receipt-reference" className="mt-1 w-full bg-slate-900 border border-white/20 rounded-lg p-2" />
          </label>
          {!enabled && <p className="text-amber-300">Begin or recover your isolated demo session to record a manual reference.</p>}
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          {confirmed && <p role="status" data-testid="receipt-result" className="text-emerald-300">Manual demo reference recorded. Not OCR verified; no new appliance was created.</p>}
          <IntakePanel {...intake} route="/api/receipt/scan" initialRecords={outflows.filter(o => !o.has_receipt).slice(0, 1).map(o => ({ kind: 'receipt', transaction_id: o.id, merchant: o.merchant, amount_cents: Math.round(o.amount_eur * 100), date: o.timestamp, receipt_id: 'YOUR-RECEIPT-ID' }))} />
        </div>
        <div className="px-6 py-4 bg-slate-900 border-t border-white/10 flex items-center justify-between">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs">Close</button>
          <button onClick={() => { void submit(); }} disabled={!enabled || pending || confirmed || !outflowId || !receiptId.trim()} data-testid="link-receipt" className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-bold text-xs disabled:opacity-50">{pending ? 'Recording...' : 'Record Manual Demo Reference'}</button>
        </div>
      </div>
    </div>
  );
};
