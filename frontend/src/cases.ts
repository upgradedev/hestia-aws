import { ApiError } from './api';

export const CASE_STATUS = {
  draft: 'Draft', review: 'In review', authorized: 'Authorized', pending_response: 'Pending response',
  needs_information: 'Needs information', rejected: 'Rejected', resolved: 'Resolved',
} as const;
export const CASE_ACTIONS = {
  start_tracking: 'Start response tracking', reply: 'Record a reply', request_information: 'Record request for information',
  add_evidence: 'Add supporting evidence', reject: 'Record refusal', partial_outcome: 'Record partial outcome',
  resolve: 'Resolve with evidence', reopen: 'Reopen case', set_deadline: 'Change planning deadline', record_silence: 'Record no reply by deadline',
} as const;
export type CaseStatus = keyof typeof CASE_STATUS;
export type CaseAction = keyof typeof CASE_ACTIONS;
export type UpdateSource = 'manual_update' | 'synthetic_reply';
export interface CaseOutcome {
  kind: 'partial' | 'resolved'; amount_cents: number; currency: 'EUR'; label: string;
  attested: true; actor: string; timestamp: string; source: UpdateSource; evidence_reference: string;
}
export interface CaseEvent {
  id: string; action: string; status: CaseStatus; actor: string; timestamp: string; source: string;
  source_label: string; note: string; evidence_reference: string; outcome?: CaseOutcome; deadline?: string | null;
}
export interface HouseholdCase {
  id: string; item_id: string; title: string; seller: string; status: CaseStatus; revision: number;
  created_at: string; updated_at: string; mode: 'simulated'; real_recovered_cents: 0;
  facts: { receipt_reference: string; purchase_date: string; repair_date: string; repair_issue: string; repair_amount_cents: number };
  notice: { id: string; notice: string; seller_email: string } | null;
  approval: { draft_id: string; digest: string; record_id: string } | null;
  deadline: string | null; deadline_status: 'closed' | 'due' | 'scheduled' | 'not_set'; deadline_label: string;
  next_action: string; allowed_actions: CaseAction[]; outcome: CaseOutcome | null; timeline: CaseEvent[];
}
export interface CaseUpdate {
  case_id: string; expected_revision: number; request_id: string; action: CaseAction; source: UpdateSource;
  note: string; evidence_reference: string; deadline?: string; amount_cents?: number; attested?: boolean;
}

// Decode the new projection fail-closed, without changing legacy response fields.
function invalid(): never { throw new ApiError('Invalid case projection. Refresh state; no outcome is confirmed.'); }
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
function str(v: unknown): string { return typeof v === 'string' && v.trim() ? v : invalid(); }
function num(v: unknown): number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : invalid(); }
function date(v: unknown): string { const s = str(v); return Number.isFinite(Date.parse(s)) ? s : invalid(); }
function status(v: unknown): CaseStatus { const s = str(v); return Object.hasOwn(CASE_STATUS, s) ? s as CaseStatus : invalid(); }
function outcome(value: unknown): CaseOutcome {
  const o = obj(value);
  if (!['partial', 'resolved'].includes(str(o.kind)) || o.attested !== true || o.currency !== 'EUR' ||
    !['manual_update', 'synthetic_reply'].includes(str(o.source))) return invalid();
  return { kind: o.kind as CaseOutcome['kind'], amount_cents: num(o.amount_cents), currency: 'EUR',
    attested: true, label: str(o.label), actor: str(o.actor), timestamp: date(o.timestamp),
    source: o.source as UpdateSource, evidence_reference: str(o.evidence_reference) };
}
export function decodeCase(value: unknown): HouseholdCase {
  const c = obj(value), f = obj(c.facts);
  if (c.mode !== 'simulated' || c.real_recovered_cents !== 0 || !Array.isArray(c.timeline) || !Array.isArray(c.allowed_actions) ||
    !/^case-[a-f0-9]{32}$/.test(str(c.id)) || num(c.revision) < 1 ||
    !['closed', 'due', 'scheduled', 'not_set'].includes(str(c.deadline_status))) return invalid();
  const n = c.notice === null ? null : obj(c.notice), a = c.approval === null ? null : obj(c.approval);
  const timeline = c.timeline.map(value => {
    const e = obj(value);
    return { id: str(e.id), action: str(e.action), status: status(e.status), actor: str(e.actor), timestamp: date(e.timestamp),
      source: str(e.source), source_label: str(e.source_label), note: str(e.note), evidence_reference: str(e.evidence_reference),
      outcome: e.outcome === undefined ? undefined : outcome(e.outcome),
      deadline: e.deadline == null ? null : date(e.deadline) };
  });
  if (timeline.length !== c.revision || new Set(timeline.map(e => e.id)).size !== timeline.length ||
    timeline[timeline.length - 1]?.status !== c.status) return invalid();
  return {
    id: str(c.id), item_id: str(c.item_id), title: str(c.title), seller: str(c.seller), status: status(c.status), revision: num(c.revision),
    created_at: date(c.created_at), updated_at: date(c.updated_at), mode: 'simulated', real_recovered_cents: 0,
    facts: { receipt_reference: str(f.receipt_reference), purchase_date: date(f.purchase_date), repair_date: date(f.repair_date),
      repair_issue: str(f.repair_issue), repair_amount_cents: num(f.repair_amount_cents) },
    notice: n ? { id: str(n.id), notice: str(n.notice), seller_email: str(n.seller_email) } : null,
    approval: a ? { draft_id: str(a.draft_id), digest: str(a.digest), record_id: str(a.record_id) } : null,
    deadline: c.deadline === null ? null : date(c.deadline), deadline_status: c.deadline_status as HouseholdCase['deadline_status'],
    deadline_label: str(c.deadline_label), next_action: str(c.next_action), timeline,
    allowed_actions: c.allowed_actions.map(v => Object.hasOwn(CASE_ACTIONS, str(v)) ? v as CaseAction : invalid()),
    outcome: c.outcome === null ? null : outcome(c.outcome),
  };
}
