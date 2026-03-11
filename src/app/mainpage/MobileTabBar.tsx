"use client";

import { TabType } from "./MobileDashboardShell";
import { BarChart3, CreditCard, TrendingUp, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "budget",   label: "Budget",   icon: <BarChart3  className="w-5 h-5" /> },
  { id: "accounts", label: "Accounts", icon: <CreditCard className="w-5 h-5" /> },
  { id: "insights", label: "Insights", icon: <TrendingUp className="w-5 h-5" /> },
  { id: "settings", label: "Settings", icon: <Settings   className="w-5 h-5" /> },
];

export default function MobileTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-0 safe-area-inset-bottom">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 py-3 px-2 transition-all duration-200 border-t-2",
            activeTab === tab.id
              ? "text-teal-600 dark:text-teal-400 border-teal-600 dark:border-teal-400 bg-teal-50/50 dark:bg-teal-900/20"
              : "text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
          )}
        >
          {tab.icon}
          <span className="text-xs font-medium leading-tight">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
