import type { BackendState } from './api';
import { CASE_STATUS } from './cases';
import type { HouseholdCase } from './cases';
import type { ApplianceWarranty, HouseholdSummary, PaymentOutflow, SentinelAlert, SubscriptionTracker } from './types';

export const EMPTY_SUMMARY: HouseholdSummary = {
  active_warranties_count: 0, protected_value_eur: 0, unclaimed_repairs_count: 0,
  leakage_detected_monthly_eur: 0, potential_recovery_eur: 0, active_sentinels: 0, missing_receipts_eur: 0,
  missing_receipts_count: 0, open_cases_count: 0, closed_cases_count: 0, monthly_recurring_eur: 0,
};

const CLOSED: ReadonlySet<string> = new Set(['resolved', 'rejected']);
const ACTIVE: ReadonlySet<string> = new Set(['authorized', 'pending_response', 'needs_information']);

/** Household-facing sentence for a repair whose saved case now carries the truth (HE8). */
export function repairStatusLine(item: { seller_name: string; repair_issue?: string; item_name: string }, c?: HouseholdCase): string {
  const base = `${item.item_name}: ${item.repair_issue ?? 'Repair recorded'}. Seller: ${item.seller_name}.`;
  if (!c) return `${base} No notice reviewed yet.`;
  if (c.status === 'resolved') return `${base} Case resolved with an attested synthetic outcome; the recorded repair cost stays a fact, not money recovered.`;
  if (c.status === 'rejected') return `${base} Recorded refusal on file; reopen the case if you want to pursue it.`;
  if (ACTIVE.has(c.status)) return `${base} Notice approved (simulated); the case is ${CASE_STATUS[c.status].toLowerCase()}.`;
  return `${base} Draft under review; nothing approved yet.`;
}

