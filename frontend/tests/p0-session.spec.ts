import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { BackendState, ClaimDraft, DemoSession } from '../src/api';

const BACKEND = 'http://127.0.0.1:8000';
const SESSION_KEY = 'hestia.demo-session.v1';
type Started = DemoSession & { state: BackendState };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function start(page: Page): Promise<Started> {
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('begin-demo')).toBeEnabled();
  await expect(page.getByTestId('review-claim')).toBeDisabled();
  const created = page.waitForResponse(response => response.url().endsWith('/api/demo/session') && response.request().method() === 'POST');
  await page.getByTestId('begin-demo').click();
  const response = await created;
  expect(response.status()).toBe(201);
  const session = await response.json() as Started;
  expect(session.mode).toBe('simulated');
  expect(session.state.appliances.find(a => a.id === 'app-001')?.item_name).toBe('Bosch Series 6 Washing Machine');
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  await expect(page.getByTestId('review-claim')).toBeEnabled();
  return session;
}

async function openNotice(page: Page): Promise<ClaimDraft> {
  const prepared = page.waitForResponse(response => response.url().endsWith('/api/action/claim/prepare'));
  await page.getByTestId('review-claim').click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  const data = await response.json() as { status: string; draft: ClaimDraft };
  expect(data.status).toBe('prepared');
  await expect(page.getByTestId('server-notice')).toBeVisible();
  // Compare actual textContent; locator text assertions normalize whitespace.
  expect(await page.getByTestId('server-notice').textContent()).toBe(data.draft.notice);
  await expect(page.getByTestId('notice-recipient')).toHaveText(data.draft.seller_email);
  await expect(page.getByTestId('notice-claimant')).toHaveText(data.draft.homeowner_name);
  await expect(page.getByTestId('notice-subject')).toHaveText(data.draft.subject);
  await expect(page.getByTestId('notice-amount')).toHaveText(`${(data.draft.amount_cents / 100).toFixed(2)} ${data.draft.currency}`);
  await expect(page.getByTestId('approve-claim')).toBeEnabled();
  return data.draft;
}

async function stateFor(request: APIRequestContext, token: string): Promise<BackendState> {
  const response = await request.get(`${BACKEND}/api/state`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return await response.json() as BackendState;
}

async function expectNoRecovery(page: Page, request: APIRequestContext, token: string, count = 0) {
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
  await expect(page.getByTestId('review-claim')).toBeVisible();
  const state = await stateFor(request, token);
  expect(state.summary.unclaimed_recovery_cents).toBe(18500);
  expect(state.dispatch_records).toHaveLength(count);
}

test('anonymous preview never creates a session, calls a model, or seeds delivered history', async ({ page, request }) => {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  const health = await request.get(`${BACKEND}/healthz`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ mode: 'simulated', live_send: false, live_model: false });
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('begin-demo')).toBeEnabled();
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  await expect(page.getByTestId('review-claim')).toBeDisabled();
  await expect(page.getByTestId('session-status')).toContainText('Synthetic preview');
  expect(posts).toEqual([]);
  const anonymous = await request.post(`${BACKEND}/api/action/claim`, { data: { item_id: 'app-001' } });
  expect(anonymous.status()).toBe(401);
});

