import type { DispatchRecord } from './types';

type JsonObject = Record<string, unknown>;
type Decoder<T> = (value: unknown) => T;

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0, public readonly uncertain = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be confirmed.';
}

function invalid(field: string): never {
  throw new ApiError(`Invalid server response: ${field}. No change has been confirmed.`);
}
function object(value: unknown, field = 'object'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(field);
  return value as JsonObject;
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) return invalid(field);
  return value;
}
function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(field);
  return value;
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return invalid(field);
  return value;
}
function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : string(value, field);
}
function dateString(value: unknown, field: string): string {
  const parsed = string(value, field);
  if (!Number.isFinite(Date.parse(parsed))) return invalid(field);
  return parsed;
}
function array<T>(value: unknown, decode: Decoder<T>, field: string): T[] {
  if (!Array.isArray(value)) return invalid(field);
  return value.map(decode);
}
function unique<T extends { id: string }>(values: T[], field: string): T[] {
  if (new Set(values.map(value => value.id)).size !== values.length) return invalid(`${field} duplicate IDs`);
  return values;
}

// The scoped API emits expiry as Unix seconds.
export type Expiry = number;
export function expiryMillis(value: Expiry): number {
  return value * 1000;
}
function expiry(value: unknown): Expiry {
  const seconds = integer(value, 'expires_at');
  if (seconds <= 0 || seconds > 8640000000000) return invalid('expires_at');
  return seconds;
}

export interface BackendAppliance {
  id: string; item_name: string; serial_number?: string; purchase_date: string;
  statutory_months: number; commercial_months: number; receipt_reference?: string;
  purchase_price_cents: number; seller_name: string; seller_email: string;
  has_repair_claim: boolean; repair_date?: string; repair_amount_cents: number;
  repair_issue?: string; claim_status: string;
}
export interface BackendSubscription {
  id: string; service_name: string; category: string; monthly_cents: number;
  previous_monthly_cents?: number; last_billed: string; is_trial: boolean;
  trial_end_date?: string; status: string; notes?: string;
}
export interface BackendOutflow {
  id: string; merchant: string; amount_cents: number; date: string;
  has_receipt: boolean; receipt_id?: string; category: string; status: string;
}
export interface UtilityBill {
  id: string; provider: string; baseline_cents: number; current_cents: number;
  bill_date: string; status: string;
}
export interface BackendState {
  version_seq: number; last_updated: string; household_name: string; homeowner_name: string;
  summary: {
    unclaimed_recovery_cents: number; protected_assets_cents: number;
    monthly_sub_leakage_cents: number; missing_receipt_cents: number;
    protected_items_count: number; active_anomalies_count: number;
  };
  appliances: BackendAppliance[]; subscriptions: BackendSubscription[];
  outflows: BackendOutflow[]; utility_bills: UtilityBill[]; dispatch_records: DispatchRecord[];
}

function dispatch(value: unknown): DispatchRecord {
  const d = object(value, 'dispatch record');
  const rawStatus = string(d.status, 'dispatch status');
  const status = rawStatus === 'simulated' || rawStatus === 'accepted' || rawStatus === 'failed' || rawStatus === 'unknown'
    ? rawStatus : 'unknown';
  return {
    id: string(d.id, 'dispatch id'), item_id: string(d.item_id, 'dispatch item_id'), status,
    historical_status: rawStatus === status ? optionalString(d.historical_status, 'historical status') : rawStatus,
    timestamp: string(d.timestamp, 'dispatch timestamp'), seller: string(d.seller, 'dispatch seller'),
    seller_email: string(d.seller_email, 'dispatch seller_email'),
    statutory_basis: optionalString(d.statutory_basis, 'statutory_basis') ?? '',
    letter_preview: string(d.letter_preview, 'dispatch notice'),
    ses_message_id: optionalString(d.ses_message_id, 'ses_message_id'),
    draft_id: optionalString(d.draft_id, 'draft_id'), digest: optionalString(d.digest, 'digest'),
  };
}

