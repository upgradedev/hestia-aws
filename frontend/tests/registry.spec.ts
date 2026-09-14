import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { BackendState, IntakeDraft } from '../src/api';

// HE18 household registry and HE19 paste-a-receipt against the CI API bridge (no model configured).
const backend = 'http://127.0.0.1:8000';
const route = '/api/ingest/sync';
type NavTab = 'Home' | 'Case file' | 'Records' | 'About' | 'Add records';
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const nav = (page: Page, name: NavTab) =>
  page.getByRole('navigation', { name: 'Household navigation' }).getByRole('button', { name, exact: true });
async function state(request: APIRequestContext, token: string): Promise<BackendState> {
  const response = await request.get(`${backend}/api/state`, { headers: headers(token) });
  expect(response.status()).toBe(200);
  return response.json();
}
async function launch(page: Page): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('launch-cockpit')).toHaveText(/Start with the sample household/);
  const creating = page.waitForResponse(r => r.url().endsWith('/api/demo/session') && r.request().method() === 'POST');
  await page.getByTestId('launch-cockpit').click();
  const response = await creating;
  expect(response.status()).toBe(201);
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  return (await response.json()).token as string;
}
async function resume(page: Page) {
  await page.reload();
  await expect(page.getByTestId('launch-cockpit')).toHaveText(/Continue your household case/);
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
}
async function check(page: Page): Promise<IntakeDraft> {
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-review').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  return (await response.json()).intake as IntakeDraft;
}
async function checkAndSave(page: Page) {
  // First click stages the facts, the second reviews the exact change; then consent and commit.
  const staged = await check(page);
  expect(staged.status).toBe('staged');
  const reviewed = await check(page);
  expect(reviewed.review?.changes[0].status).toBe('ready');
  await expect(page.getByTestId('intake-changes')).toContainText('ready');
  await page.getByTestId('intake-consent').check();
  const pending = page.waitForResponse(r => r.url().endsWith(route));
  await page.getByTestId('intake-commit').click();
  expect((await pending).status()).toBe(200);
  await expect(page.getByTestId('intake-result')).toContainText('Saved: 1 changes');
  return reviewed;
}
const dialog = (page: Page) => page.getByRole('dialog');

