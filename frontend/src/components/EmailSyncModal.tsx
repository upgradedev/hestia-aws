import React from 'react';
import { IntakePanel } from './IntakePanel';
import type { IntakePanelProps } from './IntakePanel';

interface EmailSyncModalProps { isOpen: boolean; onClose: () => void; intake: Omit<IntakePanelProps, 'route'> }
export const EmailSyncModal: React.FC<EmailSyncModalProps> = ({ isOpen, onClose, intake }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="sync-title" className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0d121c] border border-amber-500/30 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100">
        <div className="flex items-center justify-between">
          <h3 id="sync-title" className="text-base font-bold text-white">Manual Invoice and Transaction Import</h3>
          <button onClick={onClose} aria-label="Close invoice sync" className="text-slate-400 hover:text-white text-lg p-1">✕</button>
        </div>
        <p role="status" className="text-xs text-amber-300 leading-relaxed">Invoice sync is not enabled in this demo. Mailbox and banking integrations are not connected. Import your bounded JSON records or enter facts manually below.</p>
        <IntakePanel {...intake} route="/api/ingest/sync" />
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs">Close</button>
      </div>
    </div>
  );
};
