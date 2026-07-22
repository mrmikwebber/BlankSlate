"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useUndoRedoShortcuts } from "../hooks/useUndoRedoShortcuts";
import BudgetTable from "../mainpage/BudgetTable";
import TotalSpendingTile from "../mainpage/totalSpendingTile";
import SidebarPanel from "../mainpage/SidebarPanel";
import MobileDashboardShell from "../mainpage/MobileDashboardShell";
import TabletRail, { TabletView } from "../mainpage/TabletRail";
import DiscretionaryTab from "../mainpage/tabs/DiscretionaryTab";
import SettingsTab from "../mainpage/tabs/SettingsTab";
import DashboardToolbar from "../mainpage/DashboardToolbar";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useUndoRedoShortcuts();

  const [tabletView, setTabletView] = useState<TabletView>("budget");
  const [desktopView, setDesktopView] = useState<TabletView>("budget");

  useEffect(() => {
    if (!loading && !session) {
      router.push("/auth");
    }
  }, [loading, session]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-slate-50 dark:bg-slate-950">
        <p className="text-ledger-600 dark:text-ledger-400 text-lg">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile Layout (< 768px) ── */}
      <div className="md:hidden h-[calc(100vh-76px)]">
        <MobileDashboardShell />
      </div>

      {/* ── Tablet Layout (768px – 1279px) ── */}
      <div className="hidden md:flex xl:hidden h-[calc(100vh-76px)] overflow-hidden flex-col p-3">
        <DashboardToolbar />
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Slim icon rail */}
          <TabletRail activeView={tabletView} onViewChange={setTabletView} />

          {/* Main content */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {tabletView === "budget" && (
              <div className="h-full overflow-auto">
                <BudgetTable />
              </div>
            )}
            {tabletView === "accounts" && (
              <div className="h-full overflow-auto p-4">
                <SidebarPanel />
              </div>
            )}
            {tabletView === "discretionary" && (
              <div className="h-full overflow-auto p-4">
                <DiscretionaryTab />
              </div>
            )}
            {tabletView === "insights" && (
              <div className="h-full overflow-auto">
                <TotalSpendingTile />
              </div>
            )}
            {tabletView === "settings" && (
              <div className="h-full overflow-auto">
                <SettingsTab />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop Layout (≥ 1280px) ── */}
      <div className="hidden xl:flex h-[calc(100vh-76px)] overflow-hidden flex-col p-4">
        <div className="grid grid-cols-[22%_78%] gap-3 flex-1 min-h-0 min-w-0">
          <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full overflow-auto">
            <SidebarPanel activeView={desktopView} onViewChange={setDesktopView} />
          </div>

          <div className="bg-slate-100 dark:bg-slate-900 rounded-md drop-shadow-md dark:drop-shadow-lg h-full min-h-0 min-w-0 flex flex-col overflow-hidden">
            {desktopView === "budget" && (
              <div className="flex-1 min-h-0 min-w-0 p-4 overflow-auto">
                <BudgetTable />
              </div>
            )}
            {desktopView === "insights" && (
              <div className="flex-1 min-h-0 min-w-0 overflow-auto">
                <TotalSpendingTile />
              </div>
            )}
            {desktopView === "accounts" && (
              <div className="flex-1 min-h-0 min-w-0 p-4 overflow-auto">
                <SidebarPanel />
              </div>
            )}
            {desktopView === "discretionary" && (
              <div className="flex-1 min-h-0 min-w-0 p-4 overflow-auto">
                <DiscretionaryTab />
              </div>
            )}
            {desktopView === "settings" && (
              <div className="flex-1 min-h-0 min-w-0 p-4 overflow-auto">
                <SettingsTab />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
