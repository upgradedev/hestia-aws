import React from 'react';

interface EmailSyncModalProps { isOpen: boolean; onClose: () => void }
export const EmailSyncModal: React.FC<EmailSyncModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="sync-title" className="relative w-full max-w-lg rounded-2xl bg-[#0d121c] border border-amber-500/30 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100">
        <div className="flex items-center justify-between">
          <h3 id="sync-title" className="text-base font-bold text-white">Instant E-Invoice Ingest</h3>
          <button onClick={onClose} aria-label="Close invoice sync" className="text-slate-400 hover:text-white text-lg p-1">✕</button>
        </div>
        <p role="status" className="text-xs text-amber-300 leading-relaxed">Invoice sync is not enabled in this demo. Mailbox and banking integrations are not connected. No invoices have been ingested.</p>
        <div className="p-4 rounded-xl bg-slate-900/90 border border-white/5 text-xs text-slate-300">Use the synthetic server preview, then explicitly begin an isolated demo session to review a claim.</div>
        <button disabled className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs opacity-50">Invoice Sync Unavailable</button>
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs">Close</button>
      </div>
    </div>
  );
};
