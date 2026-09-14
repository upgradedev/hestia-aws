import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { PaymentOutflow } from '../types';
import { IntakePanel } from './IntakePanel';
import type { IntakePanelProps } from './IntakePanel';

interface ReceiptUploadModalProps {
  isOpen: boolean; onClose: () => void; outflows: PaymentOutflow[]; enabled: boolean;
  onReceiptMatched: (outflowId: string, receiptId: string) => Promise<void>;
  intake: Omit<IntakePanelProps, 'route' | 'initialRecords'>;
}
export function ReceiptUploadModal({ isOpen, onClose, outflows, enabled, onReceiptMatched, intake }: ReceiptUploadModalProps) {
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
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="modal max-w-xl">
        <div className="modal-head">
          <div>
            <h3 id="receipt-title" className="font-bold">Link a receipt</h3>
            <p className="text-xs muted">Manual reference or document import, reviewed before changes enter household records</p>
          </div>
          <button onClick={onClose} disabled={pending} aria-label="Close receipt options" className="btn btn-quiet btn-sm text-lg">&times;</button>
        </div>
        <div className="modal-body space-y-4 text-sm">
          <p role="status" className="note">Receipt scanning is not enabled in this demo. Manual document import is available below; no OCR or new appliance creation.</p>
          <p className="muted">Record a receipt reference against an existing transaction. This links the reference; it does not verify the receipt.</p>
          <label className="block font-medium">Transaction
            <select value={outflowId} onChange={event => setOutflowId(event.target.value)} disabled={pending || confirmed || !enabled} className="field" data-testid="receipt-outflow">
              <option value="">Select a transaction</option>
              {outflows.filter(o => !o.has_receipt).map(o => <option key={o.id} value={o.id}>{o.merchant} · €{o.amount_eur.toFixed(2)} · {o.timestamp}</option>)}
            </select>
          </label>
          <label className="block font-medium">Receipt reference
            <input value={receiptId} onChange={event => setReceiptId(event.target.value)} disabled={pending || confirmed || !enabled} maxLength={100} data-testid="receipt-reference" className="field" />
          </label>
          {!enabled && <p className="note-alert">Start or refresh your demo space to record a manual reference.</p>}
          {error && <p role="alert" className="note-alert">{error}</p>}
          {confirmed && <p role="status" data-testid="receipt-result" className="note-ok">Manual demo reference recorded. Not OCR verified; no new appliance was created.</p>}
          <IntakePanel {...intake} route="/api/receipt/scan" initialRecords={outflows.filter(o => !o.has_receipt).slice(0, 1).map(o => ({ kind: 'receipt', transaction_id: o.id, merchant: o.merchant, amount_cents: Math.round(o.amount_eur * 100), date: o.timestamp, receipt_id: 'YOUR-RECEIPT-ID' }))} />
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={pending} className="btn btn-quiet btn-sm">Close</button>
          <button onClick={() => { void submit(); }} disabled={!enabled || pending || confirmed || !outflowId || !receiptId.trim()} data-testid="link-receipt" className="btn btn-primary">{pending ? 'Recording…' : 'Record the reference'}</button>
        </div>
      </div>
    </div>
  );
}
