import { defineConfig, devices } from '@playwright/test';

const target = process.env.HESTIA_ACCEPTANCE_URL;
if (process.env.CI !== 'true' || ![
  'http://127.0.0.1:3000',
  'https://drusjukc9d4oc.cloudfront.net',
].includes(target ?? '')) throw new Error('CI-only acceptance requires an allowlisted target');
if (!/^[a-f0-9]{40}$/.test(process.env.HESTIA_APPROVED_SHA ?? '')) {
  throw new Error('An exact approved revision is required before any action');
}
if (!['backend', 'frontend'].includes(process.env.HESTIA_ACCEPTANCE_PHASE ?? '')) {
  throw new Error('Select the backend or paired frontend acceptance phase');
}

export default defineConfig({
  testDir: './acceptance',
  outputDir: './acceptance-results',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'acceptance-report', open: 'never' }]],
  // Capability tokens must not be retained in a network trace or storage-state artifact.
  use: { baseURL: target, trace: 'off', video: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
