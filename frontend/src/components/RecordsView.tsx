import { useState } from 'react';
import { errorMessage } from '../api';
import { CASE_STATUS } from '../cases';
import type { HouseholdCase } from '../cases';
import { purchaseTimeline, recordedRepairCost } from '../displayFacts';
import type { ApplianceWarranty, PaymentOutflow, SubscriptionTracker } from '../types';
import type { RegistryMode } from './RegistryModal';

interface RecordsViewProps {
  appliances: ApplianceWarranty[]; subscriptions: SubscriptionTracker[]; outflows: PaymentOutflow[];
  caseByItem: Map<string, HouseholdCase>; snapshotDate: string; actionsDisabled: boolean;
  onOpenClaimModal: (app: ApplianceWarranty) => void; onOpenCase: () => void;
  onCancelTrial: (id: string) => Promise<boolean>; onOpenReceiptModal: () => void; onOpenRegistry: (mode: RegistryMode) => void;
}

const euro = (value: number) => `€${value.toFixed(2)}`;
const ACTIVE_CLAIM = new Set(['open', 'draft', 'review', 'authorized', 'pending_response', 'needs_information']);

/** A deterministic web search for a manual; never a fabricated product page. */
function searchLink(app: ApplianceWarranty, what: 'manual' | 'quick start guide' | 'product page'): string {
  const terms = [app.brand, app.model !== 'Not provided' ? app.model : app.name, what, what === 'product page' ? '' : 'pdf'].filter(Boolean).join(' ');
  return `https://duckduckgo.com/?q=${encodeURIComponent(terms)}`;
}

function LinkCell({ label, href, app, kind, testId }: { label: string; href?: string; app: ApplianceWarranty; kind: 'manual' | 'quick start guide' | 'product page'; testId: string }) {
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId} className="chip chip-sky">{label} ↗</a>
    : <a href={searchLink(app, kind)} target="_blank" rel="noopener noreferrer" data-testid={testId + '-search'} className="chip" title="Web search; not a verified page">Search: {label}</a>;
}

