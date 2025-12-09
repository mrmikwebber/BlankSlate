"use client";

import { useState } from "react";
import AccountCarousel from "./AccountCarousel";
import MobileTabBar from "./MobileTabBar";
import MobileOverviewTab from "./tabs/MobileOverviewTab";
import MobileBudgetTab from "./tabs/MobileBudgetTab";
import MobileActivityTab from "./tabs/MobileActivityTab";
import MobileTransactionsTab from "./tabs/MobileTransactionsTab";

export type TabType = "overview" | "budget" | "activity" | "transactions";

export default function MobileDashboardShell() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <MobileOverviewTab />;
      case "budget":
        return <MobileBudgetTab />;
      case "activity":
        return <MobileActivityTab />;
      case "transactions":
        return <MobileTransactionsTab />;
      default:
        return <MobileOverviewTab />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Account Carousel - Fixed Height */}
      <div className="flex-shrink-0 p-4 pb-0 bg-slate-50">
        <AccountCarousel />
      </div>

      {/* Scrollable Tab Content - Flexible */}
      <div className="flex-1 overflow-y-auto pt-4 px-4">
        <div className="rounded-t-3xl bg-white pb-4 px-4 min-h-full">
          {renderTabContent()}
        </div>
      </div>

      {/* Bottom Tab Bar - Fixed */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white shadow-lg">
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