// Storage IDs and facts are authoritative. Case lifecycle takes precedence over the appliance flag.
export function mapState(state: BackendState) {
  const caseByItem = new Map<string, HouseholdCase>();
  for (const c of state.cases) caseByItem.set(c.item_id, c);
  const appliances: ApplianceWarranty[] = state.appliances.map(a => ({
    id: a.id, name: a.item_name, brand: '', model: a.serial_number ?? 'Not provided', serial_number: a.serial_number,
    purchase_date: a.purchase_date, price_eur: a.purchase_price_cents / 100,
    seller_name: a.seller_name, seller_email: a.seller_email, receipt_id: a.receipt_reference ?? 'Not provided',
    legal_statutory_months: a.statutory_months, statutory_warranty_months: a.statutory_months,
    commercial_warranty_months: a.commercial_months, status: a.has_repair_claim ? 'defect_reported' : 'active',
    defect_reported_at: a.repair_date, defect_description: a.repair_issue,
    statutory_basis: 'Directive (EU) 2019/771', repair_amount_cents: a.repair_amount_known === false ? undefined : a.repair_amount_cents,
    claim_status: a.claim_status, case_status: caseByItem.get(a.id)?.status,
  }));
  const subscriptions: SubscriptionTracker[] = state.subscriptions.filter(s => s.status !== 'cancelled').map(s => ({
    id: s.id, name: s.service_name,
    category: s.category === 'Cloud Storage' ? 'cloud_storage' : s.category === 'Health & Fitness' ? 'fitness' : s.category === 'Media Streaming' ? 'streaming' : 'productivity',
    current_monthly_eur: s.monthly_cents / 100, initial_monthly_eur: (s.previous_monthly_cents ?? s.monthly_cents) / 100,
    price_creep_pct: s.previous_monthly_cents ? Math.round((s.monthly_cents / s.previous_monthly_cents - 1) * 100) : 0,
    is_trial: s.is_trial, trial_expires_at: s.trial_end_date,
    next_billing_date: s.trial_end_date ?? 'Not provided', renewal_cost_eur: s.monthly_cents / 100,
    synthetic_requested: s.demo_cancellation_requested === true, status: s.status,
  }));
  const outflows: PaymentOutflow[] = state.outflows.map(o => ({
    id: o.id, timestamp: o.date, merchant: o.merchant, amount_eur: o.amount_cents / 100,
    category: o.category === 'Groceries' ? 'groceries' : o.category === 'Utilities' ? 'utilities' : 'home',
    card_digits: 'Not provided', has_receipt: o.has_receipt, requires_receipt: o.amount_cents >= 5000,
    flagged_reason: o.status === 'missing_receipt' ? 'Receipt not linked' : undefined,
  }));
  const alerts: SentinelAlert[] = [];
  for (const a of state.appliances) {
    if (!a.has_repair_claim || ['reimbursed', 'settled'].includes(a.claim_status)) continue;
    const c = caseByItem.get(a.id);
    if (c && CLOSED.has(c.status)) continue; // closed cases live in the case summary, not the queue
    const active = !!c && ACTIVE.has(c.status);
    alerts.push({
      id: `warranty-${a.id}`, item_id: a.id, timestamp: a.repair_date ?? state.last_updated, severity: 'critical',
      category: 'warranty_claim',
      title: active ? `Follow up the saved case for ${a.item_name}` : `Review repair evidence for ${a.item_name}`,
      description: repairStatusLine(a, c),
      statutory_basis: 'Directive (EU) 2019/771', potential_savings_eur: 0,
      documented_amount_eur: a.repair_amount_known === false ? undefined : a.repair_amount_cents / 100,
      action_type: active ? 'open_case' : 'dispatch_claim',
      action_label: active ? 'Open the case' : a.repair_amount_cents > 0 ? 'Review the exact notice' : 'Review missing repair amount',
      case_status: c?.status,
    });
  }
  for (const s of state.subscriptions) {
    if (s.status === 'cancelled' || !(s.is_trial || s.status === 'price_creep')) continue;
    alerts.push({
      id: `subscription-${s.id}`, item_id: s.id, timestamp: s.last_billed, severity: 'warning', category: 'price_creep',
      title: s.is_trial ? `${s.service_name} trial ends soon` : `${s.service_name} price changed`,
      description: s.notes ?? `${s.service_name}: ${s.status}`, potential_savings_eur: (s.is_trial ? s.monthly_cents : Math.max(0, s.monthly_cents - (s.previous_monthly_cents ?? s.monthly_cents))) / 100,
      action_type: s.is_trial ? 'cancel_trial' : 'request_receipt', action_label: s.is_trial ? 'Record a cancellation request' : 'Review the subscription',
    });
  }
  for (const o of state.outflows) {
    if (o.has_receipt || o.amount_cents < 5000) continue;
    alerts.push({
      id: `receipt-${o.id}`, item_id: o.id, timestamp: o.date, severity: 'warning', category: 'receipt_gap',
      title: `Receipt missing for €${(o.amount_cents / 100).toFixed(2)} at ${o.merchant}`,
      description: `${o.merchant}, ${o.date}: proof of purchase is not linked. Add the receipt reference or import the document; OCR is not part of this demo.`,
      documented_amount_eur: o.amount_cents / 100,
      potential_savings_eur: 0, action_type: 'request_receipt', action_label: 'Link a receipt',
    });
  }
  for (const bill of state.utility_bills) {
    if (bill.status !== 'spike_alert') continue;
    alerts.push({
      id: `utility-${bill.id}`, item_id: bill.id, timestamp: bill.bill_date, severity: 'warning', category: 'utility_surge',
      title: `${bill.provider} bill above baseline`, description: `€${(bill.current_cents / 100).toFixed(2)} bill against a €${(bill.baseline_cents / 100).toFixed(2)} baseline. No meter inspection has been verified.`,
      potential_savings_eur: Math.max(0, bill.current_cents - bill.baseline_cents) / 100,
      action_type: 'dispute_bill', action_label: 'Review the bill difference',
    });
  }
  const repairs = state.appliances.filter(a => a.has_repair_claim && !['reimbursed', 'settled'].includes(a.claim_status));
  const missing = outflows.filter(o => !o.has_receipt && o.requires_receipt);
  const summary: HouseholdSummary = {
    active_warranties_count: appliances.length, protected_value_eur: appliances.reduce((sum, a) => sum + a.price_eur, 0),
    unclaimed_repairs_count: alerts.filter(a => a.category === 'warranty_claim').length,
    leakage_detected_monthly_eur: subscriptions.reduce((sum, s) => sum + Math.max(0, s.current_monthly_eur - s.initial_monthly_eur), 0),
    monthly_recurring_eur: subscriptions.reduce((sum, s) => sum + s.current_monthly_eur, 0),
    potential_recovery_eur: 0, real_recovered_eur: 0, active_sentinels: alerts.length,
    documented_repair_cost_eur: repairs.some(a => a.repair_amount_known === false) ? undefined : repairs.reduce((sum, a) => sum + a.repair_amount_cents / 100, 0),
    missing_receipts_eur: missing.reduce((sum, o) => sum + o.amount_eur, 0), missing_receipts_count: missing.length,
    open_cases_count: state.cases.filter(c => !CLOSED.has(c.status)).length,
    closed_cases_count: state.cases.filter(c => CLOSED.has(c.status)).length,
  };
  return { appliances, subscriptions, outflows, alerts, summary, caseByItem };
}
