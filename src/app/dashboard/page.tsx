"use client";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useUndoRedoShortcuts } from "../hooks/useUndoRedoShortcuts";
import BudgetTable from "../mainpage/BudgetTable";
import ActivitySidebar from "../mainpage/ActivitySidebar";
import SidebarPanel from "../mainpage/SidebarPanel";
import MobileDashboardShell from "../mainpage/MobileDashboardShell";

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
      {/* Mobile Layout - Hidden on md and up */}
      <div className="md:hidden h-[calc(100vh-76px)]">
        <MobileDashboardShell />
      </div>

      {/* Desktop Layout - Hidden below md */}
      <div className="hidden md:flex h-[calc(100vh-76px)] overflow-hidden">
        <ActivitySidebar page="dashboard" />

        <div className="m-4 grid grid-cols-1 lg:grid-cols-[35%_65%] gap-3 w-full overflow-hidden">
          <div className="bg-zinc-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full">
            <SidebarPanel />
          </div>

          <div className="bg-zinc-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full overflow-y-auto min-w-[600px]">
            <BudgetTable />
          </div>
        </div>
      </div>
    </>
  );
}
