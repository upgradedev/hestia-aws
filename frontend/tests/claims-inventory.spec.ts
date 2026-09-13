import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Existing CI API + Vite harness only. No production, submission/video/Builder
// surfaces, paid providers or independent UAT are covered by these checks.
const MODE_LABELS = [
  'PSD2 bank feeds: not connected', 'Receipt OCR: not part of this demo',
  'Mailbox / retailer sync: not connected', 'Bedrock inference: Claude Haiku 4.5, bounded',
  'Managed Guardrails: not connected', 'AgentCore runtime: not connected',
  'Reader denies writes; scoped writer', 'SES: disabled; approvals are recorded only',
  'Saved case timeline; not WORM',
];

async function openAbout(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Household navigation' }).getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByTestId('architecture-claims')).toBeVisible();
}

test('about page exposes modes and preserves the read-only console', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await openAbout(page);
  const view = page.getByTestId('architecture-claims');
  const tiers = page.getByTestId('architecture-tiers');
  for (const label of MODE_LABELS) await expect(tiers.getByText(label, { exact: false })).toBeVisible();
  await expect(page.getByTestId('architecture-pipeline')).toContainText('Merchant confirmation: unknown');
  await expect(page.getByTestId('architecture-pipeline')).toContainText('It is not sent.');
  await expect(view.getByRole('button', { name: /^POST / })).toHaveCount(0);
  await expect(view.getByText(/Console writes are disabled/)).toBeVisible();
  await expect(view.getByRole('button', { name: 'GET /healthz', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('console-boundary')).toHaveCount(0);
  await view.getByRole('button', { name: 'GET /outbox/status', exact: true }).click();
  await expect(view.getByRole('button', { name: 'GET /outbox/status', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(view.getByRole('button', { name: 'GET /healthz', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('console-request')).toBeDisabled();
  await expect(page.getByTestId('console-boundary')).toHaveText('Begin an isolated demo session to read its history.');
  await view.getByRole('button', { name: 'GET /healthz', exact: true }).click();
  await expect(page.getByTestId('console-boundary')).toHaveCount(0);
  const response = page.waitForResponse(r => r.url().endsWith('/healthz'));
  await page.getByTestId('console-request').click();
  const health = await response;
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    mode: 'simulated', live_send: false, live_model: false, model_id: null,
    agent: { framework: expect.stringContaining('strands-agents'), session_cap: expect.any(Number), daily_cap: expect.any(Number), max_output_tokens: expect.any(Number) },
  });
  await expect(view.getByText('Validated response', { exact: true })).toBeVisible();
  await expect(view.locator('pre')).toContainText('"live_model": false');
  await expect(view.locator('pre')).toContainText('"model_id": null');
  await expect(view.locator('pre')).toContainText('"live_send": false');
  await expect(view.getByText(/Last browser request: \d+ ms/)).toBeVisible();
  await view.getByRole('button', { name: 'GET /api/state', exact: true }).click();
  await expect(view.locator('pre')).toHaveCount(0);
  const preview = page.waitForResponse(r => r.url().endsWith('/api/state') && r.request().method() === 'GET');
  await page.getByTestId('console-request').click();
  expect((await preview).request().headers().authorization).toBeUndefined();
  await expect(view.locator('pre')).toContainText('"household_name": "Athens Apartment 4B (Urban Household)"');
  await expect(view.locator('pre')).toContainText('"dispatch_records": []');
  await expect(view.locator('pre')).toContainText('"agent_briefings": []');
  expect(posts).toEqual([]);
});

test('console read failures stay unconfirmed with the error visible', async ({ page }) => {
  await openAbout(page);
  await page.route('**/healthz', route => route.abort('failed'));
  await page.getByTestId('console-request').click();
  const view = page.getByTestId('architecture-claims');
  await expect(view.getByText('Unconfirmed', { exact: true })).toBeVisible();
  await expect(view.locator('pre')).toContainText('Request interrupted');
  await expect(view.getByText('Validated response', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('session-panel').getByRole('alert')).toContainText('Request interrupted');
  await expect(view.getByText(/Last browser request: \d+ ms/)).toBeVisible();
  await expect(page.getByTestId('console-request')).toBeEnabled();
});

test('the about page retains the card layout at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openAbout(page);
  const view = page.getByTestId('architecture-claims');
  await expect(view).toBeVisible();
  const bounds = await view.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(await view.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByTestId('architecture-tiers').getByText('Bedrock inference: Claude Haiku 4.5, bounded', { exact: false })).toBeVisible();
  await test.info().attach('architecture-claims-mobile', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
});
