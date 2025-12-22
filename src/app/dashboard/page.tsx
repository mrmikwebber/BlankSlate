"use client";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useUndoRedoShortcuts } from "../hooks/useUndoRedoShortcuts";
import BudgetTable from "../mainpage/BudgetTable";
// ActivitySidebar removed per request
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
      <div className="hidden md:flex h-[calc(100vh-76px)] overflow-hidden flex-col">
        <div className="m-4 grid grid-cols-1 lg:grid-cols-[22%_78%] gap-3 w-full min-h-0">
          <div className="bg-zinc-100 dark:bg-slate-900 p-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full">
            <SidebarPanel />
          </div>

          <div className="bg-zinc-100 dark:bg-slate-900 pl-4 pr-8 py-4 rounded-md drop-shadow-md dark:drop-shadow-lg h-full min-h-0 flex">
            <BudgetTable />
          </div>
        </div>
      </div>
    </>
  );
}
