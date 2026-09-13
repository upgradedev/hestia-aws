import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { Landing } from './components/Landing';
import { SentinelHome } from './components/SentinelHome';
import { CaseWorkspace } from './components/CaseWorkspace';
import { RecordsView } from './components/RecordsView';
import { AboutView } from './components/AboutView';
import { FormalNoticeModal } from './components/FormalNoticeModal';
import { ReceiptUploadModal } from './components/ReceiptUploadModal';
import { UtilityDisputeModal } from './components/UtilityDisputeModal';
import { RegistryModal } from './components/RegistryModal';
import type { RegistryMode } from './components/RegistryModal';
import type { CaseUpdate } from './cases';
import { api, ApiError, errorMessage } from './api';
import type { ClaimDraft, ExtractHint, IntakeRoute } from './api';
import { mapState } from './stateMapping';
import { useDemoSession } from './useDemoSession';
import type { ActiveTab } from './types';

export function App() {
  const demo = useDemoSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const [selection, setSelection] = useState<string | null>(null);
  const [modal, setModal] = useState<'receipt' | 'utility' | 'registry' | null>(null);
  const [registryMode, setRegistryMode] = useState<RegistryMode>({ tab: 'appliance' });
  const [registryKey, setRegistryKey] = useState(0);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const view = demo.state ? mapState(demo.state) : null;
  const enabled = demo.status === 'active' && !demo.busy;
  const selectedAppliance = view?.appliances.find(a => a.id === selection) ?? null;
  const utilityBill = demo.state?.utility_bills.find(bill => bill.status === 'spike_alert') ?? null;
  const returning = demo.status === 'active';

  const start = async () => {
    if (demo.status === 'active') { setActiveTab('home'); return; }
    setSelection(null);
    if (await demo.begin()) setActiveTab('home');
  };
  const openNotice = (id?: string) => {
    const item = view?.appliances.find(a => a.id === id);
    if (!enabled || !item) {
      demo.reportError(new ApiError('Start or refresh your private copy and select a valid appliance.'));
      return;
    }
    setSelection(item.id);
  };
  const openRegistry = (mode: RegistryMode) => { setRegistryMode(mode); setRegistryKey(k => k + 1); setModal('registry'); };
  const approve = (draft: ClaimDraft) => demo.mutate(async token => {
    if (!selection || draft.item_id !== selection) throw new ApiError('Selection changed. Reopen the notice.');
    // prepare persists a new version; only the backend can validate its current source_version.
    const result = await api.approve(token, draft);
    return { state: result.state, value: result.record };
  });
  const updateCase = (update: CaseUpdate) => demo.mutate(async token => {
    const result = await api.updateCase(token, update);
    return { state: result.state, value: result.case };
  });
  const cancelTrial = (id: string) => demo.mutate(async token => {
    const sub = demo.state?.subscriptions.find(s => s.id === id);
    if (!sub) throw new ApiError('Unknown subscription. Refresh session state.');
    return { state: await api.cancel(token, sub.service_name, sub.id, sub.monthly_cents), value: true };
  });
  const dispute = (provider: string, excessCents: number) => demo.mutate(async token => ({
    state: await api.utility(token, provider, excessCents), value: undefined,
  }));
  const linkReceipt = (id: string, receiptId: string) => demo.mutate(async token => {
    const outflow = demo.state?.outflows.find(o => o.id === id);
    if (!outflow) throw new ApiError('Unknown outflow. Refresh session state.');
    return { state: await api.receipt(token, outflow.merchant, outflow.amount_cents, receiptId, outflow.id), value: undefined };
  });
  const importIntake = (route: IntakeRoute, body: Record<string, unknown>) => demo.mutate(async token => {
    const result = await api.intake(token, route, body);
    return { state: result.state, value: result.intake };
  });
  const extract = (text: string, hint: ExtractHint) => demo.mutate(async token => {
    const result = await api.agentExtract(token, text, hint);
    return { state: result.state, value: result.intake };
  });
  const agentReview = async () => {
    if (agentBusy) return;
    setAgentBusy(true); setAgentError(null);
    try {
      await demo.mutate(async token => {
        const result = await api.agentReview(token);
        return { state: result.state, value: result.briefing };
      });
    } catch (error) { setAgentError(errorMessage(error)); }
    finally { setAgentBusy(false); }
  };
  const intakeProps = { enabled, stateVersion: demo.state?.version_seq ?? 0, drafts: demo.state?.intakes ?? [], onIntake: importIntake };
  const reset = async () => {
    await demo.mutate(async token => ({ state: await api.reset(token), value: undefined }));
    setSelection(null); setModal(null);
  };
  const select = (tab: ActiveTab) => { setActiveTab(tab); if (tab === 'case' || tab === 'home') void demo.refresh(); };
  const showStrip = activeTab !== 'landing' || !!demo.error || demo.status === 'expired';

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar householdName={demo.state?.household_name ?? 'Sample household'} activeTab={activeTab} onSelectTab={select}
        sessionStatus={demo.status} expiresAt={demo.session ? demo.session.expires_at * 1000 : undefined}
        onReset={() => { void reset().catch(demo.reportError); }} resetDisabled={!enabled || !!selection} onOpenImport={() => openRegistry({ tab: 'appliance' })} />

      <div className={`${showStrip ? '' : 'hidden'} w-full max-w-[1400px] mx-auto px-4 lg:px-8 py-2 text-xs`} data-testid="session-panel">
        <div className="card-muted px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <p data-testid="session-status" className="muted">
            {demo.status === 'active' ? 'Isolated demo session active: your private copy of the sample household' : demo.status === 'expired' ? 'Demo session expired' : demo.status === 'loading' ? 'Loading the sample household…' : 'Synthetic preview'}
            {' · '}recorded approvals only; no email, provider action or real recovery.
          </p>
          <div className="flex gap-2">
            {demo.status !== 'active' && <button data-testid="begin-demo" disabled={demo.busy || demo.status === 'loading'}
              onClick={() => { setSelection(null); void demo.begin(); }} className="btn btn-primary btn-sm">
              {demo.busy ? 'Starting…' : demo.status === 'expired' ? 'Start a new demo space' : 'Start demo space'}
            </button>}
            <button data-testid="refresh-state" disabled={demo.busy || demo.status === 'expired' || !!selection} onClick={() => { void demo.refresh(); }} className="btn btn-secondary btn-sm">Refresh</button>
          </div>
        </div>
        {demo.status === 'loading' && <p role="status" className="px-4 pt-2">Loading server preview...</p>}
        {demo.error && <p role="alert" className="note-alert px-4 pt-2">{demo.error}</p>}
        {demo.storageWarning && <p role="status" className="note px-4 pt-2">{demo.storageWarning}</p>}
      </div>

      <main id="main-content" tabIndex={-1} className={activeTab === 'landing' ? 'flex-1 w-full' : 'flex-1 w-full mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8'}>
        {activeTab === 'landing' && <Landing preview={demo.state} returning={returning} expired={demo.status === 'expired'} busy={demo.busy} error={demo.status !== 'active' ? demo.error : null} onStart={() => { void start(); }} />}
        {activeTab === 'home' && view && demo.state && <SentinelHome state={demo.state} summary={view.summary} alerts={view.alerts} enabled={enabled}
          briefings={demo.state.agent_briefings} agentBusy={agentBusy} agentError={agentError} onAgentReview={agentReview}
          onOpenNotice={openNotice} onOpenCase={() => select('case')} onCancelTrial={cancelTrial} onOpenRegistry={openRegistry}
          onOpenReceiptModal={() => setModal('receipt')} onOpenUtilityModal={() => setModal('utility')} onOpenRecords={() => select('records')} />}
        {activeTab === 'case' && demo.state && <CaseWorkspace key={demo.session?.token ?? 'preview'} state={demo.state} enabled={enabled} onPrepare={openNotice} onUpdate={updateCase} onRefresh={demo.refresh} />}
        {activeTab === 'records' && view && demo.state && <RecordsView appliances={view.appliances} subscriptions={view.subscriptions} outflows={view.outflows} caseByItem={view.caseByItem}
          snapshotDate={demo.state.last_updated} actionsDisabled={!enabled} onOpenClaimModal={a => openNotice(a.id)} onOpenCase={() => select('case')}
          onCancelTrial={cancelTrial} onOpenReceiptModal={() => setModal('receipt')} onOpenRegistry={openRegistry} />}
        {!view && activeTab !== 'landing' && activeTab !== 'about' && <p role="status" className="note">Household state is unavailable. Refresh the server preview to continue.</p>}
        {activeTab === 'about' && <AboutView key={demo.session?.token ?? 'preview'} token={demo.session?.token ?? ''} onError={demo.reportError} />}
      </main>

      {selection && demo.session && <FormalNoticeModal key={demo.session.token + ':' + selection} appliance={selectedAppliance} isOpen
        token={demo.session.token} enabled={enabled} onClose={() => setSelection(null)} onError={demo.reportError} onDispatch={approve}
        onViewCase={() => { setSelection(null); select('case'); }} />}
      {modal === 'receipt' && <ReceiptUploadModal key={'receipt-' + (demo.session?.token ?? 'preview')} isOpen onClose={() => setModal(null)}
        outflows={view?.outflows ?? []} enabled={enabled} onReceiptMatched={linkReceipt} intake={intakeProps} />}
      {modal === 'utility' && <UtilityDisputeModal key={'utility-' + (demo.session?.token ?? 'preview')} isOpen onClose={() => setModal(null)}
        bill={utilityBill} homeownerName={demo.state?.homeowner_name ?? ''} enabled={enabled} onDispute={dispute} />}
      {modal === 'registry' && <RegistryModal key={'registry-' + registryKey + '-' + (demo.session?.token ?? 'preview')} isOpen mode={registryMode} onClose={() => setModal(null)}
        appliances={demo.state?.appliances ?? []} extractsUsed={demo.state?.agent_extracts ?? 0} intake={intakeProps} onExtract={extract} />}
      <footer className="border-t border-[var(--line)] py-4 px-6 text-xs faint flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1400px] mx-auto w-full">
        <div>Hestia · household sentinel · Directive (EU) 2019/771 as general reference</div>
        <div>Fictional household · recorded approvals · Strands agent on Amazon Bedrock</div>
      </footer>
    </div>
  );
}
