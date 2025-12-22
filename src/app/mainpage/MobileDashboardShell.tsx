"use client";

import { useEffect, useState } from "react";
import { useAccountContext } from "../context/AccountContext";
import { useDarkMode } from "../context/DarkModeContext";
import AccountCarousel from "./AccountCarousel";
import MobileTabBar from "./MobileTabBar";
import MobileOverviewTab from "./tabs/MobileOverviewTab";
import MobileBudgetTab from "./tabs/MobileBudgetTab";
import MobileActivityTab from "./tabs/MobileActivityTab";
import MobileTransactionsTab from "./tabs/MobileTransactionsTab";
import { Moon, Sun } from "lucide-react";

export type TabType = "overview" | "budget" | "activity" | "transactions";

export default function MobileDashboardShell() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const { accounts } = useAccountContext();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  // Default to first account when available
  useEffect(() => {
    if (selectedAccountId == null && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <MobileOverviewTab />;
      case "budget":
        return <MobileBudgetTab />;
      case "activity":
        return <MobileActivityTab />;
      case "transactions":
        return (
          <MobileTransactionsTab
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
          />
        );
      default:
        return <MobileOverviewTab />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Top Account Carousel - Fixed Height */}
      <div className="flex-shrink-0 p-4 pb-0 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center justify-end mb-2">
          <button
            aria-label="Toggle dark mode"
            onClick={toggleDarkMode}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDarkMode ? "Light" : "Dark"}</span>
          </button>
        </div>
        <AccountCarousel
          selectedAccountId={selectedAccountId}
          onSelect={setSelectedAccountId}
        />
      </div>

      {/* Scrollable Tab Content - Flexible */}
      <div className="flex-1 overflow-y-auto pt-4 px-4">
        <div className="rounded-t-3xl bg-white dark:bg-slate-900 pb-4 px-4 min-h-full text-slate-900 dark:text-slate-200">
          {renderTabContent()}
        </div>
      </div>

      {/* Bottom Tab Bar - Fixed */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
