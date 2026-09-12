import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import { CASE_ACTIONS } from '../cases';
import type { CaseAction, CaseUpdate, HouseholdCase, UpdateSource } from '../cases';

interface Props {
  householdCase: HouseholdCase; enabled: boolean;
  onUpdate: (update: CaseUpdate) => Promise<HouseholdCase>; onRefresh: () => Promise<void>;
}
const manualOnly = new Set<CaseAction>(['start_tracking', 'add_evidence', 'reopen', 'set_deadline', 'record_silence']);
const inputClass = 'block w-full mt-2 bg-slate-950 border border-slate-600 rounded-lg p-3 text-slate-100';

export function CaseUpdateForm({ householdCase: c, enabled, onUpdate, onRefresh }: Props) {
  const [action, setAction] = useState<CaseAction>(c.allowed_actions[0]);
  const [source, setSource] = useState<UpdateSource>('manual_update');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [deadline, setDeadline] = useState(c.deadline ?? '');
  const [amount, setAmount] = useState('');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CaseUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  const chosen = c.allowed_actions.includes(action) ? action : c.allowed_actions[0];
  const monetary = chosen === 'resolve' || chosen === 'partial_outcome';
  const needsDate = chosen === 'start_tracking' || chosen === 'set_deadline' || chosen === 'reopen';
  const effectiveSource = manualOnly.has(chosen) ? 'manual_update' : source;

  const submit = async (update: CaseUpdate) => {
    if (!enabled || submitting.current) return;
    submitting.current = true; setBusy(true); setError(null); setMessage(null); setPending(update);
    try {
      const saved = await onUpdate(update);
      setPending(null); setNote(''); setEvidence(''); setAttested(false); setAmount('');
      setAction(saved.allowed_actions[0]);
      setMessage('Update saved in this case timeline. No message sent and no real money recovered.');
    } catch (error) { setError(errorMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-white/15 bg-slate-900/60 p-5 sm:p-6" aria-labelledby="case-update-title">
      <h3 id="case-update-title" className="text-lg font-semibold">Add a case update</h3>
      <p className="text-sm text-slate-400 mt-2">No mailbox is connected. Record your own report or an explicitly synthetic reply. Evidence references are notes, not uploaded or verified documents.</p>
      {!enabled && <p role="status" className="mt-3 text-amber-300">Updates are blocked until your isolated session is active and its state is recovered.</p>}
      {message && <p role="status" data-testid="case-update-result" className="mt-3 text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
      {pending ? (
        <div className="mt-4 space-y-3" data-testid="case-pending-update">
          <p className="text-sm">Keep this exact update until the server state is reconciled. A retry reuses the same request ID and cannot append it twice.</p>
          <p className="text-sm break-words">{CASE_ACTIONS[pending.action]}: {pending.note}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => { void onRefresh(); }} className="border border-white/30 rounded-lg px-4 py-3">Refresh case state</button>
            <button type="button" disabled={busy || !enabled} data-testid="retry-case-update" onClick={() => { void submit(pending); }} className="bg-amber-400 text-slate-950 rounded-lg px-4 py-3 disabled:opacity-50">Retry exact update</button>
            <button type="button" disabled={busy || !enabled} onClick={() => { setPending(null); setError(null); }} className="border border-white/30 rounded-lg px-4 py-3">Review a different update</button>
          </div>
        </div>
      ) : (
        <form className="space-y-4 mt-5" onSubmit={event => {
          event.preventDefault();
          const amountCents = amount === '' ? 0 : Math.round(Number(amount) * 100);
          const update: CaseUpdate = {
            case_id: c.id, expected_revision: c.revision, request_id: crypto.randomUUID().replaceAll('-', ''),
            action: chosen, source: effectiveSource, note: note.trim(), evidence_reference: evidence.trim(),
            ...(needsDate ? { deadline } : {}), ...(monetary ? { amount_cents: amountCents, attested } : {}),
          };
          void submit(update);
        }}>
          <fieldset disabled={!enabled || busy} className="space-y-4 disabled:opacity-60">
            <legend className="sr-only">Record a protected case update</legend>
            <label className="block text-sm">What happened?
              <select data-testid="case-action" value={chosen} onChange={e => { setAction(e.target.value as CaseAction); setAttested(false); }} className={inputClass}>
                {c.allowed_actions.map(a => <option value={a} key={a}>{CASE_ACTIONS[a]}</option>)}
              </select>
            </label>
            <label className="block text-sm">Update source
              <select data-testid="case-source" value={effectiveSource} disabled={manualOnly.has(chosen)} onChange={e => { setSource(e.target.value as UpdateSource); setAttested(false); }} className={inputClass}>
                <option value="manual_update">Manual household update (unverified report)</option>
                <option value="synthetic_reply">Synthetic reply fixture (not a merchant reply)</option>
              </select>
            </label>
            <p data-testid="case-source-explanation" className="text-xs text-amber-300">{effectiveSource === 'synthetic_reply'
              ? 'This will be labeled synthetic on every timeline entry. It is not a real merchant response.'
              : 'Attributed to this household session. No merchant identity, document or delivery is independently verified.'}</p>
            <label className="block text-sm">Update summary
              <input data-testid="case-note" required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className={inputClass} placeholder="Describe what changed and what still needs attention" />
            </label>
            <label className="block text-sm">Evidence reference
              <input data-testid="case-evidence" required maxLength={200} value={evidence} onChange={e => setEvidence(e.target.value)} className={inputClass} placeholder="For example: repair invoice, reported reply date, or fixture ID" />
            </label>
            {needsDate && <label className="block text-sm">Planning deadline (UTC, not a legal deadline)
              <input data-testid="case-deadline-input" type="date" required value={deadline} onChange={e => setDeadline(e.target.value)} className={inputClass} />
            </label>}
            {monetary && <>
              <label className="block text-sm">Total evidenced outcome amount in EUR (synthetic)
                <input data-testid="case-amount" type="number" min={chosen === 'partial_outcome' ? '0.01' : '0'} max={(c.facts.repair_amount_cents / 100).toFixed(2)} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} />
              </label>
              <p className="text-xs text-slate-400">Enter the total supported by this update, not an additional payment. Zero can document a non-monetary resolution. Real recovered money stays €0.00 in this demo.</p>
              <label className="flex items-start gap-3 text-sm"><input data-testid="case-attestation" type="checkbox" required checked={attested} onChange={e => setAttested(e.target.checked)} className="mt-1 w-5 h-5 shrink-0" />
                I attest that the referenced evidence supports this synthetic outcome and amount. This is not evidence of real reimbursement.</label>
            </>}
            <button data-testid="save-case-update" type="submit" className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold">Save case update</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
