import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { ClaimDraft } from '../src/api';

const sha = process.env.HESTIA_APPROVED_SHA!;
const live = process.env.HESTIA_ACCEPTANCE_URL!.startsWith('https:');
const pause = () => new Promise(resolve => setTimeout(resolve, 1_100));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function health(request: APIRequestContext) {
  await pause();
  const response = await request.get('/healthz', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({
    service: 'hestia-aws', status: 'ok', commit: sha,
    mode: 'simulated', live_send: false, live_model: false, demo_sessions_configured: true,
  });
  if (live) expect(data.storage_configured).toBe(true);
}

test('deployed API: exact approval, persistent replay, isolation and fail-closed legacy routes', async ({ request }) => {
  // Read-only safety gate runs before the first synthetic mutation.
  await health(request);
  async function call(path: string, code: number, token?: string, body?: object) {
    await pause();
    const response = await request.fetch(path, {
      method: body === undefined ? 'GET' : 'POST', data: body,
      headers: token ? bearer(token) : {}, maxRedirects: 0, maxRetries: 0,
    });
    expect(response.status(), `${path}: expected HTTP ${code}`).toBe(code);
    return response.json();
  }
  const preview = await call('/api/state', 200);
  expect(preview.dispatch_records).toHaveLength(0);
  await call('/api/action/claim', 401, undefined, {});
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
  await call('/action/claim', 400, first.token, { item_id: 'app-001' });
  await call('/api/outbox/dispatch', 403, first.token, {});
  await call('/api/receipt/scan', 501, first.token, {});
  await call('/api/ingest/sync', 501, first.token, {});
  await health(request);
  await test.info().attach('sanitized-acceptance.json', {
    body: JSON.stringify({
      commit: sha, target: live ? 'aws' : 'ci-calibration', timestamp: new Date().toISOString(),
      record_id: accepted.dispatch_record.id, notice_digest: draft.digest,
      version: persisted.version_seq, simulated_records: 1, delivered_count: 0,
      persistent_replay: true, separate_workspace_empty: true, recovered_cents: 0,
    }, null, 2), contentType: 'application/json',
  });
});

if (process.env.HESTIA_ACCEPTANCE_PHASE === 'frontend') {
  test('paired browser: visible exact notice, explicit simulation and durable history after reload', async ({ page, request }) => {
    await health(request);
    // Serialize unmodified same-origin API requests to respect the 2 RPS demo limit.
    let queued = Promise.resolve();
    await page.route(/\/(api\/|healthz)/, async route => {
      queued = queued.then(pause);
      await queued;
      await route.continue();
    });
    await page.goto('/');
    if (live) await expect(page.locator('meta[name="application-commit"]')).toHaveAttribute('content', sha);
    await page.getByTestId('launch-cockpit').click();
    await expect(page.getByTestId('review-claim')).toBeDisabled();
    const started = page.waitForResponse(r => r.url().endsWith('/api/demo/session'));
    await page.getByTestId('begin-demo').click();
    expect((await started).status()).toBe(201);
    await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
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
    await page.reload();
    await page.getByTestId('launch-cockpit').click();
    await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
    await expect(page.getByTestId('dispatch-record')).toContainText(result.dispatch_record.id);
    await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
    await test.info().attach('aws-persisted-dashboard', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
