import { useState } from 'react';
import type { BackendState } from '../api';
import { CASE_STATUS } from '../cases';
import type { CaseUpdate, HouseholdCase } from '../cases';
import { CaseUpdateForm } from './CaseUpdateForm';

interface Props {
  state: BackendState; enabled: boolean; onPrepare: (id: string) => void;
  onUpdate: (update: CaseUpdate) => Promise<HouseholdCase>; onRefresh: () => Promise<void>;
}
export function CaseWorkspace({ state, enabled, onPrepare, onUpdate, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const c = state.cases.find(c => c.id === selectedId) ?? state.cases[0];
  const item = state.appliances.find(a => a.has_repair_claim);
  return (
    <section data-testid="case-workspace" className="space-y-6 mb-10" aria-labelledby="case-workspace-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs text-amber-300 uppercase tracking-widest mb-2">Your household case</p><h2 id="case-workspace-title" className="text-2xl sm:text-3xl font-bold">{c ? 'A saved next step, from receipt to outcome' : 'Start with the receipt and repair facts'}</h2></div>
        {state.cases.length > 1 && <label className="text-sm">Choose a case<select value={c?.id} onChange={e => setSelectedId(e.target.value)} className="block p-3 bg-slate-900 rounded-lg border border-white/20">{state.cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      </div>
      {!c && <div data-testid="case-empty" className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-5 sm:p-7 space-y-5">
        <p className="text-slate-300">No case saved yet. Use the existing synthetic appliance and receipt to review a notice, then follow the case through to an evidenced outcome.</p>
        {item ? <>
          <h3 className="text-xl font-semibold">{item.item_name}</h3>
          <dl data-testid="reviewed-facts" className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-slate-400">Receipt reference</dt><dd>{item.receipt_reference ?? 'Missing receipt reference'}</dd></div>
            <div><dt className="text-slate-400">Purchase / repair date</dt><dd>{item.purchase_date} / {item.repair_date ?? 'Not recorded'}</dd></div>
            <div><dt className="text-slate-400">Seller</dt><dd>{item.seller_name}<br />{item.seller_email}</dd></div>
            <div><dt className="text-slate-400">Recorded repair cost</dt><dd>{item.repair_amount_known === false ? 'Amount not recorded' : `€${(item.repair_amount_cents / 100).toFixed(2)} (not recovered)`}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-400">Reported problem</dt><dd>{item.repair_issue}</dd></div>
          </dl>
          <p className="text-sm text-amber-300">Synthetic facts, not OCR or independent verification. Check these facts before continuing. The notice does not establish legal eligibility.</p>
          <button data-testid="prepare-case-notice" disabled={!enabled || item.repair_amount_known === false || item.repair_amount_cents <= 0} onClick={() => onPrepare(item.id)} className="px-5 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold disabled:opacity-50">Facts reviewed: prepare exact notice</button>
          {(item.repair_amount_known === false || item.repair_amount_cents <= 0) && <p className="text-sm text-amber-300">A documented positive repair amount is required before preparing a notice.</p>}
          {!enabled && <p className="text-sm text-slate-400">Begin the isolated demo session above to save your first case.</p>}
        </> : <p role="status">No appliance has a documented repair to review. Automatic OCR and provider inbox sync are unavailable; no case was fabricated.</p>}
      </div>}
      {c && <>
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-slate-900 p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">{c.title}</h3><span data-testid="case-status" className="rounded-full bg-amber-400/10 border border-amber-400/40 text-amber-200 py-2 px-4 font-semibold">{CASE_STATUS[c.status]}</span></div>
          <p className="text-sm text-slate-400">{c.seller} · Synthetic household case · No email sent</p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div><h4 className="text-sm font-bold text-amber-300 mb-1">Your next step</h4><p data-testid="case-next-action">{c.next_action}</p></div>
            <div data-testid="case-deadline"><h4 className="text-sm font-bold text-amber-300 mb-1">Planning deadline</h4><p>{c.deadline ?? 'Not set'}{c.deadline_status === 'due' ? ' · Due / overdue' : c.deadline_status === 'closed' ? ' · Case not awaiting a response' : ''}</p><p className="text-xs text-slate-400 mt-1">{c.deadline_label}</p></div>
          </div>
          {(c.status === 'draft' || c.status === 'review') && <button disabled={!enabled} onClick={() => onPrepare(c.item_id)} className="px-4 py-3 rounded-lg bg-amber-400 text-slate-950 disabled:opacity-50">Review a fresh exact notice</button>}
          {c.outcome && <div data-testid="case-outcome" className="border-t border-white/15 pt-4 text-sm space-y-1"><p className="font-semibold">{c.outcome.kind === 'partial' ? 'Partial outcome' : 'Recorded resolution'}: €{(c.outcome.amount_cents / 100).toFixed(2)} total (synthetic)</p><p>{c.outcome.label}</p><p>Evidence: {c.outcome.evidence_reference}</p></div>}
          <p data-testid="case-real-recovery" className="text-sm text-slate-300">Real recovered money: €0.00. Sending or simulating a notice never resolves the case.</p>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0 space-y-5">
            <details className="border border-white/15 rounded-xl p-4">
              <summary className="font-semibold cursor-pointer">Receipt, decision and exact notice</summary>
              <div className="pt-4 space-y-3 text-sm break-words"><p>Receipt: {c.facts.receipt_reference}</p><p>Purchase: {c.facts.purchase_date} · Repair: {c.facts.repair_date}</p><p>{c.facts.repair_issue} · €{(c.facts.repair_amount_cents / 100).toFixed(2)} recorded cost</p><p>Decision: {c.approval ? 'Exact draft approved; no email sent.' : 'Awaiting your review and exact approval.'}</p>{c.notice && <pre data-testid="case-exact-notice" className="whitespace-pre-wrap break-words text-xs font-mono">{c.notice.notice}</pre>}</div>
            </details>
            <section aria-labelledby="timeline-title"><h3 id="timeline-title" className="text-lg font-semibold mb-4">Case timeline</h3>
              <ol data-testid="case-timeline" className="space-y-4 border-l border-amber-400/30 pl-4">
                {c.timeline.map(event => <li key={event.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-2 break-words">
                  <div className="flex flex-wrap gap-2 justify-between text-sm"><strong>{CASE_STATUS[event.status]}</strong><time dateTime={event.timestamp} className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</time></div>
                  <p className="text-sm">{event.note}</p><p className="text-xs text-amber-200">{event.source_label}</p><p className="text-xs text-slate-300">Evidence: {event.evidence_reference}</p>
                  {event.deadline && <p className="text-xs text-slate-400">Planning date: {event.deadline}</p>}
                  {event.outcome && <p className="text-xs">Attested synthetic total: €{(event.outcome.amount_cents / 100).toFixed(2)}. {event.outcome.label}</p>}
                  <details className="text-xs text-slate-400"><summary className="cursor-pointer">Actor and audit detail</summary><p className="break-all mt-2">Actor: {event.actor}<br />Recorded: {event.timestamp}<br />Event: {event.id}</p></details>
                </li>)}
              </ol>
            </section>
          </div>
          {c.allowed_actions.length > 0 && <CaseUpdateForm key={c.id} householdCase={c} enabled={enabled} onUpdate={onUpdate} onRefresh={onRefresh} />}
        </div>
        <details className="text-xs text-slate-400"><summary className="cursor-pointer">Case storage and approval detail</summary><p className="mt-3 break-all">Case {c.id} · Revision {c.revision}<br />Approval digest: {c.approval?.digest ?? 'Not approved'}<br />Saved in an isolated session. Refresh or reload to recover it while the 30-minute session remains valid. No cross-device or expired-session recovery is connected.</p></details>
      </>}
    </section>
  );
}
