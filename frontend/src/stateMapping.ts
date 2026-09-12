import type { BackendState } from './api';
import type { ApplianceWarranty, HouseholdSummary, PaymentOutflow, SentinelAlert, SubscriptionTracker } from './types';

export const EMPTY_SUMMARY: HouseholdSummary = {
  active_warranties_count: 0, protected_value_eur: 0, unclaimed_repairs_count: 0,
  leakage_detected_monthly_eur: 0, potential_recovery_eur: 0, active_sentinels: 0, missing_receipts_eur: 0,
};

// Storage IDs and facts are authoritative. Never join them to the unrelated marketing fixtures.
export function mapState(state: BackendState) {
  const appliances: ApplianceWarranty[] = state.appliances.map(a => ({
    id: a.id, name: a.item_name, brand: '', model: a.serial_number ?? 'Not provided', serial_number: a.serial_number,
    purchase_date: a.purchase_date, price_eur: a.purchase_price_cents / 100,
    seller_name: a.seller_name, seller_email: a.seller_email, receipt_id: a.receipt_reference ?? 'Not provided',
    legal_statutory_months: a.statutory_months, statutory_warranty_months: a.statutory_months,
    commercial_warranty_months: a.commercial_months, status: a.has_repair_claim ? 'defect_reported' : 'active',
    defect_reported_at: a.repair_date, defect_description: a.repair_issue,
    statutory_basis: 'Directive (EU) 2019/771', repair_amount_cents: a.repair_amount_cents, claim_status: a.claim_status,
  }));
  const subscriptions: SubscriptionTracker[] = state.subscriptions.filter(s => s.status !== 'cancelled').map(s => ({
    id: s.id, name: s.service_name,
    category: s.category === 'Cloud Storage' ? 'cloud_storage' : s.category === 'Health & Fitness' ? 'fitness' : s.category === 'Media Streaming' ? 'streaming' : 'productivity',
    current_monthly_eur: s.monthly_cents / 100, initial_monthly_eur: (s.previous_monthly_cents ?? s.monthly_cents) / 100,
    price_creep_pct: s.previous_monthly_cents ? Math.round((s.monthly_cents / s.previous_monthly_cents - 1) * 100) : 0,
    is_trial: s.is_trial, trial_expires_at: s.trial_end_date,
    next_billing_date: s.trial_end_date ?? 'Not provided', renewal_cost_eur: s.monthly_cents / 100,
  }));
  const outflows: PaymentOutflow[] = state.outflows.map(o => ({
    id: o.id, timestamp: o.date, merchant: o.merchant, amount_eur: o.amount_cents / 100,
    category: o.category === 'Groceries' ? 'groceries' : o.category === 'Utilities' ? 'utilities' : 'home',
    card_digits: 'Not provided', has_receipt: o.has_receipt, requires_receipt: o.amount_cents > 5000,
    flagged_reason: o.status === 'missing_receipt' ? 'Receipt not linked' : undefined,
  }));
  const alerts: SentinelAlert[] = [];
  for (const a of state.appliances) {
    if (!a.has_repair_claim || ['reimbursed', 'settled'].includes(a.claim_status)) continue;
    alerts.push({
      id: `warranty-${a.id}`, item_id: a.id, timestamp: a.repair_date ?? state.last_updated, severity: 'critical',
      category: 'warranty_claim', title: `Claim €${(a.repair_amount_cents / 100).toFixed(2)} Repair Cost from ${a.seller_name}`,
      description: `${a.item_name}: ${a.repair_issue ?? 'Repair claim recorded'}. Seller: ${a.seller_name}. Claim status: ${a.claim_status}.`,
      statutory_basis: 'Directive (EU) 2019/771', potential_savings_eur: a.repair_amount_cents / 100,
      action_type: 'dispatch_claim', action_label: `Review Legal Notice & Claim €${(a.repair_amount_cents / 100).toFixed(2)}`,
    });
  }
  for (const s of state.subscriptions) {
    if (s.status === 'cancelled' || !(s.is_trial || s.status === 'price_creep')) continue;
    alerts.push({
      id: `subscription-${s.id}`, item_id: s.id, timestamp: s.last_billed, severity: 'warning', category: 'price_creep',
      title: s.is_trial ? `Cancel ${s.service_name} Trial Before €${(s.monthly_cents / 100).toFixed(2)} Auto-Charge` : `${s.service_name} Monthly Price Change`,
      description: s.notes ?? `${s.service_name}: ${s.status}`, potential_savings_eur: (s.is_trial ? s.monthly_cents : Math.max(0, s.monthly_cents - (s.previous_monthly_cents ?? s.monthly_cents))) / 100,
      action_type: s.is_trial ? 'cancel_trial' : 'request_receipt', action_label: 'Review subscription',
    });
  }
  for (const o of state.outflows) {
    if (o.has_receipt || o.amount_cents <= 5000) continue;
    alerts.push({
      id: `receipt-${o.id}`, item_id: o.id, timestamp: o.date, severity: 'warning', category: 'receipt_gap',
      title: `Upload Receipt for €${(o.amount_cents / 100).toFixed(2)} ${o.merchant} Purchase`,
      description: `${o.merchant}, ${o.date}: proof of purchase is not linked. Receipt scanning is not enabled in this demo.`,
      potential_savings_eur: o.amount_cents / 100, action_type: 'request_receipt', action_label: 'Receipt options',
    });
  }
  for (const bill of state.utility_bills) {
    if (bill.status !== 'spike_alert') continue;
    alerts.push({
      id: `utility-${bill.id}`, item_id: bill.id, timestamp: bill.bill_date, severity: 'warning', category: 'utility_surge',
      title: `${bill.provider} Bill Review`, description: `€${(bill.current_cents / 100).toFixed(2)} bill against €${(bill.baseline_cents / 100).toFixed(2)} baseline. No meter inspection has been verified.`,
      potential_savings_eur: Math.max(0, bill.current_cents - bill.baseline_cents) / 100,
      action_type: 'dispute_bill', action_label: 'Review utility dispute',
    });
  }
  const summary: HouseholdSummary = {
    active_warranties_count: state.summary.protected_items_count, protected_value_eur: state.summary.protected_assets_cents / 100,
    unclaimed_repairs_count: alerts.filter(a => a.category === 'warranty_claim').length,
    leakage_detected_monthly_eur: state.summary.monthly_sub_leakage_cents / 100,
    potential_recovery_eur: state.summary.unclaimed_recovery_cents / 100, active_sentinels: state.summary.active_anomalies_count,
    missing_receipts_eur: state.summary.missing_receipt_cents / 100,
  };
  return { appliances, subscriptions, outflows, alerts, summary };
}