export function RecordsView({ appliances, subscriptions, outflows, caseByItem, snapshotDate, actionsDisabled, onOpenClaimModal, onOpenCase, onCancelTrial, onOpenReceiptModal, onOpenRegistry }: RecordsViewProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cancel = async (id: string) => {
    if (pendingId || actionsDisabled) return;
    setPendingId(id); setError(null); setMessage(null);
    try {
      if (!(await onCancelTrial(id))) throw new Error('The server did not confirm the request.');
      setMessage('Cancellation request recorded in your private copy. No provider subscription was cancelled; the charge is unchanged.');
    } catch (err) { setError(errorMessage(err)); } finally { setPendingId(null); }
  };
  const own = appliances.filter(a => a.source === 'household_registry').length;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Household records</p>
          <h1 className="title text-2xl sm:text-3xl mt-1">Your appliances, subscriptions and transactions</h1>
          <p className="note mt-2 max-w-2xl">One place for the receipt, the guarantee, the manual and the repair history of everything you own. Add your own items; the sample ones are there to show how it works.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="add-appliance" onClick={() => onOpenRegistry({ tab: 'appliance' })} className="btn btn-primary btn-sm">Add an appliance</button>
          <button data-testid="paste-receipt" onClick={() => onOpenRegistry({ tab: 'paste' })} className="btn btn-secondary btn-sm">Paste a receipt or order email</button>
          <button data-testid="open-intake" onClick={onOpenReceiptModal} className="btn btn-secondary btn-sm">Link a receipt to a transaction</button>
        </div>
      </div>
      {error && <p role="alert" className="note-alert">{error}</p>}
      {message && <p role="status" className="note-ok">{message}</p>}

      <section aria-labelledby="appliances-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="appliances-title" className="text-lg font-bold">Appliance catalogue ({appliances.length}{own ? `, ${own} added by you` : ''})</h2>
          <p className="faint text-sm">Recorded purchase value {euro(appliances.reduce((acc, a) => acc + a.price_eur, 0))}</p>
        </div>
        <p className="note">Recorded durations are screening inputs under Directive (EU) 2019/771, not a determination of legal eligibility. Links are the ones you saved; "Search" opens a web search and never a guessed page.</p>
        <div className="grid md:grid-cols-2 gap-4" data-testid="appliance-catalogue">
          {appliances.map(app => {
            const defective = app.status === 'defect_reported';
            const c = caseByItem.get(app.id);
            const active = defective && (!!c ? ACTIVE_CLAIM.has(c.status) || c.status === 'draft' || c.status === 'review' : ACTIVE_CLAIM.has(app.claim_status ?? ''));
            const timeline = purchaseTimeline(app.purchase_date, app.defect_reported_at ?? snapshotDate, app.legal_statutory_months);
            return (
              <article key={app.id} data-testid={'appliance-' + app.id} className={`p-5 space-y-3 ${defective ? 'card-accent' : 'card'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold leading-snug">{app.name}</h3>
                    <p className="text-xs muted mt-0.5">{[app.brand, app.model !== 'Not provided' ? app.model : ''].filter(Boolean).join(' · ') || 'Brand and model not recorded'}</p>
                    <p className="text-xs faint mono">Serial {app.serial_number || 'not recorded'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold mono">{app.price_eur > 0 ? euro(app.price_eur) : 'Price not recorded'}</p>
                    <span className={`chip mt-1 ${defective ? (c ? (c.status === 'resolved' ? 'chip-sage' : 'chip-hearth') : 'chip-clay') : 'chip-sage'}`}>
                      {defective ? (c ? `Case ${CASE_STATUS[c.status].toLowerCase()}` : 'Repair recorded') : app.source === 'household_registry' ? 'Added by you' : 'Purchase recorded'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs muted">
                    <span>Recorded warranty duration</span>
                    <span className="mono">{timeline ? `${timeline.months} full months at ${defective ? 'repair' : 'snapshot'} / ${app.legal_statutory_months} recorded` : 'Date or duration needs review'}</span>
                  </div>
                  <div className="w-full bg-[var(--line)] rounded-full h-2 overflow-hidden"><div className={`h-2 rounded-full ${defective ? 'bg-[var(--clay)]' : 'bg-[var(--sage)]'}`} style={{ width: `${timeline?.percent ?? 0}%` }}></div></div>
                  <p className="text-xs faint">Purchase-based illustration, not a statutory deadline. Delivery facts and applicable terms require separate review.</p>
                </div>
                {defective && <p data-testid={'repair-cost-' + app.id} className="text-sm font-semibold">{recordedRepairCost(app.repair_amount_cents)}. Not recovered.</p>}
                <dl className="grid grid-cols-2 gap-2 text-xs inset p-3">
                  <div><dt className="faint">Purchased</dt><dd className="font-medium">{app.purchase_date}</dd></div>
                  <div><dt className="faint">Seller</dt><dd className="font-medium truncate" title={app.seller_email}>{app.seller_name}</dd></div>
                  <div><dt className="faint">Receipt or order</dt><dd className="font-medium truncate">{app.receipt_id}</dd></div>
                  <div><dt className="faint">Store guarantee</dt><dd className="font-medium">{app.commercial_warranty_months} months recorded</dd></div>
                  <div className="col-span-2"><dt className="faint">EU statutory screening</dt><dd className="font-medium">{app.legal_statutory_months} months; review required</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2 items-center" data-testid={'links-' + app.id}>
                  <span className="text-xs faint">Docs:</span>
                  <LinkCell label="Product page" href={app.product_url} app={app} kind="product page" testId={'product-' + app.id} />
                  <LinkCell label="Manual" href={app.manual_url} app={app} kind="manual" testId={'manual-' + app.id} />
                  <LinkCell label="Quick start" href={app.quickstart_url} app={app} kind="quick start guide" testId={'quickstart-' + app.id} />
                </div>
                {defective && (app.repair_amount_cents ?? 0) <= 0 && <p className="text-xs note-alert">A documented positive repair amount is required before preparing a notice.</p>}
                {defective ? (
                  c && c.status !== 'draft' && c.status !== 'review'
                    ? <button onClick={onOpenCase} className="btn btn-secondary w-full" data-testid={'review-appliance-' + app.id}>Open the saved case file</button>
                    : <button onClick={() => onOpenClaimModal(app)} disabled={actionsDisabled || (app.repair_amount_cents ?? 0) <= 0} data-testid={'review-appliance-' + app.id} className="btn btn-primary w-full">Review repair facts and prepare the notice</button>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {!active && <button onClick={() => onOpenRegistry({ tab: 'repair', applianceId: app.id })} disabled={actionsDisabled} data-testid={'report-repair-' + app.id} className="btn btn-secondary btn-sm flex-1">Report a repair</button>}
                  <button onClick={() => onOpenRegistry({ tab: 'appliance', editId: app.id })} disabled={actionsDisabled} data-testid={'edit-appliance-' + app.id} className="btn btn-quiet btn-sm flex-1">Edit details and links</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="subscriptions-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="subscriptions-title" className="text-lg font-bold">Recurring subscriptions ({subscriptions.length})</h2>
          <p className="faint text-sm">{euro(subscriptions.reduce((acc, s) => acc + s.current_monthly_eur, 0))} per month recorded</p>
        </div>
        <p className="note">Recorded charges, price changes and trial dates. No account connection or automatic monitoring; a recorded request does not cancel anything.</p>
        <div className="grid md:grid-cols-2 gap-3">
          {subscriptions.map(sub => (
            <article key={sub.id} data-testid={`subscription-${sub.id}`} className={`p-4 space-y-2 ${sub.is_trial || sub.price_creep_pct > 0 ? 'card-accent' : 'card'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{sub.name}</h3>
                    {sub.is_trial && <span className="chip chip-hearth">Trial ending</span>}
                    {sub.price_creep_pct > 0 && <span className="chip chip-clay">+{sub.price_creep_pct}% price change</span>}
                    {sub.status === 'duplicate_overlap' && <span className="chip">Overlap to review</span>}
                  </div>
                  <p className="text-xs faint mt-1">Next renewal: {sub.next_billing_date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold mono">{euro(sub.current_monthly_eur)}/mo</p>
                  {sub.initial_monthly_eur > 0 && sub.initial_monthly_eur !== sub.current_monthly_eur && <p className="text-xs faint mono">was {euro(sub.initial_monthly_eur)}</p>}
                </div>
              </div>
              {sub.is_trial && (
                <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between gap-2">
                  <span className="text-xs muted">Will charge {euro(sub.renewal_cost_eur)}/mo</span>
                  <button onClick={() => { void cancel(sub.id); }} disabled={actionsDisabled || !!pendingId || sub.synthetic_requested} className="btn btn-secondary btn-sm">
                    {sub.synthetic_requested ? 'Request recorded' : 'Record a cancellation request'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="transactions-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="transactions-title" className="text-lg font-bold">Card transactions ({outflows.length})</h2>
          <p className="faint text-sm">Receipt review from €50</p>
        </div>
        <div className="space-y-3">
          {outflows.map(tx => (
            <article key={tx.id} className={`p-4 ${!tx.has_receipt && tx.requires_receipt ? 'card-accent' : 'card'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{tx.merchant}</h3>
                  <p className="text-xs faint mono">{tx.timestamp} · {tx.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold mono">{euro(tx.amount_eur)}</p>
                  <span className={`chip mt-1 ${tx.has_receipt ? 'chip-sage' : tx.requires_receipt ? 'chip-clay' : ''}`}>{tx.has_receipt ? 'Receipt linked' : tx.requires_receipt ? 'Receipt missing' : 'Under €50'}</span>
                </div>
              </div>
              {!tx.has_receipt && tx.requires_receipt && (
                <div className="mt-3 pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
                  <span className="text-xs muted">{tx.flagged_reason ?? 'Proof of purchase is not linked'}</span>
                  <button onClick={onOpenReceiptModal} className="btn btn-secondary btn-sm">Link a receipt</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
