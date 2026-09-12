import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { BackendState, IntakeDraft, IntakeRecord } from '../src/api';

const backend = 'http://127.0.0.1:8000';
const route = '/api/receipt/scan';
const receipt: IntakeRecord = { kind: 'receipt', transaction_id: 'out-001', merchant: 'Leroy Merlin DIY', amount_cents: 8550, date: '2026-09-04', receipt_id: 'DOCUMENT-REF' };
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
async function state(request: APIRequestContext, token: string): Promise<BackendState> {
  const response = await request.get(`${backend}/api/state`, { headers: headers(token) });
  expect(response.status()).toBe(200);
  return response.json();
}
async function open(page: Page) {
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  const creating = page.waitForResponse(r => r.url().endsWith('/api/demo/session'));
  await page.getByTestId('begin-demo').click();
  const session = await (await creating).json();
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  await page.getByRole('button', { name: 'Receipt Options (Scanning Unavailable)', exact: true }).click();
  return session.token as string;
}
async function upload(page: Page, records: IntakeRecord[]) {
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-file').setInputFiles({ name: 'actual-records.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records })) });
  const result = await pending;
  expect(result.status()).toBe(200);
  return (await result.json()).intake as IntakeDraft;
}
async function review(page: Page) {
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-review').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId('intake-consent')).toBeEnabled();
  return (await response.json()).intake as IntakeDraft;
}
async function advanced(page: Page) {
  const details = page.getByTestId('intake-advanced');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await expect(page.getByTestId('intake-records')).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByTestId('intake-consent').check();
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-commit').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId('intake-result')).toContainText('Saved:');
  return (await response.json()).intake as IntakeDraft;
}

test('real JSON bytes, correction, exact review, commit and reload retain receipt provenance', async ({ page, request }) => {
  const token = await open(page);
  const draft = await upload(page, [{ ...receipt, amount_cents: 123 }]);
  await expect(page.getByTestId('intake-provenance')).toContainText(draft.input_sha256);
  expect((await state(request, token)).outflows[0].has_receipt).toBe(false);
  await advanced(page);
  await page.getByTestId('intake-records').fill(JSON.stringify([receipt]));
  const reviewed = await review(page);
  expect(reviewed.review?.original_records[0].amount_cents).toBe(123);
  expect(reviewed.review?.changes[0].before?.has_receipt).toBe(false);
  await expect(page.getByTestId('intake-commit')).toBeDisabled();
  await confirm(page);
  const saved = await state(request, token);
  expect(saved.outflows.find(o => o.id === 'out-001')).toMatchObject({ has_receipt: true, receipt_id: 'DOCUMENT-REF' });
  expect(saved.summary.missing_receipt_cents).toBe(0);
  expect(saved.summary.real_recovered_cents).toBe(0);
  expect(saved.appliances).toHaveLength(3);
  await page.reload();
  await page.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await page.getByTestId('open-intake').click();
  await page.getByTestId('intake-history').selectOption(draft.id);
  await expect(page.getByTestId('intake-result')).toContainText('Saved: 1 changes');
  await expect(page.getByTestId('intake-provenance')).toContainText(draft.input_sha256);
  await test.info().attach('intake-persisted-review', { body: await page.getByRole('dialog').screenshot(), contentType: 'image/png' });
});

test('material edits invalidate consent and stale review cannot commit after another real write', async ({ page, request }) => {
  const token = await open(page);
  await upload(page, [receipt]);
  const reviewed = await review(page);
  await advanced(page);
  for (const changed of [
    { ...receipt, receipt_id: 'NEW-ID' }, { ...receipt, transaction_id: 'out-003' },
    { ...receipt, amount_cents: 0 }, { ...receipt, merchant: 'Other merchant' },
  ]) {
    await page.getByTestId('intake-consent').check();
    await page.getByTestId('intake-records').fill(JSON.stringify([changed]));
    await expect(page.getByTestId('intake-consent')).not.toBeChecked();
    await expect(page.getByTestId('intake-commit')).toBeDisabled();
    await page.getByTestId('intake-records').fill(JSON.stringify([receipt], null, 2));
    await review(page);
  }
  const other = await request.post(`${backend}/api/action/cancel`, { headers: headers(token), data: { service_name: 'sub-001' } });
  expect(other.status()).toBe(200);
  const stale = await request.post(`${backend}${route}`, { headers: headers(token), data: { operation: 'commit', intake_id: reviewed.id, digest: reviewed.review?.digest, confirmed: true } });
  expect(stale.status()).toBe(409);
  expect((await state(request, token)).outflows[0].has_receipt).toBe(false);
  await page.getByTestId('intake-consent').check();
  const rejected = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-commit').click();
  expect((await rejected).status()).toBe(409);
  await expect(page.getByTestId('intake-result')).toHaveCount(0);
  await expect(page.getByTestId('intake-consent')).not.toBeChecked();
});

