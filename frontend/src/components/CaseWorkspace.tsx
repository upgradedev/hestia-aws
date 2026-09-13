import { useState } from 'react';
import type { BackendState } from '../api';
import { CASE_STATUS } from '../cases';
import type { CaseUpdate, HouseholdCase } from '../cases';
import { CaseUpdateForm } from './CaseUpdateForm';

interface Props {
  state: BackendState; enabled: boolean; onPrepare: (id: string) => void;
  onUpdate: (update: CaseUpdate) => Promise<HouseholdCase>; onRefresh: () => Promise<void>;
}

const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export function CaseWorkspace({ state, enabled, onPrepare, onUpdate, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const c = state.cases.find(c => c.id === selectedId) ?? state.cases[0];
  const item = state.appliances.find(a => a.has_repair_claim);
  const amountMissing = !!item && (item.repair_amount_known === false || item.repair_amount_cents <= 0);
  return (
    <section data-testid="case-workspace" className="space-y-6" aria-labelledby="case-workspace-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your household case</p>
          <h1 id="case-workspace-title" className="title text-2xl sm:text-3xl mt-1">{c ? 'A saved next step, from receipt to outcome' : 'Start with the receipt and repair facts'}</h1>
        </div>
        {state.cases.length > 1 && <label className="text-sm">Choose a case<select value={c?.id} onChange={e => setSelectedId(e.target.value)} className="field">{state.cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      </div>

      {!c && <div data-testid="case-empty" className="card-accent p-5 sm:p-7 space-y-5">
        <p className="muted">No case saved yet. Check the recorded appliance and receipt facts, review the exact notice, then follow the case through to an evidenced outcome.</p>
        {item ? <>
          <h2 className="text-xl font-bold">{item.item_name}</h2>
          <dl data-testid="reviewed-facts" className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="muted">Receipt reference</dt><dd className="font-semibold mono">{item.receipt_reference ?? 'Missing receipt reference'}</dd></div>
            <div><dt className="muted">Purchase / repair date</dt><dd className="font-semibold">{item.purchase_date} / {item.repair_date ?? 'Not recorded'}</dd></div>
            <div><dt className="muted">Seller</dt><dd className="font-semibold">{item.seller_name}<br /><span className="mono text-xs font-normal">{item.seller_email}</span></dd></div>
            <div><dt className="muted">Recorded repair cost</dt><dd className="font-semibold">{item.repair_amount_known === false ? 'Amount not recorded' : `${euro(item.repair_amount_cents)} (not recovered)`}</dd></div>
            <div className="sm:col-span-2"><dt className="muted">Reported problem</dt><dd className="font-semibold">{item.repair_issue}</dd></div>
          </dl>
          <p className="note">These are the household's recorded facts, not OCR or independent verification. The notice does not establish legal eligibility.</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button data-testid="prepare-case-notice" disabled={!enabled || amountMissing} onClick={() => onPrepare(item.id)} className="btn btn-primary">Facts checked: prepare the exact notice</button>
            {amountMissing && <p className="note-alert text-sm">A documented positive repair amount is required before preparing a notice.</p>}
            {!enabled && <p className="note text-sm">Start the demo space to save your first case.</p>}
          </div>
        </> : <p role="status" className="note">No appliance has a documented repair to review. Automatic OCR and provider inbox sync are not part of this demo; no case was fabricated.</p>}
      </div>}

      {c && <>
        <div className="card-accent p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{c.title}</h2>
            <span data-testid="case-status" className={`chip text-sm ${c.status === 'resolved' ? 'chip-sage' : c.status === 'rejected' ? 'chip-clay' : 'chip-hearth'}`}>{CASE_STATUS[c.status]}</span>
          </div>
          <p className="text-sm muted">{c.seller} · recorded in this demo space · no email sent</p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div><h3 className="eyebrow mb-1">Your next step</h3><p data-testid="case-next-action" className="font-medium">{c.next_action}</p></div>
            <div data-testid="case-deadline"><h3 className="eyebrow mb-1">Planning deadline</h3><p className="font-medium">{c.deadline ?? 'Not set'}{c.deadline_status === 'due' ? ' · Due / overdue' : c.deadline_status === 'closed' ? ' · Case not awaiting a response' : ''}</p><p className="text-xs faint mt-1">{c.deadline_label}</p></div>
          </div>
          {(c.status === 'draft' || c.status === 'review') && <button disabled={!enabled} onClick={() => onPrepare(c.item_id)} className="btn btn-primary">Review a fresh exact notice</button>}
          {c.outcome && <div data-testid="case-outcome" className="border-t border-[var(--line)] pt-4 text-sm space-y-1"><p className="font-semibold">{c.outcome.kind === 'partial' ? 'Partial outcome' : 'Recorded resolution'}: {euro(c.outcome.amount_cents)} total (synthetic)</p><p className="muted">{c.outcome.label}</p><p className="muted">Evidence: {c.outcome.evidence_reference}</p></div>}
          <p data-testid="case-real-recovery" className="text-sm muted">Real recovered money: €0.00. Approving or recording a notice never resolves the case by itself.</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0 space-y-5">
            <details className="card p-4">
              <summary className="font-semibold">Receipt, decision and exact notice</summary>
              <div className="pt-4 space-y-2 text-sm break-words">
                <p><span className="muted">Receipt:</span> <span className="mono">{c.facts.receipt_reference}</span></p>
                <p><span className="muted">Purchase:</span> {c.facts.purchase_date} · <span className="muted">Repair:</span> {c.facts.repair_date}</p>
                <p>{c.facts.repair_issue} · {euro(c.facts.repair_amount_cents)} recorded cost</p>
                <p><span className="muted">Decision:</span> {c.approval ? 'Exact draft approved; no email sent.' : 'Awaiting your review and exact approval.'}</p>
                {c.notice && <pre data-testid="case-exact-notice" className="whitespace-pre-wrap break-words text-xs mono inset p-3">{c.notice.notice}</pre>}
              </div>
            </details>
            <section aria-labelledby="timeline-title" className="card p-4 sm:p-5">
              <h3 id="timeline-title" className="text-lg font-bold mb-4">Case timeline</h3>
              <ol data-testid="case-timeline" className="timeline space-y-4">
                {c.timeline.map(event => <li key={event.id} className="inset p-4 space-y-1.5 break-words">
                  <div className="flex flex-wrap gap-2 justify-between text-sm"><strong>{CASE_STATUS[event.status]}</strong><time dateTime={event.timestamp} className="text-xs faint">{new Date(event.timestamp).toLocaleString()}</time></div>
                  <p className="text-sm">{event.note}</p>
                  <p className="text-xs text-[var(--hearth-strong)]">{event.source_label}</p>
                  <p className="text-xs muted">Evidence: {event.evidence_reference}</p>
                  {event.deadline && <p className="text-xs muted">Planning date: {event.deadline}</p>}
                  {event.outcome && <p className="text-xs">Attested synthetic total: {euro(event.outcome.amount_cents)}. {event.outcome.label}</p>}
                  <details className="text-xs faint"><summary>Actor and audit detail</summary><p className="break-all mt-2">Actor: {event.actor}<br />Recorded: {event.timestamp}<br />Event: {event.id}</p></details>
                </li>)}
              </ol>
            </section>
          </div>
          {c.allowed_actions.length > 0 && <CaseUpdateForm key={c.id} householdCase={c} enabled={enabled} onUpdate={onUpdate} onRefresh={onRefresh} />}
        </div>
        <details className="text-xs faint"><summary>Case storage and approval detail</summary><p className="mt-3 break-all">Case {c.id} · Revision {c.revision}<br />Approval digest: {c.approval?.digest ?? 'Not approved'}<br />Saved in this demo space. Refresh or reload to recover it while the 30-minute space remains valid. No cross-device or expired-space recovery is connected.</p></details>
      </>}
    </section>
  );
}
