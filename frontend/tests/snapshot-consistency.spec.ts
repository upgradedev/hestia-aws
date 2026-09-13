import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type NavTab = 'Home' | 'Case file' | 'Records' | 'About' | 'Add records';
const nav = (page: Page, name: NavTab) =>
  page.getByRole('navigation', { name: 'Household navigation' }).getByRole('button', { name, exact: true });

// Presentation contract fixtures over the read-only preview: no session is created, so the
// fixture is the only source of facts. The session, case, intake and agent suites exercise
// actual server writes and reload.
async function snapshot(page: Page, repair: number | null, missingAmount = false) {
  await page.route('**/api/state', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const state = await response.json();
    state.household_name = 'Fixture household B';
    state.homeowner_name = 'Fixture reviewer';
    state.version_seq = 17;
    state.appliances = [{ ...state.appliances[0], item_name: 'Fixture Dishwasher',
      seller_name: 'Fixture Retailer B', purchase_price_cents: 48237,
      repair_amount_cents: repair, repair_issue: 'Fixture leak', has_repair_claim: true }];
    if (missingAmount) delete state.appliances[0].repair_amount_cents;
    state.subscriptions = [];
    state.utility_bills = [];
    state.outflows = [
      { ...state.outflows[0], id: 'fixture-out-a', merchant: 'Fixture A', amount_cents: 5000, has_receipt: false },
      { ...state.outflows[0], id: 'fixture-out-b', merchant: 'Fixture B', amount_cents: 7200, has_receipt: false },
    ];
    state.cases = [];
    // Intentionally stale aggregate must not override the records displayed below it.
    state.summary.unclaimed_recovery_cents = 18500;
    await route.fulfill({ response, json: state });
  });
  await page.goto('/');
  await nav(page, 'Home').click();
  await expect(page.getByTestId('session-status')).toContainText('Synthetic preview');
  await expect(page.getByTestId('home-disabled-note')).toBeVisible();
}

for (const width of [1280, 375]) {
  test(`HE8 changed snapshot remains consistent across home, case, records and reload at ${width}px`, async ({ page }) => {
    const posts: string[] = [];
    page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
    await page.setViewportSize({ width, height: 900 });
    await snapshot(page, 7391);
    await expect(page.getByTestId('recovery-amount')).toHaveText('€73.91');
    await expect(page.getByTestId('dashboard-real-recovery')).toContainText('€0.00');
    await expect(page.getByTestId('alert-warranty')).toContainText('Fixture Dishwasher');
    await expect(page.getByTestId('alert-warranty')).toContainText('€73.91 recorded');
    await expect(page.getByTestId('review-claim')).toBeDisabled();
    await expect(page.getByText('2 purchases need a receipt reference', { exact: true })).toBeVisible();
    await page.getByTestId('metric-definitions').locator('summary').click();
    await expect(page.getByTestId('metric-definitions')).toContainText('Version 17');
    await nav(page, 'Case file').click();
    await expect(page.getByTestId('reviewed-facts')).toContainText('Fixture Retailer B');
    await expect(page.getByTestId('reviewed-facts')).toContainText('€73.91 (not recovered)');
    await expect(page.getByTestId('prepare-case-notice')).toBeDisabled();
    await nav(page, 'Home').click();
    const records = page.getByTestId('metric-subscriptions');
    await expect(records).toHaveAccessibleName('Review recorded subscriptions');
    await records.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Fixture Dishwasher', exact: true })).toBeVisible();
    await expect(page.getByTestId('repair-cost-app-001')).toContainText('€73.91 recorded repair cost');
    await expect(page.getByTestId('review-appliance-app-001')).toBeDisabled();
    await expect(page.getByText('Purchase-based illustration', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await test.info().attach(`changed-facts-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.reload();
    await nav(page, 'Home').click();
    await expect(page.getByTestId('recovery-amount')).toHaveText('€73.91');
    await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
    expect(posts).toEqual([]);
  });
}

test('HE8 zero repair never becomes the sample amount', async ({ page }) => {
  await snapshot(page, 0);
  await expect(page.getByTestId('recovery-amount')).toHaveText('€0.00');
  await expect(page.getByTestId('alert-warranty')).toContainText('€0.00 recorded');
  await expect(page.getByTestId('review-claim')).toHaveText('Review missing repair amount');
  await expect(page.getByTestId('review-claim')).toBeDisabled();
  await nav(page, 'Records').click();
  await expect(page.getByTestId('repair-cost-app-001')).toContainText('€0.00 recorded repair cost');
  await expect(page.getByTestId('review-appliance-app-001')).toBeDisabled();
  await expect(page.getByText('A documented positive repair amount is required', { exact: false })).toBeVisible();
});

test('HE8 missing amount fails closed instead of fabricating money', async ({ page }) => {
  await snapshot(page, null, true);
  await expect(page.getByTestId('recovery-amount')).toHaveText('Not available');
  await expect(page.getByTestId('alert-warranty')).toContainText('Amount not recorded');
  await expect(page.getByTestId('review-claim')).toBeDisabled();
  await nav(page, 'Case file').click();
  await expect(page.getByTestId('reviewed-facts')).toContainText('Amount not recorded');
  await expect(page.getByTestId('prepare-case-notice')).toBeDisabled();
  await nav(page, 'Records').click();
  await expect(page.getByTestId('repair-cost-app-001')).toContainText('Repair amount not recorded');
  await expect(page.getByTestId('review-appliance-app-001')).toBeDisabled();
});