export function decodeState(value: unknown): BackendState {
  const s = object(value, 'state');
  const summary = object(s.summary, 'summary');
  return {
    version_seq: integer(s.version_seq, 'version_seq'), last_updated: dateString(s.last_updated, 'last_updated'),
    household_name: string(s.household_name, 'household_name'), homeowner_name: string(s.homeowner_name, 'homeowner_name'),
    summary: {
      unclaimed_recovery_cents: integer(summary.unclaimed_recovery_cents, 'unclaimed_recovery_cents'),
      protected_assets_cents: integer(summary.protected_assets_cents, 'protected_assets_cents'),
      monthly_sub_leakage_cents: integer(summary.monthly_sub_leakage_cents, 'monthly_sub_leakage_cents'),
      missing_receipt_cents: integer(summary.missing_receipt_cents, 'missing_receipt_cents'),
      protected_items_count: integer(summary.protected_items_count, 'protected_items_count'),
      active_anomalies_count: integer(summary.active_anomalies_count, 'active_anomalies_count'),
    },
    appliances: unique(array(s.appliances, value => {
      const a = object(value, 'appliance');
      return {
        id: string(a.id, 'appliance id'), item_name: string(a.item_name, 'item_name'),
        serial_number: optionalString(a.serial_number, 'serial_number'), purchase_date: dateString(a.purchase_date, 'purchase_date'),
        statutory_months: integer(a.statutory_months, 'statutory_months'), commercial_months: integer(a.commercial_months, 'commercial_months'),
        receipt_reference: optionalString(a.receipt_reference, 'receipt_reference'),
        purchase_price_cents: integer(a.purchase_price_cents, 'purchase_price_cents'),
        seller_name: string(a.seller_name, 'seller_name'), seller_email: string(a.seller_email, 'seller_email'),
        has_repair_claim: bool(a.has_repair_claim, 'has_repair_claim'), repair_date: a.repair_date == null ? undefined : dateString(a.repair_date, 'repair_date'),
        repair_amount_cents: integer(a.repair_amount_cents, 'repair_amount_cents'),
        repair_issue: optionalString(a.repair_issue, 'repair_issue'), claim_status: string(a.claim_status, 'claim_status'),
      };
    }, 'appliances'), 'appliances'),
    subscriptions: unique(array(s.subscriptions, value => {
      const sub = object(value, 'subscription');
      return {
        id: string(sub.id, 'subscription id'), service_name: string(sub.service_name, 'service_name'),
        category: string(sub.category, 'subscription category'), monthly_cents: integer(sub.monthly_cents, 'monthly_cents'),
        previous_monthly_cents: sub.previous_monthly_cents === undefined ? undefined : integer(sub.previous_monthly_cents, 'previous_monthly_cents'),
        last_billed: string(sub.last_billed, 'last_billed'), is_trial: bool(sub.is_trial, 'is_trial'),
        trial_end_date: optionalString(sub.trial_end_date, 'trial_end_date'), status: string(sub.status, 'subscription status'),
        notes: optionalString(sub.notes, 'subscription notes'),
      };
    }, 'subscriptions'), 'subscriptions'),
    outflows: unique(array(s.outflows, value => {
      const out = object(value, 'outflow');
      return {
        id: string(out.id, 'outflow id'), merchant: string(out.merchant, 'merchant'), amount_cents: integer(out.amount_cents, 'amount_cents'),
        date: string(out.date, 'outflow date'), has_receipt: bool(out.has_receipt, 'has_receipt'),
        receipt_id: optionalString(out.receipt_id, 'receipt_id'), category: string(out.category, 'outflow category'),
        status: string(out.status, 'outflow status'),
      };
    }, 'outflows'), 'outflows'),
    utility_bills: unique(array(s.utility_bills, value => {
      const bill = object(value, 'utility bill');
      return {
        id: string(bill.id, 'bill id'), provider: string(bill.provider, 'provider'),
        baseline_cents: integer(bill.baseline_cents, 'baseline_cents'), current_cents: integer(bill.current_cents, 'current_cents'),
        bill_date: string(bill.bill_date, 'bill_date'), status: string(bill.status, 'bill status'),
      };
    }, 'utility_bills'), 'utility_bills'),
    dispatch_records: unique(array(s.dispatch_records, dispatch, 'dispatch_records'), 'dispatch_records'),
  };
}

