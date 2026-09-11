import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { GuidedWalkBar, GuidedStep } from './components/GuidedWalkBar';
import { HouseholdInventory } from './components/HouseholdInventory';
import { SentinelRadar } from './components/SentinelRadar';
import { ReturnOfControl } from './components/ReturnOfControl';
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('cockpit');
  const [summary, setSummary] = useState<HouseholdSummary>(INITIAL_SUMMARY);
  const [appliances, setAppliances] = useState<ApplianceWarranty[]>(INITIAL_APPLIANCES);
  const [outflows, setOutflows] = useState<PaymentOutflow[]>(INITIAL_OUTFLOWS);
  const [subscriptions, setSubscriptions] = useState(INITIAL_SUBSCRIPTIONS);
  const [alerts, setAlerts] = useState<SentinelAlert[]>(INITIAL_ALERTS);

  const [selectedAlert, setSelectedAlert] = useState<SentinelAlert | null>(INITIAL_ALERTS[0]);
  const [selectedAppliance, setSelectedAppliance] = useState<ApplianceWarranty | null>(INITIAL_APPLIANCES[0]);
  const [liveApiOnline, setLiveApiOnline] = useState(false);

  // Guided Walk & Tour State
  const [isTourActive, setIsTourActive] = useState(true);
  const [currentTourStep, setCurrentTourStep] = useState(1);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

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

  const handleSelectApplianceForClaim = (item: ApplianceWarranty) => {
    setSelectedAppliance(item);
    const relatedAlert = alerts.find((a) => a.item_id === item.id) || null;
    setSelectedAlert(relatedAlert);
  };

  const handleSelectAlert = (alert: SentinelAlert) => {
    setSelectedAlert(alert);
    if (alert.item_id) {
      const matchApp = appliances.find((a) => a.id === alert.item_id);
      if (matchApp) {
        setSelectedAppliance(matchApp);
      }
    }
  };

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

    setAlerts((prev) => prev.filter((a) => a.item_id !== itemId));

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
    setAlerts((prev) => prev.filter((a) => a.item_id !== subId));
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
      protected_value_eur: prev.protected_value_eur + recoveredAsset.price_eur,
    }));
  };

  // Guided Tour Steps Configuration
  const guidedSteps: GuidedStep[] = [
    {
      stepNumber: 1,
      title: "Silent Defect Identified (Bosch Washing Machine)",
      badge: "Step 1 // Detection",
      description: "Elena paid €185 out-of-pocket after MediaMarkt claimed the 1-year guarantee was over. Hestia flags this outlay in Column 1.",
      actionText: "Inspect Appliance in Column 1",
      actionHandler: () => {
        setActiveTab('cockpit');
        setSelectedAppliance(appliances[0]);
      },
    },
    {
      stepNumber: 2,
      title: "Directive (EU) 2019/771 Article 10(1) Radar Sweep",
      badge: "Step 2 // Statutory Law",
      description: "Hestia correlates purchase date against EU statutory 24-month horizon. The defect at month 22 is 100% covered by law.",
      actionText: "Select Radar Alert",
      actionHandler: () => {
        setActiveTab('cockpit');
        const alert = alerts.find((a) => a.category === 'warranty_claim') || alerts[0];
        setSelectedAlert(alert);
      },
    },
    {
      stepNumber: 3,
      title: "Review Formal German Legal Notice",
      badge: "Step 3 // Return-of-Control",
      description: "Inspect the pre-drafted formal notice (Muster-Mängelanzeige gem. BGB § 437) ready for MediaMarkt Munich.",
      actionText: "Open Legal Notice Modal",
      actionHandler: () => {
        setIsNoticeModalOpen(true);
      },
    },
    {
      stepNumber: 4,
      title: "Authorize & Dispatch with Cryptographic Seal",
      badge: "Step 4 // Human Gate",
      description: "Zero autonomous financial action without human consent. Click Authorize to dispatch notice and seal the dispute on S3.",
      actionText: "Open Dispatch Console",
      actionHandler: () => {
        setActiveTab('cockpit');
        setSelectedAppliance(appliances[0]);
      },
    },
    {
      stepNumber: 5,
      title: "Receipt Anti-Join: Vault & Protect IKEA Purchase",
      badge: "Step 5 // Asset Protection",
      description: "An €85 IKEA card charge lacks an invoice. Simulate multimodal Bedrock OCR upload to link proof and protect the asset.",
      actionText: "Launch Receipt Vault Modal",
      actionHandler: () => {
        setIsReceiptModalOpen(true);
      },
    },
  ];

  return (
    <div className="min-h-screen bg-[#090b10] flex flex-col text-slate-100">
      {/* Top Header with Tab Switcher & Impact Metrics */}
      <Header
        summary={summary}
        liveApiOnline={liveApiOnline}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onStartTour={() => {
          setActiveTab('cockpit');
          setIsTourActive(true);
          setCurrentTourStep(1);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-8 flex flex-col">
        {/* Value Proposition Hero Banner */}
        <HeroBanner
          onStartTour={() => {
            setActiveTab('cockpit');
            setIsTourActive(true);
            setCurrentTourStep(1);
          }}
          onSelectTab={setActiveTab}
          onDismiss={() => setIsBannerDismissed(!isBannerDismissed)}
          isDismissed={isBannerDismissed}
        />

        {/* Interactive Guided Walk Bar (When Tour Active) */}
        {isTourActive && activeTab === 'cockpit' && (
          <GuidedWalkBar
            currentStep={currentTourStep}
            totalSteps={guidedSteps.length}
            onNextStep={() => setCurrentTourStep((prev) => Math.min(guidedSteps.length, prev + 1))}
            onPrevStep={() => setCurrentTourStep((prev) => Math.max(1, prev - 1))}
            onSelectStep={(s) => setCurrentTourStep(s)}
            onCloseTour={() => setIsTourActive(false)}
            steps={guidedSteps}
          />
        )}

        {/* VIEW 1: OPERATIONS COCKPIT */}
        {activeTab === 'cockpit' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[720px]">
            {/* Column 1: Feeds & Household Inventory */}
            <section className="h-full">
              <HouseholdInventory
                appliances={appliances}
                outflows={outflows}
                subscriptions={subscriptions}
                onSelectItemForClaim={(item) => {
                  handleSelectApplianceForClaim(item);
                  setIsNoticeModalOpen(true);
                }}
                onRequestUploadReceipt={() => setIsReceiptModalOpen(true)}
              />
            </section>

            {/* Column 2: AI Sentinel Radar */}
            <section className="h-full">
              <SentinelRadar
                alerts={alerts}
                onSelectAlert={handleSelectAlert}
                selectedAlertId={selectedAlert?.id || null}
              />
            </section>

            {/* Column 3: Return-of-Control (ROC) Command Center */}
            <section className="h-full">
              <ReturnOfControl
                selectedAlert={selectedAlert}
                selectedAppliance={selectedAppliance}
                dispatchHistory={dispatchHistory}
                onDispatchClaim={handleDispatchClaim}
                onCancelTrial={handleCancelTrial}
                onInspectDocument={() => setIsNoticeModalOpen(true)}
              />
            </section>
          </div>
        )}

        {/* VIEW 2: INTERACTIVE USER JOURNEYS */}
        {activeTab === 'journeys' && (
          <UserJourneysView
            onSelectJourneyToSimulate={(journeyId) => {
              setActiveTab('cockpit');
              if (journeyId === 'journey-warranty-recovery') {
                setCurrentTourStep(1);
                setIsTourActive(true);
              } else if (journeyId === 'journey-receipt-antijoin') {
                setCurrentTourStep(5);
                setIsTourActive(true);
                setIsReceiptModalOpen(true);
              } else if (journeyId === 'journey-subscription-creep') {
                const subAlert = alerts.find((a) => a.action_type === 'cancel_trial') || alerts[1];
                setSelectedAlert(subAlert);
                setSelectedAppliance(null);
              }
            }}
          />
        )}

        {/* VIEW 3: GTM & BUSINESS MODEL */}
        {activeTab === 'gtm' && <GtmInvestorView />}

        {/* VIEW 4: BEDROCK ARCHITECTURE & LIVE CONSOLE */}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Formal Notice Modal */}
      <FormalNoticeModal
        appliance={selectedAppliance}
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        onDispatch={handleDispatchClaim}
      />

      {/* Receipt Upload & Anti-Join Modal */}
      <ReceiptUploadModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onReceiptMatched={handleReceiptMatched}
      />

      {/* Statutory EU Sub-Footer */}
      <footer className="border-t border-white/5 py-3.5 px-6 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1600px] mx-auto w-full">
        <div>
          AWS Agents for Humans &bull; Everyday Agents Track &bull; Directive (EU) 2019/771
        </div>
        <div className="text-slate-400">
          Elena Weber (Munich, DE) &bull; Zero Silent Actions &bull; Return-of-Control Certified
        </div>
      </footer>
    </div>
  );
};
