import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { BackendState } from '../src/api';
import type { CaseAction, HouseholdCase } from '../src/cases';

const backend = 'http://127.0.0.1:8000';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function savedState(request: APIRequestContext, token: string): Promise<BackendState> {
  const response = await request.get(`${backend}/api/state`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return response.json();
}
async function screenshot(page: Page, name: string) {
  await test.info().attach(`${process.env.HESTIA_COMMIT_SHA}-${name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
async function openCase(page: Page) {
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('case-empty')).toContainText('No case saved yet');
  const sessionResponse = page.waitForResponse(r => r.url().endsWith('/api/demo/session'));
  await page.getByTestId('begin-demo').click();
  const response = await sessionResponse;
  expect(response.status()).toBe(201);
  const session = await response.json();
  await expect(page.getByTestId('reviewed-facts')).toContainText('REC-2024-BOSCH-88');
  const prepared = page.waitForResponse(r => r.url().endsWith('/api/action/claim/prepare'));
  await page.getByTestId('prepare-case-notice').click();
  expect((await prepared).status()).toBe(200);
  const draft = (await (await prepared).json()).draft;
  await expect(page.getByTestId('server-notice')).toBeVisible();
  expect(await page.getByTestId('server-notice').textContent()).toBe(draft.notice);
  const approved = page.waitForResponse(r => r.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await approved).status()).toBe(200);
  await page.getByTestId('open-persisted-case').click();
  await expect(page.getByTestId('case-status')).toHaveText('Authorized');
  await expect(page.getByTestId('case-next-action')).toContainText('Approval sent no email');
  return { token: session.token as string, draft };
}

async function fillUpdate(page: Page, action: CaseAction, options: {
  note?: string; evidence?: string; source?: 'synthetic_reply' | 'manual_update'; deadline?: string; amount?: string;
} = {}) {
  await page.getByTestId('case-action').selectOption(action);
  if (options.source) await page.getByTestId('case-source').selectOption(options.source);
  await page.getByTestId('case-note').fill(options.note ?? `Fixture ${action} update`);
  await page.getByTestId('case-evidence').fill(options.evidence ?? `FIXTURE-${action.toUpperCase()}`);
  if (options.deadline) await page.getByTestId('case-deadline-input').fill(options.deadline);
  if (options.amount !== undefined) {
    await page.getByTestId('case-amount').fill(options.amount);
    await page.getByTestId('case-attestation').check();
  }
}
async function update(page: Page, action: CaseAction, options: Parameters<typeof fillUpdate>[2] = {}): Promise<HouseholdCase> {
  await fillUpdate(page, action, options);
  const response = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
  await page.getByTestId('save-case-update').click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(page.getByTestId('case-update-result')).toContainText('Update saved');
  return (await result.json()).case;
}

test('cold start explains household, problem, outcome and first action on desktop and mobile', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Keep the whole case together');
  await expect(page.getByText('For households facing a repair bill')).toBeVisible();
  await expect(page.getByTestId('launch-cockpit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pitch & GTM', exact: true })).toBeHidden();
  await screenshot(page, 'cold-start-desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('launch-cockpit')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, 'cold-start-mobile');
  expect(posts).toEqual([]);
});

test('receipt facts to exact approval, synthetic reply, more evidence, partial and attested resolution persist', async ({ page, request }) => {
  const { token, draft } = await openCase(page);
  await screenshot(page, 'authorized-case');
  await update(page, 'start_tracking', { deadline: '2026-10-01' });
  await update(page, 'reply', { source: 'synthetic_reply', note: 'Fixture seller is reviewing the repair' });
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  expect((await savedState(request, token)).cases[0].outcome).toBeNull();
  await update(page, 'request_information', { source: 'synthetic_reply', note: 'Fixture seller asks for the repair invoice' });
  await expect(page.getByTestId('case-status')).toHaveText('Needs information');
  await expect(page.getByTestId('case-next-action')).toContainText('Add the requested evidence');
  await screenshot(page, 'additional-evidence-needed');
  await update(page, 'add_evidence', { evidence: 'FIXTURE-REPAIR-INVOICE-185' });
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  await update(page, 'partial_outcome', { source: 'manual_update', amount: '49.00', evidence: 'FIXTURE-PARTIAL-49' });
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  await expect(page.getByTestId('case-outcome')).toContainText('€49.00 total (synthetic)');
  const resolved = await update(page, 'resolve', { amount: '185.00', evidence: 'FIXTURE-RESOLUTION-185', note: 'Human attests to the fixture repair outcome' });
  await expect(page.getByTestId('case-status')).toHaveText('Resolved');
  await expect(page.getByTestId('case-outcome')).toContainText('Human-attested synthetic outcome');
  await expect(page.getByTestId('case-real-recovery')).toContainText('€0.00');
  await expect(page.getByTestId('case-timeline')).toContainText('Synthetic reply fixture; not a merchant response');
  await page.getByText('Receipt, decision and exact notice', { exact: true }).click();
  expect(await page.getByTestId('case-exact-notice').textContent()).toBe(draft.notice);
  await screenshot(page, 'completed-case-desktop');
  await page.reload();
  await expect(page.getByTestId('launch-cockpit')).toContainText('Continue your household case');
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('case-status')).toHaveText('Resolved');
  const persisted = await savedState(request, token);
  expect(persisted.cases[0]).toEqual(resolved);
  expect(persisted.dispatch_records).toHaveLength(1);
  expect(persisted.summary.unclaimed_recovery_cents).toBe(18500);
  await test.info().attach('case-journey-receipt.json', { body: JSON.stringify({
    commit: process.env.HESTIA_COMMIT_SHA, case_id: resolved.id, status: resolved.status,
    events: resolved.timeline.map(e => ({ id: e.id, status: e.status, source: e.source, evidence_reference: e.evidence_reference })),
    real_recovered_cents: 0, human_uat: 'NOT_RUN',
  }, null, 2), contentType: 'application/json' });
});

test('silence and an elapsed planning deadline remain pending until a household decision', async ({ page, request }) => {
  const { token } = await openCase(page);
  await update(page, 'start_tracking', { deadline: '2026-09-01' });
  await expect(page.getByTestId('case-deadline')).toContainText('Due / overdue');
  await expect(page.getByTestId('case-next-action')).toContainText('Planning date reached');
  await update(page, 'record_silence', { note: 'No reply recorded by the fixture planning date' });
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  await screenshot(page, 'silence-deadline');
  await update(page, 'set_deadline', { deadline: '2026-10-20' });
  const c = (await savedState(request, token)).cases[0];
  expect(c.status).toBe('pending_response');
  expect(c.outcome).toBeNull();
  expect(c.timeline.filter(e => e.action === 'record_silence')).toHaveLength(1);
});

test('refusal and reopen retain evidence without another notice or side effect', async ({ page, request }) => {
  const { token } = await openCase(page);
  await update(page, 'start_tracking', { deadline: '2026-10-01' });
  await update(page, 'reject', { source: 'synthetic_reply', note: 'Fixture seller refuses the requested remedy', evidence: 'FIXTURE-REFUSAL-1' });
  await expect(page.getByTestId('case-status')).toHaveText('Rejected');
  await screenshot(page, 'refusal');
  await update(page, 'reopen', { deadline: '2026-10-10', note: 'Household has new fixture evidence to review' });
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  const s = await savedState(request, token);
  expect(s.cases[0].timeline.find(e => e.status === 'rejected')?.evidence_reference).toBe('FIXTURE-REFUSAL-1');
  expect(s.dispatch_records).toHaveLength(1);
  expect(s.cases[0].real_recovered_cents).toBe(0);
});

test('lost committed update response requires refresh and exact retry, with no duplicate event', async ({ page, request }) => {
  const { token } = await openCase(page);
  let writes = 0;
  await page.route('**/api/case/update', async route => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await fillUpdate(page, 'start_tracking', { deadline: '2026-10-01' });
  await page.getByTestId('save-case-update').click();
  await expect(page.getByTestId('case-pending-update')).toBeVisible();
  await expect(page.getByTestId('retry-case-update')).toBeDisabled();
  expect((await savedState(request, token)).cases[0].status).toBe('pending_response');
  await page.unroute('**/api/case/update');
  await page.getByRole('button', { name: 'Refresh case state', exact: true }).click();
  await expect(page.getByTestId('retry-case-update')).toBeEnabled();
  const replay = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
  await page.getByTestId('retry-case-update').click();
  expect((await (await replay).json()).replayed).toBe(true);
  await expect(page.getByTestId('case-update-result')).toContainText('Update saved');
  expect((await savedState(request, token)).cases[0].timeline.filter(e => e.action === 'start_tracking')).toHaveLength(1);
  expect(writes).toBe(1);
});

test('real HTTP forgery, request-content tamper, cross-session and stale revision are denied', async ({ page, request }) => {
  const { token } = await openCase(page);
  const c = (await savedState(request, token)).cases[0];
  const body = { case_id: c.id, expected_revision: c.revision, request_id: 'd'.repeat(32), action: 'start_tracking',
    source: 'manual_update', note: 'Protected fixture update', evidence_reference: 'FIXTURE-SECURITY', deadline: '2026-10-01' };
  const second = await (await request.post(`${backend}/api/demo/session`, { data: {} })).json();
  const send = (data: object, capability = token) => request.post(`${backend}/api/case/update`, { headers: bearer(capability), data });
  expect((await send(body, second.token)).status()).toBe(404);
  expect((await send({ ...body, actor: 'verified-merchant' })).status()).toBe(400);
  expect((await send(body, 'tampered')).status()).toBe(401);
  expect((await send(body)).status()).toBe(200);
  expect((await send({ ...body, note: 'Changed content under the same request ID' })).status()).toBe(409);
  await fillUpdate(page, 'start_tracking', { deadline: '2026-10-01' });
  const stale = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
  await page.getByTestId('save-case-update').click();
  expect((await stale).status()).toBe(409);
  await expect(page.getByTestId('case-workspace').getByRole('alert')).toContainText('Case changed');
  await expect(page.getByTestId('case-update-result')).toHaveCount(0);
  expect((await savedState(request, token)).cases[0].revision).toBe(c.revision + 1);
  expect((await savedState(request, second.token)).cases).toEqual([]);
});

test('mobile keyboard journey reaches a non-monetary resolution and saved return state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to household content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await openCase(page);
  await fillUpdate(page, 'start_tracking', { deadline: '2026-10-01' });
  await page.getByTestId('save-case-update').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  await fillUpdate(page, 'resolve', { amount: '0.00', note: 'Fixture repair completed without reimbursement' });
  await page.getByTestId('case-attestation').uncheck();
  await page.getByTestId('case-attestation').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('save-case-update')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('case-status')).toHaveText('Resolved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, 'completed-case-mobile-keyboard');
  await page.reload();
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('case-outcome')).toContainText('€0.00 total (synthetic)');
});

test('case update cannot save an unattested resolution and reports real boundary refusal', async ({ page, request }) => {
  const { token } = await openCase(page);
  await update(page, 'start_tracking', { deadline: '2026-10-01' });
  await fillUpdate(page, 'resolve', { amount: '185.00' });
  await page.route('**/api/case/update', route => route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), attested: false }) }));
  const denied = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
  await page.getByTestId('save-case-update').click();
  expect((await denied).status()).toBe(422);
  await expect(page.getByTestId('case-workspace').getByRole('alert')).toContainText('Attest');
  await expect(page.getByTestId('case-status')).toHaveText('Pending response');
  expect((await savedState(request, token)).cases[0].outcome).toBeNull();
});

test('outcome attestation binds amount, summary, evidence, source and current case revision', async ({ page, request }) => {
  const { token } = await openCase(page);
  await update(page, 'start_tracking', { deadline: '2026-10-01' });
  await fillUpdate(page, 'resolve', { amount: '49.00' });
  await expect(page.getByTestId('save-case-update')).toBeEnabled();
  for (const [field, value] of [['case-amount', '50.00'], ['case-evidence', 'FIXTURE-CHANGED-EVIDENCE'], ['case-note', 'Changed outcome explanation']]) {
    await page.getByTestId(field).fill(value);
    await expect(page.getByTestId('case-attestation')).not.toBeChecked();
    await expect(page.getByTestId('save-case-update')).toBeDisabled();
    await page.getByTestId('case-attestation').check();
    await expect(page.getByTestId('save-case-update')).toBeEnabled();
  }
  await page.getByTestId('case-source').selectOption('synthetic_reply');
  await expect(page.getByTestId('case-attestation')).not.toBeChecked();
  await page.getByTestId('case-attestation').check();
  const c = (await savedState(request, token)).cases[0];
  const changed = await request.post(`${backend}/api/case/update`, { headers: bearer(token), data: {
    case_id: c.id, expected_revision: c.revision, request_id: 'e'.repeat(32), action: 'set_deadline',
    source: 'manual_update', note: 'Another household view revised the deadline', evidence_reference: 'FIXTURE-NEW-REVISION', deadline: '2026-10-05',
  } });
  expect(changed.status()).toBe(200);
  await page.getByTestId('refresh-state').click();
  await expect(page.getByTestId('case-attestation')).not.toBeChecked();
  await expect(page.getByTestId('save-case-update')).toBeDisabled();
  await expect(page.getByTestId('case-amount')).toHaveValue('50.00');
  await expect(page.getByTestId('case-evidence')).toHaveValue('FIXTURE-CHANGED-EVIDENCE');
  await expect(page.getByTestId('case-note')).toHaveValue('Changed outcome explanation');
  await page.getByTestId('case-attestation').check();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/case/update'));
  await page.getByTestId('save-case-update').click();
  expect((await saved).status()).toBe(200);
  const final = (await savedState(request, token)).cases[0];
  expect(final.outcome?.amount_cents).toBe(5000);
  expect(final.outcome?.evidence_reference).toBe('FIXTURE-CHANGED-EVIDENCE');
});