test('explicit partial batch imports valid rows, keeps duplicates unchanged and exposes failed rows', async ({ page, request }) => {
  const token = await open(page);
  const tx: IntakeRecord = { kind: 'transaction', transaction_id: 'new-tx', merchant: 'Manual shop', amount_cents: 5000, date: '2026-09-12', category: 'Home' };
  await upload(page, [tx, tx, { ...tx, transaction_id: 'bad-tx', amount_cents: 0 }]);
  await review(page);
  await expect(page.getByTestId('intake-changes')).toContainText('positive integer');
  await expect(page.getByTestId('intake-changes')).toContainText('1 to import, 1 unchanged duplicates, 1 errors excluded');
  await confirm(page);
  const saved = await state(request, token);
  expect(saved.outflows.filter(o => o.id === 'new-tx')).toHaveLength(1);
  expect(saved.outflows.some(o => o.id === 'bad-tx')).toBe(false);
  expect(saved.summary.missing_receipt_cents).toBe(13550);
  await expect(page.getByTestId('intake-result')).toContainText('1 rows excluded');
});

test('invalid document bytes do not create drafts; paid OCR is never inferred from the filename', async ({ page, request }) => {
  const token = await open(page);
  const before = await state(request, token);
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-file').setInputFiles({ name: 'store-receipt.png', mimeType: 'image/png', buffer: Buffer.from('IKEA fabricated OCR bait') });
  expect((await pending).status()).toBe(400);
  await expect(page.getByTestId('intake-result')).toHaveCount(0);
  expect(await state(request, token)).toEqual(before);
  await page.getByTestId('intake-file').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(16001) });
  await expect(page.getByRole('dialog')).toContainText('16000 bytes');
  expect(await state(request, token)).toEqual(before);
});

test('lost response after actual import is recovered by reload and exact replay with one link', async ({ page, request }) => {
  const token = await open(page);
  await upload(page, [receipt]);
  const draft = await review(page);
  await page.route(`**${route}`, async interception => {
    if (interception.request().postDataJSON().operation !== 'commit') return interception.continue();
    const response = await interception.fetch();
    expect(response.status()).toBe(200);
    await interception.abort('failed');
  });
  await page.getByTestId('intake-consent').check();
  const failed = page.waitForEvent('requestfailed', { predicate: r => r.url().endsWith(route) });
  await page.getByTestId('intake-commit').click();
  await failed;
  await expect(page.getByTestId('intake-result')).toHaveCount(0);
  const saved = await state(request, token);
  expect(saved.outflows[0].has_receipt).toBe(true);
  const replay = await request.post(`${backend}${route}`, { headers: headers(token), data: { operation: 'commit', intake_id: draft.id, digest: draft.review?.digest, confirmed: true } });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  expect(await state(request, token)).toEqual(saved);
  await page.unroute(`**${route}`);
  await page.reload();
  await page.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await page.getByTestId('open-intake').click();
  await page.getByTestId('intake-history').selectOption(draft.id);
  await expect(page.getByTestId('intake-result')).toContainText('Saved: 1 changes');
});

