"use client";

import { useState } from "react";
import MobileTabBar from "./MobileTabBar";
import MobileBudgetTab from "./tabs/MobileBudgetTab";
import MobileAccountsTab from "./tabs/MobileAccountsTab";
import MobileTransactionsTab from "./tabs/MobileTransactionsTab";
import DiscretionaryTab from "./tabs/DiscretionaryTab";
import SettingsTab from "./tabs/SettingsTab";
import TotalSpendingTile from "./totalSpendingTile";

export type TabType = "budget" | "accounts" | "discretionary" | "insights" | "settings";

export default function MobileDashboardShell() {
  const [activeTab, setActiveTab] = useState<TabType>("budget");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab !== "accounts") setSelectedAccountId(null);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "budget":
        return (
          <div className="pt-4 px-4 bg-slate-50 dark:bg-slate-950 min-h-full">
            <div className="rounded-t-3xl bg-slate-50 dark:bg-slate-900 pb-4 px-4 min-h-full text-slate-900 dark:text-slate-200">
              <MobileBudgetTab />
            </div>
          </div>
        );
      case "accounts":
        return selectedAccountId !== null ? (
          <MobileTransactionsTab
            accountId={selectedAccountId}
            onBack={() => setSelectedAccountId(null)}
          />
        ) : (
          <MobileAccountsTab onSelectAccount={setSelectedAccountId} />
        );
      case "discretionary":
        return (
          <div className="pt-4 px-4 bg-slate-50 dark:bg-slate-950 min-h-full">
            <DiscretionaryTab />
          </div>
        );
      case "insights":
        return <TotalSpendingTile />;
      case "settings":
        return <SettingsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>

      {/* Bottom tab bar */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-lg">
        <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}
