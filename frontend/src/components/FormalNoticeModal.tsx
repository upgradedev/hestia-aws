import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, expiryMillis } from '../api';
import type { ClaimDraft } from '../api';
import type { ApplianceWarranty, DispatchRecord } from '../types';

interface FormalNoticeModalProps {
  appliance: ApplianceWarranty | null;
  isOpen: boolean;
  token: string;
  enabled: boolean;
  onClose: () => void;
  onError: (error: unknown) => void;
  onDispatch: (draft: ClaimDraft) => Promise<DispatchRecord>;
}

export const FormalNoticeModal: React.FC<FormalNoticeModalProps> = ({
  appliance, isOpen, token, enabled, onClose, onError, onDispatch,
}) => {
  const [draft, setDraft] = useState<ClaimDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);
  const [record, setRecord] = useState<DispatchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const prepared = useRef<{ key: string; promise: Promise<ClaimDraft> } | null>(null);
  const itemId = appliance?.id;

  useEffect(() => {
    let current = true;
    setDraft(null); setRecord(null); setError(null); setCopyError(null); setCopied(false); setExpired(false); setLoading(true);
    if (!isOpen || !itemId || !token) { setLoading(false); return; }
    // Deduplicate StrictMode setup. Preparing persists a draft; never replay it in effect cleanup.
    const key = token + ':' + itemId;
    if (prepared.current?.key !== key) prepared.current = { key, promise: api.prepare(token, itemId) };
    prepared.current.promise.then(next => {
      if (!current) return;
      if (next.item_id !== itemId) throw new ApiError('This preview belongs to another item. Refresh state and reopen the notice.');
      setDraft(next);
      setExpired(expiryMillis(next.expires_at) <= Date.now());
    }).catch(error => {
      if (!current) return;
      setError(errorMessage(error)); onError(error);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [isOpen, itemId, token, onError]);

  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => setExpired(true), Math.min(2147483647, Math.max(0, expiryMillis(draft.expires_at) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, [isOpen]);

  // All hooks precede conditional returns. App remounts on close, selection, or session change.
  if (!isOpen || !appliance) return null;
  const unavailable = loading || !draft || !!error || expired || isDispatching || !!record || !enabled;

  const handleSend = async () => {
    if (unavailable || !draft || submitting.current) return;
    if (expiryMillis(draft.expires_at) <= Date.now()) { setExpired(true); return; }
    submitting.current = true;
    setIsDispatching(true);
    try {
      const result = await onDispatch(draft);
      if (result.status !== 'simulated') throw new ApiError('Simulation was not confirmed.');
      setRecord(result);
    } catch (error) { setError(errorMessage(error)); }
    finally { submitting.current = false; setIsDispatching(false); }
  };
  const handleCopy = async () => {
    if (!draft || loading || error) return;
    try { await navigator.clipboard.writeText(draft.notice); setCopied(true); setCopyError(null); }
    catch { setCopyError('Clipboard unavailable. Export the exact notice as a text file.'); }
  };
  const handleDownload = () => {
    if (!draft || loading || error) return;
    const url = URL.createObjectURL(new Blob([draft.notice], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'Hestia-Statutory-Notice.txt';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="formal-notice-title" tabIndex={-1}
        onKeyDown={event => {
          if (event.key === 'Escape' && !isDispatching) onClose();
          if (event.key === 'Tab') {
            const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}
        className="max-w-2xl w-full bg-[#0d121c] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <h3 id="formal-notice-title" className="text-sm font-bold text-white">Formal Statutory Notice of Lack of Conformity</h3>
            <p className="text-[11px] font-mono text-slate-400">Server preview · isolated simulation · no email will be sent</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} disabled={!draft || loading || !!error} title="Copy to clipboard" className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg text-xs border border-white/10 disabled:opacity-50">{copied ? 'Copied!' : 'Copy Text'}</button>
            <button onClick={handleDownload} disabled={!draft || loading || !!error} title="Download notice as text" className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg text-xs border border-white/10 disabled:opacity-50">Export .txt</button>
            <button onClick={onClose} disabled={isDispatching} aria-label="Close notice" className="text-slate-400 hover:text-white p-1 text-lg">&times;</button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono text-slate-300 leading-relaxed bg-[#080b10]">
          <p>{appliance.name}</p>
          {loading && <p role="status">Preparing the server notice...</p>}
          {error && <p role="alert" className="p-3 rounded-xl border border-rose-500/40 text-rose-300">{error} Close this preview, refresh state, and review a new draft before another approval.</p>}
          {expired && !record && <p role="alert" className="text-amber-300">Draft expired. Close and reopen to explicitly request a new preview.</p>}
          {!enabled && !record && <p className="text-amber-300">Approval unavailable while session state needs recovery or another action is pending.</p>}
          {copyError && <p role="alert">{copyError}</p>}
          {draft && <>
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 grid grid-cols-2 gap-3 text-[11px]">
              <div><span className="text-slate-500 uppercase block">Claimant (Consumer)</span><span data-testid="notice-claimant">{draft.homeowner_name}</span></div>
              <div><span className="text-slate-500 uppercase block">Seller (Commercial Respondent)</span><span>{draft.seller}</span><div data-testid="notice-recipient">{draft.seller_email}</div></div>
            </div>
            <div className="border-t border-b border-white/10 py-2.5">
              <div><strong>SUBJECT:</strong> <span data-testid="notice-subject">{draft.subject}</span></div>
              <div><strong>CLAIM SUM:</strong> <span data-testid="notice-amount">{(draft.amount_cents / 100).toFixed(2)} {draft.currency}</span></div>
            </div>
            <pre data-testid="server-notice" className="whitespace-pre-wrap break-words font-mono text-xs">{draft.notice}</pre>
            <div className="pt-3 border-t border-white/10 text-[10px] text-slate-500 break-all">Preview digest: {draft.digest}<br />Expires: {new Date(expiryMillis(draft.expires_at)).toISOString()}<br />Mode: {draft.mode} · Generator: {draft.model_id}</div>
          </>}
          {record && <div role="status" data-testid="claim-result" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">Simulated approval recorded. No email sent and no reimbursement recorded. Record: {record.id}</div>}
        </div>
        <div className="px-6 py-4 bg-slate-900 border-t border-white/10 flex items-center justify-between gap-3">
          <button onClick={onClose} disabled={isDispatching} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">{record ? 'Close' : 'Cancel / Edit Later'}</button>
          <button onClick={handleSend} disabled={unavailable} data-testid="approve-claim" className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-lg disabled:opacity-50">
            {record ? 'Simulated approval recorded' : isDispatching ? 'Recording simulated approval...' : 'Approve Simulated Notice'}
          </button>
        </div>
      </div>
    </div>
  );
};
