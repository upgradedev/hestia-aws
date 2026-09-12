import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Existing CI API + Vite harness only. No production, submission/video/Builder
// surfaces, paid providers or independent UAT are covered by these checks.
async function openAdvanced(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('launch-cockpit').click();
  await page.getByText('About / Advanced', { exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByText('About / Advanced', { exact: true }).click();
}

test('architecture details expose modes and preserve the read-only console', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await openAdvanced(page, 'AWS Console');
  const view = page.getByTestId('architecture-claims');
  const tiers = page.getByTestId('architecture-tiers');
  for (const label of [
    'PSD2 bank feeds: not connected', 'Receipt OCR: disabled',
    'Mailbox / retailer sync: not connected', 'Bedrock inference: disabled',
    'Managed Guardrails: not connected', 'AgentCore: not connected',
    'Reader denies writes; scoped writer', 'SES: disabled; simulation only',
    'Saved case timeline; not WORM',
  ]) await expect(tiers.getByText(label, { exact: false })).toBeVisible();
  await expect(page.getByTestId('architecture-pipeline')).toContainText('Merchant confirmation: unknown');
  await expect(view).not.toContainText(/\d+(?:\.\d+)?%\s*(?:P\(Settle\)|Settle)/);
  await expect(view).not.toContainText('EU ODR ESCALATION');
  const writeButtons = view.getByRole('button', { name: /^POST / });
  expect(await writeButtons.count()).toBeGreaterThan(0);
  for (const button of await writeButtons.all()) {
    await button.click();
    await expect(page.getByTestId('console-request')).toBeDisabled();
    await expect(view.getByText(/Console writes are disabled/)).toBeVisible();
  }
  await view.getByRole('button', { name: 'GET /outbox/status', exact: true }).click();
  await expect(page.getByTestId('console-request')).toBeDisabled();
  await expect(view.getByText('Begin an isolated demo session to read its history.')).toBeVisible();
  await view.getByRole('button', { name: 'GET /healthz', exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/healthz'));
  await page.getByTestId('console-request').click();
  const health = await response;
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ mode: 'simulated', live_send: false, live_model: false });
  await expect(view.locator('pre')).toContainText('"live_model": false');
  await expect(view.getByText(/Last browser request: \d+ ms/)).toBeVisible();
  expect(posts).toEqual([]);
});

test('optional MCTS stays a toy after a real response without interpreting action names', async ({ page }) => {
  await openAdvanced(page, 'AWS Console');
  const view = page.getByTestId('architecture-claims');
  await expect(view.getByText(/Toy calculation returned:/)).toHaveCount(0);
  await expect(page.getByTestId('mcts-boundary')).toContainText('No observed rate');
  const pending = page.waitForResponse(r => r.url().endsWith('/api/simulation/mcts'));
  await view.getByRole('button', { name: /Run MCTS Illustration/ }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ mode: 'illustrative', empirical_success_rate: null });
  await expect(view.getByText(/Toy calculation returned:/)).toHaveText(
    `Toy calculation returned: ${body.iterations} iterations. Empirical success rate: unmeasured.`,
  );
  await expect(view).not.toContainText(/\d+(?:\.\d+)?%\s*(?:P\(Settle\)|Settle)/);
  await view.getByRole('button', { name: 'GET /mcts', exact: true }).click();
  await expect(page.getByTestId('mcts-response-boundary')).toContainText(
    'not empirical results or current legal routes',
  );
  const consoleResponse = page.waitForResponse(r => r.url().endsWith('/api/simulation/mcts'));
  await page.getByTestId('console-request').click();
  expect((await consoleResponse).status()).toBe(200);
  await expect(view.locator('pre')).toContainText('"mode": "illustrative"');
  await page.route('**/api/simulation/mcts', route => route.abort('failed'));
  await view.getByRole('button', { name: /Run MCTS Illustration/ }).click();
  await expect(view.getByRole('alert')).toContainText('Request interrupted');
  await expect(view.getByText(/Toy calculation returned:/)).toHaveCount(0);
});

test('console read failures stay unconfirmed with the error visible', async ({ page }) => {
  await openAdvanced(page, 'AWS Console');
  await page.route('**/healthz', route => route.abort('failed'));
  await page.getByTestId('console-request').click();
  const view = page.getByTestId('architecture-claims');
  await expect(view.locator('pre')).toContainText('"status": "Unconfirmed"');
  await expect(view.locator('pre')).toContainText('Request interrupted');
  await expect(view.locator('pre')).not.toContainText('Validated response');
  await expect(page.getByTestId('console-request')).toBeEnabled();
});

test('commercial detail exposes unknown metrics and a non-executable partner sketch', async ({ page }) => {
  await openAdvanced(page, 'Pitch & GTM');
  const view = page.getByTestId('commercial-claims');
  await expect(view.getByRole('heading', { name: 'A household review workflow to validate' })).toBeVisible();
  for (const label of [
    'Market size is unknown.', 'Gross margin: unmeasured', 'API margin: unmeasured',
    'ROI unmeasured', 'Churn effect: unmeasured', 'Paid plan: not offered',
    'No partner endpoint deployed',
  ]) await expect(view.getByText(label, { exact: false })).toBeVisible();
  await expect(view).not.toContainText(/€38\.4B|€4\.2B|€84M|8\.2x|92%|98%|95%/);
  await expect(view.locator('pre').last()).toContainText('"connection": "not_connected"');
  await expect(view.locator('pre').last()).toContainText('"verified_recovery_eur": null');
  await expect(view.getByRole('button')).toHaveCount(0);
});

test('every journey labels synthetic amounts and shows storyboards without completed outcomes', async ({ page }) => {
  await openAdvanced(page, 'User Journeys');
  const view = page.getByTestId('journey-claims');
  await expect(view).toContainText('Independent human UAT is NOT_RUN');
  const selectors = view.getByTestId('journey-selector');
  await expect(selectors).toHaveCount(4);
  for (const selector of await selectors.all()) {
    await expect(selector).toContainText(/Sample €\d/);
    await selector.click();
    await expect(selector).toHaveAttribute('aria-pressed', 'true');
    await expect(view).toContainText('Synthetic scenario:');
    await expect(view).toContainText('Synthetic amount:');
    await expect(view).toContainText('Legal status: review required');
    await expect(page.getByTestId('journey-storyboard')).toContainText('No execution status');
    await expect(view).not.toContainText(
      /Total Solved Value|Zero Hallucinations Guarantee|solved autonomously|100%|delivery receipt/,
    );
  }
  await selectors.filter({ hasText: 'Receipt' }).click();
  await expect(page.getByTestId('journey-storyboard')).toContainText('actual OCR stays disabled');
  await selectors.filter({ hasText: 'Subscription' }).click();
  await view.getByRole('button', { name: 'Open Review in Operations Cockpit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Action Center', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('journey-claims')).toHaveCount(0);
});

test('claims retain the card layout at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [tab, testId] of [
    ['AWS Console', 'architecture-claims'],
    ['Pitch & GTM', 'commercial-claims'],
    ['User Journeys', 'journey-claims'],
  ]) {
    await openAdvanced(page, tab);
    const view = page.getByTestId(testId);
    await expect(view).toBeVisible();
    const bounds = await view.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(await view.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await test.info().attach(`${testId}-mobile`, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
  }
});