export interface ClaimDraft {
  id: string; item_id: string; subject: string; notice: string; seller: string; seller_email: string;
  homeowner_name: string; amount_cents: number; currency: string; source_version: number;
  expires_at: Expiry; digest: string; approval_token: string; model_id: string; mode: 'simulated';
}
export interface DemoSession { token: string; expires_at: Expiry; mode: 'simulated' }
export function decodeSession(value: unknown): DemoSession {
  const s = object(value, 'session');
  if (s.mode !== 'simulated') return invalid('session mode');
  const token = string(s.token, 'session token');
  if (/\s/.test(token)) return invalid('session token');
  return { token, expires_at: expiry(s.expires_at), mode: 'simulated' };
}
function prepared(value: unknown): ClaimDraft {
  const result = object(value, 'prepare result');
  if (result.status !== 'prepared') return invalid('prepare status');
  const d = object(result.draft, 'draft');
  if (d.mode !== 'simulated') return invalid('draft mode');
  if (!/^[A-Z]{3}$/.test(string(d.currency, 'currency')) || integer(d.amount_cents, 'amount_cents') === 0 || integer(d.source_version, 'source_version') === 0) return invalid('draft amount, currency or version');
  if (!/^draft-[a-f0-9]{32}$/.test(string(d.id, 'draft id')) || !/^[a-f0-9]{64}$/.test(string(d.digest, 'digest')) || !/^[a-f0-9]{64}$/.test(string(d.approval_token, 'approval_token'))) return invalid('draft approval proof');
  return {
    id: string(d.id, 'draft id'), item_id: string(d.item_id, 'draft item_id'), subject: string(d.subject, 'subject'),
    notice: string(d.notice, 'notice'), seller: string(d.seller, 'seller'), seller_email: string(d.seller_email, 'seller_email'),
    homeowner_name: string(d.homeowner_name, 'homeowner_name'), amount_cents: integer(d.amount_cents, 'amount_cents'),
    currency: string(d.currency, 'currency'), source_version: integer(d.source_version, 'source_version'),
    expires_at: expiry(d.expires_at), digest: string(d.digest, 'digest'), approval_token: string(d.approval_token, 'approval_token'),
    model_id: string(d.model_id, 'model_id'), mode: 'simulated',
  };
}

