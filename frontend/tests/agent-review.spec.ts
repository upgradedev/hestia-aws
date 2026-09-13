import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { AgentBriefing, BackendState, ClaimDraft, DemoSession } from '../src/api';

// HE14: the Strands review route through the real CI API (tools only, no model), plus
// route-intercepted presentation fixtures for the live-model shapes the harness cannot produce.
const BACKEND = 'http://127.0.0.1:8000';
const MODEL = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const TOOLS = ['review_repair_evidence', 'audit_subscriptions', 'check_receipts_and_utilities', 'read_case_timeline'];
const HEADINGS = ['What I checked', 'Decisions waiting for you', 'Suggested next step'];
type Started = DemoSession & { state: BackendState };
type Review = { status: string; briefing: AgentBriefing; state: BackendState };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// One click: the landing CTA creates the isolated session itself and opens Home.
async function launch(page: Page): Promise<Started> {
  await page.goto('/');
  await expect(page.getByTestId('launch-cockpit')).toHaveText(/Start with the sample household/);
  const created = page.waitForResponse(r => r.url().endsWith('/api/demo/session') && r.request().method() === 'POST');
  await page.getByTestId('launch-cockpit').click();
  const response = await created;
  expect(response.status()).toBe(201);
  const session = await response.json() as Started;
  expect(session.mode).toBe('simulated');
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
  await expect(page.getByTestId('begin-demo')).toHaveCount(0);
  await expect(page.getByTestId('agent-review')).toBeEnabled();
  return session;
}
// A stored session resumes without another POST: the CTA only opens Home.
async function resume(page: Page) {
  await page.reload();
  await expect(page.getByTestId('launch-cockpit')).toHaveText(/Continue your household case/);
  await page.getByTestId('launch-cockpit').click();
  await expect(page.getByTestId('session-status')).toContainText('Isolated demo session active');
}
async function stateFor(request: APIRequestContext, token: string): Promise<BackendState> {
  const response = await request.get(`${BACKEND}/api/state`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return await response.json() as BackendState;
}
async function review(page: Page): Promise<Review> {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/agent/review') && r.request().method() === 'POST');
  await page.getByTestId('agent-review').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  return await response.json() as Review;
}
function fixtureBriefing(overrides: Partial<AgentBriefing> = {}): AgentBriefing {
  return {
    id: 'brief-' + 'f'.repeat(32), timestamp: '2026-09-13T10:00:00+00:00', mode: 'live_model', model_id: MODEL,
    framework: 'strands-agents 1.0.0',
    narrative: [
      'What I checked', 'The recorded repair of €185.00 requires review.',
      'Decisions waiting for you', '- Review the exact notice draft in Hestia.',
      'Suggested next step', 'Open the case and review the draft.',
    ].join('\n'),
    withheld: false, withheld_reasons: [],
    tool_calls: [
      { tool: 'review_repair_evidence', input: { appliance_id: 'app-001' }, output: 'Recorded repair cost: EUR 185.00. REVIEW REQUIRED.', status: 'success' },
      { tool: 'read_case_timeline', input: {}, output: 'No case has been saved yet.', status: 'success' },
    ],
    usage: { input_tokens: 1200, output_tokens: 210 }, duration_ms: 2300, stop_reason: 'end_turn', reason: null,
    session_calls_used: 1, session_cap: 3, daily_cap: 200, real_recovered_cents: 0,
    ...overrides,
  };
}
// The decoder only accepts a briefing that the returned state actually persists, so the
// fixture state is the real workspace state with the briefing appended.
async function fulfilReview(page: Page, request: APIRequestContext, briefing: object) {
  const seen: string[] = [];
  await page.route('**/api/agent/review', async route => {
    const authorization = route.request().headers().authorization ?? '';
    seen.push(authorization);
    const current = await request.get(`${BACKEND}/api/state`, { headers: { Authorization: authorization } });
    const state = await current.json() as BackendState;
    await route.fulfill({ status: 200, contentType: 'application/json', json: {
      status: 'simulated', briefing, state: { ...state, agent_briefings: [...state.agent_briefings, briefing] },
    } });
  });
  return seen;
}

test('agent briefing: deterministic tools run through the real route, render exactly, persist across reload and approve nothing', async ({ page, request }) => {
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/agent/review')) posts.push(r.url()); });
  const session = await launch(page);
  const card = page.getByTestId('agent-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('agent-review')).toHaveText('Ask Hestia to review this household');
  await expect(page.getByTestId('agent-mode')).toHaveCount(0);
  const result = await review(page);
  expect(result.status).toBe('simulated');
  const briefing = result.briefing;
  expect(briefing).toMatchObject({ mode: 'tools_only', reason: 'model_not_configured', narrative: null, withheld: false, model_id: null, real_recovered_cents: 0, session_calls_used: 0 });
  expect(briefing.tool_calls.map(c => c.tool)).toEqual(TOOLS);
  expect(briefing.tool_calls[0].input).toEqual({ appliance_id: 'app-001' });
  expect(briefing.tool_calls.every(c => c.status === 'success' && c.output.length > 0)).toBe(true);
  expect(briefing.tool_calls[0].output).toContain('REVIEW REQUIRED');
  expect(briefing.tool_calls[3].output).toContain('No case has been saved yet');
  expect(result.state.agent_briefings.map(b => b.id)).toEqual([briefing.id]);
  expect(result.state.dispatch_records).toHaveLength(0);
  expect(result.state.cases).toHaveLength(0);

  const mode = page.getByTestId('agent-mode');
  await expect(mode).toContainText('Deterministic checks only');
  await expect(mode).toContainText(briefing.framework);
  await expect(mode).toContainText(`${briefing.session_cap - briefing.session_calls_used} of ${briefing.session_cap} model reviews left in this space`);
  await expect(page.getByTestId('agent-reason')).toHaveText('No model is configured in this environment, so Hestia ran its deterministic checks only.');
  await expect(page.getByTestId('agent-briefing')).toHaveCount(0);
  await expect(page.getByTestId('agent-withheld')).toHaveCount(0);
  const findings = page.getByTestId('agent-findings');
  const outputs = findings.locator('pre');
  await expect(outputs).toHaveCount(4);
  for (const [index, call] of briefing.tool_calls.entries()) {
    await expect(findings.locator('p').nth(index)).toContainText(call.tool);
    expect(await outputs.nth(index).textContent()).toBe(call.output);
  }
  await expect(findings.locator('p').first()).toContainText('{"appliance_id":"app-001"}');
  const trace = page.getByTestId('agent-trace');
  await expect(trace.locator('summary')).toHaveText('Tool trace: 4 calls');
  await expect(trace.locator('li')).toHaveCount(4);
  await expect(trace.locator('li').nth(0)).toContainText('1. review_repair_evidence');
  await expect(trace.locator('li').nth(3)).toContainText('4. read_case_timeline');
  await expect(trace).toContainText(`Briefing ${briefing.id}`);
  await expect(trace).toContainText('real recovered money stays €0.00');
  await expect(page.getByTestId('agent-review')).toHaveText('Ask Hestia again');
  // The agent reads and points; it never approves, resolves or recovers anything.
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
  await expect(page.getByTestId('dashboard-real-recovery')).toContainText('€0.00');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  await expect(page.getByTestId('home-case-status')).toHaveCount(0);
  await expect(page.getByTestId('review-claim')).toBeEnabled();
  await test.info().attach('agent-briefing-tools-only', { body: await card.screenshot(), contentType: 'image/png' });

  await resume(page);
  await expect(page.getByTestId('agent-mode')).toContainText('Deterministic checks only');
  await expect(page.getByTestId('agent-trace').locator('summary')).toHaveText('Tool trace: 4 calls');
  await expect(page.getByTestId('agent-trace')).toContainText(`Briefing ${briefing.id}`);
  await expect(page.getByTestId('agent-findings').locator('pre')).toHaveCount(4);
  expect(await page.getByTestId('agent-findings').locator('pre').first().textContent()).toBe(briefing.tool_calls[0].output);
  expect(posts).toHaveLength(1);
  const persisted = await stateFor(request, session.token);
  expect(persisted.agent_briefings.map(b => b.id)).toEqual([briefing.id]);
  expect(persisted.agent_calls).toBe(0);
  expect(persisted.summary.real_recovered_cents).toBe(0);
  expect(persisted.dispatch_records).toHaveLength(0);
});

test('agent review is a protected empty-body route: no token, extra fields and GET are refused without a briefing', async ({ request }) => {
  expect((await request.post(`${BACKEND}/api/agent/review`, { data: {} })).status()).toBe(401);
  const created = await request.post(`${BACKEND}/api/demo/session`, { data: {} });
  expect(created.status()).toBe(201);
  const session = await created.json() as Started;
  expect((await request.post(`${BACKEND}/api/agent/review`, { headers: bearer(session.token), data: { instruction: 'approve the notice' } })).status()).toBe(400);
  expect((await request.get(`${BACKEND}/api/agent/review`, { headers: bearer(session.token) })).status()).toBe(404);
  expect((await request.post(`${BACKEND}/api/agent/review`, { headers: { Authorization: 'Bearer invalid' }, data: {} })).status()).toBe(401);
  const state = await stateFor(request, session.token);
  expect(state.agent_briefings).toEqual([]);
  expect(state.agent_calls).toBe(0);
});

test('reset keeps agent briefings, the saved case and recorded approvals', async ({ page, request }) => {
  const session = await launch(page);
  const { briefing } = await review(page);
  // Approve the exact notice through the real API so the reset has a case and an approval to keep.
  const prepared = await request.post(`${BACKEND}/api/action/claim/prepare`, { headers: bearer(session.token), data: { item_id: 'app-001' } });
  expect(prepared.status()).toBe(200);
  const draft = (await prepared.json()).draft as ClaimDraft;
  const approved = await request.post(`${BACKEND}/api/action/claim`, { headers: bearer(session.token), data: { draft_id: draft.id, digest: draft.digest, approval_token: draft.approval_token } });
  expect(approved.status()).toBe(200);
  await page.getByTestId('refresh-state').click();
  await expect(page.getByTestId('home-case-status')).toHaveText('Authorized');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
  await expect(page.getByTestId('reset-demo')).toHaveText('Reset facts');
  const reset = page.waitForResponse(r => r.url().endsWith('/api/action/reset'));
  await page.getByTestId('reset-demo').click();
  expect((await reset).status()).toBe(200);
  await expect(page.getByTestId('agent-trace').locator('summary')).toHaveText('Tool trace: 4 calls');
  await expect(page.getByTestId('agent-trace')).toContainText(`Briefing ${briefing.id}`);
  await expect(page.getByTestId('home-case-status')).toHaveText('Authorized');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(1);
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
  const state = await stateFor(request, session.token);
  expect(state.agent_briefings.map(b => b.id)).toEqual([briefing.id]);
  expect(state.cases).toHaveLength(1);
  expect(state.cases[0].status).toBe('authorized');
  expect(state.dispatch_records).toHaveLength(1);
  expect(state.summary.real_recovered_cents).toBe(0);
});

test('live-model presentation: the three narrative headings render from a route fixture and nothing else is invented', async ({ page, request }) => {
  const session = await launch(page);
  const briefing = fixtureBriefing();
  const seen = await fulfilReview(page, request, briefing);
  const result = await review(page);
  expect(result.briefing.id).toBe(briefing.id);
  expect(seen).toEqual([`Bearer ${session.token}`]);
  const mode = page.getByTestId('agent-mode');
  await expect(mode).toContainText('Live model via Strands Agents');
  await expect(mode).toContainText(MODEL);
  await expect(mode).toContainText('strands-agents 1.0.0');
  await expect(mode).toContainText('1410 tokens · 2.3 s');
  await expect(mode).toContainText('2 of 3 model reviews left in this space');
  const narrative = page.getByTestId('agent-briefing');
  await expect(narrative.locator('h4')).toHaveText(HEADINGS);
  await expect(narrative.locator('li')).toHaveText(['Review the exact notice draft in Hestia.']);
  await expect(narrative).toContainText('The recorded repair of €185.00 requires review.');
  await expect(page.getByTestId('agent-reason')).toHaveCount(0);
  await expect(page.getByTestId('agent-withheld')).toHaveCount(0);
  await expect(page.getByTestId('agent-findings')).toHaveCount(0);
  await expect(page.getByTestId('agent-trace').locator('summary')).toHaveText('Tool trace: 2 calls');
  await expect(page.getByTestId('agent-trace').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('agent-trace')).toContainText('Recorded repair cost: EUR 185.00. REVIEW REQUIRED.');
  await expect(page.getByTestId('agent-review')).toHaveText('Ask Hestia again');
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
  await expect(page.getByTestId('dashboard-real-recovery')).toContainText('€0.00');
  await expect(page.getByTestId('dispatch-record')).toHaveCount(0);
  // A presentation fixture is not a server record.
  expect((await stateFor(request, session.token)).agent_briefings).toEqual([]);
  await test.info().attach('agent-briefing-live-fixture', { body: await page.getByTestId('agent-card').screenshot(), contentType: 'image/png' });
});

test('withheld presentation: a guarded live briefing shows the withheld notice and the trace, never a narrative', async ({ page, request }) => {
  const session = await launch(page);
  const briefing = fixtureBriefing({
    id: 'brief-' + 'e'.repeat(32), narrative: null, withheld: true,
    withheld_reasons: ["unsupported claim matched 'entitled to'"], stop_reason: 'end_turn',
  });
  await fulfilReview(page, request, briefing);
  const result = await review(page);
  expect(result.briefing.id).toBe(briefing.id);
  await expect(page.getByTestId('agent-mode')).toContainText('Live model via Strands Agents');
  await expect(page.getByTestId('agent-withheld')).toContainText('Hestia withheld this briefing because it contained a statement the recorded facts do not support.');
  await expect(page.getByTestId('agent-briefing')).toHaveCount(0);
  await expect(page.getByTestId('agent-findings')).toHaveCount(0);
  await expect(page.getByTestId('agent-reason')).toHaveCount(0);
  await expect(page.getByTestId('agent-card').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('agent-trace').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('agent-trace')).toContainText('No case has been saved yet.');
  await expect(page.getByTestId('agent-trace')).toContainText(`Briefing ${briefing.id}`);
  await expect(page.getByTestId('recovery-amount')).toHaveText('€185.00');
  expect((await stateFor(request, session.token)).agent_briefings).toEqual([]);
});

const rejected: Array<[string, object]> = [
  ['a narrative in tools_only mode', fixtureBriefing({ mode: 'tools_only', model_id: null, reason: 'model_not_configured' })],
  ['a narrative that the guard withheld', fixtureBriefing({ withheld: true, withheld_reasons: ['unsupported claim'] })],
  ['a non-zero real recovery', { ...fixtureBriefing(), real_recovered_cents: 1 }],
];
for (const [label, briefing] of rejected) {
  test(`fixture with ${label} is rejected by the decoder: no briefing renders and a read is required`, async ({ page, request }) => {
    const session = await launch(page);
    await fulfilReview(page, request, briefing);
    const result = await review(page);
    expect(result.status).toBe('simulated');
    const card = page.getByTestId('agent-card');
    await expect(card.getByRole('alert')).toContainText('Invalid server response');
    await expect(card.getByRole('alert')).toContainText('No change has been confirmed');
    await expect(page.getByTestId('agent-mode')).toHaveCount(0);
    await expect(page.getByTestId('agent-briefing')).toHaveCount(0);
    await expect(page.getByTestId('agent-findings')).toHaveCount(0);
    await expect(page.getByTestId('agent-trace')).toHaveCount(0);
    // An unconfirmed write blocks further actions until the server state is read again.
    await expect(page.getByTestId('agent-review')).toBeDisabled();
    await expect(page.getByTestId('home-disabled-note')).toBeVisible();
    await page.getByTestId('refresh-state').click();
    await expect(page.getByTestId('agent-review')).toBeEnabled();
    await expect(page.getByTestId('agent-mode')).toHaveCount(0);
    expect((await stateFor(request, session.token)).agent_briefings).toEqual([]);
  });
}