test('explicit demo → exact server preview → simulated approval → reload retains history and recovery', async ({ page, context, request }) => {
  const posted: { url: string; body: unknown; authorization: string | undefined }[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posted.push({ url: req.url(), body: req.postDataJSON(), authorization: req.headers().authorization });
  });
  const session = await start(page);
  const draft = await openNotice(page);
  expect(draft.item_id).toBe('app-001');
  expect(draft.seller_email).toBe(session.state.appliances[0].seller_email);
  expect(draft.homeowner_name).toBe(session.state.homeowner_name);
  expect(draft.notice).toContain('Bosch Series 6');
  expect(draft.notice).not.toContain('Elena Weber');
  await test.info().attach('exact-notice-desktop', {
    body: await page.getByRole('dialog').screenshot(), contentType: 'image/png',
  });

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy Text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draft.notice);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .txt', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(draft.notice);

  const approved = page.waitForResponse(response => response.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  const response = await approved;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.status).toBe('simulated');
  expect(result.dispatch_record).toMatchObject({ status: 'simulated', delivery_status: 'SIMULATED', ses_message_id: null, full_letter: draft.notice });
  await expect(page.getByTestId('claim-result')).toContainText('Simulated approval recorded');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  expect(posted.filter(p => p.url.endsWith('/api/action/claim/prepare'))).toHaveLength(1);
  expect(posted.filter(p => p.url.endsWith('/api/action/claim'))).toEqual([{
    url: 'http://127.0.0.1:3000/api/action/claim',
    body: { draft_id: draft.id, digest: draft.digest, approval_token: draft.approval_token },
    authorization: `Bearer ${session.token}`,
  }]);
  expect(posted.some(p => p.url.includes(session.token))).toBe(false);
  await page.getByRole('button', { name: 'Close notice', exact: true }).click();
  await expectNoRecovery(page, request, session.token, 1);
  await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
  await test.info().attach('recorded-simulation-desktop', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await page.reload();
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  await expect(page.getByTestId('dispatch-record')).toContainText(result.dispatch_record.id);
  await expectNoRecovery(page, request, session.token, 1);
  expect(posted.filter(p => p.url.endsWith('/api/demo/session'))).toHaveLength(1);
  const outbox = await request.get(`${BACKEND}/api/outbox/status`, { headers: bearer(session.token) });
  expect(outbox.status()).toBe(200);
  expect((await outbox.json()).outbox.records[0].id).toBe(result.dispatch_record.id);
  const reopened = await openNotice(page);
  expect(reopened.id).not.toBe(draft.id);
  await expect(page.getByTestId('claim-result')).toHaveCount(0);
});

