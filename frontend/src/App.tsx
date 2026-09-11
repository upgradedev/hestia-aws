import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ConsumerDashboard } from './components/ConsumerDashboard';
import { AssetVaultView } from './components/AssetVaultView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { UserJourneysView } from './components/UserJourneysView';
import { GtmInvestorView } from './components/GtmInvestorView';
import { ArchitectureView } from './components/ArchitectureView';
import { FormalNoticeModal } from './components/FormalNoticeModal';
import { ReceiptUploadModal } from './components/ReceiptUploadModal';

import {
  INITIAL_SUMMARY,
  INITIAL_APPLIANCES,
  INITIAL_OUTFLOWS,
  INITIAL_SUBSCRIPTIONS,
  INITIAL_ALERTS,
} from './data/seedData';
import {
  ApplianceWarranty,
  SentinelAlert,
  DispatchRecord,
  HouseholdSummary,
  PaymentOutflow,
  ActiveTab,
} from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [summary, setSummary] = useState<HouseholdSummary>(INITIAL_SUMMARY);
  const [appliances, setAppliances] = useState<ApplianceWarranty[]>(INITIAL_APPLIANCES);
  const [outflows, setOutflows] = useState<PaymentOutflow[]>(INITIAL_OUTFLOWS);
  const [subscriptions, setSubscriptions] = useState(INITIAL_SUBSCRIPTIONS);
  const [alerts, setAlerts] = useState<SentinelAlert[]>(INITIAL_ALERTS);

  const [selectedAppliance, setSelectedAppliance] = useState<ApplianceWarranty | null>(INITIAL_APPLIANCES[0]);
  const [liveApiOnline, setLiveApiOnline] = useState(false);

  // Modals
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const [dispatchHistory, setDispatchHistory] = useState<DispatchRecord[]>([
    {
      id: 'disp-000',
      item_id: 'app-002',
      status: 'acknowledged',
      timestamp: '2026-08-28 10:14',
      seller: "Amazon EU S.a.r.l.",
      seller_email: "eu-consumer-rights@amazon.example.com",
      statutory_basis: "Directive (EU) 2019/771, Article 10(1)",
      letter_preview: "Free repair authorization issued for boiler heating unit.",
    },
  ]);

  // Check live API healthz on mount
  useEffect(() => {
    fetch('/healthz')
      .then((res) => {
        if (res.ok) {
          setLiveApiOnline(true);
        }
      })
      .catch(() => {
        setLiveApiOnline(false);
      });
  }, []);

  const handleDispatchClaim = async (itemId: string): Promise<DispatchRecord | null> => {
    const item = appliances.find((a) => a.id === itemId) || appliances[0];
    let record: DispatchRecord;

    try {
      const response = await fetch('/action/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });

      if (response.ok) {
        const data = await response.json();
        record = {
          id: `disp-${Date.now()}`,
          item_id: itemId,
          status: 'dispatched',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          seller: item.seller_name,
          seller_email: item.seller_email,
          statutory_basis: data.dispatch_record?.statutory_basis || item.statutory_basis,
          letter_preview: data.dispatch_record?.letter_preview || 'Statutory notice dispatched.',
        };
      } else {
        throw new Error('API returned non-200');
      }
    } catch {
      // Graceful offline fallback simulation
      record = {
        id: `disp-${Date.now()}`,
        item_id: itemId,
        status: 'dispatched',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
        seller: item.seller_name,
        seller_email: item.seller_email,
        statutory_basis: item.statutory_basis,
        letter_preview: `FORMAL NOTICE OF LACK OF CONFORMITY PURSUANT TO DIRECTIVE (EU) 2019/771. Dispatched to ${item.seller_email}.`,
      };
    }

    setDispatchHistory((prev) => [record, ...prev]);

    // Update summary and resolve alert
    setSummary((prev) => ({
      ...prev,
      unclaimed_repairs_count: Math.max(0, prev.unclaimed_repairs_count - 1),
      potential_recovery_eur: Math.max(0, prev.potential_recovery_eur - 185.00),
    }));

    setAlerts((prev) => prev.filter((a) => a.category !== 'warranty_claim'));

    return record;
  };

  const handleCancelTrial = async (subId: string): Promise<boolean> => {
    try {
      const res = await fetch('/action/cancel_trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: subId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // offline simulation
    }

    setSubscriptions((prev) => prev.filter((s) => s.id !== subId));
    setAlerts((prev) => prev.filter((a) => a.action_type !== 'cancel_trial'));
    setSummary((prev) => ({
      ...prev,
      leakage_detected_monthly_eur: Math.max(0, prev.leakage_detected_monthly_eur - 29.99),
    }));

    return true;
  };

  const handleReceiptMatched = (outflowId: string, recoveredAsset: ApplianceWarranty) => {
    // Update outflows: mark as matched
    setOutflows((prev) =>
      prev.map((tx) => (tx.id === outflowId ? { ...tx, has_receipt: true } : tx))
    );

    // Add new protected appliance
    setAppliances((prev) => [recoveredAsset, ...prev]);

    // Remove the receipt gap alert
    setAlerts((prev) => prev.filter((a) => a.category !== 'receipt_gap'));

    // Increase protected assets by €85.00
    setSummary((prev) => ({
      ...prev,
      active_warranties_count: prev.active_warranties_count + 1,
      protected_value_eur: prev.protected_value_eur + recoveredAsset.price_eur,
    }));
  };

  const pendingCount = alerts.length;

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col text-slate-100">
      {/* Clean Top Navigation Bar */}
      <Header
        summary={summary}
        liveApiOnline={liveApiOnline}
        activeTab={activeTab}
        pendingActionsCount={pendingCount}
        onSelectTab={setActiveTab}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* VIEW 1: CONSUMER DASHBOARD (ACTION INBOX) */}
        {activeTab === 'overview' && (
          <ConsumerDashboard
            summary={summary}
            alerts={alerts}
            dispatchHistory={dispatchHistory}
            onOpenNoticeModal={() => {
              setSelectedAppliance(appliances[0]);
              setIsNoticeModalOpen(true);
            }}
            onCancelTrial={handleCancelTrial}
            onOpenReceiptModal={() => setIsReceiptModalOpen(true)}
            onViewAllAssets={() => setActiveTab('vault')}
            onViewAllSubscriptions={() => setActiveTab('subscriptions')}
          />
        )}

        {/* VIEW 2: ASSET VAULT */}
        {activeTab === 'vault' && (
          <AssetVaultView
            appliances={appliances}
            onOpenClaimModal={(app) => {
              setSelectedAppliance(app);
              setIsNoticeModalOpen(true);
            }}
          />
        )}

        {/* VIEW 3: SUBSCRIPTIONS & BANK FEEDS */}
        {activeTab === 'subscriptions' && (
          <SubscriptionsView
            subscriptions={subscriptions}
            outflows={outflows}
            onCancelTrial={handleCancelTrial}
            onOpenReceiptModal={() => setIsReceiptModalOpen(true)}
          />
        )}

        {/* VIEW 4: USER JOURNEYS */}
        {activeTab === 'journeys' && (
          <UserJourneysView
            onSelectJourneyToSimulate={(journeyId) => {
              setActiveTab('overview');
              if (journeyId === 'journey-warranty-recovery') {
                setSelectedAppliance(appliances[0]);
                setIsNoticeModalOpen(true);
              } else if (journeyId === 'journey-receipt-antijoin') {
                setIsReceiptModalOpen(true);
              }
            }}
          />
        )}

        {/* VIEW 5: GTM & ECONOMICS */}
        {activeTab === 'gtm' && <GtmInvestorView />}

        {/* VIEW 6: BEDROCK ARCHITECTURE */}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Formal Notice Modal */}
      <FormalNoticeModal
        appliance={selectedAppliance}
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        onDispatch={handleDispatchClaim}
      />

      {/* Receipt Upload Modal */}
      <ReceiptUploadModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onReceiptMatched={handleReceiptMatched}
      />

      {/* Simple, Clean Footer */}
      <footer className="border-t border-white/5 py-4 px-6 text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1500px] mx-auto w-full">
        <div>
          Hestia &bull; Autonomous Household Sentinel &bull; Directive (EU) 2019/771
        </div>
        <div className="text-slate-400">
          Elena Weber (Munich) &bull; Zero Silent Actions &bull; Return-of-Control Certified
        </div>
      </footer>
    </div>
  );
};
