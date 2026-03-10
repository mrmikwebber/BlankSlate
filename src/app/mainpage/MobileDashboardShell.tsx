"use client";

import { useState } from "react";
import MobileTabBar from "./MobileTabBar";
import MobileBudgetTab from "./tabs/MobileBudgetTab";
import MobileAccountsTab from "./tabs/MobileAccountsTab";
import TotalSpendingTile from "./totalSpendingTile";

export type TabType = "budget" | "accounts" | "insights" | "settings";

function SettingsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center bg-slate-50 dark:bg-slate-950 min-h-full">
      <div className="text-5xl mb-4 opacity-20">⚙️</div>
      <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
        Settings
      </p>
      <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
        Coming soon
      </p>
    </div>
  );
}

export default function MobileDashboardShell() {
  const [activeTab, setActiveTab] = useState<TabType>("budget");

  const renderTabContent = () => {
    switch (activeTab) {
      case "budget":
        return (
          <div className="pt-4 px-4 bg-slate-50 dark:bg-slate-950 min-h-full">
            <div className="rounded-t-3xl bg-white dark:bg-slate-900 pb-4 px-4 min-h-full text-slate-900 dark:text-slate-200">
              <MobileBudgetTab />
            </div>
          </div>
        );
      case "accounts":
        return <MobileAccountsTab />;
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
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
