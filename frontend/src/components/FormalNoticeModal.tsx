import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, expiryMillis } from '../api';
import type { ClaimDraft } from '../api';
import type { ApplianceWarranty, DispatchRecord } from '../types';

interface FormalNoticeModalProps {
  appliance: ApplianceWarranty | null; isOpen: boolean; token: string; enabled: boolean;
  onClose: () => void; onError: (error: unknown) => void;
  onDispatch: (draft: ClaimDraft) => Promise<DispatchRecord>; onViewCase: () => void;
}

export function FormalNoticeModal({ appliance, isOpen, token, enabled, onClose, onError, onDispatch, onViewCase }: FormalNoticeModalProps) {
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
    link.href = url; link.download = 'Hestia-repair-notice.txt';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="modal-backdrop">
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
        className="modal max-w-2xl">
        <div className="modal-head">
          <div>
            <h3 id="formal-notice-title" className="font-bold">Repair notice for your review</h3>
            <p className="text-xs muted">Prepared on the server from the recorded facts · recorded on approval, never sent</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleCopy} disabled={!draft || loading || !!error} title="Copy to clipboard" className="btn btn-quiet btn-sm whitespace-nowrap">{copied ? 'Copied' : 'Copy text'}</button>
            <button onClick={handleDownload} disabled={!draft || loading || !!error} title="Download notice as text" className="btn btn-quiet btn-sm whitespace-nowrap">Export .txt</button>
            <button onClick={onClose} disabled={isDispatching} aria-label="Close notice" className="btn btn-quiet btn-sm text-lg">&times;</button>
          </div>
        </div>
        <div className="modal-body space-y-4 text-sm">
          <p className="font-semibold">{appliance.name}</p>
          {loading && <p role="status" className="note">Preparing the server notice...</p>}
          {error && <p role="alert" className="note-alert">{error} Close this preview, refresh state, and review a new draft before another approval.</p>}
          {expired && !record && <p role="alert" className="note-alert">Draft expired. Close and reopen to explicitly request a new preview.</p>}
          {!enabled && !record && <p className="note-alert">Approval unavailable while session state needs recovery or another action is pending.</p>}
          {copyError && <p role="alert" className="note-alert">{copyError}</p>}
          {draft && <>
            <div className="inset p-3 grid grid-cols-2 gap-3 text-xs">
              <div><span className="faint uppercase block">Claimant (consumer)</span><span data-testid="notice-claimant" className="font-semibold">{draft.homeowner_name}</span></div>
              <div><span className="faint uppercase block">Seller (respondent)</span><span className="font-semibold">{draft.seller}</span><div data-testid="notice-recipient" className="mono">{draft.seller_email}</div></div>
            </div>
            <div className="border-t border-b border-[var(--line)] py-2.5 text-xs space-y-1">
              <div><strong>Subject:</strong> <span data-testid="notice-subject">{draft.subject}</span></div>
              <div><strong>Recorded repair cost:</strong> <span data-testid="notice-amount">{(draft.amount_cents / 100).toFixed(2)} {draft.currency}</span></div>
            </div>
            <pre data-testid="server-notice" className="whitespace-pre-wrap break-words mono text-xs inset p-3">{draft.notice}</pre>
            <p className="text-xs muted">Approval expires: {new Date(expiryMillis(draft.expires_at)).toLocaleString()}. Prepared from the recorded facts; no eligibility decision is implied.</p>
            <details className="text-xs faint break-all"><summary>Preview and generator detail</summary>Preview digest: {draft.digest}<br />Mode: {draft.mode} · Generator: {draft.model_id}</details>
          </>}
          {record && <div role="status" data-testid="claim-result" className="inset p-3 note-ok">Simulated approval recorded. No email sent and no reimbursement recorded. Record: {record.id}</div>}
          {record && <button data-testid="open-persisted-case" onClick={onViewCase} className="btn btn-primary w-full">Continue to the saved case and next step</button>}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={isDispatching} className="btn btn-quiet btn-sm">{record ? 'Close' : 'Cancel / edit later'}</button>
          <button onClick={handleSend} disabled={unavailable} data-testid="approve-claim" className="btn btn-primary">
            {record ? 'Approval recorded' : isDispatching ? 'Recording your approval…' : 'Approve this notice (recorded, not sent)'}
          </button>
        </div>
      </div>
    </div>
  );
}