function serverFailure(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as JsonObject;
  if (d.success === false || d.ok === false || d.error || ['error', 'failed', 'unknown', 'denied', 'unavailable'].includes(String(d.status))) {
    return typeof d.message === 'string' ? d.message : typeof d.error === 'string' ? d.error : 'The server did not confirm this request.';
  }
  return null;
}
async function request<T>(path: string, decode: Decoder<T>, token?: string, body?: JsonObject, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Request interrupted. Outcome unconfirmed. Refresh session state before another action; nothing will be retried automatically.', 0, body !== undefined);
  }
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new ApiError(`HTTP ${response.status}: expected a JSON response. Outcome unconfirmed.`, response.status, body !== undefined);
  }
  const envelope: JsonObject = data && typeof data === 'object' ? data as JsonObject : {};
  const failure = serverFailure(data) || serverFailure(envelope.result) || serverFailure(envelope.dispatch_record);
  if (!response.ok || failure) {
    const message = failure || (typeof envelope.message === 'string' ? envelope.message : `Request denied (HTTP ${response.status}).`);
    throw new ApiError(message, response.status, body !== undefined && response.status >= 500 && response.status !== 501);
  }
  try { return decode(data); } catch (error) {
    throw new ApiError(errorMessage(error), response.status, body !== undefined);
  }
}
function protectedToken(token: string): string {
  if (!token) throw new ApiError('Begin an isolated demo session before taking an action.', 401);
  return token;
}
function mutation(value: unknown): BackendState {
  const d = object(value, 'action result');
  if (d.status !== 'simulated') return invalid('action status');
  const result = object(d.result, 'action result details');
  if (result.status !== 'simulated' && result.status !== 'linked') return invalid('result status');
  return decodeState(d.state);
}
export const api = {
  health: () => request('/healthz', value => {
    const d = object(value, 'health');
    if (d.status !== 'ok' || d.mode !== 'simulated' || d.live_send !== false || d.live_model !== false) return invalid('transport mode');
    return { status: 'ok', mode: 'simulated', live_send: false, live_model: false,
      storage_configured: bool(d.storage_configured, 'storage_configured'),
      demo_sessions_configured: bool(d.demo_sessions_configured, 'demo_sessions_configured') };
  }),
  mcts: () => request('/api/simulation/mcts', value => {
    const d = object(value, 'illustration');
    if (d.mode !== 'illustrative' || d.empirical_success_rate !== null) return invalid('illustration mode');
    return { mode: 'illustrative', optimal_action: string(d.optimal_action, 'optimal_action'), iterations: integer(d.iterations, 'iterations') };
  }),
  state: (token?: string, signal?: AbortSignal) => request('/api/state', decodeState, token, undefined, signal),
  begin: () => request('/api/demo/session', value => ({ ...decodeSession(value), state: decodeState(object(value).state) }), undefined, {}),
  prepare: (token: string, itemId: string, signal?: AbortSignal) => request('/api/action/claim/prepare', prepared, protectedToken(token), { item_id: itemId }, signal),
  approve: (token: string, draft: ClaimDraft) => request('/api/action/claim', value => {
    const d = object(value, 'approval result');
    if (d.status !== 'simulated') return invalid('approval status');
    const record = dispatch(d.dispatch_record);
    if (record.status !== 'simulated' || record.item_id !== draft.item_id || record.seller_email !== draft.seller_email) return invalid('approval record');
    const exact = object(d.dispatch_record);
    if (exact.full_letter !== draft.notice || exact.subject !== draft.subject || exact.amount_cents !== draft.amount_cents ||
        exact.currency !== draft.currency || exact.cryptographic_seal !== draft.digest || exact.seller !== draft.seller ||
        exact.source_version !== draft.source_version || exact.delivery_status !== 'SIMULATED' || exact.ses_message_id !== null) return invalid('exact approval artifact');
    const state = decodeState(d.state);
    if (!state.dispatch_records.some(item => item.id === record.id && item.status === 'simulated')) return invalid('persisted approval record');
    return { record, state };
  }, protectedToken(token), { draft_id: draft.id, digest: draft.digest, approval_token: draft.approval_token }),
  cancel: (token: string, serviceName: string) => request('/api/action/cancel', value => {
    const result = object(object(value).result);
    if (result.status !== 'simulated' || result.service_name !== serviceName) return invalid('cancellation simulation');
    return mutation(value);
  }, protectedToken(token), { service_name: serviceName }),
  utility: (token: string, provider: string, excessCents: number) => request('/api/action/utility_dispute', value => {
    const result = object(object(value).result);
    if (result.status !== 'simulated' || result.provider !== provider) return invalid('utility simulation');
    return mutation(value);
  }, protectedToken(token), { provider, excess_cents: excessCents }),
  receipt: (token: string, merchant: string, amountCents: number, receiptId: string) => request('/api/action/receipt', value => {
    const result = object(object(value).result);
    if (result.status !== 'linked' || result.matched !== true || result.receipt_id !== receiptId) return invalid('receipt match');
    const state = mutation(value);
    if (!state.outflows.some(o => o.merchant === merchant && o.amount_cents === amountCents && o.has_receipt && o.receipt_id === receiptId)) return invalid('persisted receipt match');
    return state;
  }, protectedToken(token), { merchant, amount_cents: amountCents, receipt_id: receiptId }),
  reset: (token: string) => request('/api/action/reset', mutation, protectedToken(token), {}),
  outbox: (token: string) => request('/api/outbox/status', value => {
    const d = object(value, 'outbox result');
    if (d.status !== 'success' && d.status !== 'simulated') return invalid('outbox status');
    return unique(array(object(d.outbox, 'outbox').records, dispatch, 'outbox records'), 'outbox records');
  }, protectedToken(token)),
};
