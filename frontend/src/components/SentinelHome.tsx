import { useState } from 'react';
import type { AgentBriefing, BackendState } from '../api';
import { errorMessage } from '../api';
import { CASE_STATUS } from '../cases';
import type { HouseholdCase } from '../cases';
import type { HouseholdSummary, SentinelAlert } from '../types';
import { AgentBriefingCard } from './AgentBriefing';
import type { RegistryMode } from './RegistryModal';

interface SentinelHomeProps {
  state: BackendState; summary: HouseholdSummary; alerts: SentinelAlert[]; enabled: boolean;
  briefings: AgentBriefing[]; agentBusy: boolean; agentError: string | null;
  onAgentReview: () => Promise<void>;
  onOpenNotice: (itemId?: string) => void; onOpenCase: () => void; onCancelTrial: (id: string) => Promise<boolean>;
  onOpenReceiptModal: () => void; onOpenUtilityModal: () => void; onOpenRecords: () => void;
  onOpenRegistry: (mode: RegistryMode) => void;
}

const euro = (value: number) => `€${value.toFixed(2)}`;

function CaseSummary({ c, onOpenCase }: { c: HouseholdCase | undefined; onOpenCase: () => void }) {
  return (
    <section className="card p-5 space-y-3" aria-labelledby="case-summary-title">
      <p className="eyebrow">Your case file</p>
      {c ? <>
        <h3 id="case-summary-title" className="font-bold text-lg leading-snug">{c.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${c.status === 'resolved' ? 'chip-sage' : c.status === 'rejected' ? 'chip-clay' : 'chip-hearth'}`} data-testid="home-case-status">{CASE_STATUS[c.status]}</span>
          <span className="faint text-xs">revision {c.revision}</span>
        </div>
        <p className="text-sm">{c.next_action}</p>
        <button className="btn btn-secondary btn-sm" onClick={onOpenCase} data-testid="home-open-case">Open the case file</button>
      </> : <>
        <h3 id="case-summary-title" className="font-bold text-lg leading-snug">No case file yet</h3>
        <p className="note">Report a repair, or review the exact notice for the sample repair and approve it. The case file starts there.</p>
      </>}
    </section>
  );
}

export function SentinelHome({
  state, summary, alerts, enabled, briefings, agentBusy, agentError, onAgentReview,
  onOpenNotice, onOpenCase, onCancelTrial, onOpenReceiptModal, onOpenUtilityModal, onOpenRecords, onOpenRegistry,
}: SentinelHomeProps) {
  const [pendingSub, setPendingSub] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const warranties = alerts.filter(a => a.category === 'warranty_claim');
  const others = alerts.filter(a => a.category !== 'warranty_claim');
  const own = state.appliances.filter(a => a.source === 'household_registry').length;
  const primaryCase = state.cases[0];
  const cancel = async (id: string) => {
    if (pendingSub || !enabled) return;
    setPendingSub(true); setError(null); setMessage(null);
    try {
      if (!(await onCancelTrial(id))) throw new Error('The server did not confirm the request.');
      setMessage('Cancellation request recorded in this demo space. No provider was contacted and the charge is unchanged.');
    } catch (err) { setError(errorMessage(err)); } finally { setPendingSub(false); }
  };
  const snapshotDate = new Date(state.last_updated);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">This week at</p>
          <h1 className="title text-2xl sm:text-3xl">{state.household_name}</h1>
        </div>
        <p className="faint text-sm">Records as of {snapshotDate.toLocaleDateString()} · snapshot v{state.version_seq}</p>
      </div>
      {!enabled && <p className="note" data-testid="home-disabled-note">Start or refresh your private copy to take actions. Reading is always available.</p>}
      {error && <p role="alert" className="note-alert">{error}</p>}
      {message && <p role="status" className="note-ok">{message}</p>}

      <section className="card-accent p-5 sm:p-6 space-y-4" aria-labelledby="start-here-title" data-testid="start-here">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Start here</p>
            <h2 id="start-here-title" className="text-xl font-bold mt-1">What do you want to do?</h2>
            <p className="note mt-1">{own ? `${own} appliance${own === 1 ? '' : 's'} added by you so far.` : 'This is your private copy. Add what you own; the sample facts stay as an example.'}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <button className="card p-4 text-left space-y-1 hover:border-[var(--hearth)]" disabled={!enabled} onClick={() => onOpenRegistry({ tab: 'repair' })} data-testid="start-repair">
            <span className="chip chip-clay">Something broke</span>
            <span className="block font-bold mt-2">Report a repair</span>
            <span className="block text-xs muted">Date, invoice amount, what broke. Hestia prepares the exact notice for you to approve.</span>
          </button>
          <button className="card p-4 text-left space-y-1 hover:border-[var(--hearth)]" disabled={!enabled} onClick={() => onOpenRegistry({ tab: 'appliance' })} data-testid="start-appliance">
            <span className="chip chip-sky">New purchase</span>
            <span className="block font-bold mt-2">Add an appliance you own</span>
            <span className="block text-xs muted">Receipt, guarantee months, seller, and links to the product page, manual and quick start.</span>
          </button>
          <button className="card p-4 text-left space-y-1 hover:border-[var(--hearth)]" disabled={!enabled} onClick={() => onOpenRegistry({ tab: 'paste' })} data-testid="start-paste">
            <span className="chip chip-sage">Got an email</span>
            <span className="block font-bold mt-2">Paste a receipt or order email</span>
            <span className="block text-xs muted">Hestia's model reads the text and proposes the facts. You check them before anything is saved.</span>
          </button>
        </div>
        <p className="text-xs faint">Or explore the sample below: a washing machine repair waiting for a decision, a trial ending, a price change and a missing receipt.</p>
      </section>

      <AgentBriefingCard briefings={briefings} enabled={enabled} busy={agentBusy} error={agentError} onReview={onAgentReview} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Recorded facts at a glance">
        <div className="card p-4">
          <p className="text-xs muted">Recorded repair cost</p>
          <p data-testid="recovery-amount" className="text-2xl font-extrabold mono mt-1">{summary.documented_repair_cost_eur === undefined ? 'Not available' : euro(summary.documented_repair_cost_eur)}</p>
          <p className="text-xs faint mt-1">{warranties.length ? 'Evidence to review, not money recovered' : primaryCase ? `Case ${CASE_STATUS[primaryCase.status].toLowerCase()} · not money recovered` : 'No open repair in this snapshot'}</p>
        </div>
        <button className="card p-4 text-left" onClick={onOpenCase} data-testid="metric-cases">
          <p className="text-xs muted">Saved cases</p>
          <p className="text-2xl font-extrabold mono mt-1">{summary.open_cases_count ?? 0} open</p>
          <p className="text-xs faint mt-1">{summary.closed_cases_count ?? 0} closed · timeline kept</p>
        </button>
        <button className="card p-4 text-left" onClick={onOpenRecords} aria-label="Review recorded subscriptions" data-testid="metric-subscriptions">
          <p className="text-xs muted">Recurring per month</p>
          <p className="text-2xl font-extrabold mono mt-1">{euro(summary.monthly_recurring_eur ?? 0)}</p>
          <p className="text-xs faint mt-1">{summary.leakage_detected_monthly_eur > 0 ? `+${euro(summary.leakage_detected_monthly_eur)} price changes` : 'No recorded price change'}</p>
        </button>
        <button className="card p-4 text-left" onClick={onOpenReceiptModal} aria-label="Review missing receipt evidence" data-testid="metric-receipts">
          <p className="text-xs muted">Receipts missing</p>
          <p className="text-2xl font-extrabold mono mt-1">{euro(summary.missing_receipts_eur ?? 0)}</p>
          <p className="text-xs faint mt-1">{summary.missing_receipts_count ?? 0} purchase{summary.missing_receipts_count === 1 ? '' : 's'} need{summary.missing_receipts_count === 1 ? 's' : ''} a receipt reference</p>
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        <section className="space-y-3" aria-labelledby="queue-title">
          <div className="flex items-center justify-between">
            <h2 id="queue-title" className="text-lg font-bold">Decisions waiting for you <span className="chip chip-hearth ml-2">{alerts.length}</span></h2>
            <span className="faint text-xs">Nothing happens without your click</span>
          </div>
          {warranties.map((warranty, index) => (
            <article key={warranty.id} className="card-accent p-5 space-y-3" data-testid={index === 0 ? 'alert-warranty' : 'alert-warranty-' + warranty.item_id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="eyebrow">Repair · {warranty.case_status ? CASE_STATUS[warranty.case_status as keyof typeof CASE_STATUS] : 'eligibility requires review'}</p>
                  <h3 className="font-bold text-base mt-1">{warranty.title}</h3>
                </div>
                <span className="text-lg font-extrabold mono">{warranty.documented_amount_eur === undefined ? 'Amount not recorded' : `${euro(warranty.documented_amount_eur)} recorded`}</span>
              </div>
              <p className="text-sm muted">{warranty.description}</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {warranty.action_type === 'open_case'
                  ? <button className="btn btn-primary" onClick={onOpenCase} data-testid={index === 0 ? 'review-claim' : 'review-claim-' + warranty.item_id}>{warranty.action_label}</button>
                  : <button className="btn btn-primary" onClick={() => onOpenNotice(warranty.item_id)} disabled={!enabled || !warranty.item_id || !(warranty.documented_amount_eur ?? 0)} data-testid={index === 0 ? 'review-claim' : 'review-claim-' + warranty.item_id}>{warranty.action_label}</button>}
                <span className="faint text-xs">{warranty.action_type === 'open_case' ? 'Record replies, evidence and the outcome' : (warranty.documented_amount_eur ?? 0) > 0 ? 'Exact text before approval; recorded as a simulation' : 'A documented positive repair amount is required'}</span>
              </div>
            </article>
          ))}
          {others.map(alert => (
            <article key={alert.id} className="card p-5 space-y-3" data-testid={`alert-${alert.category}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="eyebrow">{alert.category === 'price_creep' ? 'Subscription' : alert.category === 'receipt_gap' ? 'Receipt' : 'Utility bill'}</p>
                  <h3 className="font-bold text-base mt-1">{alert.title}</h3>
                </div>
                <span className="text-lg font-extrabold mono">
                  {alert.category === 'receipt_gap' ? (alert.documented_amount_eur === undefined ? 'Evidence gap' : euro(alert.documented_amount_eur))
                    : alert.action_type === 'cancel_trial' ? `${euro(alert.potential_savings_eur)}/mo` : alert.category === 'price_creep' ? `+${euro(alert.potential_savings_eur * 12)}/yr` : euro(alert.potential_savings_eur)}
                </span>
              </div>
              <p className="text-sm muted">{alert.description}</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {alert.action_type === 'cancel_trial' && <button className="btn btn-secondary" data-testid="cancel-trial" disabled={!enabled || pendingSub || !alert.item_id} onClick={() => { if (alert.item_id) void cancel(alert.item_id); }}>{pendingSub ? 'Recording…' : alert.action_label}</button>}
                {alert.action_type === 'request_receipt' && alert.category === 'price_creep' && <button className="btn btn-secondary" onClick={onOpenRecords}>{alert.action_label}</button>}
                {alert.action_type === 'request_receipt' && alert.category === 'receipt_gap' && <button className="btn btn-secondary" onClick={onOpenReceiptModal} data-testid="open-receipt-options">{alert.action_label}</button>}
                {alert.action_type === 'dispute_bill' && <button className="btn btn-secondary" onClick={onOpenUtilityModal} disabled={!enabled} data-testid="review-utility">{alert.action_label}</button>}
                <span className="faint text-xs">{alert.action_type === 'cancel_trial' ? 'Recorded in this space; no provider contacted' : alert.category === 'receipt_gap' ? 'Manual reference or document import' : alert.action_type === 'dispute_bill' ? 'Recorded review request only' : 'No provider change is made'}</span>
              </div>
            </article>
          ))}
          {alerts.length === 0 && (
            <div className="card-muted p-8 text-center space-y-2">
              <p className="font-bold">Nothing is waiting for a decision</p>
              <p className="note">This snapshot is quiet. Hestia only surfaces items when there is something to decide.</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <CaseSummary c={primaryCase} onOpenCase={onOpenCase} />
          <section className="card p-5 space-y-3" aria-labelledby="approvals-title">
            <div className="flex items-center justify-between"><p className="eyebrow">Approvals in your copy</p><span className="faint text-xs">Server records</span></div>
            <h3 id="approvals-title" className="sr-only">Approval history</h3>
            <div className="space-y-2" data-testid="dispatch-history">
              {state.dispatch_records.length === 0 && <p className="note">No recorded approvals yet.</p>}
              {state.dispatch_records.map(d => (
                <div key={d.id} data-testid="dispatch-record" className="inset p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{d.seller}</span><span className="chip chip-sky">{d.status === 'simulated' ? 'Recorded, not sent' : d.status === 'accepted' ? 'Accepted; delivery unconfirmed' : d.status}</span></div>
                  <p className="muted text-xs">{d.letter_preview}</p>
                  <p className="faint text-xs mono">{d.seller_email} · {d.id}</p>
                  {d.historical_status && <p className="text-xs note-alert">Historical label: {d.historical_status}. Outcome unverified.</p>}
                  <p className="faint text-xs">{d.timestamp}</p>
                </div>
              ))}
            </div>
            <p data-testid="dashboard-real-recovery" className="text-sm muted">Real recovered money: €0.00. Approvals are recorded, never sent.</p>
          </section>
          <details data-testid="metric-definitions" className="card-muted p-4 text-xs muted">
            <summary className="font-semibold">Where these numbers come from</summary>
            <p className="mt-2">Source: canonical records in this demo space. Version {state.version_seq}; snapshot timestamp {state.last_updated}.</p>
            <p className="mt-1">Repair cost sums open recorded repairs. Recurring per month sums current subscription charges; price changes are the recorded increases. Receipts missing sums unlinked outlays of at least €50. None of these amounts is money recovered.</p>
          </details>
        </aside>
      </div>
    </div>
  );
}
