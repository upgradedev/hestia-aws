import { useState } from 'react';
import type { AgentBriefing } from '../api';

interface AgentBriefingProps {
  briefings: AgentBriefing[]; enabled: boolean; busy: boolean; error: string | null;
  onReview: () => Promise<void>;
}

const REASONS: Record<string, string> = {
  model_not_configured: 'No model is configured in this environment, so Hestia ran its deterministic checks only.',
  session_cap: 'This demo space has used its model reviews. The deterministic checks still run.',
  daily_cap: "Today's shared model budget is used up. The deterministic checks still run.",
  budget_unconfirmed: 'The model budget could not be confirmed, so no model call was made. The deterministic checks still run.',
  model_timeout: 'The model did not answer in time, so the deterministic checks are shown instead.',
};

function reasonText(reason: string | null): string {
  if (!reason) return '';
  if (reason.startsWith('model_error')) return 'The model call failed, so the deterministic checks are shown instead. Nothing was invented.';
  return REASONS[reason] ?? reason;
}

/** Render the three-section briefing without trusting any markup from the model. */
function Narrative({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const headings = new Set(['what i checked', 'decisions waiting for you', 'suggested next step']);
  return (
    <div className="prose-narrative text-[0.95rem] leading-relaxed" data-testid="agent-briefing">
      {lines.map((line, index) => {
        const bare = line.replace(/^[#*\-\s]+|[:*\s]+$/g, '').toLowerCase();
        if (headings.has(bare)) return <h4 key={index}>{line.replace(/^[#*\-\s]+|[:*\s]+$/g, '')}</h4>;
        if (/^[-*•]\s+/.test(line)) return <ul key={index}><li>{line.replace(/^[-*•]\s+/, '')}</li></ul>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

export function AgentBriefingCard({ briefings, enabled, busy, error, onReview }: AgentBriefingProps) {
  const [showTrace, setShowTrace] = useState(false);
  const latest = briefings.length ? briefings[briefings.length - 1] : null;
  const live = latest?.mode === 'live_model';
  const remaining = latest ? Math.max(0, latest.session_cap - latest.session_calls_used) : null;
  return (
    <section className="card p-5 sm:p-6 space-y-4" aria-labelledby="briefing-title" data-testid="agent-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Hestia's review</p>
          <h2 id="briefing-title" className="text-xl font-bold mt-1">What needs your decision this week</h2>
          <p className="note mt-1">A Strands agent reads the recorded facts with four tools and writes a short briefing. It points; you decide.</p>
        </div>
        <button data-testid="agent-review" className="btn btn-primary" disabled={!enabled || busy} onClick={() => { void onReview(); }}>
          {busy ? 'Hestia is reading the records…' : latest ? 'Ask Hestia again' : 'Ask Hestia to review this household'}
        </button>
      </div>
      {!enabled && !busy && <p className="note">Start the demo space to let Hestia review the records.</p>}
      {error && <p role="alert" className="note-alert">{error}</p>}
      {busy && <p role="status" className="note">Calling the agent's tools and the model. This usually takes a few seconds.</p>}
      {latest && !busy && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="agent-mode">
            <span className={`chip ${live ? 'chip-sage' : 'chip-sky'}`}>{live ? 'Live model via Strands Agents' : 'Deterministic checks only'}</span>
            {latest.model_id && <span className="chip mono">{latest.model_id}</span>}
            <span className="chip">{latest.framework}</span>
            {latest.usage && <span className="chip">{latest.usage.input_tokens + latest.usage.output_tokens} tokens · {(latest.duration_ms / 1000).toFixed(1)} s</span>}
            {remaining !== null && <span className="chip">{remaining} of {latest.session_cap} model reviews left in this space</span>}
          </div>
          {!live && latest.reason && <p className="note" data-testid="agent-reason">{reasonText(latest.reason)}</p>}
          {latest.narrative && <Narrative text={latest.narrative} />}
          {live && latest.withheld && (
            <p role="status" className="note-alert" data-testid="agent-withheld">
              Hestia withheld this briefing because it contained a statement the recorded facts do not support. The tool findings below are unaffected.
            </p>
          )}
          {!latest.narrative && !latest.withheld && (
            <div className="space-y-2" data-testid="agent-findings">
              {latest.tool_calls.map((call, index) => (
                <div key={index} className="inset p-3 text-sm">
                  <p className="font-semibold mono text-xs text-[var(--hearth-strong)]">{call.tool}{Object.keys(call.input).length ? ` ${JSON.stringify(call.input)}` : ''}</p>
                  <pre className="whitespace-pre-wrap break-words mt-1 text-[0.85rem] font-sans">{call.output}</pre>
                </div>
              ))}
            </div>
          )}
          <details open={showTrace} onToggle={event => setShowTrace((event.target as HTMLDetailsElement).open)} className="text-sm" data-testid="agent-trace">
            <summary className="font-semibold">Tool trace: {latest.tool_calls.length} call{latest.tool_calls.length === 1 ? '' : 's'}</summary>
            <ol className="mt-2 space-y-2">
              {latest.tool_calls.map((call, index) => (
                <li key={index} className="inset p-3">
                  <p className="mono text-xs font-semibold">{index + 1}. {call.tool}{Object.keys(call.input).length ? ` ${JSON.stringify(call.input)}` : ''} <span className="faint">· {call.status}</span></p>
                  <pre className="whitespace-pre-wrap break-words mt-1 text-xs muted font-sans">{call.output || 'No output recorded'}</pre>
                </li>
              ))}
            </ol>
            <p className="faint text-xs mt-2">Briefing {latest.id} · {new Date(latest.timestamp).toLocaleString()} · real recovered money stays €0.00</p>
          </details>
        </div>
      )}
    </section>
  );
}
