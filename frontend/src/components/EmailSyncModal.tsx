import { IntakePanel } from './IntakePanel';
import type { IntakePanelProps } from './IntakePanel';

interface EmailSyncModalProps { isOpen: boolean; onClose: () => void; intake: Omit<IntakePanelProps, 'route'> }
export function EmailSyncModal({ isOpen, onClose, intake }: EmailSyncModalProps) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="sync-title" className="modal max-w-lg">
        <div className="modal-head">
          <div>
            <h3 id="sync-title" className="font-bold">Import records</h3>
            <p className="text-xs muted">Transactions, receipts and subscriptions from your own documents</p>
          </div>
          <button onClick={onClose} aria-label="Close invoice sync" className="btn btn-quiet btn-sm text-lg">&times;</button>
        </div>
        <div className="modal-body space-y-4 text-sm">
          <p role="status" className="note">Invoice sync is not enabled in this demo. Mailbox and banking integrations are not connected. Import your bounded JSON records or enter facts manually below.</p>
          <IntakePanel {...intake} route="/api/ingest/sync" />
        </div>
        <div className="modal-foot">
          <button onClick={onClose} className="btn btn-quiet btn-sm">Close</button>
          <span className="faint text-xs">Nothing is imported until you confirm the reviewed changes</span>
        </div>
      </div>
    </div>
  );
}