test('a household adds its own appliance with links, reports its repair, approves the notice and keeps it all after reload', async ({ page, request }) => {
  const token = await launch(page);
  await expect(page.getByTestId('start-here')).toBeVisible();
  await page.getByTestId('start-appliance').click();
  await expect(dialog(page)).toContainText('Add an appliance you own');
  await expect(dialog(page).getByTestId('registry-tab-appliance')).toHaveAttribute('aria-selected', 'true');
  const form = page.getByTestId('intake-simple-form');
  await form.getByLabel('Appliance ID', { exact: true }).fill('fridge-kitchen');
  await form.getByLabel('What is it?', { exact: true }).fill('Fridge freezer');
  await form.getByLabel('Brand (optional)', { exact: true }).fill('Liebherr');
  await form.getByLabel('Model number (optional)', { exact: true }).fill('CNsdd 5223');
  await form.getByLabel('Purchase date', { exact: true }).fill('2025-11-02');
  await form.getByLabel('Price paid (EUR, optional)', { exact: true }).fill('899,00');
  await form.getByLabel('Receipt or order reference', { exact: true }).fill('paper receipt 2 Nov 2025');
  await form.getByLabel('Seller', { exact: true }).fill('Local Store');
  // The seller email is required because the notice goes to it.
  await page.getByTestId('intake-review').click();
  await expect(dialog(page).getByRole('alert')).toContainText('seller email');
  await form.getByLabel('Seller email (for the notice)', { exact: true }).fill('service@localstore.example');
  await form.locator('summary', { hasText: 'Links' }).click();
  await form.getByLabel('Manual link (PDF or page)', { exact: true }).fill('https://example.com/cnsdd-5223-manual.pdf');
  const mutations: unknown[] = [];
  page.on('request', r => { if (r.url().endsWith(route) && r.method() === 'POST') mutations.push(r.postDataJSON()); });
  const reviewed = await checkAndSave(page);
  expect(mutations[0]).toMatchObject({ operation: 'stage', records: [{
    kind: 'appliance', appliance_id: 'fridge-kitchen', item_name: 'Fridge freezer', brand: 'Liebherr', model_number: 'CNsdd 5223',
    purchase_date: '2025-11-02', purchase_price_cents: 89900, receipt_reference: 'paper receipt 2 Nov 2025', seller_name: 'Local Store',
    seller_email: 'service@localstore.example', statutory_months: 24, commercial_months: 0, manual_url: 'https://example.com/cnsdd-5223-manual.pdf',
  }] });
  expect(reviewed.review?.changes[0]).toMatchObject({ collection: 'appliances', record_id: 'fridge-kitchen', before: null });
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('start-here')).toContainText('1 appliance added by you');

  // The catalogue shows the facts, the saved manual link and honest search links for the rest.
  await nav(page, 'Records').click();
  const card = page.getByTestId('appliance-fridge-kitchen');
  await expect(card.getByRole('heading', { name: 'Fridge freezer', exact: true })).toBeVisible();
  await expect(card).toContainText('Liebherr · CNsdd 5223');
  await expect(card).toContainText('Added by you');
  await expect(card).toContainText('€899.00');
  await expect(card.getByTestId('manual-fridge-kitchen')).toHaveAttribute('href', 'https://example.com/cnsdd-5223-manual.pdf');
  await expect(card.getByTestId('product-fridge-kitchen-search')).toHaveAttribute('href', /duckduckgo\.com\/\?q=Liebherr/);
  await expect(card.getByTestId('quickstart-fridge-kitchen-search')).toHaveAttribute('href', /quick%20start/);
  await expect(card.getByTestId('review-appliance-fridge-kitchen')).toHaveCount(0);
  const saved = await state(request, token);
  expect(saved.appliances.find(a => a.id === 'fridge-kitchen')).toMatchObject({
    item_name: 'Fridge freezer', brand: 'Liebherr', has_repair_claim: false, claim_status: 'none', manual_url: 'https://example.com/cnsdd-5223-manual.pdf', source: 'household_registry',
  });
  expect(saved.summary.real_recovered_cents).toBe(0);

  // Report the repair from the catalogue card; it is preselected in the form.
  await card.getByTestId('report-repair-fridge-kitchen').click();
  await expect(dialog(page)).toContainText('Report what broke');
  await expect(page.getByTestId('repair-appliance')).toHaveValue('fridge-kitchen');
  const repair = page.getByTestId('intake-simple-form');
  await repair.getByLabel('Repair date', { exact: true }).fill('2026-09-10');
  await repair.getByLabel('Repair cost (EUR)', { exact: true }).fill('120');
  await repair.getByLabel('What broke?', { exact: true }).fill('Compressor stopped, technician replaced it');
  const repairReview = await checkAndSave(page);
  expect(repairReview.review?.changes[0]).toMatchObject({ collection: 'appliances', record_id: 'fridge-kitchen' });
  expect(repairReview.review?.changes[0].after).toMatchObject({ has_repair_claim: true, repair_amount_cents: 12000, claim_status: 'open' });
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
  await expect(card.getByTestId('repair-cost-fridge-kitchen')).toContainText('€120.00 recorded repair cost');
  await expect(card.getByTestId('report-repair-fridge-kitchen')).toHaveCount(0);

  // Home now queues the household's own repair next to the sample one, and the notice uses its facts.
  await nav(page, 'Home').click();
  await expect(page.getByTestId('alert-warranty')).toContainText('Bosch Series 6 Washing Machine');
  await expect(page.getByTestId('alert-warranty-fridge-kitchen')).toContainText('Fridge freezer');
  await expect(page.getByTestId('alert-warranty-fridge-kitchen')).toContainText('€120.00 recorded');
  const prepared = page.waitForResponse(r => r.url().endsWith('/api/action/claim/prepare'));
  await page.getByTestId('review-claim-fridge-kitchen').click();
  expect((await prepared).status()).toBe(200);
  await expect(page.getByTestId('notice-recipient')).toHaveText('service@localstore.example');
  await expect(page.getByTestId('notice-amount')).toHaveText('120.00 EUR');
  await expect(page.getByTestId('server-notice')).toContainText('Compressor stopped');
  await expect(page.getByTestId('server-notice')).toContainText('paper receipt 2 Nov 2025');
  const approving = page.waitForResponse(r => r.url().endsWith('/api/action/claim'));
  await page.getByTestId('approve-claim').click();
  expect((await approving).status()).toBe(200);
  await expect(page.getByTestId('claim-result')).toContainText('No email sent');
  await page.getByTestId('open-persisted-case').click();
  await expect(page.getByTestId('case-workspace')).toContainText('Fridge freezer');
  await expect(page.getByTestId('case-status')).toHaveText('Authorized');

  // Reload: the appliance, its links, the repair and the case file are still there.
  await resume(page);
  await nav(page, 'Records').click();
  await expect(page.getByTestId('appliance-fridge-kitchen').getByTestId('manual-fridge-kitchen')).toHaveAttribute('href', 'https://example.com/cnsdd-5223-manual.pdf');
  await expect(page.getByTestId('appliance-fridge-kitchen')).toContainText('Case authorized');
  await expect(page.getByTestId('review-appliance-fridge-kitchen')).toHaveText('Open the saved case file');
  const after = await state(request, token);
  expect(after.cases.some(c => c.item_id === 'fridge-kitchen' && c.status === 'authorized')).toBe(true);
  expect(after.dispatch_records).toHaveLength(1);
  expect(after.summary.real_recovered_cents).toBe(0);
  await test.info().attach('household-registry-catalogue', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('editing an appliance keeps its identity and a second repair is refused while the case file is open', async ({ page, request }) => {
  const token = await launch(page);
  await nav(page, 'Records').click();
  await page.getByTestId('edit-appliance-app-002').click();
  await expect(dialog(page)).toContainText('Correct the details of Sony Bravia 55 OLED TV');
  const form = page.getByTestId('intake-simple-form');
  await expect(form.getByLabel('Appliance ID', { exact: true })).toHaveValue('app-002');
  await expect(form.getByLabel('Seller email (for the notice)', { exact: true })).toHaveValue('warranty@plaka-tv-audio.example.gr');
  await form.locator('summary', { hasText: 'Links' }).click();
  await form.getByLabel('Quick start link', { exact: true }).fill('not a link');
  await page.getByTestId('intake-review').click();
  await expect(dialog(page).getByRole('alert')).toContainText('Links must start with http:// or https://');
  await form.getByLabel('Quick start link', { exact: true }).fill('https://example.com/bravia-quickstart');
  const reviewed = await checkAndSave(page);
  expect(reviewed.review?.changes[0]).toMatchObject({ collection: 'appliances', record_id: 'app-002' });
  expect(reviewed.review?.changes[0].before).toMatchObject({ item_name: 'Sony Bravia 55 OLED TV' });
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
  await expect(page.getByTestId('quickstart-app-002')).toHaveAttribute('href', 'https://example.com/bravia-quickstart');
  const saved = await state(request, token);
  expect(saved.appliances).toHaveLength(3);
  expect(saved.appliances.find(a => a.id === 'app-002')).toMatchObject({ quickstart_url: 'https://example.com/bravia-quickstart', purchase_price_cents: 149900, has_repair_claim: false });

  // The sample washing machine already has an open repair: no second report is offered, and the API refuses one.
  await expect(page.getByTestId('report-repair-app-001')).toHaveCount(0);
  await page.getByTestId('report-repair-app-002').click();
  await expect(page.getByTestId('repair-appliance')).toHaveValue('app-002');
  await expect(page.getByTestId('repair-appliance').locator('option', { hasText: 'Bosch' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
  const staged = await request.post(`${backend}${route}`, { headers: headers(token), data: { operation: 'stage', records: [{ kind: 'repair', appliance_id: 'app-001', repair_date: '2026-09-11', repair_amount_cents: 500, repair_issue: 'Second fault' }] } });
  expect(staged.status()).toBe(200);
  const intake = (await staged.json()).intake as IntakeDraft;
  const review = await request.post(`${backend}${route}`, { headers: headers(token), data: { operation: 'review', intake_id: intake.id, records: intake.records } });
  expect(review.status()).toBe(200);
  expect((await review.json()).intake.review.changes[0]).toMatchObject({ status: 'error' });
  expect((await state(request, token)).appliances.find(a => a.id === 'app-001')?.repair_amount_cents).toBe(18500);
});

test('pasting a receipt fails closed without a model and never saves anything by itself', async ({ page, request }) => {
  const token = await launch(page);
  await page.getByTestId('start-paste').click();
  await expect(dialog(page)).toContainText('Paste the text of a receipt');
  await expect(page.getByTestId('paste-unavailable')).toContainText('The model is not configured');
  await page.getByTestId('paste-text').fill('Order 4711 confirmed. Liebherr fridge freezer EUR 899.00, delivered 2 November 2025.');
  await expect(page.getByTestId('paste-read')).toBeDisabled();
  const refused = await request.post(`${backend}/api/agent/extract`, { headers: headers(token), data: { text: 'Order 4711 confirmed' } });
  expect(refused.status()).toBe(503);
  expect((await refused.json()).message).toContain('not configured');
  expect(await request.post(`${backend}/api/agent/extract`, { data: { text: 'x' } }).then(r => r.status())).toBe(401);
  const before = await state(request, token);
  expect(before.agent_extracts).toBe(0);
  expect(Object.keys(before.intakes ?? {})).toHaveLength(0);
  // The manual path is one click away from the same dialog.
  await dialog(page).getByTestId('registry-tab-appliance').click();
  await expect(page.getByTestId('intake-simple-form')).toContainText('Appliance details');
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
});

test('a model proposal from pasted text lands in the review form with the missing seller email left blank', async ({ page, request }) => {
  const token = await launch(page);
  await page.route('**/healthz', async r => {
    const response = await r.fetch();
    const health = await response.json();
    await r.fulfill({ response, json: { ...health, live_model: true, model_id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', agent: { ...health.agent, extract_session_cap: 3 } } });
  });
  const current = await state(request, token);
  const intake = {
    id: 'intake-' + 'a'.repeat(32), input_sha256: 'b'.repeat(64), byte_count: 71, mime_type: 'text/plain', source: 'model_text_extraction',
    route, status: 'staged', created_at: new Date().toISOString(), review: null, ocr_status: 'model_text', confidence_score: null,
    model_id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', usage: { input_tokens: 500, output_tokens: 90 }, duration_ms: 1800,
    message: 'Proposed by the model from the pasted text. Review and correct every fact before importing; nothing is verified.',
    records: [{ kind: 'appliance', appliance_id: 'liebherr-fridge', item_name: 'Liebherr CNsdd 5223 fridge freezer', brand: 'Liebherr', purchase_date: '2025-11-02', purchase_price_cents: 89900, seller_name: 'Local Store', receipt_reference: 'Order 4711' }],
  };
  await page.route('**/api/agent/extract', r => r.fulfill({ status: 200, contentType: 'application/json', json: {
    status: 'simulated', replayed: false, intake, state: { ...current, intakes: { [intake.id]: intake }, agent_extracts: 1 },
  } }));
  await nav(page, 'Home').click();
  await page.getByTestId('start-paste').click();
  await expect(page.getByTestId('paste-budget')).toContainText('3 of 3 text readings left');
  await page.getByTestId('paste-hint').selectOption('order');
  await page.getByTestId('paste-text').fill('Order 4711 confirmed\nLiebherr CNsdd 5223 fridge freezer, EUR 899.00\nDelivered 2 November 2025\nLocal Store');
  const posted = page.waitForRequest(r => r.url().endsWith('/api/agent/extract'));
  await page.getByTestId('paste-read').click();
  expect((await posted).postDataJSON()).toEqual({ text: 'Order 4711 confirmed\nLiebherr CNsdd 5223 fridge freezer, EUR 899.00\nDelivered 2 November 2025\nLocal Store', hint: 'order' });
  await expect(dialog(page)).toContainText('Check what Hestia read');
  await expect(page.getByTestId('intake-provenance')).toContainText('Proposed by eu.anthropic.claude-haiku-4-5-20251001-v1:0 from pasted text');
  const form = page.getByTestId('intake-simple-form');
  await expect(form.getByLabel('Appliance ID', { exact: true })).toHaveValue('liebherr-fridge');
  await expect(form.getByLabel('What is it?', { exact: true })).toHaveValue('Liebherr CNsdd 5223 fridge freezer');
  await expect(form.getByLabel('Price paid (EUR, optional)', { exact: true })).toHaveValue('899.00');
  await expect(form.getByLabel('Seller email (for the notice)', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('intake-result')).toHaveCount(0);
  // Nothing reached the real server: the proposal is staged for review, never saved on its own.
  const after = await state(request, token);
  expect(after.appliances.some(a => a.id === 'liebherr-fridge')).toBe(false);
  expect(after.agent_extracts).toBe(0);
});

test('the landing page explains the three moments and the top navigation opens the add-records dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('how-you-use-it')).toContainText('Report the repair, approve the letter');
  await expect(page.getByTestId('how-you-use-it')).toContainText('Paste the order email, or type the receipt');
  await expect(page.getByTestId('how-you-use-it')).toContainText('you add records yourself');
  await launch(page);
  await nav(page, 'Add records').click();
  await expect(dialog(page).getByTestId('registry-tab-appliance')).toHaveAttribute('aria-selected', 'true');
  await dialog(page).getByTestId('registry-tab-file').click();
  await expect(page.getByTestId('intake-file')).toBeVisible();
  await expect(dialog(page)).toContainText('Mailbox and bank sync are not connected');
  await page.getByRole('button', { name: 'Close add records', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});
