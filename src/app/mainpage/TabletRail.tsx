"use client";
import { useAccountContext } from "@/app/context/AccountContext";
import { useRouter } from "next/navigation";
import { BarChart3, CreditCard, TrendingUp, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatToUSD } from "@/app/utils/formatToUSD";

export type TabletView = "budget" | "accounts" | "insights";

interface Props {
  activeView: TabletView;
  onViewChange: (view: TabletView) => void;
}

function getAccountAbbr(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("CHECK")) return "CHK";
  if (upper.includes("SAV")) return "SAV";
  if (upper.includes("CASH")) return "CSH";
  if (upper.includes("CREDIT")) return "CRD";
  return name.replace(/\s+/g, "").slice(0, 3).toUpperCase();
}

const VIEWS: { id: TabletView; icon: React.ReactNode; label: string }[] = [
  { id: "budget",   icon: <BarChart3  className="w-5 h-5" />, label: "Budget"   },
  { id: "accounts", icon: <CreditCard className="w-5 h-5" />, label: "Accounts" },
  { id: "insights", icon: <TrendingUp className="w-5 h-5" />, label: "Insights" },
];

export default function TabletRail({ activeView, onViewChange }: Props) {
  const { accounts } = useAccountContext();
  const router = useRouter();

  return (
    <div className="w-[52px] flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-2.5 gap-1 overflow-visible z-10">

      {/* View icons */}
      {VIEWS.map((v) => (
        <div key={v.id} className="relative group">
          <button
            onClick={() => onViewChange(v.id)}
            className={cn(
              "w-9 h-9 rounded-[9px] flex items-center justify-center transition-colors",
              activeView === v.id
                ? "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            {v.icon}
          </button>
          {/* Tooltip */}
          <div className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-50">
            <div className="absolute right-full mr-0 border-4 border-transparent border-r-slate-900 dark:border-r-slate-100" />
            {v.label}
          </div>
        </div>
      ))}

      {/* Divider */}
      <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-1 flex-shrink-0" />

      {/* Account chips with hover popout */}
      {accounts.slice(0, 7).map((acc) => {
        const bal =
          acc.transactions?.reduce((s, tx) => s + tx.balance, 0) ??
          acc.balance ??
          0;
        const isDebit = acc.type === "debit";

        return (
          <div key={acc.id} className="relative group">
            <button
              onClick={() => router.push(`/accounts/${acc.id}`)}
              className={cn(
                "w-8 h-8 rounded-[8px] flex-shrink-0 flex items-center justify-center text-[8px] font-bold border transition-colors",
                isDebit
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/40 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              )}
            >
              {getAccountAbbr(acc.name)}
            </button>

            {/* Hover popout panel */}
            <div className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 hidden group-hover:flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 z-50 whitespace-nowrap min-w-[140px]">
              {/* Arrow */}
              <div className="absolute right-full mr-0 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-white dark:border-r-slate-800" />
              <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                {acc.name}
              </p>
              <p
                className={cn(
                  "font-mono text-[13px] font-semibold mt-0.5",
                  bal < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-teal-600 dark:text-teal-400"
                )}
              >
                {formatToUSD(bal)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
                {acc.type === "credit" ? "Credit card" : "Cash"}
              </p>
            </div>
          </div>
        );
      })}

      {/* Settings at bottom */}
      <div className="relative group mt-auto">
        <button className="w-9 h-9 rounded-[9px] flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <div className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 hidden group-hover:flex items-center bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-50">
          <div className="absolute right-full mr-0 border-4 border-transparent border-r-slate-900 dark:border-r-slate-100" />
          Settings
        </div>
      </div>
    </div>
  );
}
