import React, { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';

interface ArchitectureViewProps { token: string; onError: (error: unknown) => void }
export const ArchitectureView: React.FC<ArchitectureViewProps> = ({ token, onError }) => {
  const [activeEndpoint, setActiveEndpoint] = useState<
    '/healthz' | '/api/action/claim' | '/api/action/utility_dispute' | '/api/action/cancel' | '/api/action/reset' | '/api/simulation/mcts' | '/api/receipt/scan' | '/api/ingest/sync' | '/api/outbox/status' | '/api/outbox/dispatch'
  >('/healthz');
  const [requestPayload, setRequestPayload] = useState('');
  const [apiResponse, setApiResponse] = useState<{ status: string; data?: unknown; error?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [mctsData, setMctsData] = useState<Awaited<ReturnType<typeof api.mcts>> | null>(null);
  const [mctsLoading, setMctsLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const readOnly = activeEndpoint === '/healthz' || activeEndpoint === '/api/simulation/mcts' || activeEndpoint === '/api/outbox/status';

  const handleRunMcts = async () => {
    setMctsLoading(true); setReadError(null);
    try { setMctsData(await api.mcts()); }
    catch (error) { setReadError(errorMessage(error)); }
    finally { setMctsLoading(false); }
  };

  const handleTestApi = async () => {
    if (!readOnly || isLoading) return;
    setIsLoading(true); setApiResponse(null);
    const start = performance.now();
    try {
      const data = activeEndpoint === '/healthz' ? await api.health()
        : activeEndpoint === '/api/simulation/mcts' ? await api.mcts()
        : await api.outbox(token);
      setApiResponse({ status: 'Validated response', data });
    } catch (error) {
      setApiResponse({ status: error instanceof ApiError && error.status ? 'HTTP ' + error.status : 'Unconfirmed', error: errorMessage(error) });
      onError(error);
    } finally { setLatencyMs(Math.round(performance.now() - start)); setIsLoading(false); }
  };

  return (
    <div className="space-y-8">
      {/* Topology Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 border border-sky-500/30 p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400 font-bold">
                SYSTEM ARCHITECTURE & AWS BEDROCK SPECIFICATION
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono border border-sky-500/30">
                100% SERVERLESS // EU-WEST-1
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Deterministic Action Groups + Amazon Bedrock AgentCore
            </h2>
            <p className="text-xs lg:text-sm text-slate-300 mt-2 max-w-4xl leading-relaxed">
              Architecture illustration. The public demo uses deterministic review templates in an isolated session. Model inference and email transport are disabled; verified invoice sync and receipt scanning are not enabled.
            </p>
          </div>

          {/* Reset Demo State Trigger */}
          <div className="shrink-0 flex flex-col items-start sm:items-end gap-2">
            <button
              disabled
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Reset Demo State (Amazon S3)</span>
            </button>
            <span className="text-[11px] font-mono text-amber-300">Use the scoped Reset Demo control in the header.</span>
          </div>
        </div>
      </div>

      {/* Visual Strands Agent Execution Trace */}
      <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-[#0a0f18]">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Proposed AWS Pipeline · Architecture Illustration
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-400">Not a recorded execution trace</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-amber-400 uppercase font-bold">Step 1 // Privacy Gate</div>
            <div className="text-white font-semibold">sanitize_pii()</div>
            <p className="text-[11px] text-slate-400">Masks IBANs and payment card numbers before any LLM inference call.</p>
            <div className="text-[10px] text-amber-400 pt-1">&bull; Illustrative stage; no measured latency</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-sky-400 uppercase font-bold">Step 2 // Deterministic Tool</div>
            <div className="text-white font-semibold">check_appliance_warranty()</div>
            <p className="text-[11px] text-slate-400">Python domain model evaluates 24-month horizon under Directive 2019/771.</p>
            <div className="text-[10px] text-emerald-400 pt-1">&bull; Invariant: Month 22 &lt;= 24</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-purple-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-purple-400 uppercase font-bold">Step 3 // Foundation Model</div>
            <div className="text-white font-semibold">Bedrock Haiku Converse</div>
            <p className="text-[11px] text-slate-400">Not enabled in the public demo. Preview uses a deterministic review template.</p>
            <div className="text-[10px] text-purple-300 pt-1">&bull; eu.anthropic.claude-haiku</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-emerald-400 uppercase font-bold">Step 4 // Conditional Persistence</div>
            <div className="text-white font-semibold">SHA-256 S3 Audit Seal</div>
            <p className="text-[11px] text-slate-400">The exact preview digest and simulated outcome share one versioned, session-scoped state record.</p>
            <div className="text-[10px] text-emerald-400 pt-1">&bull; Return-of-Control Proof</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-cyan-400 uppercase font-bold">Step 5 // SES Outbox</div>
            <div className="text-white font-semibold">SES Raw Email Dispatch</div>
            <p className="text-[11px] text-slate-400">SES is disabled in the public demo. Approval records a simulation.</p>
            <div className="text-[10px] text-amber-400 pt-1">&bull; No email sent; delivery unconfirmed</div>
          </div>
        </div>
      </div>

      {/* 4 Architectural Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4 border border-white/10">
          <div className="text-[10px] font-mono text-amber-400 font-bold uppercase">TIER 01 // INGESTION</div>
          <h4 className="text-sm font-bold text-white mt-1">Multi-Channel Feeds</h4>
          <ul className="text-xs text-slate-400 space-y-1.5 mt-2 font-mono">
            <li>&bull; PSD2 Open Banking Card Streams</li>
            <li>&bull; Multimodal Mobile Camera Invoices</li>
            <li>&bull; Retailer E-Invoice Forwarding</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-sky-500/30 bg-sky-950/10">
          <div className="text-[10px] font-mono text-sky-400 font-bold uppercase">TIER 02 // BEDROCK AGENTCORE</div>
          <h4 className="text-sm font-bold text-white mt-1">Orchestrator & Guardrails</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; Claude 3.5 Sonnet / Haiku Supervisor</li>
            <li>&bull; Bedrock Financial Guardrails Filter</li>
            <li>&bull; Strict JSON Schema Parameter Binding</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-emerald-500/30 bg-emerald-950/10">
          <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">TIER 03 // ACTION GROUPS</div>
          <h4 className="text-sm font-bold text-white mt-1">Deterministic Lambdas</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; warranties.py (Directive 2019/771)</li>
            <li>&bull; subscriptions.py (Tier Anomaly)</li>
            <li>&bull; completeness.py (Anti-Join &gt;€50)</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-purple-500/30 bg-purple-950/10">
          <div className="text-[10px] font-mono text-purple-400 font-bold uppercase">TIER 04 // RETURN-OF-CONTROL</div>
          <h4 className="text-sm font-bold text-white mt-1">S3 Vault & SES Outbox</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; Human Consent Gate (EU AI Act Art 14)</li>
            <li>&bull; SHA-256 Dispute Seals on S3</li>
            <li>&bull; Automated AWS SES Raw Dispatch</li>
            <li>&bull; Sealed RFC 5322 EML & Receipts</li>
          </ul>
        </div>
      </div>

      {/* JENSEN HUANG & MARTIN FOWLER ARCHITECTURAL ADDITIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jensen Huang: Agentic Negotiation Simulation & Rollout Engine */}
        <div className="rounded-2xl p-6 border border-emerald-500/40 bg-[#0a111a] shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                AGENTIC MULTI-PATH NEGOTIATION SIMULATION (MCTS)
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Test-Time Compute
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Optional algorithm illustration using synthetic assumptions. It does not run during claim preparation, establish legal eligibility, or predict real settlement rates. Values below are illustrative assumptions only.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              onClick={handleRunMcts}
              disabled={mctsLoading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              {mctsLoading ? (
                <>
                  <div className="w-3 h-3 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin"></div>
                  <span>Running illustration...</span>
                </>
              ) : (
                <>
                  <span>▶ Run MCTS Illustration</span>
                </>
              )}
            </button>
            {mctsData && (
              <span className="text-[11px] font-mono text-emerald-400">
                Illustrative action: {mctsData.optimal_action} ({mctsData.iterations} iterations)
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {readError && <p role="alert" className="text-rose-300">{readError}</p>}
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/50 flex items-center justify-between text-xs font-mono">
              <div>
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>★ PATH A (SELECTED): DIRECT BGB § 437 DEMAND</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Strict statutory lack of conformity with 14-day refund cure</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-emerald-400 font-bold">92% P(Settle)</span>
                <div className="text-[10px] text-slate-400">8d avg</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs font-mono opacity-80">
              <div>
                <div className="font-bold text-slate-300">PATH B: EU ODR ESCALATION</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Cross-border mediation submission under Directive 2013/11/EU</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-amber-400 font-bold">68% P(Settle)</span>
                <div className="text-[10px] text-slate-400">45d avg</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs font-mono opacity-80">
              <div>
                <div className="font-bold text-slate-300">PATH C: AMICABLE VOUCHER COMPROMISE</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Commercial store voucher compromise without legal assertion</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-rose-400 font-bold">45% P(Settle)</span>
                <div className="text-[10px] text-slate-400">2d avg</div>
              </div>
            </div>
          </div>
        </div>

        {/* Martin Fowler: Optimistic Concurrency Control (OCC) & Event Sourcing */}
        <div className="rounded-2xl p-6 border border-sky-500/40 bg-[#0a111a] shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
              <span className="text-[11px] font-mono text-sky-400 font-bold uppercase tracking-wider">
                OPTIMISTIC CONCURRENCY & EVENT SOURCING (OCC)
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
              version_seq Monotonic
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Concurrent updates use S3 conditional writes. Approval consumption, its outcome and audit entry commit together in one scoped state object. Conflicting updates are rejected. A SHA-256 digest binds the preview; it is not a digital signature or proof of WORM storage.
          </p>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-between">
              <span className="text-slate-400">Concurrency Control Engine:</span>
              <span className="text-sky-300 font-bold">S3 If-Match / ETag Safe</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-between">
              <span className="text-slate-400">State Versioning Sequence:</span>
              <span className="text-emerald-400 font-bold">version_seq = Monotonic INT</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-between">
              <span className="text-slate-400">Audit Persistence:</span>
              <span className="text-purple-300 font-bold">Versioned state · not WORM</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-between">
              <span className="text-slate-400">Financial Arithmetic Precision:</span>
              <span className="text-amber-300 font-bold">Integer Cents (Zero Float Drift)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Interactive API Testing Console */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10 mb-4">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
              READ-ONLY VERIFICATION // API CONSOLE
            </span>
            <h3 className="text-base font-bold text-white">
              Inspect Transport & Scoped Simulation History
            </h3>
          </div>

          {/* Endpoint Switcher */}
          <div className="flex flex-wrap p-0.5 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono gap-1">
            <button
              onClick={() => {
                setActiveEndpoint('/healthz');
                setRequestPayload('');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/healthz'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              GET /healthz
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/action/claim');
                setRequestPayload('Use Action Center to prepare and approve the exact server notice.');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/action/claim'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /claim
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/action/utility_dispute');
                setRequestPayload('{\n  "provider": "Stadtwerke Munich",\n  "excess_cents": 5400,\n  "legal_basis": "AVBWasserV § 18"\n}');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/action/utility_dispute'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /utility_dispute
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/action/cancel');
                setRequestPayload('{\n  "service_name": "Fitness Stream Pro"\n}');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/action/cancel'
                  ? 'bg-purple-500/20 text-purple-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /cancel
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/simulation/mcts');
                setRequestPayload('');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/simulation/mcts'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              GET /mcts
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/receipt/scan');
                setRequestPayload('{\n  "filename": "ikea_receipt.jpg",\n  "file_base64": "JVBERi0xLjQK..."\n}');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/receipt/scan'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /receipt/scan
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/ingest/sync');
                setRequestPayload('{\n  "source": "manual_sync",\n  "count": 4\n}');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/ingest/sync'
                  ? 'bg-sky-500/20 text-sky-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /ingest/sync
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/outbox/status');
                setRequestPayload('');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/outbox/status'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              GET /outbox/status
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/outbox/dispatch');
                setRequestPayload('Direct outbox dispatch is disabled. Use the exact server preview approval flow.');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/outbox/dispatch'
                  ? 'bg-teal-500/20 text-teal-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /outbox/dispatch
            </button>
            <button
              onClick={() => {
                setActiveEndpoint('/api/action/reset');
                setRequestPayload('{}');
              }}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                activeEndpoint === '/api/action/reset'
                  ? 'bg-rose-500/20 text-rose-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              POST /reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Request Panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Request Body (JSON)</span>
              <span className="text-amber-400">HTTP API</span>
            </div>
            <textarea
              value={requestPayload}
              readOnly
              aria-label="Endpoint documentation"
              className="w-full h-40 p-3 rounded-xl bg-[#080b10] border border-white/10 font-mono text-xs text-slate-200 focus:border-amber-400/60 focus:outline-none resize-none disabled:opacity-50"
              placeholder={activeEndpoint === '/healthz' || activeEndpoint === '/api/simulation/mcts' || activeEndpoint === '/api/outbox/status' ? 'No request body needed for this endpoint' : '{\n  "key": "value"\n}'}
            />
            <button
              onClick={handleTestApi}
              disabled={isLoading || !readOnly || (activeEndpoint === '/api/outbox/status' && !token)}
              data-testid="console-request"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Transmitting to AWS API Gateway...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Dispatch Request ({activeEndpoint})</span>
                </>
              )}
            </button>
            {!readOnly && <p className="text-xs text-amber-300">Console writes are disabled. Use the scoped Action Center review flow. Sync and scan remain unavailable.</p>}
            {activeEndpoint === '/api/outbox/status' && !token && <p className="text-xs text-amber-300">Begin an isolated demo session to read its history.</p>}
          </div>

          {/* Response Panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Response Payload</span>
              {latencyMs !== null && (
                <span className="text-emerald-400">Latency: {latencyMs} ms</span>
              )}
            </div>
            <pre className="w-full h-40 p-3 rounded-xl bg-[#080b10] border border-white/10 font-mono text-xs text-emerald-300 overflow-y-auto">
              {apiResponse
                ? JSON.stringify(apiResponse, null, 2)
                : '// Click "Dispatch Request" above to view live HTTP API response'}
            </pre>
            <div className="text-[11px] font-mono text-slate-500 flex items-center justify-between">
              <span>Status: {apiResponse ? apiResponse.status : 'Awaiting trigger'}</span>
              <span>Amazon API Gateway (HTTP API)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
