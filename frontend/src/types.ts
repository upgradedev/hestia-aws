export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface ApplianceWarranty {
  id: string;
  name: string;
  brand: string;
  model: string;
  serial_number?: string;
  purchase_date: string;
  price_eur: number;
  seller_name: string;
  seller_email: string;
  receipt_id: string;
  legal_statutory_months: number; // 24 months under Directive (EU) 2019/771, screening input only
  statutory_warranty_months?: number;
  commercial_warranty_months: number;
  status: 'active' | 'defect_reported' | 'expired';
  defect_reported_at?: string;
  defect_description?: string;
  statutory_basis: string;
  repair_amount_cents?: number;
  claim_status?: string;
  case_status?: string;
}

export interface PaymentOutflow {
  id: string;
  timestamp: string;
  merchant: string;
  amount_eur: number;
  category: 'electronics' | 'groceries' | 'utilities' | 'subscription' | 'home';
  card_digits: string;
  has_receipt: boolean;
  requires_receipt: boolean; // >= EUR 50
  flagged_reason?: string;
}

export interface SubscriptionTracker {
  id: string;
  name: string;
  category: 'cloud_storage' | 'streaming' | 'productivity' | 'fitness';
  current_monthly_eur: number;
  initial_monthly_eur: number;
  price_creep_pct: number;
  is_trial: boolean;
  trial_expires_at?: string;
  next_billing_date: string;
  renewal_cost_eur: number;
  synthetic_requested?: boolean;
  status: string;
}

export interface SentinelAlert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  category: 'warranty_claim' | 'price_creep' | 'receipt_gap' | 'utility_surge';
  title: string;
  description: string;
  statutory_basis?: string;
  potential_savings_eur: number;
  documented_amount_eur?: number;
  action_type: 'dispatch_claim' | 'open_case' | 'cancel_trial' | 'request_receipt' | 'dispute_bill';
  item_id?: string;
  action_label: string;
  case_status?: string;
}

export interface DispatchRecord {
  id: string;
  item_id: string;
  status: 'simulated' | 'accepted' | 'failed' | 'unknown';
  historical_status?: string;
  draft_id?: string;
  digest?: string;
  delivery_status?: string;
  ses_message_id?: string;
  timestamp: string;
  seller: string;
  seller_email: string;
  statutory_basis: string;
  letter_preview: string;
}

export interface HouseholdSummary {
  active_warranties_count: number;
  protected_value_eur: number;
  unclaimed_repairs_count: number;
  leakage_detected_monthly_eur: number;
  potential_recovery_eur: number;
  active_sentinels: number;
  missing_receipts_eur?: number;
  missing_receipts_count?: number;
  documented_repair_cost_eur?: number;
  real_recovered_eur?: number;
  monthly_recurring_eur?: number;
  open_cases_count?: number;
  closed_cases_count?: number;
}

export type ActiveTab = 'landing' | 'home' | 'case' | 'records' | 'about';
