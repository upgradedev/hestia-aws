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
    setMctsLoading(true); setReadError(null); setMctsData(null);
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
    <div className="space-y-8" data-testid="architecture-claims">
      {/* Topology Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 border border-sky-500/30 p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400 font-bold">
                SYSTEM ARCHITECTURE & MODE INVENTORY
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono border border-sky-500/30">
                SOURCE INVENTORY
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Scoped review, simulation and case history
            </h2>
            <p className="text-xs lg:text-sm text-slate-300 mt-2 max-w-4xl leading-relaxed">
              The source implements reader/writer scopes, deterministic review templates and saved case timelines. Bedrock and SES are disabled; AgentCore and provider feeds are not connected. This inventory does not verify the deployed revision.
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

      {/* Source flow and provider boundaries */}
      <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-[#0a0f18]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Review Pipeline · Source Illustration
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-400">Not a recorded execution trace</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="architecture-pipeline">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-amber-400 uppercase font-bold">Step 1 // Supplied facts</div>
            <div className="text-white font-semibold">Synthetic household records</div>
            <p className="text-[11px] text-slate-400">Manual references are unverified. Bank and mailbox feeds are not connected; OCR is disabled.</p>
            <div className="text-[10px] text-amber-400 pt-1">&bull; Illustrative stage; no measured latency</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-sky-400 uppercase font-bold">Step 2 // Rule comparison</div>
            <div className="text-white font-semibold">Supplied dates and amounts</div>
            <p className="text-[11px] text-slate-400">Python compares supplied dates and amounts. A date match does not establish legal eligibility.</p>
            <div className="text-[10px] text-emerald-400 pt-1">&bull; Eligibility: requires review</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-purple-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-purple-400 uppercase font-bold">Step 3 // Review template</div>
            <div className="text-white font-semibold">Deterministic notice draft</div>
            <p className="text-[11px] text-slate-400">The review template is implemented. Bedrock inference is disabled in the public demo.</p>
            <div className="text-[10px] text-purple-300 pt-1">&bull; Bedrock: disabled</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-emerald-400 uppercase font-bold">Step 4 // Conditional Persistence</div>
            <div className="text-white font-semibold">Exact approval digest</div>
            <p className="text-[11px] text-slate-400">The exact preview digest and simulated outcome share one versioned, session-scoped state record.</p>
            <div className="text-[10px] text-emerald-400 pt-1">&bull; Application approval; not WORM</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-1 text-xs font-mono">
            <div className="text-[10px] text-cyan-400 uppercase font-bold">Step 5 // Case follow-up</div>
            <div className="text-white font-semibold">Manual / synthetic timeline</div>
            <p className="text-[11px] text-slate-400">Actor, time, evidence reference and attested outcomes are recorded. SES is disabled; no email is sent.</p>
            <div className="text-[10px] text-amber-400 pt-1">&bull; Merchant confirmation: unknown</div>
          </div>
        </div>
      </div>

      {/* 4 Architectural Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="architecture-tiers">
        <div className="glass-panel rounded-xl p-4 border border-white/10">
          <div className="text-[10px] font-mono text-amber-400 font-bold uppercase">TIER 01 // INGESTION</div>
          <h4 className="text-sm font-bold text-white mt-1">Inputs and connection status</h4>
          <ul className="text-xs text-slate-400 space-y-1.5 mt-2 font-mono">
            <li>&bull; PSD2 bank feeds: not connected</li>
            <li>&bull; Receipt OCR: disabled</li>
            <li>&bull; Mailbox / retailer sync: not connected</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-sky-500/30 bg-sky-950/10">
          <div className="text-[10px] font-mono text-sky-400 font-bold uppercase">TIER 02 // MODEL BOUNDARY</div>
          <h4 className="text-sm font-bold text-white mt-1">Optional providers</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; Bedrock inference: disabled</li>
            <li>&bull; Managed Guardrails: not connected</li>
            <li>&bull; AgentCore: not connected</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-emerald-500/30 bg-emerald-950/10">
          <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">TIER 03 // PYTHON HANDLERS</div>
          <h4 className="text-sm font-bold text-white mt-1">Implemented review rules</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; Warranty dates: review required</li>
            <li>&bull; Subscription price comparisons</li>
            <li>&bull; Receipt / utility fixture comparisons</li>
          </ul>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-purple-500/30 bg-purple-950/10">
          <div className="text-[10px] font-mono text-purple-400 font-bold uppercase">TIER 04 // SCOPED PERSISTENCE</div>
          <h4 className="text-sm font-bold text-white mt-1">Approval and case state</h4>
          <ul className="text-xs text-slate-300 space-y-1.5 mt-2 font-mono">
            <li>&bull; Reader denies writes; scoped writer</li>
            <li>&bull; Exact approval and conditional writes</li>
            <li>&bull; SES: disabled; simulation only</li>
            <li>&bull; Saved case timeline; not WORM</li>
          </ul>
        </div>
      </div>

      {/* Optional illustration and implemented storage boundary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Explicitly requested toy algorithm */}
        <div className="rounded-2xl p-6 border border-emerald-500/40 bg-[#0a111a] shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                OPTIONAL MCTS TOY ILLUSTRATION
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Fixed assumptions
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Toy assumptions only. The optional endpoint uses fixed priors and simulated rollouts, separate from claim preparation. It has no settlement sample or observed duration. Action names are illustrative, not current legal routes or recommendations.
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
                Toy calculation returned: {mctsData.iterations} iterations. Empirical success rate: unmeasured.
              </span>
            )}
          </div>

          <div className="space-y-2.5" data-testid="mcts-boundary">
            {readError && <p role="alert" className="text-rose-300">{readError}</p>}
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/50 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div>
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>TOY SEARCH: FIXED PRIORS</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Input probabilities are assumptions in the example code.</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-emerald-400 font-bold">No observed rate</span>
                <div className="text-[10px] text-slate-400">Duration unmeasured</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono opacity-80">
              <div>
                <div className="font-bold text-slate-300">LEGAL ROUTE: NOT EVALUATED</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Verify current jurisdiction and facts before choosing any route.</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-amber-400 font-bold">Eligibility unknown</span>
                <div className="text-[10px] text-slate-400">No legal advice</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono opacity-80">
              <div>
                <div className="font-bold text-slate-300">REAL OUTCOME: NOT OBSERVED</div>
                <div className="text-[11px] text-slate-400 mt-0.5">A toy reward is not money received or a merchant response.</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-rose-400 font-bold">Recovery unmeasured</span>
                <div className="text-[10px] text-slate-400">No outcome sample</div>
              </div>
            </div>
          </div>
        </div>

        {/* Conditional state persistence */}
        <div className="rounded-2xl p-6 border border-sky-500/40 bg-[#0a111a] shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
              <span className="text-[11px] font-mono text-sky-400 font-bold uppercase tracking-wider">
                CONDITIONAL WRITES & CASE TIMELINE
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
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">Concurrency Control Engine:</span>
              <span className="text-sky-300 font-bold">S3 If-Match / ETag</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">State Versioning Sequence:</span>
              <span className="text-emerald-400 font-bold">version_seq = Monotonic INT</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">Audit Persistence:</span>
              <span className="text-purple-300 font-bold">Versioned state · not WORM</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">Financial Arithmetic Precision:</span>
              <span className="text-amber-300 font-bold">Integer-cent inputs</span>
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
                setRequestPayload('Use the scoped utility review flow. Sample amounts are synthetic; legal eligibility is unverified.');
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
                setRequestPayload('Receipt OCR is disabled. A manual reference or adapter preparation is not a document scan.');
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
                setRequestPayload('Provider sync is not connected. Manual import preparation does not establish a bank or mailbox connection.');
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
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
                  <span>Requesting configured API...</span>
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
            {!readOnly && <p className="text-xs text-amber-300">Console writes are disabled. Use the scoped Action Center review flow. Provider sync is not connected and actual OCR is disabled.</p>}
            {activeEndpoint === '/api/outbox/status' && !token && <p className="text-xs text-amber-300">Begin an isolated demo session to read its history.</p>}
          </div>

          {/* Response Panel */}
          <div className="space-y-3">
            {activeEndpoint === '/api/simulation/mcts' && <p data-testid="mcts-response-boundary" className="text-xs text-amber-300">Toy response: probabilities, durations and action names are assumptions, not empirical results or current legal routes.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <span>Response Payload · one request, not deployment acceptance</span>
              {latencyMs !== null && (
                <span className="text-emerald-400">Last browser request: {latencyMs} ms</span>
              )}
            </div>
            <pre className="w-full h-40 p-3 rounded-xl bg-[#080b10] border border-white/10 font-mono text-xs text-emerald-300 overflow-y-auto">
              {apiResponse
                ? JSON.stringify(apiResponse, null, 2)
                : '// Click "Dispatch Request" above to view live HTTP API response'}
            </pre>
            <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Status: {apiResponse ? apiResponse.status : 'Awaiting trigger'}</span>
              <span>Configured HTTP API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
