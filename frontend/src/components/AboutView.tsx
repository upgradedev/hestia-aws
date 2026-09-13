import { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';

interface AboutViewProps { token: string; onError: (error: unknown) => void }
type Endpoint = 'GET /healthz' | 'GET /api/state' | 'GET /outbox/status';
const ENDPOINTS: Endpoint[] = ['GET /healthz', 'GET /api/state', 'GET /outbox/status'];

export function AboutView({ token, onError }: AboutViewProps) {
  const [endpoint, setEndpoint] = useState<Endpoint>('GET /healthz');
  const [output, setOutput] = useState<{ label: string; body: string } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const needsSession = endpoint === 'GET /outbox/status' && !token;
  const run = async () => {
    if (busy || needsSession) return;
    setBusy(true); setOutput(null);
    const started = performance.now();
    try {
      const data = endpoint === 'GET /healthz' ? await api.health() : endpoint === 'GET /api/state' ? await api.state(token || undefined) : await api.outbox(token);
      setOutput({ label: 'Validated response', body: JSON.stringify(data, null, 2) });
    } catch (error) {
      setOutput({ label: error instanceof ApiError && error.status ? `HTTP ${error.status}` : 'Unconfirmed', body: errorMessage(error) });
      onError(error);
    } finally { setLatency(Math.round(performance.now() - started)); setBusy(false); }
  };
  return (
    <div className="space-y-8" data-testid="architecture-claims">
      <div>
        <p className="eyebrow">About Hestia</p>
        <h1 className="title text-2xl sm:text-3xl mt-1">What runs, what does not, and where to check</h1>
        <p className="note mt-2 max-w-3xl">Everything below describes the deployed source. Modes are shown beside the feature they limit, and the read-only console lets you read the same answers the app reads.</p>
      </div>

      <section className="card p-5 sm:p-6 space-y-4" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title" className="text-lg font-bold">One journey, five steps</h2>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm" data-testid="architecture-pipeline">
          <li className="inset p-3 space-y-1"><p className="eyebrow">1 · Records</p><p className="font-semibold">Household facts</p><p className="muted text-xs">Synthetic appliances, subscriptions, transactions and bills in a private S3 workspace. Manual imports with review; no bank, mailbox or OCR feed.</p></li>
          <li className="inset p-3 space-y-1"><p className="eyebrow">2 · Agent review</p><p className="font-semibold">Strands agent on Bedrock</p><p className="muted text-xs">A Strands Agents SDK agent calls four bounded tools and writes a briefing on Claude Haiku 4.5. Per-session and daily limits; unsupported statements are withheld.</p></li>
          <li className="inset p-3 space-y-1"><p className="eyebrow">3 · Exact notice</p><p className="font-semibold">Deterministic draft</p><p className="muted text-xs">Python prepares the letter from recorded facts; the server binds text, recipient, amount and revision. Eligibility: requires review.</p></li>
          <li className="inset p-3 space-y-1"><p className="eyebrow">4 · Your approval</p><p className="font-semibold">Single-use, exact</p><p className="muted text-xs">Approval consumes a one-time token bound to the exact digest. The result is recorded with a conditional write. It is not sent.</p></li>
          <li className="inset p-3 space-y-1"><p className="eyebrow">5 · Case timeline</p><p className="font-semibold">Follow-up to outcome</p><p className="muted text-xs">Replies, silence, evidence and attested outcomes with actor and time. Merchant confirmation: unknown.</p></li>
        </ol>
      </section>

      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="architecture-tiers" aria-label="Modes and connections">
        <div className="card p-4 space-y-2">
          <p className="eyebrow">Inputs</p>
          <ul className="text-sm space-y-1.5">
            <li><span className="chip chip-sage">on</span> Manual import with review</li>
            <li><span className="chip">off</span> PSD2 bank feeds: not connected</li>
            <li><span className="chip">off</span> Mailbox / retailer sync: not connected</li>
            <li><span className="chip">off</span> Receipt OCR: not part of this demo</li>
          </ul>
        </div>
        <div className="card p-4 space-y-2">
          <p className="eyebrow">Agent</p>
          <ul className="text-sm space-y-1.5">
            <li><span className="chip chip-sage">on</span> Strands Agents SDK agent with four tools</li>
            <li><span className="chip chip-sage">on</span> Bedrock inference: Claude Haiku 4.5, bounded</li>
            <li><span className="chip">off</span> Managed Guardrails: not connected</li>
            <li><span className="chip">off</span> AgentCore runtime: not connected</li>
          </ul>
        </div>
        <div className="card p-4 space-y-2">
          <p className="eyebrow">Rules</p>
          <ul className="text-sm space-y-1.5">
            <li><span className="chip chip-sage">on</span> Warranty dates: review required</li>
            <li><span className="chip chip-sage">on</span> Subscription price comparisons</li>
            <li><span className="chip chip-sage">on</span> Receipt and utility comparisons</li>
            <li><span className="chip">off</span> Legal eligibility: never decided here</li>
          </ul>
        </div>
        <div className="card p-4 space-y-2">
          <p className="eyebrow">Storage and sending</p>
          <ul className="text-sm space-y-1.5">
            <li><span className="chip chip-sage">on</span> Reader denies writes; scoped writer</li>
            <li><span className="chip chip-sage">on</span> Exact approval and conditional writes</li>
            <li><span className="chip">off</span> SES: disabled; approvals are recorded only</li>
            <li><span className="chip">off</span> Saved case timeline; not WORM</li>
          </ul>
        </div>
      </section>

      <section className="card p-5 sm:p-6 space-y-4" aria-labelledby="console-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="console-title" className="text-lg font-bold">Read-only console</h2>
          <span className="faint text-xs">Same-origin GET requests from your browser</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ENDPOINTS.map(item => (
            <button key={item} onClick={() => { setEndpoint(item); setOutput(null); }} aria-pressed={endpoint === item} className={`btn btn-sm ${endpoint === item ? 'btn-primary' : 'btn-secondary'} mono`}>{item}</button>
          ))}
        </div>
        {needsSession && <p className="note" data-testid="console-boundary">Begin an isolated demo session to read its history.</p>}
        <p className="note">Console writes are disabled. Actions only happen through the reviewed flows in the app.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button data-testid="console-request" onClick={() => { void run(); }} disabled={busy || needsSession} className="btn btn-secondary btn-sm">{busy ? 'Requesting…' : 'Send request'}</button>
          {latency !== null && <span className="faint text-xs">Last browser request: {latency} ms</span>}
        </div>
        {output && <div className="inset p-3"><p className="text-xs font-semibold mb-2">{output.label}</p><pre className="text-xs mono whitespace-pre-wrap break-words max-h-80 overflow-auto">{output.body}</pre></div>}
      </section>

      <section className="card-muted p-5 text-sm muted space-y-2">
        <p><strong className="text-[var(--ink)]">Source and evidence.</strong> The README lists every mode with its file path and the CI receipts behind it. Independent human UAT is a separate gate and is reported honestly as NOT_RUN until it happens.</p>
        <p>Legal references are general information about Directive (EU) 2019/771; jurisdiction-specific applicability requires separate review. Nothing here is legal advice.</p>
      </section>
    </div>
  );
}
