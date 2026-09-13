import type { ActiveTab } from '../types';

interface TopBarProps {
  householdName: string; activeTab: ActiveTab; onSelectTab: (tab: ActiveTab) => void;
  sessionStatus: 'loading' | 'preview' | 'active' | 'expired' | 'error'; expiresAt?: number;
  onReset: () => void; resetDisabled: boolean; onOpenImport: () => void;
}

const TABS: ReadonlyArray<readonly [ActiveTab, string]> = [['home', 'Home'], ['case', 'Case'], ['records', 'Records'], ['about', 'About']];

function minutesLeft(expiresAt?: number): string | null {
  if (!expiresAt) return null;
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  return `${minutes} min left`;
}

export function TopBar({ householdName, activeTab, onSelectTab, sessionStatus, expiresAt, onReset, resetDisabled, onOpenImport }: TopBarProps) {
  const left = minutesLeft(expiresAt);
  return (
    <header className="sm:sticky sm:top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:block p-3 bg-[var(--hearth)] text-white">Skip to household content</a>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-2.5 sm:py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button onClick={() => onSelectTab('landing')} className="flex items-center gap-2 text-left" aria-label="Hestia home">
          <span aria-hidden="true" className="w-8 h-8 rounded-full bg-[var(--hearth)] text-white flex items-center justify-center font-black">H</span>
          <span>
            <span className="block text-lg font-extrabold tracking-tight leading-none">Hestia</span>
            <span className="block text-xs muted leading-tight mt-0.5">{householdName}</span>
          </span>
        </button>
        <nav aria-label="Household navigation" className="order-3 w-full sm:order-2 sm:w-auto sm:ml-4 flex flex-wrap items-center gap-1">
          {TABS.map(([tab, label]) => (
            <button key={tab} className="nav-link" aria-current={activeTab === tab ? 'page' : undefined} onClick={() => onSelectTab(tab)}>{label}</button>
          ))}
          <button className="nav-link" onClick={onOpenImport}>Import records</button>
        </nav>
        <div className="order-2 sm:order-3 ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className={`chip list-none ${sessionStatus === 'active' ? 'chip-sage' : sessionStatus === 'expired' || sessionStatus === 'error' ? 'chip-clay' : ''}`} data-testid="demo-chip">
              <span className="dot" aria-hidden="true"></span>
              {sessionStatus === 'active' ? `Demo space${left ? ` · ${left}` : ''}` : sessionStatus === 'expired' ? 'Demo space expired' : 'Demo preview'}
            </summary>
            <div className="absolute right-0 top-full mt-2 z-40 w-72 card p-4 text-sm space-y-2">
              <p className="font-bold">What this demo is</p>
              <p className="muted">A fictional Athens household in a private 30-minute space. Facts are synthetic.</p>
              <p className="muted">Approvals are recorded, never sent. No email, no bank or mailbox connection, no OCR, and no money moves.</p>
              <p className="muted">Hestia's review uses a Strands agent on Amazon Bedrock with a small per-session limit.</p>
            </div>
          </details>
          <button data-testid="reset-demo" disabled={resetDisabled} onClick={onReset} title="Reset sample facts; case and approval history are retained" className="btn btn-quiet btn-sm">Reset facts</button>
        </div>
      </div>
    </header>
  );
}
