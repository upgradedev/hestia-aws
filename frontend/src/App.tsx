import React, { useState } from 'react';
import { Header } from './components/Header';
import { ConsumerDashboard } from './components/ConsumerDashboard';
import { AssetVaultView } from './components/AssetVaultView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { UserJourneysView } from './components/UserJourneysView';
import { GtmInvestorView } from './components/GtmInvestorView';
import { ArchitectureView } from './components/ArchitectureView';
import { FormalNoticeModal } from './components/FormalNoticeModal';
import { ReceiptUploadModal } from './components/ReceiptUploadModal';
import { UtilityDisputeModal } from './components/UtilityDisputeModal';
import { LandingPage } from './components/LandingPage';
import { EmailSyncModal } from './components/EmailSyncModal';
import { api, ApiError } from './api';
import type { ClaimDraft } from './api';
import { EMPTY_SUMMARY, mapState } from './stateMapping';
import { useDemoSession } from './useDemoSession';
import type { ActiveTab, Locale } from './types';

export const App: React.FC = () => {
  const demo = useDemoSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const [locale, setLocale] = useState<Locale>('en');
  const [selection, setSelection] = useState<string | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isUtilityModalOpen, setIsUtilityModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const view = demo.state ? mapState(demo.state) : null;
  const enabled = demo.status === 'active' && !demo.busy;
  const selectedAppliance = view?.appliances.find(a => a.id === selection) ?? null;
  const utilityBill = demo.state?.utility_bills.find(bill => bill.status === 'spike_alert') ?? null;

  const openNotice = (id?: string) => {
    const item = view?.appliances.find(a => a.id === id);
    if (!enabled || !item) {
      demo.reportError(new ApiError('Begin or recover your isolated session and select a valid appliance.'));
      return;
    }
    setSelection(item.id);
  };
  const approve = (draft: ClaimDraft) => demo.mutate(async token => {
    if (!selection || draft.item_id !== selection) throw new ApiError('Selection changed. Reopen the notice.');
    // prepare persists a new version; only the backend can validate its current source_version.
    const result = await api.approve(token, draft);
    return { state: result.state, value: result.record };
  });
  const cancelTrial = (id: string) => demo.mutate(async token => {
    const sub = demo.state?.subscriptions.find(s => s.id === id);
    if (!sub) throw new ApiError('Unknown subscription. Refresh session state.');
    return { state: await api.cancel(token, sub.service_name), value: true };
  });
  const dispute = (provider: string, excessCents: number) => demo.mutate(async token => ({
    state: await api.utility(token, provider, excessCents), value: undefined,
  }));
  const linkReceipt = (id: string, receiptId: string) => demo.mutate(async token => {
    const outflow = demo.state?.outflows.find(o => o.id === id);
    if (!outflow) throw new ApiError('Unknown outflow. Refresh session state.');
    return { state: await api.receipt(token, outflow.merchant, outflow.amount_cents, receiptId), value: undefined };
  });
  const reset = async () => {
    await demo.mutate(async token => ({ state: await api.reset(token), value: undefined }));
    setSelection(null); setIsUtilityModalOpen(false); setIsReceiptModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col text-slate-100">
      <Header summary={view?.summary ?? EMPTY_SUMMARY} liveApiOnline={!!demo.state}
        householdName={demo.state?.household_name ?? 'Synthetic household preview'}
        activeTab={activeTab} pendingActionsCount={view?.alerts.length ?? 0} locale={locale}
        onToggleLocale={() => setLocale(previous => previous === 'en' ? 'de' : 'en')}
        onResetDemo={() => { void reset().catch(demo.reportError); }} resetDisabled={!enabled || !!selection}
        onSelectTab={setActiveTab} onOpenSyncModal={() => setIsSyncModalOpen(true)} />

      <div className="w-full max-w-[1500px] mx-auto px-4 lg:px-8 py-3 border-b border-amber-500/20 bg-amber-950/10 text-xs" data-testid="session-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p data-testid="session-status">{demo.status === 'active' ? 'Isolated demo session active' : demo.status === 'expired' ? 'Demo session expired' : 'Synthetic preview'} · Simulation only. No model inference, email send, or real recovery.</p>
          <div className="flex gap-3">
            {demo.status !== 'active' && <button data-testid="begin-demo" disabled={demo.busy || demo.status === 'loading'}
              onClick={() => { setSelection(null); void demo.begin(); }}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold disabled:opacity-50">
              {demo.busy ? 'Starting...' : demo.status === 'expired' ? 'Restart Isolated Demo Session' : 'Begin Isolated Demo Session'}
            </button>}
            <button data-testid="refresh-state" disabled={demo.busy || demo.status === 'expired' || !!selection} onClick={() => { void demo.refresh(); }} className="px-3 py-2 rounded-xl border border-white/20 disabled:opacity-50">Recover / Refresh State</button>
          </div>
        </div>
        {demo.status === 'loading' && <p role="status">Loading server preview...</p>}
        {demo.error && <p role="alert" className="mt-2 text-rose-300">{demo.error}</p>}
        {demo.storageWarning && <p role="status" className="mt-2 text-amber-300">{demo.storageWarning}</p>}
      </div>

      <main className={activeTab === 'landing' ? 'flex-1 w-full mx-auto' : 'flex-1 w-full mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8'}>
        {activeTab === 'landing' && <LandingPage locale={locale} onLaunchCockpit={() => setActiveTab('overview')} onOpenSyncModal={() => setIsSyncModalOpen(true)} />}
        {activeTab === 'overview' && view && <ConsumerDashboard summary={view.summary} alerts={view.alerts} dispatchHistory={demo.state?.dispatch_records ?? []}
          householdName={demo.state?.household_name ?? ''} actionsDisabled={!enabled}
          onOpenNoticeModal={openNotice} onCancelTrial={cancelTrial} onOpenReceiptModal={() => setIsReceiptModalOpen(true)}
          onOpenUtilityDisputeModal={() => setIsUtilityModalOpen(true)} onViewAllAssets={() => setActiveTab('vault')} onViewAllSubscriptions={() => setActiveTab('subscriptions')} />}
        {activeTab === 'vault' && view && <AssetVaultView appliances={view.appliances} snapshotDate={demo.state!.last_updated} actionsDisabled={!enabled} onOpenClaimModal={a => openNotice(a.id)} />}
        {activeTab === 'subscriptions' && view && <SubscriptionsView subscriptions={view.subscriptions} outflows={view.outflows} actionsDisabled={!enabled} onCancelTrial={cancelTrial} onOpenReceiptModal={() => setIsReceiptModalOpen(true)} />}
        {!view && activeTab !== 'landing' && <p role="status">Household state is unavailable. Recover the server preview to continue.</p>}
        {activeTab === 'journeys' && <UserJourneysView onSelectJourneyToSimulate={id => {
          setActiveTab('overview');
          if (id === 'journey-warranty-recovery') openNotice(view?.alerts.find(a => a.category === 'warranty_claim')?.item_id);
          else if (id === 'journey-receipt-antijoin') setIsReceiptModalOpen(true);
          else if (id === 'journey-utility-surge') setIsUtilityModalOpen(true);
        }} />}
        {activeTab === 'gtm' && <GtmInvestorView />}
        {activeTab === 'architecture' && <ArchitectureView key={demo.session?.token ?? 'preview'} token={demo.session?.token ?? ''} onError={demo.reportError} />}
      </main>

      {selection && demo.session && <FormalNoticeModal key={demo.session.token + ':' + selection} appliance={selectedAppliance} isOpen
        token={demo.session.token} enabled={enabled} onClose={() => setSelection(null)} onError={demo.reportError} onDispatch={approve} />}
      {isReceiptModalOpen && <ReceiptUploadModal key={demo.session?.token ?? 'preview'} isOpen onClose={() => setIsReceiptModalOpen(false)}
        outflows={view?.outflows ?? []} enabled={enabled} onReceiptMatched={linkReceipt} />}
      {isUtilityModalOpen && <UtilityDisputeModal key={demo.session?.token ?? 'preview'} isOpen onClose={() => setIsUtilityModalOpen(false)}
        bill={utilityBill} homeownerName={demo.state?.homeowner_name ?? ''} enabled={enabled} onDispute={dispute} />}
      <EmailSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
      <footer className="border-t border-white/5 py-4 px-6 text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1500px] mx-auto w-full">
        <div>Hestia &bull; Household Sentinel &bull; Directive (EU) 2019/771</div>
        <div>Synthetic demo &bull; Explicit approval &bull; Simulated history</div>
      </footer>
    </div>
  );
};
