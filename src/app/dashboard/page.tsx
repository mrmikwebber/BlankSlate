"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useUndoRedoShortcuts } from "../hooks/useUndoRedoShortcuts";
import BudgetTable from "../mainpage/BudgetTable";
import TotalSpendingTile from "../mainpage/totalSpendingTile";
// ActivitySidebar removed per request
import SidebarPanel from "../mainpage/SidebarPanel";
import MobileDashboardShell from "../mainpage/MobileDashboardShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();
  
  // Enable undo/redo shortcuts
  useUndoRedoShortcuts();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/auth");
    }
  }, [loading, session]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-white dark:bg-slate-950">
        <p className="text-teal-600 dark:text-teal-400 text-lg">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Layout - Hidden on md and up (< 768px) */}
      <div className="md:hidden h-[calc(100vh-76px)]">
        <MobileDashboardShell />
      </div>

      {/* Tablet Layout - Visible from md to xl (768px - 1279px) */}
      <div className="hidden md:flex xl:hidden h-[calc(100vh-76px)] overflow-hidden flex-col">
        <div className="m-4 flex flex-col gap-3 w-full min-w-0">
          {/* Sidebar on top for tablets and medium desktops */}
          <div className="bg-zinc-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg overflow-hidden">
            <SidebarPanel />
          </div>

          {/* Tabbed interface for tablets and medium desktops */}
          <div className="bg-zinc-100 dark:bg-slate-900 rounded-md drop-shadow-md dark:drop-shadow-lg flex-1 min-h-0 flex flex-col overflow-hidden">
            <Tabs defaultValue="budget" className="w-full h-full flex flex-col min-h-0">
              <TabsList className="m-4 mb-0 flex-shrink-0">
                <TabsTrigger value="budget">Budget</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>
              <TabsContent value="budget" className="mt-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full w-full overflow-hidden">
                  <BudgetTable />
                </div>
              </TabsContent>
              <TabsContent value="insights" className="mt-0 flex-1 min-h-0 overflow-auto">
                <TotalSpendingTile />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Hidden below xl (≥ 1280px) */}
      <div className="hidden xl:flex h-[calc(100vh-76px)] overflow-hidden flex-col">
        <div className="m-4 grid grid-cols-[22%_78%] gap-3 w-full h-full min-h-0">
          <div className="bg-zinc-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full overflow-auto">
            <SidebarPanel />
          </div>

          <div className="bg-zinc-100 dark:bg-slate-900 rounded-md drop-shadow-md dark:drop-shadow-lg h-full min-h-0 flex flex-col overflow-hidden">
            <Tabs defaultValue="budget" className="w-full h-full flex flex-col min-h-0">
              <TabsList className="m-4 mb-0 flex-shrink-0">
                <TabsTrigger value="budget">Budget</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>
              <TabsContent value="budget" className="mt-0 flex-1 min-h-0 p-4 pt-4">
                <BudgetTable />
              </TabsContent>
              <TabsContent value="insights" className="mt-0 flex-1 min-h-0 overflow-auto\">
                <TotalSpendingTile />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
}