test('HTTP abort retains the pending claim, disables approval, and never replays a mutation', async ({ page, request }) => {
  const session = await start(page);
  await openNotice(page);
  let attempts = 0;
  await page.route('**/api/action/claim', route => { attempts++; return route.abort('failed'); });
  await page.getByTestId('approve-claim').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Request interrupted');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  await expect(page.getByTestId('claim-result')).toHaveCount(0);
  await expectNoRecovery(page, request, session.token);
  await page.getByRole('button', { name: 'Close notice', exact: true }).click();
  await page.getByTestId('refresh-state').click();
  await expect(page.getByTestId('review-claim')).toBeEnabled();
  expect(attempts).toBe(1);
  await page.unroute('**/api/action/claim');
  await openNotice(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

test('notice keyboard focus is contained and mobile approval remains an explicit review', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await start(page);
  await openNotice(page);
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('approve-claim')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Copy Text', exact: true })).toBeFocused();
  await test.info().attach('exact-notice-mobile', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('review-claim')).toBeFocused();
  await openNotice(page);
  await page.getByTestId('approve-claim').click();
  await expect(page.getByTestId('claim-result')).toContainText('No email sent');
  await expectNoRecovery(page, request, session.token, 1);
});

test('lost response after a real backend commit shows uncertainty until reload reveals history', async ({ page, request }) => {
  const session = await start(page);
  await openNotice(page);
  let attempts = 0;
  await page.route('**/api/action/claim', async route => {
    attempts++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await page.getByTestId('approve-claim').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Outcome unconfirmed');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  await expectNoRecovery(page, request, session.token, 1);
  await page.reload();
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
  expect(attempts).toBe(1);
});

test('real HTTP 403 on altered approval proof cannot become UI success', async ({ page, request }) => {
  const session = await start(page);
  await openNotice(page);
  await page.route('**/api/action/claim', route => route.continue({
    postData: JSON.stringify({ ...route.request().postDataJSON(), approval_token: '0'.repeat(64) }),
  }));
  const denied = page.waitForResponse(response => response.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await denied).status()).toBe(403);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Approval does not match');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  await expectNoRecovery(page, request, session.token);
  await page.getByRole('button', { name: 'Close notice', exact: true }).click();
  await page.unroute('**/api/action/claim');
  await openNotice(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

test('real stale draft after reset returns 409 and re-open explicitly prepares a fresh draft', async ({ page, request }) => {
  const session = await start(page);
  const old = await openNotice(page);
  const reset = await request.post(`${BACKEND}/api/action/reset`, { headers: bearer(session.token), data: {} });
  expect(reset.status()).toBe(200);
  const denied = page.waitForResponse(response => response.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await denied).status()).toBe(409);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Evidence changed');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  await expectNoRecovery(page, request, session.token);
  await page.getByRole('button', { name: 'Close notice', exact: true }).click();
  const fresh = await openNotice(page);
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.source_version).toBeGreaterThan(old.source_version);
});

test('real cross-session approval returns 404; neither workspace receives a record', async ({ page, request }) => {
  const session = await start(page);
  await openNotice(page);
  const secondResponse = await request.post(`${BACKEND}/api/demo/session`, { data: {} });
  expect(secondResponse.status()).toBe(201);
  const other = await secondResponse.json() as Started;
  await page.route('**/api/action/claim', route => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${other.token}` } }));
  const denied = page.waitForResponse(response => response.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await denied).status()).toBe(404);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Prepared notice not found in this session');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  await expectNoRecovery(page, request, session.token);
  expect((await stateFor(request, other.token)).dispatch_records).toHaveLength(0);
});

test('unknown item is a real 404; preview error is retained and approval unavailable', async ({ page, request }) => {
  const session = await start(page);
  await page.route('**/api/action/claim/prepare', route => route.continue({ postData: JSON.stringify({ item_id: 'unknown-item' }) }));
  const denied = page.waitForResponse(response => response.url().endsWith('/api/action/claim/prepare'));
  await page.getByTestId('review-claim').click();
  expect((await denied).status()).toBe(404);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('selected appliance does not exist');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  await expect(page.getByTestId('server-notice')).toHaveCount(0);
  await expectNoRecovery(page, request, session.token);
});

test('client session expiry requires explicit restart and clears the old preview', async ({ page }) => {
  await page.clock.install();
  const session = await start(page);
  await openNotice(page);
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page.getByTestId('session-status')).toContainText('Demo session expired');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('begin-demo')).toHaveText('Restart Isolated Demo Session');
  expect(posts).toEqual([]);
  // Restore browser time before explicitly requesting a new server-issued session.
  await page.clock.setSystemTime(Date.now());
  const restarted = page.waitForResponse(response => response.url().endsWith('/api/demo/session'));
  await page.getByTestId('begin-demo').click();
  expect((await (await restarted).json()).token).not.toBe(session.token);
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
});

test('denied bearer requires restart without sending an automatic session request', async ({ page }) => {
  await start(page);
  await openNotice(page);
  let newSessions = 0;
  page.on('request', req => { if (req.url().endsWith('/api/demo/session')) newSessions++; });
  await page.route('**/api/action/claim', route => route.continue({ headers: { ...route.request().headers(), authorization: 'Bearer invalid' } }));
  const denied = page.waitForResponse(response => response.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await denied).status()).toBe(401);
  await expect(page.getByTestId('begin-demo')).toHaveText('Restart Isolated Demo Session');
  expect(newSessions).toBe(0);
});

test('sessionStorage failures still permit an in-memory isolated session', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } }));
  await start(page);
  await expect(page.getByTestId('session-panel')).toContainText('session storage is unavailable');
  await openNotice(page);
  await page.reload();
  await expect(page.getByTestId('begin-demo')).toBeEnabled();
  await expect(page.getByTestId('session-status')).toContainText('Synthetic preview');
});

test('expired persisted credentials cannot silently create or recover another workspace', async ({ page }) => {
  await page.addInitScript(key => sessionStorage.setItem(key, JSON.stringify({ token: 'expired', expires_at: 1, mode: 'simulated' })), SESSION_KEY);
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.goto('/');
  await expect(page.getByTestId('begin-demo')).toHaveText('Restart Isolated Demo Session');
  expect(posts).toEqual([]);
});

for (const variant of ['invalid-json', 'missing-draft', 'explicit-failure'] as const) {
  test(`HTTP 200 ${variant} cannot fabricate a preview or enable approval`, async ({ page, request }) => {
    const session = await start(page);
    await page.route('**/api/action/claim/prepare', async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const bodies = {
        'invalid-json': '<html>upstream error</html>',
        'missing-draft': JSON.stringify({ status: 'prepared', draft: { id: 'incomplete' } }),
        'explicit-failure': JSON.stringify({ status: 'failed', message: 'Preview explicitly failed' }),
      };
      await route.fulfill({ response, body: bodies[variant], contentType: 'application/json' });
    });
    await page.getByTestId('review-claim').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('approve-claim')).toBeDisabled();
    await expect(page.getByTestId('server-notice')).toHaveCount(0);
    await expectNoRecovery(page, request, session.token);
  });
}

test('pending preview cannot be approved, and draft expiry disables approval without regeneration', async ({ page }) => {
  await page.clock.install();
  await start(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let prepares = 0;
  await page.route('**/api/action/claim/prepare', async route => {
    prepares++;
    await held;
    await route.continue();
  });
  await page.getByTestId('review-claim').click();
  await expect(page.getByText('Preparing the server notice...', { exact: true })).toBeVisible();
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  release();
  await expect(page.getByTestId('approve-claim')).toBeEnabled();
  await page.clock.fastForward(11 * 60 * 1000);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Draft expired');
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  expect(prepares).toBe(1);
});

test('appliance vault uses backend identity and re-opening discards the old draft', async ({ page }) => {
  const session = await start(page);
  const previous = await openNotice(page);
  await page.getByRole('button', { name: 'Close notice', exact: true }).click();
  await page.getByRole('button', { name: /Asset Vault/ }).click();
  await expect(page.getByRole('heading', { name: 'Sony Bravia 55 OLED TV', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daikin Inverter AC 12000 BTU', exact: true })).toBeVisible();
  const response = page.waitForResponse(res => res.url().endsWith('/api/action/claim/prepare'));
  await page.getByTestId('review-appliance-app-001').click();
  const fresh = (await (await response).json()).draft as ClaimDraft;
  expect(fresh.id).not.toBe(previous.id);
  expect(fresh.seller_email).toBe(session.state.appliances.find(a => a.id === 'app-001')?.seller_email);
  await expect(page.getByTestId('approve-claim')).toBeEnabled();
  expect(await page.getByTestId('server-notice').textContent()).toBe(fresh.notice);
});

test('other simulated actions preserve provider risks; manual receipt only links an existing outflow', async ({ page, request }) => {
  const session = await start(page);
  const before = await stateFor(request, session.token);
  const cancel = page.waitForResponse(res => res.url().endsWith('/api/action/cancel'));
  await page.getByTestId('cancel-trial').click();
  expect((await cancel).status()).toBe(200);
  await expect(page.getByText('Simulated cancellation request recorded. No provider subscription was cancelled; monthly risk is unchanged.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cancel-trial')).toBeVisible();
  expect((await stateFor(request, session.token)).summary.monthly_sub_leakage_cents).toBe(before.summary.monthly_sub_leakage_cents);

  await page.getByTestId('review-utility').click();
  const utility = page.waitForResponse(res => res.url().endsWith('/api/action/utility_dispute'));
  await page.getByTestId('approve-utility').click();
  expect((await utility).status()).toBe(200);
  await expect(page.getByTestId('utility-result')).toContainText('No provider was contacted');
  await page.getByRole('button', { name: 'Close utility review', exact: true }).click();
  await expect(page.getByTestId('review-utility')).toBeVisible();
  expect((await stateFor(request, session.token)).summary.active_anomalies_count).toBe(before.summary.active_anomalies_count);

  await page.getByRole('button', { name: 'Receipt Options (Scanning Unavailable)', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Receipt scanning is not enabled');
  await page.getByTestId('receipt-outflow').selectOption('out-001');
  await page.getByTestId('receipt-reference').fill('DEMO-MANUAL-REF-1');
  const receipt = page.waitForResponse(res => res.url().endsWith('/api/action/receipt'));
  await page.getByTestId('link-receipt').click();
  expect((await receipt).status()).toBe(200);
  await expect(page.getByTestId('receipt-result')).toContainText('no new appliance was created');
  const after = await stateFor(request, session.token);
  expect(after.appliances).toEqual(before.appliances);
  expect(after.summary.protected_assets_cents).toBe(before.summary.protected_assets_cents);
  expect(after.outflows.find(o => o.id === 'out-001')).toMatchObject({ has_receipt: true, receipt_id: 'DEMO-MANUAL-REF-1' });
});

test('cancel, utility, receipt and reset propagate denied responses without clearing UI state', async ({ page, request }) => {
  const session = await start(page);
  const before = await stateFor(request, session.token);
  for (const action of ['cancel', 'utility_dispute', 'receipt', 'reset']) {
    await page.route(`**/api/action/${action}`, route => route.continue({ postData: JSON.stringify({ unexpected: true }) }));
  }
  const cancel = page.waitForResponse(res => res.url().endsWith('/api/action/cancel'));
  await page.getByTestId('cancel-trial').click();
  expect((await cancel).status()).toBe(400);
  await expect(page.getByTestId('cancel-trial')).toBeEnabled();

  await page.getByTestId('review-utility').click();
  const utility = page.waitForResponse(res => res.url().endsWith('/api/action/utility_dispute'));
  await page.getByTestId('approve-utility').click();
  expect((await utility).status()).toBe(400);
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('utility-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close utility review', exact: true }).click();

  await page.getByRole('button', { name: 'Receipt Options (Scanning Unavailable)', exact: true }).click();
  await page.getByTestId('receipt-reference').fill('DENIED-REFERENCE');
  const receipt = page.waitForResponse(res => res.url().endsWith('/api/action/receipt'));
  await page.getByTestId('link-receipt').click();
  expect((await receipt).status()).toBe(400);
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('receipt-result')).toHaveCount(0);
  await expect(page.getByTestId('receipt-reference')).toHaveValue('DENIED-REFERENCE');
  await page.getByRole('button', { name: 'Close receipt options', exact: true }).click();

  const reset = page.waitForResponse(res => res.url().endsWith('/api/action/reset'));
  await page.getByTestId('reset-demo').click();
  expect((await reset).status()).toBe(400);
  await expect(page.getByTestId('session-panel').getByRole('alert')).toContainText('Unexpected or missing');
  expect(await stateFor(request, session.token)).toEqual(before);
  await expectNoRecovery(page, request, session.token);
});

test('unavailable sync/scan and legacy dispatch aliases cannot bypass the approval boundary', async ({ page, request }) => {
  const session = await start(page);
  const before = await stateFor(request, session.token);
  for (const path of ['/api/ingest/sync', '/ingest/sync', '/api/receipt/scan', '/receipt/scan']) {
    const response = await request.post(`${BACKEND}${path}`, { headers: bearer(session.token), data: {} });
    expect(response.status()).toBe(501);
    expect((await response.json()).message).toContain('not enabled');
  }
  for (const path of ['/api/outbox/dispatch', '/outbox/dispatch']) {
    const response = await request.post(`${BACKEND}${path}`, { headers: bearer(session.token), data: {} });
    expect(response.status()).toBe(403);
  }
  const legacy = await request.post(`${BACKEND}/action/claim`, { headers: bearer(session.token), data: { item_id: 'app-001' } });
  expect(legacy.status()).toBe(400);
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.getByText('About / Advanced', { exact: true }).click();
  await page.getByRole('button', { name: 'Sync Invoices', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Invoice sync is not enabled');
  await page.getByRole('button', { name: 'Close invoice sync', exact: true }).click();
  await page.getByRole('button', { name: 'AWS Console', exact: true }).click();
  await page.getByRole('button', { name: 'POST /outbox/dispatch', exact: true }).click();
  await expect(page.getByTestId('console-request')).toBeDisabled();
  await expect(page.getByText(/Console writes are disabled/)).toBeVisible();
  await page.getByRole('button', { name: 'POST /claim', exact: true }).click();
  await expect(page.getByTestId('console-request')).toBeDisabled();
  expect(posts).toEqual([]);
  const read = page.waitForRequest(req => req.url().endsWith('/api/outbox/status'));
  await page.getByRole('button', { name: 'GET /outbox/status', exact: true }).click();
  await page.getByTestId('console-request').click();
  expect((await read).headers().authorization).toBe(`Bearer ${session.token}`);
  expect(await stateFor(request, session.token)).toEqual(before);
});

test('session service 503 leaves the preview read-only and displays its explanation', async ({ page }) => {
  await page.route('**/api/demo/session', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ status: 'error', message: 'Private demo sessions are not configured. Read-only preview is available.' }),
  }));
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  await page.getByTestId('begin-demo').click();
  await expect(page.getByTestId('session-panel').getByRole('alert')).toContainText('Read-only preview is available');
  await expect(page.getByTestId('review-claim')).toBeDisabled();
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
});

test('explicit failure inside an HTTP 200 approval result never becomes a success banner', async ({ page, request }) => {
  const session = await start(page);
  await openNotice(page);
  await page.route('**/api/action/claim', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const result = await response.json();
    await route.fulfill({ response, json: { ...result, dispatch_record: { ...result.dispatch_record, status: 'failed', message: 'Transport outcome failed' } } });
  });
  await page.getByTestId('approve-claim').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Transport outcome failed');
  await expect(page.getByTestId('claim-result')).toHaveCount(0);
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  await expect(page.getByTestId('approve-claim')).toBeDisabled();
  // The real server recorded a simulation. Only a subsequent read may display that fact.
  await expectNoRecovery(page, request, session.token, 1);
});
