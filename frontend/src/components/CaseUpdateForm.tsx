import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import { CASE_ACTIONS } from '../cases';
import type { CaseAction, CaseUpdate, HouseholdCase, UpdateSource } from '../cases';

interface Props {
  householdCase: HouseholdCase; enabled: boolean;
  onUpdate: (update: CaseUpdate) => Promise<HouseholdCase>; onRefresh: () => Promise<void>;
}
const manualOnly = new Set<CaseAction>(['start_tracking', 'add_evidence', 'reopen', 'set_deadline', 'record_silence']);

export function CaseUpdateForm({ householdCase: c, enabled, onUpdate, onRefresh }: Props) {
  const [action, setAction] = useState<CaseAction>(c.allowed_actions[0]);
  const [source, setSource] = useState<UpdateSource>('manual_update');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [deadline, setDeadline] = useState(c.deadline ?? '');
  const [amount, setAmount] = useState('');
  const [attestedContent, setAttestedContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CaseUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  const chosen = c.allowed_actions.includes(action) ? action : c.allowed_actions[0];
  const monetary = chosen === 'resolve' || chosen === 'partial_outcome';
  const needsDate = chosen === 'start_tracking' || chosen === 'set_deadline' || chosen === 'reopen';
  const effectiveSource = manualOnly.has(chosen) ? 'manual_update' : source;
  const amountCents = amount === '' ? 0 : Math.round(Number(amount) * 100);
  const consentContent = JSON.stringify({ case_id: c.id, expected_revision: c.revision,
    action: chosen, source: effectiveSource, note: note.trim(), evidence_reference: evidence.trim(), amount_cents: amountCents });
  const attested = attestedContent === consentContent;

  const submit = async (update: CaseUpdate) => {
    if (!enabled || submitting.current) return;
    submitting.current = true; setBusy(true); setError(null); setMessage(null); setPending(update);
    try {
      const saved = await onUpdate(update);
      setPending(null); setNote(''); setEvidence(''); setAttestedContent(null); setAmount('');
      setAction(saved.allowed_actions[0]);
      setMessage('Update saved in this case timeline. No message sent and no real money recovered.');
    } catch (error) { setError(errorMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="case-update-title">
      <h3 id="case-update-title" className="text-lg font-bold">Add a case update</h3>
      <p className="note mt-1">No mailbox is connected. Record your own report or an explicitly synthetic reply. Evidence references are notes, not uploaded or verified documents.</p>
      {!enabled && <p role="status" className="mt-3 note-alert">Updates are blocked until your demo space is active and its state is refreshed.</p>}
      {message && <p role="status" data-testid="case-update-result" className="mt-3 note-ok">{message}</p>}
      {error && <p role="alert" className="mt-3 note-alert">{error}</p>}
      {pending ? (
        <div className="mt-4 space-y-3" data-testid="case-pending-update">
          <p className="text-sm">Keep this exact update until the server state is reconciled. A retry reuses the same request ID and cannot append it twice.</p>
          <p className="text-sm break-words"><span className="muted">{CASE_ACTIONS[pending.action]}:</span> {pending.note}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => { void onRefresh(); }} className="btn btn-secondary btn-sm">Refresh case state</button>
            <button type="button" disabled={busy || !enabled} data-testid="retry-case-update" onClick={() => { void submit(pending); }} className="btn btn-primary btn-sm">Retry exact update</button>
            <button type="button" disabled={busy || !enabled} onClick={() => { setPending(null); setError(null); }} className="btn btn-quiet btn-sm">Review a different update</button>
          </div>
        </div>
      ) : (
        <form className="space-y-4 mt-5" onSubmit={event => {
          event.preventDefault();
          const update: CaseUpdate = {
            case_id: c.id, expected_revision: c.revision, request_id: crypto.randomUUID().replaceAll('-', ''),
            action: chosen, source: effectiveSource, note: note.trim(), evidence_reference: evidence.trim(),
            ...(needsDate ? { deadline } : {}), ...(monetary ? { amount_cents: amountCents, attested } : {}),
          };
          void submit(update);
        }}>
          <fieldset disabled={!enabled || busy} className="space-y-4 disabled:opacity-60">
            <legend className="sr-only">Record a protected case update</legend>
            <label className="block text-sm font-medium">What happened?
              <select data-testid="case-action" value={chosen} onChange={e => { setAction(e.target.value as CaseAction); setAttestedContent(null); }} className="field">
                {c.allowed_actions.map(a => <option value={a} key={a}>{CASE_ACTIONS[a]}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Update source
              <select data-testid="case-source" value={effectiveSource} disabled={manualOnly.has(chosen)} onChange={e => { setSource(e.target.value as UpdateSource); setAttestedContent(null); }} className="field">
                <option value="manual_update">Manual household update (unverified report)</option>
                <option value="synthetic_reply">Synthetic reply fixture (not a merchant reply)</option>
              </select>
            </label>
            <p data-testid="case-source-explanation" className="text-xs muted">{effectiveSource === 'synthetic_reply'
              ? 'This will be labeled synthetic on every timeline entry. It is not a real merchant response.'
              : 'Attributed to this household session. No merchant identity, document or delivery is independently verified.'}</p>
            <label className="block text-sm font-medium">Update summary
              <input data-testid="case-note" required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className="field" placeholder="Describe what changed and what still needs attention" />
            </label>
            <label className="block text-sm font-medium">Evidence reference
              <input data-testid="case-evidence" required maxLength={200} value={evidence} onChange={e => setEvidence(e.target.value)} className="field" placeholder="For example: repair invoice, reported reply date, or fixture ID" />
            </label>
            {needsDate && <label className="block text-sm font-medium">Planning deadline (UTC, not a legal deadline)
              <input data-testid="case-deadline-input" type="date" required value={deadline} onChange={e => setDeadline(e.target.value)} className="field" />
            </label>}
            {monetary && <>
              <label className="block text-sm font-medium">Total evidenced outcome amount in EUR (synthetic)
                <input data-testid="case-amount" type="number" min={chosen === 'partial_outcome' ? '0.01' : '0'} max={(c.facts.repair_amount_cents / 100).toFixed(2)} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="field" />
              </label>
              <p className="text-xs muted">Enter the total supported by this update, not an additional payment. Zero can document a non-monetary resolution. Real recovered money stays €0.00 in this demo.</p>
              <label className="flex items-start gap-3 text-sm"><input data-testid="case-attestation" type="checkbox" required checked={attested} onChange={e => setAttestedContent(e.target.checked ? consentContent : null)} className="mt-1 w-5 h-5 shrink-0 accent-[var(--hearth)]" />
                I attest that the referenced evidence supports this synthetic outcome and amount. This is not evidence of real reimbursement.</label>
              {!attested && <p className="text-xs note-alert">Confirm this exact update. Changing the amount, summary, evidence, source or case revision requires fresh attestation.</p>}
            </>}
            <button data-testid="save-case-update" type="submit" disabled={monetary && !attested} className="btn btn-primary w-full sm:w-auto">Save case update</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
