import { useEffect, useMemo, useState } from "react";
import { getDaysInMonth, isSameMonth, parseISO, subMonths, format } from "date-fns";
import { createPortal } from "react-dom";

import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { TabletView } from "./TabletRail";

import AccountCardCompact from "./AccountCardCompact";
import AddAccountModal from "./AddAccountModal";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BarChart3, CreditCard, TrendingUp, Plus } from "lucide-react";

const NAV_ITEMS: { id: TabletView; icon: React.ReactNode; label: string }[] = [
  { id: "budget",   icon: <BarChart3  className="h-3.5 w-3.5" />, label: "Budget"   },
  { id: "accounts", icon: <CreditCard className="h-3.5 w-3.5" />, label: "Accounts" },
  { id: "insights", icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Insights" },
];

interface SidebarPanelProps {
  activeView?: TabletView;
  onViewChange?: (view: TabletView) => void;
}

export default function SidebarPanel({ activeView, onViewChange }: SidebarPanelProps = {}) {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    accountId: string | number;
  } | null>(null);
  const [renaming, setRenaming] = useState<{ accountId: string | number; value: string } | null>(null);

  const { accounts, addAccount, deleteAccount, reorderAccounts, editAccountName } = useAccountContext();
  const budgetCtx = useBudgetContext();
  const rta = budgetCtx ? budgetCtx.getDisplayedRta(budgetCtx.currentMonth) : 0;
  const netWorth = accounts.reduce((sum, acc) => {
    const bal = acc.transactions?.reduce((s, tx) => s + tx.balance, 0) ?? acc.balance ?? 0;
    return sum + bal;
  }, 0);

  const currentMonthDate = parseISO(`${budgetCtx?.currentMonth ?? format(new Date(), "yyyy-MM")}-01`);

  const spendingPace = useMemo(() => {
    const today = new Date();
    const isCurrentRealMonth = isSameMonth(currentMonthDate, today);
    const daysInMonth = getDaysInMonth(currentMonthDate);
    const daysElapsed = isCurrentRealMonth ? Math.max(today.getDate(), 1) : daysInMonth;

    const getMonthOutflow = (monthDate: Date) =>
      accounts.flatMap((a) => a.transactions).filter((tx) => {
        const isTransfer = (!tx.category && !tx.category_group) || tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance = tx.category === "Category Not Needed" || tx.category_group === "Starting Balance";
        const isCardPayment = tx.category_group === "Credit Card Payments";
        return tx.balance < 0 && tx.date && isSameMonth(parseISO(tx.date), monthDate) && !isTransfer && !isStartingBalance && !isCardPayment;
      }).reduce((sum, tx) => sum + Math.abs(tx.balance), 0);

    const totalOutflow = getMonthOutflow(currentMonthDate);

    const historicalRates: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(currentMonthDate, i);
      const spending = getMonthOutflow(d);
      if (spending > 0) {
        historicalRates.push(spending / getDaysInMonth(d));
        if (historicalRates.length >= 3) break;
      }
    }

    if (historicalRates.length === 0) return null;

    const avgDailyRate = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
    const currentDailyRate = daysElapsed > 0 ? totalOutflow / daysElapsed : 0;
    const diff = totalOutflow - avgDailyRate * daysElapsed;
    const pct = avgDailyRate * daysElapsed > 0 ? Math.abs((diff / (avgDailyRate * daysElapsed)) * 100) : 0;

    return {
      isAhead: diff > 0,
      pct,
      diff,
      currentTotal: totalOutflow,
      projectedMonthTotal: currentDailyRate * daysInMonth,
      avgMonthTotal: avgDailyRate * daysInMonth,
      daysElapsed,
      daysInMonth,
    };
  }, [accounts, currentMonthDate]);
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string | number;
    position: "before" | "after";
  } | null>(null);

  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  const handleDeleteAccount = (accountId: string | number) => {
    deleteAccount(accountId);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const renderAccountCard = (acc) => {
    const isDragTarget = dragOver?.id === acc.id;
    const borderClass = isDragTarget
      ? dragOver?.position === "after"
        ? "border-b-4 border-b-teal-500"
        : "border-l-4 border-l-teal-500"
      : "";

    return (
      <div
        key={acc.id}
        className={`relative group w-full`}
        style={{
          opacity: draggingId === acc.id ? 0.7 : 1,
          boxShadow: isDragTarget ? "0 0 0 2px rgba(20,184,166,0.35)" : undefined,
        }}
        onDragOver={(e) => {
          if (draggingId === null || draggingId === acc.id) return;
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== acc.type) return;
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const position = e.clientY - rect.top > rect.height / 2 ? "after" : "before";
          setDragOver({ id: acc.id, position });
        }}
        onDrop={(e) => {
          if (draggingId === null || draggingId === acc.id) return;
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== acc.type) return;
          e.preventDefault();
          reorderAccounts(draggingId, acc.id, dragOver?.position || "before");
          setDraggingId(null);
          setDragOver(null);
        }}
        onDragLeave={() => {
          if (dragOver?.id === acc.id) setDragOver(null);
        }}
      >
        <button
          aria-label="Drag to reorder account"
          className="absolute right-1 top-1 z-10 rounded-full border border-slate-200/80 bg-white/75 p-[6px] text-slate-400 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-600 hover:shadow dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-500"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggingId(acc.id);
            setDragOver({ id: acc.id, position: "before" });
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOver(null);
          }}
        >
          <span className="flex flex-col items-center justify-center gap-[2px] px-[1px]">
            <span className="flex gap-[2px]">
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
            </span>
            <span className="flex gap-[2px]">
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
            </span>
          </span>
        </button>

        <div className={`w-full border border-transparent pr-7 ${borderClass}`}>
          <AccountCardCompact
            variant="row"
            account={acc}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                accountId: acc.id,
              });
            }}
          />
        </div>
      </div>
    );
  };

  const sectionDropZone = (list, type: "debit" | "credit") => {
    if (list.length === 0 || draggingId === null) return null;
    const last = list[list.length - 1];
    return (
      <div
        className="h-2 w-full"
        onDragOver={(e) => {
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== type) return;
          e.preventDefault();
          setDragOver({ id: last.id, position: "after" });
        }}
        onDrop={(e) => {
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== type) return;
          e.preventDefault();
          reorderAccounts(draggingId, last.id, "after");
          setDraggingId(null);
          setDragOver(null);
        }}
      />
    );
  };

  return (
    <aside className="space-y-3 w-full text-sm">

      {/* Quick nav — only shown when wired up to a parent view */}
      {onViewChange && (
        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeView === item.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Ready to Assign — only in the primary sidebar */}
      {onViewChange && <div className={cn(
        "rounded-xl px-4 py-3",
        rta < 0
          ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
          : "bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800"
      )}>
        <p className={cn(
          "text-[10px] font-semibold uppercase tracking-wide mb-1",
          rta < 0 ? "text-red-400 dark:text-red-500" : "text-teal-600 dark:text-teal-500"
        )}>
          Ready to Assign
        </p>
        <p className={cn(
          "text-2xl font-bold font-mono tabular-nums leading-none",
          rta < 0 ? "text-red-600 dark:text-red-400" : "text-teal-700 dark:text-teal-300"
        )}>
          {rta.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </p>
        {rta > 0 && (
          <p className="text-[10px] text-teal-500 dark:text-teal-500 mt-1.5">
            Assign it before the month ends
          </p>
        )}
        {rta < 0 && (
          <p className="text-[10px] text-red-400 dark:text-red-500 mt-1.5">
            Over-assigned — check your budget
          </p>
        )}
      </div>}

      {/* Accounts list */}
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Accounts
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowModal(true)}
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {accounts.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
            No accounts yet.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-3 pt-2.5 pb-1">
              Cash
            </p>
            <div className="flex flex-col px-1">
              {accounts
                .filter((a) => a.type === "debit")
                .map((acc) => renderAccountCard(acc))}
            </div>
            {sectionDropZone(accounts.filter((a) => a.type === "debit"), "debit")}

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-3 pt-1.5 pb-1">
              Credit
            </p>
            <div className="flex flex-col px-1 pb-1">
              {accounts
                .filter((a) => a.type === "credit")
                .map((acc) => renderAccountCard(acc))}
            </div>
            {sectionDropZone(accounts.filter((a) => a.type === "credit"), "credit")}
          </div>
        )}

        {showModal && (
          <AddAccountModal
            onAddAccount={handleAddAccount}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>

      {/* Footer stats — only in the primary sidebar */}
      {accounts.length > 0 && onViewChange && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">

          {/* Net worth */}
          <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-2.5">
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Net Worth
            </p>
            <p className={cn(
              "text-sm font-semibold font-mono tabular-nums leading-none",
              netWorth < 0 ? "text-red-500 dark:text-red-400" : "text-slate-700 dark:text-slate-200"
            )}>
              {netWorth.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </p>
          </div>

          {/* Spending pace */}
          {spendingPace && (
            <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  Spending Pace
                </p>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                  Day {spendingPace.daysElapsed}/{spendingPace.daysInMonth}
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                {/* Average marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-slate-500 z-10"
                  style={{ left: `${Math.min((spendingPace.avgMonthTotal > 0 ? (spendingPace.projectedMonthTotal / (spendingPace.avgMonthTotal * 1.5)) : 0.5) * 100, 100)}%` }}
                />
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    spendingPace.isAhead ? "bg-red-400 dark:bg-red-500" : "bg-teal-500 dark:bg-teal-400"
                  )}
                  style={{ width: `${Math.min((spendingPace.avgMonthTotal > 0 ? spendingPace.currentTotal / (spendingPace.avgMonthTotal * 1.5) : 0) * 100, 100)}%` }}
                />
              </div>

              {/* Status + numbers */}
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "text-[11px] font-semibold",
                  spendingPace.isAhead ? "text-red-500 dark:text-red-400" : "text-teal-600 dark:text-teal-400"
                )}>
                  {spendingPace.isAhead ? "▲" : "▼"} {spendingPace.pct.toFixed(0)}% {spendingPace.isAhead ? "over" : "under"}
                </span>
                <div className="text-right">
                  <p className="text-[11px] font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-200 leading-none">
                    {spendingPace.currentTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
                    proj. {spendingPace.projectedMonthTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right-click context menu for delete account (kept, but visually softened) */}
      {contextMenu &&
        createPortal(
          <div
            className="absolute bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-md z-50 text-xs"
            style={{
              top: contextMenu.y - document.documentElement.scrollTop,
              left: contextMenu.x,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="px-3 py-2 w-full text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              onClick={() => {
                const acc = accounts.find((a) => a.id === contextMenu!.accountId);
                setRenaming({ accountId: contextMenu!.accountId, value: acc?.name ?? "" });
                setContextMenu(null);
              }}
            >
              Rename account
            </button>
            <button
              className="px-3 py-2 w-full text-left hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
              onClick={() => {
                handleDeleteAccount(contextMenu!.accountId);
                setContextMenu(null);
              }}
            >
              Delete account
            </button>
          </div>,
          document.body
        )}

      {renaming &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={(e) => { if (e.target === e.currentTarget) setRenaming(null); }}
          >
            <form
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-4 w-64 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = renaming.value.trim();
                if (trimmed) editAccountName(renaming.accountId, trimmed);
                setRenaming(null);
              }}
            >
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Rename account</p>
              <input
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={renaming.value}
                autoFocus
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRenaming(null)} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-md bg-teal-600 hover:bg-teal-700 text-white">Save</button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </aside>
  );
}
