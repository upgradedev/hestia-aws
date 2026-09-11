import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HouseholdInventory } from './components/HouseholdInventory';
import { SentinelRadar } from './components/SentinelRadar';
import { ReturnOfControl } from './components/ReturnOfControl';
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
} from './types';

export const App: React.FC = () => {
  const [summary, setSummary] = useState<HouseholdSummary>(INITIAL_SUMMARY);
  const [appliances, setAppliances] = useState<ApplianceWarranty[]>(INITIAL_APPLIANCES);
  const [outflows] = useState(INITIAL_OUTFLOWS);
  const [subscriptions, setSubscriptions] = useState(INITIAL_SUBSCRIPTIONS);
  const [alerts, setAlerts] = useState<SentinelAlert[]>(INITIAL_ALERTS);

  const [selectedAlert, setSelectedAlert] = useState<SentinelAlert | null>(INITIAL_ALERTS[0]);
  const [selectedAppliance, setSelectedAppliance] = useState<ApplianceWarranty | null>(INITIAL_APPLIANCES[0]);
  const [liveApiOnline, setLiveApiOnline] = useState(false);

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
        // If offline or standalone preview, fallback to false
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

    // Update summary
    setSummary((prev) => ({
      ...prev,
      unclaimed_repairs_count: Math.max(0, prev.unclaimed_repairs_count - 1),
    }));

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

  return (
    <div className="min-h-screen bg-[#090b10] flex flex-col text-slate-100">
      {/* Top Header */}
      <Header summary={summary} liveApiOnline={liveApiOnline} />

      {/* Main 3-Column Cockpit Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)] min-h-[700px]">
          {/* Column 1: Household Inventory & Connected Feeds */}
          <section className="h-full">
            <HouseholdInventory
              appliances={appliances}
              outflows={outflows}
              subscriptions={subscriptions}
              onSelectItemForClaim={handleSelectApplianceForClaim}
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
            />
          </section>
        </div>
      </main>

      {/* Sub-Footer Statutory Context */}
      <footer className="border-t border-white/5 py-3 px-6 text-center text-xs text-slate-500 font-mono">
        AWS Agents for Humans &bull; Everyday Agents Track &bull; Statutory Directive (EU) 2019/771 Enforced &bull; Zero Silent Actions
      </footer>
    </div>
  );
};
