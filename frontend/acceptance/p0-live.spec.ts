import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { AgentBriefing, ClaimDraft, IntakeDraft } from '../src/api';
import type { CaseAction, HouseholdCase } from '../src/cases';

const sha = process.env.HESTIA_APPROVED_SHA!;
const live = process.env.HESTIA_ACCEPTANCE_URL!.startsWith('https:');
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 1_100));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const NARRATIVE_HEADINGS = ['What I checked', 'Decisions waiting for you', 'Suggested next step'];
type NavTab = 'Home' | 'Case' | 'Records' | 'About' | 'Import records';
const nav = (page: Page, name: NavTab) =>
  page.getByRole('navigation', { name: 'Household navigation' }).getByRole('button', { name, exact: true });

async function health(request: APIRequestContext) {
  await pause();
  const response = await request.get('/healthz', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const data = await response.json();
  // The deployed backend runs a bounded Bedrock model; the CI harness has none. Sending stays off everywhere.
  expect(data).toMatchObject({
    service: 'hestia-aws', status: 'ok', commit: sha,
    mode: 'simulated', live_send: false, live_model: live, demo_sessions_configured: true,
    agent: {
      framework: expect.stringContaining('strands-agents'), session_cap: expect.any(Number),
      daily_cap: expect.any(Number), max_output_tokens: expect.any(Number),
    },
  });
  if (live) {
    expect(data.storage_configured).toBe(true);
    expect(typeof data.model_id).toBe('string');
  } else {
    expect(data.model_id).toBeNull();
  }
}

// Deliberately serial and slower than 2 RPS; use only freshly allocated synthetic scopes.
function caller(request: APIRequestContext) {
  return async function call(path: string, code: number, token?: string, body?: object) {
    await pause();
    const response = await request.fetch(path, {
      method: body === undefined ? 'GET' : 'POST', data: body,
      headers: token ? bearer(token) : {}, maxRedirects: 0, maxRetries: 0,
    });
    expect(response.status(), `${path}: expected HTTP ${code}`).toBe(code);
    return response.json();
  };
}

function expectBriefingBoundary(briefing: AgentBriefing) {
  expect(briefing.mode).toBe(live ? 'live_model' : 'tools_only');
  expect(briefing.real_recovered_cents).toBe(0);
  expect(briefing.tool_calls.length).toBeGreaterThanOrEqual(1);
  if (live) {
    expect(typeof briefing.model_id).toBe('string');
    const narrative = (briefing.narrative ?? '').toLowerCase();
    const headed = NARRATIVE_HEADINGS.every(heading => narrative.includes(heading.toLowerCase()));
    expect(briefing.withheld || headed, 'a live briefing is either withheld or carries the three headings').toBe(true);
    if (briefing.withheld) expect(briefing.narrative).toBeNull();
  } else {
    expect(briefing.reason).toBe('model_not_configured');
    expect(briefing.narrative).toBeNull();
    expect(briefing.model_id).toBeNull();
    expect(briefing.tool_calls).toHaveLength(4);
  }
}

test('deployed API: exact approval, persistent replay, isolation, bounded agent review and fail-closed legacy routes', async ({ request }) => {
  // Read-only safety gate runs before the first synthetic mutation.
  await health(request);
  const call = caller(request);
  const preview = await call('/api/state', 200);
  expect(preview.dispatch_records).toHaveLength(0);
  await call('/api/action/claim', 401, undefined, {});
  await call('/api/agent/review', 401, undefined, {});
  const first = await call('/api/demo/session', 201, undefined, {});
  const second = await call('/api/demo/session', 201, undefined, {});
  expect(first.mode).toBe('simulated');
  expect(second.mode).toBe('simulated');
  expect(first.token === second.token).toBe(false);
  const draft: ClaimDraft = (await call('/api/action/claim/prepare', 200, first.token, { item_id: 'app-001' })).draft;
  expect(draft.mode).toBe('simulated');
  expect(draft.amount_cents).toBe(18500);
  const approval = { draft_id: draft.id, digest: draft.digest, approval_token: draft.approval_token };
  await call('/api/action/claim', 403, first.token, { ...approval, digest: '0'.repeat(64) });
  await call('/api/action/claim', 404, second.token, approval);
  const accepted = await call('/api/action/claim', 200, first.token, approval);
  expect(accepted.status).toBe('simulated');
  expect(accepted.dispatch_record).toMatchObject({
    status: 'simulated', delivery_status: 'SIMULATED', ses_message_id: null,
    full_letter: draft.notice, subject: draft.subject, amount_cents: draft.amount_cents,
    currency: draft.currency, cryptographic_seal: draft.digest, source_version: draft.source_version,
  });
  expect(accepted.state.summary.unclaimed_recovery_cents).toBe(18500);
  expect(accepted.state.dispatch_records).toHaveLength(1);
  const replay = await call('/api/action/claim', 200, first.token, approval);
  expect(replay.replayed).toBe(true);
  expect(replay.dispatch_record.id).toBe(accepted.dispatch_record.id);
  expect(replay.state.version_seq).toBe(accepted.state.version_seq);
  const persisted = await call('/api/state', 200, first.token);
  expect(persisted.dispatch_records).toHaveLength(1);
  expect(persisted.dispatch_records[0].id).toBe(accepted.dispatch_record.id);
  expect(persisted.summary.unclaimed_recovery_cents).toBe(18500);
  expect((await call('/api/state', 200, second.token)).dispatch_records).toHaveLength(0);
  const outbox = await call('/api/outbox/status', 200, first.token);
  expect(outbox.outbox.records).toHaveLength(1);
  expect(outbox.outbox.delivered_count).toBe(0);
  // The Strands review reads the same workspace with bounded tools; it approves and recovers nothing.
  const reviewed = await call('/api/agent/review', 200, first.token, {});
  expect(reviewed.status).toBe('simulated');
  const briefing: AgentBriefing = reviewed.briefing;
  expectBriefingBoundary(briefing);
  expect(reviewed.state.agent_briefings.map((b: AgentBriefing) => b.id)).toContain(briefing.id);
  expect(reviewed.state.dispatch_records).toHaveLength(1);
  expect(reviewed.state.summary.unclaimed_recovery_cents).toBe(18500);
  expect(reviewed.state.summary.real_recovered_cents).toBe(0);
  const afterReview = await call('/api/state', 200, first.token);
  expect(afterReview.agent_briefings.map((b: AgentBriefing) => b.id)).toContain(briefing.id);
  expect(afterReview.dispatch_records).toHaveLength(1);
  await call('/action/claim', 400, first.token, { item_id: 'app-001' });
  await call('/api/outbox/dispatch', 403, first.token, {});
  await call('/api/receipt/scan', 501, first.token, {});
  await call('/api/ingest/sync', 501, first.token, {});
  await health(request);
  await test.info().attach('sanitized-acceptance.json', {
    body: JSON.stringify({
      commit: sha, target: live ? 'aws' : 'ci-calibration', timestamp: new Date().toISOString(),
      record_id: accepted.dispatch_record.id, notice_digest: draft.digest,
      version: afterReview.version_seq, simulated_records: 1, delivered_count: 0,
      persistent_replay: true, separate_workspace_empty: true, recovered_cents: 0,
      agent_briefing_id: briefing.id, agent_mode: briefing.mode, agent_withheld: briefing.withheld,
      agent_tool_calls: briefing.tool_calls.map(c => c.tool),
    }, null, 2), contentType: 'application/json',
  });
});

test('deployed cases: protected updates, deadline, reply, refusal, evidence and attested outcome', async ({ request }) => {
  await health(request);
  const call = caller(request);
  const first = await call('/api/demo/session', 201, undefined, {});
  const second = await call('/api/demo/session', 201, undefined, {});
  const draft = (await call('/api/action/claim/prepare', 200, first.token, { item_id: 'app-001' })).draft;
  const reviewed = await call('/api/state', 200, first.token);
  expect(reviewed.cases[0].status).toBe('review');
  const approved = await call('/api/action/claim', 200, first.token, {
    draft_id: draft.id, digest: draft.digest, approval_token: draft.approval_token,
  });
  let c: HouseholdCase = approved.state.cases[0];
  expect(c.status).toBe('authorized');
  expect(c.outcome).toBeNull();
  expect(c.approval?.digest).toBe(draft.digest);
  let sequence = 0;
  const body = (action: CaseAction, extra: object = {}) => ({
    case_id: c.id, expected_revision: c.revision, request_id: (++sequence).toString(16).padStart(32, '0'),
    action, source: 'manual_update', note: `Synthetic acceptance ${action}`,
    evidence_reference: `FIXTURE-ACCEPTANCE-${action}`, ...extra,
  });
  const tracking = body('start_tracking', { deadline: '2026-09-01' });
  await call('/api/case/update', 401, undefined, tracking);
  await call('/api/case/update', 404, second.token, tracking);
  await call('/api/case/update', 400, first.token, { ...tracking, actor: 'merchant' });
  const started = await call('/api/case/update', 200, first.token, tracking);
  c = started.case;
  const replay = await call('/api/case/update', 200, first.token, tracking);
  expect(replay.replayed).toBe(true);
  expect(replay.state.version_seq).toBe(started.state.version_seq);
  expect(replay.event_id).toBe(started.event_id);
  await call('/api/case/update', 409, first.token, { ...tracking, note: 'Changed content' });
  expect(c.deadline_status).toBe('due');
  async function update(action: CaseAction, extra: object = {}) {
    const result = await call('/api/case/update', 200, first.token, body(action, extra));
    c = result.case;
    expect(c.real_recovered_cents).toBe(0);
  }
  await update('record_silence');
  expect(c.status).toBe('pending_response');
  await update('reply', { source: 'synthetic_reply' });
  expect(c.status).toBe('pending_response');
  expect(c.outcome).toBeNull();
  await update('reject', { source: 'synthetic_reply' });
  expect(c.status).toBe('rejected');
  await update('reopen', { deadline: '2026-10-01' });
  await update('request_information', { source: 'synthetic_reply' });
  expect(c.status).toBe('needs_information');
  await update('add_evidence');
  await call('/api/case/update', 422, first.token, body('resolve', { amount_cents: 18500 }));
  await update('partial_outcome', { amount_cents: 4900, attested: true });
  expect(c.status).toBe('pending_response');
  await update('resolve', { amount_cents: 4900, attested: true });
  expect(c.status).toBe('resolved');
  expect(c.outcome?.amount_cents).toBe(4900);
  const persisted = await call('/api/state', 200, first.token);
  expect(persisted.cases[0].revision).toBe(c.revision);
  expect(persisted.cases[0].status).toBe('resolved');
  expect(persisted.dispatch_records).toHaveLength(1);
  expect(persisted.summary.unclaimed_recovery_cents).toBe(18500);
  expect((await call('/api/state', 200, second.token)).cases).toHaveLength(0);
  expect((await call('/api/outbox/status', 200, first.token)).outbox.delivered_count).toBe(0);
  await health(request);
  // Tokens, raw HTTP traces and session storage are intentionally absent from receipts.
  await test.info().attach('sanitized-case-acceptance.json', {
    body: JSON.stringify({ commit: sha, target: live ? 'aws' : 'ci-calibration',
      case_id: c.id, revision: c.revision, status: c.status, evidence_level: 'synthetic runtime',
      events: c.timeline.map(e => ({ id: e.id, status: e.status, source: e.source, timestamp: e.timestamp })),
      real_recovered_cents: 0, delivered_count: 0, independent_human_uat: 'NOT_RUN',
    }, null, 2), contentType: 'application/json',
  });
});

test('deployed intake: manual receipt facts are staged, reviewed exactly, committed once and survive a read', async ({ request }) => {
  await health(request);
  const call = caller(request);
  const session = await call('/api/demo/session', 201, undefined, {});
  const receipt = { kind: 'receipt', transaction_id: 'out-001', merchant: 'Leroy Merlin DIY', amount_cents: 8550, date: '2026-09-04', receipt_id: 'ACCEPTANCE-RECEIPT-001' };
  expect(session.state.outflows.find((o: { id: string }) => o.id === 'out-001')).toMatchObject({ has_receipt: false, amount_cents: 8550 });
  await call('/api/receipt/scan', 401, undefined, { operation: 'stage', records: [receipt] });
  const staged = await call('/api/receipt/scan', 200, session.token, { operation: 'stage', records: [receipt] });
  const draft: IntakeDraft = staged.intake;
  expect(staged.status).toBe('simulated');
  expect(staged.replayed).toBe(false);
  expect(draft).toMatchObject({ status: 'staged', route: '/api/receipt/scan', source: 'manual_entry', review: null });
  expect(draft.input_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(staged.state.outflows.find((o: { id: string }) => o.id === 'out-001').has_receipt).toBe(false);
  // Nothing commits without an exact review digest and explicit consent.
  await call('/api/receipt/scan', 409, session.token, { operation: 'commit', intake_id: draft.id, digest: '0'.repeat(64), confirmed: true });
  const reviewed = await call('/api/receipt/scan', 200, session.token, { operation: 'review', intake_id: draft.id, records: [receipt] });
  expect(reviewed.intake.status).toBe('review');
  const review = reviewed.intake.review;
  expect(review.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(review.changes).toEqual([expect.objectContaining({ index: 0, status: 'ready', collection: 'outflows', record_id: 'out-001' })]);
  expect(review.changes[0].before.has_receipt).toBe(false);
  expect(review.changes[0].after).toMatchObject({ has_receipt: true, receipt_id: 'ACCEPTANCE-RECEIPT-001' });
  await call('/api/receipt/scan', 422, session.token, { operation: 'commit', intake_id: draft.id, digest: review.digest, confirmed: false });
  const committed = await call('/api/receipt/scan', 200, session.token, { operation: 'commit', intake_id: draft.id, digest: review.digest, confirmed: true });
  expect(committed.replayed).toBe(false);
  expect(committed.intake.status).toBe('committed');
  expect(committed.intake.result).toEqual({ ready: 1, duplicate: 0, error: 0 });
  expect(committed.state.outflows.find((o: { id: string }) => o.id === 'out-001')).toMatchObject({ has_receipt: true, receipt_id: 'ACCEPTANCE-RECEIPT-001' });
  const replay = await call('/api/receipt/scan', 200, session.token, { operation: 'commit', intake_id: draft.id, digest: review.digest, confirmed: true });
  expect(replay.replayed).toBe(true);
  expect(replay.state.version_seq).toBe(committed.state.version_seq);
  const persisted = await call('/api/state', 200, session.token);
  expect(persisted.outflows.find((o: { id: string }) => o.id === 'out-001')).toMatchObject({ has_receipt: true, receipt_id: 'ACCEPTANCE-RECEIPT-001', status: 'manually_recorded' });
  expect(persisted.intakes[draft.id]).toMatchObject({ status: 'committed', input_sha256: draft.input_sha256, ocr_status: 'unavailable', confidence_score: null, result: { ready: 1, duplicate: 0, error: 0 } });
  expect(persisted.summary.missing_receipt_cents).toBe(0);
  expect(persisted.summary.real_recovered_cents).toBe(0);
  expect(persisted.appliances).toHaveLength(3);
  expect(persisted.dispatch_records).toHaveLength(0);
  await health(request);
  await test.info().attach('sanitized-intake-acceptance.json', {
    body: JSON.stringify({ commit: sha, target: live ? 'aws' : 'ci-calibration',
      intake_id: draft.id, input_sha256: draft.input_sha256, review_digest: review.digest,
      result: committed.intake.result, ocr: 'unavailable', linked_transaction: 'out-001', replayed_commit: true,
      real_recovered_cents: 0, independent_human_uat: 'NOT_RUN',
    }, null, 2), contentType: 'application/json',
  });
});

test('deployed subscriptions: a synthetic cancellation request is recorded exactly once and replays the same record', async ({ request }) => {
  await health(request);
  const call = caller(request);
  const session = await call('/api/demo/session', 201, undefined, {});
  const before = session.state.subscriptions.find((s: { id: string }) => s.id === 'sub-001');
  expect(before).toMatchObject({ service_name: 'Fitness Stream Pro', monthly_cents: 1999, is_trial: true, status: 'expiring_trial' });
  expect(before.demo_cancellation_requested).toBeFalsy();
  const body = { service_name: 'Fitness Stream Pro', subscription_id: 'sub-001', expected_monthly_cents: 1999 };
  await call('/api/action/cancel', 401, undefined, body);
  await call('/api/action/cancel', 409, session.token, { ...body, expected_monthly_cents: 1 });
  await call('/api/action/cancel', 404, session.token, { service_name: 'Unknown Service', subscription_id: 'sub-999', expected_monthly_cents: 1 });
  const recorded = await call('/api/action/cancel', 200, session.token, body);
  expect(recorded.status).toBe('simulated');
  expect(recorded.replayed).toBeUndefined();
  expect(recorded.result).toMatchObject({ status: 'simulated', service_name: 'Fitness Stream Pro' });
  const requested = recorded.state.subscriptions.find((s: { id: string }) => s.id === 'sub-001');
  expect(requested).toMatchObject({
    status: 'expiring_trial', monthly_cents: 1999, demo_cancellation_requested: true,
    cancellation_request: { status: 'synthetic_requested', subscription_id: 'sub-001', service_name: 'Fitness Stream Pro', monthly_cents: 1999 },
  });
  expect(recorded.state.summary.monthly_recurring_cents).toBe(session.state.summary.monthly_recurring_cents);
  const replay = await call('/api/action/cancel', 200, session.token, body);
  expect(replay.replayed).toBe(true);
  expect(replay.state.version_seq).toBe(recorded.state.version_seq);
  expect(replay.state.subscriptions.find((s: { id: string }) => s.id === 'sub-001').cancellation_request).toEqual(requested.cancellation_request);
  const persisted = await call('/api/state', 200, session.token);
  expect(persisted.subscriptions.find((s: { id: string }) => s.id === 'sub-001')).toMatchObject({
    status: 'expiring_trial', monthly_cents: 1999, demo_cancellation_requested: true,
    cancellation_request: { status: 'synthetic_requested', subscription_id: 'sub-001', monthly_cents: 1999 },
  });
  expect(persisted.summary.monthly_recurring_cents).toBe(session.state.summary.monthly_recurring_cents);
  expect(persisted.summary.real_recovered_cents).toBe(0);
  expect(persisted.dispatch_records).toHaveLength(0);
  await health(request);
  await test.info().attach('sanitized-subscription-acceptance.json', {
    body: JSON.stringify({ commit: sha, target: live ? 'aws' : 'ci-calibration',
      subscription_id: 'sub-001', request_status: 'synthetic_requested', provider_contacted: false,
      monthly_cents_unchanged: true, replayed: true, real_recovered_cents: 0, independent_human_uat: 'NOT_RUN',
    }, null, 2), contentType: 'application/json',
  });
});

if (process.env.HESTIA_ACCEPTANCE_PHASE === 'frontend') {
  // Serialize unmodified same-origin API requests to respect the 2 RPS demo limit.
  async function paced(page: Page) {
    let queued = Promise.resolve();
    await page.route(/\/(api\/|healthz)/, async route => {
      queued = queued.then(pause);
      await queued;
      await route.continue();
    });
  }
  async function coldStart(page: Page) {
    await page.goto('/');
    if (live) await expect(page.locator('meta[name="application-commit"]')).toHaveAttribute('content', sha);
    await expect(page.getByTestId('launch-cockpit')).toHaveText(/Start with the sample household/);
  }
  // One click: the landing CTA creates the isolated session itself and opens Home.
  async function start(page: Page) {
    const started = page.waitForResponse(r => r.url().endsWith('/api/demo/session') && r.request().method() === 'POST');
    await page.getByTestId('launch-cockpit').click();
    expect((await started).status()).toBe(201);
    await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
    await expect(page.getByTestId('begin-demo')).toHaveCount(0);
  }
  // A stored session resumes without another POST: the CTA only opens Home.
  async function resume(page: Page) {
    await page.reload();
    await expect(page.getByTestId('launch-cockpit')).toHaveText(/Continue your household case/);
    await page.getByTestId('launch-cockpit').click();
    await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  }

  test('paired browser: visible exact notice, explicit simulation, bounded agent review and durable history after reload', async ({ page, request }) => {
    await health(request);
    await paced(page);
    await coldStart(page);
    await start(page);
    await expect(page.getByTestId('review-claim')).toBeEnabled();
    const prepared = page.waitForResponse(r => r.url().endsWith('/api/action/claim/prepare'));
    await page.getByTestId('review-claim').click();
    const preparedResponse = await prepared;
    expect(preparedResponse.status()).toBe(200);
    const draft: ClaimDraft = (await preparedResponse.json()).draft;
    await expect(page.getByTestId('server-notice')).toBeVisible();
    expect(await page.getByTestId('server-notice').textContent()).toBe(draft.notice);
    await expect(page.getByTestId('notice-recipient')).toHaveText(draft.seller_email);
    await expect(page.getByTestId('notice-amount')).toHaveText('185.00 EUR');
    await test.info().attach('aws-exact-notice', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const approved = page.waitForResponse(r => r.url().endsWith('/api/action/claim'));
    await page.getByTestId('approve-claim').click();
    const approvedResponse = await approved;
    expect(approvedResponse.status()).toBe(200);
    const result = await approvedResponse.json();
    expect(result.status).toBe('simulated');
    expect(result.dispatch_record.ses_message_id).toBeNull();
    await expect(page.getByTestId('claim-result')).toContainText('No email sent');
    await page.getByRole('button', { name: 'Close notice', exact: true }).click();
    await expect(page.getByTestId('home-case-status')).toHaveText('Authorized');
    // Hestia's review runs its bounded tools (and the model when configured) over the same records; it approves nothing.
    const reviewed = page.waitForResponse(r => r.url().endsWith('/api/agent/review') && r.request().method() === 'POST');
    await page.getByTestId('agent-review').click();
    const reviewResponse = await reviewed;
    expect(reviewResponse.status()).toBe(200);
    const briefing: AgentBriefing = (await reviewResponse.json()).briefing;
    expectBriefingBoundary(briefing);
    await expect(page.getByTestId('agent-mode')).toContainText(live ? 'Live model via Strands Agents' : 'Deterministic checks only');
    await expect(page.getByTestId('agent-trace')).toContainText(`Tool trace: ${briefing.tool_calls.length} call`);
    await expect(page.getByTestId('agent-trace')).toContainText(`Briefing ${briefing.id}`);
    if (briefing.narrative) await expect(page.getByTestId('agent-briefing')).toBeVisible();
    else if (briefing.withheld) await expect(page.getByTestId('agent-withheld')).toBeVisible();
    else await expect(page.getByTestId('agent-findings')).toBeVisible();
    await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
    await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
    await expect(page.getByTestId('dashboard-real-recovery')).toContainText('€0.00');
    await test.info().attach('aws-agent-review-home', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await resume(page);
    await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
    await expect(page.getByTestId('dispatch-record')).toContainText(result.dispatch_record.id);
    await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
    await expect(page.getByTestId('agent-trace')).toContainText(`Briefing ${briefing.id}`);
    await test.info().attach('aws-persisted-dashboard', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('paired consumer case: cold start, facts, saved next action, evidence and mobile return', async ({ page, request }) => {
    await health(request);
    await paced(page);
    await coldStart(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Keep the whole case together');
    await test.info().attach(`${sha}-cold-start`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await start(page);
    await nav(page, 'Case').click();
    await expect(page.getByTestId('case-empty')).toContainText('No case saved yet');
    await expect(page.getByTestId('reviewed-facts')).toContainText('REC-2024-BOSCH-88');
    await page.getByTestId('prepare-case-notice').click();
    await expect(page.getByTestId('approve-claim')).toBeEnabled();
    await page.getByTestId('approve-claim').click();
    await page.getByTestId('open-persisted-case').click();
    await expect(page.getByTestId('case-status')).toHaveText('Authorized');
    for (const step of [
      { action: 'start_tracking', deadline: '2026-10-01' },
      { action: 'request_information', source: 'synthetic_reply' },
      { action: 'add_evidence' },
      { action: 'resolve', amount: '0.00' },
    ]) {
      await page.getByTestId('case-action').selectOption(step.action);
      if (step.source) await page.getByTestId('case-source').selectOption(step.source);
      await page.getByTestId('case-note').fill(`Synthetic browser acceptance: ${step.action}`);
      await page.getByTestId('case-evidence').fill(`FIXTURE-BROWSER-${step.action}`);
      if (step.deadline) await page.getByTestId('case-deadline-input').fill(step.deadline);
      if (step.amount) {
        await page.getByTestId('case-amount').fill(step.amount);
        await page.getByTestId('case-attestation').check();
      }
      const saved = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
      await page.getByTestId('save-case-update').click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByTestId('case-update-result')).toContainText('Update saved');
    }
    await expect(page.getByTestId('case-status')).toHaveText('Resolved');
    await expect(page.getByTestId('case-real-recovery')).toContainText('€0.00');
    await test.info().attach(`${sha}-completed-case`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.setViewportSize({ width: 375, height: 812 });
    await resume(page);
    await expect(page.getByTestId('home-case-status')).toHaveText('Resolved');
    await expect(page.getByTestId('alert-warranty')).toHaveCount(0);
    await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId('home-open-case').click();
    await expect(page.getByTestId('case-status')).toHaveText('Resolved');
    await expect(page.getByTestId('case-outcome')).toContainText('Human-attested synthetic outcome');
    await test.info().attach(`${sha}-completed-case-mobile`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