test('mobile sync import and exact synthetic subscription request persist without cancellation or reduced cost', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const token = await open(page);
  await page.getByRole('button', { name: 'Close receipt options', exact: true }).click();
  await page.getByText('About / Advanced', { exact: true }).click();
  await page.getByRole('button', { name: 'Sync Invoices', exact: true }).click();
  const rows = [{ kind: 'subscription', subscription_id: 'imported-sub', service_name: 'My Imported Plan', monthly_cents: 1750, category: 'Productivity', last_billed: '2026-09-12', is_trial: true, trial_end_date: '2026-09-20' }];
  const staging = page.waitForResponse(r => r.url().endsWith('/api/ingest/sync'));
  await page.getByTestId('intake-file').setInputFiles({ name: 'subscription.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records: rows })) });
  expect((await staging).status()).toBe(200);
  const reviewing = page.waitForResponse(r => r.url().endsWith('/api/ingest/sync'));
  await page.getByTestId('intake-review').click();
  expect((await reviewing).status()).toBe(200);
  await page.getByTestId('intake-consent').check();
  const importing = page.waitForResponse(r => r.url().endsWith('/api/ingest/sync'));
  await page.getByTestId('intake-commit').click();
  expect((await importing).status()).toBe(200);
  await expect(page.getByTestId('intake-result')).toContainText('Saved: 1 changes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close invoice sync', exact: true }).click();
  await page.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  const before = await state(request, token);
  const posted = page.waitForRequest(r => r.url().endsWith('/api/action/cancel'));
  await page.getByTestId('subscription-imported-sub').getByRole('button', { name: 'Simulate Cancellation Request' }).click();
  expect((await posted).postDataJSON()).toEqual({ service_name: 'My Imported Plan', subscription_id: 'imported-sub', expected_monthly_cents: 1750 });
  await expect(page.getByTestId('subscription-imported-sub').getByRole('button', { name: 'Synthetic Request Saved' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await expect(page.getByTestId('subscription-imported-sub').getByRole('button', { name: 'Synthetic Request Saved' })).toBeDisabled();
  const saved = await state(request, token);
  expect(saved.subscriptions.find(s => s.id === 'imported-sub')).toMatchObject({ status: 'expiring_trial', monthly_cents: 1750, cancellation_request: { status: 'synthetic_requested', subscription_id: 'imported-sub', monthly_cents: 1750 } });
  expect(saved.summary.monthly_recurring_cents).toBe(before.summary.monthly_recurring_cents);
  expect(saved.summary.real_recovered_cents).toBe(0);
  await test.info().attach('mobile-intake-synthetic-request', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('simple form converts exact EUR cents, distinguishes missing and zero, and persists only freshly reviewed corrections', async ({ page, request }) => {
  const token = await open(page);
  const form = page.getByTestId('intake-simple-form');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('intake-records')).toBeHidden();
  await form.getByLabel('What are you adding?', { exact: true }).selectOption('transaction');
  await form.getByLabel('Transaction ID', { exact: true }).fill('simple-form-tx');
  await form.getByLabel('Merchant name', { exact: true }).fill('Simple Form Store');
  await form.getByLabel('Transaction date', { exact: true }).fill('2026-09-12');
  await form.getByLabel('Category', { exact: true }).fill('Home');
  const mutations: unknown[] = [];
  page.on('request', r => { if (r.url().endsWith(route) && r.method() === 'POST') mutations.push(r.postDataJSON()); });
  await page.getByTestId('intake-review').click();
  await expect(page.getByRole('dialog')).toContainText('Amount is not provided');
  await form.getByLabel('Amount (EUR)', { exact: true }).fill('0');
  await page.getByTestId('intake-review').click();
  await expect(page.getByRole('dialog')).toContainText('The entered amount is EUR 0.00');
  await form.getByLabel('Amount (EUR)', { exact: true }).fill('50.005');
  await page.getByTestId('intake-review').click();
  await expect(page.getByRole('dialog')).toContainText('Amounts are never rounded');
  expect(mutations).toEqual([]);
  await form.getByLabel('Amount (EUR)', { exact: true }).fill('50,25');
  const staging = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-review').click();
  const stageResponse = await staging;
  expect(stageResponse.status()).toBe(200);
  const draft = (await stageResponse.json()).intake as IntakeDraft;
  expect(draft.records[0].amount_cents).toBe(5025);
  expect(mutations[0]).toMatchObject({ operation: 'stage', records: [{ kind: 'transaction', transaction_id: 'simple-form-tx', merchant: 'Simple Form Store', date: '2026-09-12', amount_cents: 5025, category: 'Home' }] });
  await review(page);
  await page.getByTestId('intake-consent').check();
  await form.getByLabel('Amount (EUR)', { exact: true }).fill('73.91');
  await expect(page.getByTestId('intake-consent')).not.toBeChecked();
  await expect(page.getByTestId('intake-commit')).toBeDisabled();
  expect((await state(request, token)).outflows.some(o => o.id === 'simple-form-tx')).toBe(false);
  const corrected = await review(page);
  expect(corrected.review?.original_records[0].amount_cents).toBe(5025);
  expect(corrected.review?.corrected_records[0].amount_cents).toBe(7391);
  await confirm(page);
  await page.reload();
  await page.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await page.getByTestId('open-intake').click();
  await page.getByTestId('intake-history').selectOption(draft.id);
  await expect(page.getByTestId('intake-result')).toContainText('Saved: 1 changes');
  await expect(page.getByTestId('intake-simple-form').getByLabel('Amount (EUR)', { exact: true })).toHaveValue('73.91');
  await expect(page.getByTestId('intake-records')).toBeHidden();
  const saved = await state(request, token);
  expect(saved.outflows.filter(o => o.id === 'simple-form-tx')).toEqual([expect.objectContaining({ merchant: 'Simple Form Store', amount_cents: 7391, date: '2026-09-12', has_receipt: false })]);
  expect(saved.summary.real_recovered_cents).toBe(0);
  await test.info().attach('simple-form-reviewed-import', { body: await page.getByRole('dialog').screenshot(), contentType: 'image/png' });
});
