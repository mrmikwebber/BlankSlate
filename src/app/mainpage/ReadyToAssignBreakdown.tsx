"use client";

import type { ReactNode } from "react";
import { format, parseISO, subMonths } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Wraps any Ready to Assign display so clicking it opens a breakdown of the
// math behind the figure, matching YNAB's own "Ready to Assign" breakdown:
// leftover from last month + this month's income - last month's cash
// overspending - this month's assigned = Ready to Assign. This is genuinely
// specific to whichever month is currently in view (see
// BudgetContext.currentMonth) — RTA is sequential/per-month, not one figure
// shared across every month.
export default function ReadyToAssignBreakdown({ children }: { children: ReactNode }) {
  const { budgetView, currentMonth } = useBudgetContext();

  const prevMonthLeftover = budgetView?.rta_prev_month_leftover ?? 0;
  const incomeThisMonth = budgetView?.rta_income_this_month ?? 0;
  const overspendPrevMonth = budgetView?.rta_overspend_prev_month ?? 0;
  const assignedThisMonth = budgetView?.rta_assigned_this_month ?? 0;
  const readyToAssign = budgetView?.ready_to_assign ?? 0;

  const monthDate = parseISO(`${currentMonth}-01`);
  const monthLabel = format(monthDate, "MMMM");
  const prevMonthLabel = format(subMonths(monthDate, 1), "MMMM");

  // Money already assigned to a later month (e.g. pre-budgeting next
  // month's rent) doesn't touch the core recursive RTA — it only counts
  // once the walk reaches that month — but while you're looking at the real
  // current month, it's worth a warning that some of what looks available
  // is already spoken for. Only shown for the actual current month, not
  // when browsing past history (matches YNAB). The server already bakes
  // this into `ready_to_assign` itself for the current month (see
  // serializeMonthView), so no further subtraction is needed here.
  const isRealCurrentMonth = currentMonth === format(new Date(), "yyyy-MM");
  const assignedBeyond = isRealCurrentMonth ? budgetView?.rta_assigned_beyond_this_month ?? 0 : 0;

  const inTotal = prevMonthLeftover + incomeThisMonth;
  const outTotal = overspendPrevMonth + assignedThisMonth + assignedBeyond;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ready to Assign Breakdown</DialogTitle>
          <DialogDescription>For {monthLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 font-mono text-sm tabular-nums">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">In</p>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Ready to Assign left over from {prevMonthLabel}</span>
              <span className={cn(prevMonthLeftover < 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100")}>
                {fmt(prevMonthLeftover)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Inflow: Ready to Assign transactions in {monthLabel}</span>
              <span className="text-slate-800 dark:text-slate-100">{fmt(incomeThisMonth)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold">
              <span className="text-slate-600 dark:text-slate-300">=</span>
              <span className="text-slate-800 dark:text-slate-100">{fmt(inTotal)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Out</p>
            {overspendPrevMonth > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Cash overspending in {prevMonthLabel}</span>
                <span className="text-red-600 dark:text-red-400">−{fmt(overspendPrevMonth)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Assigned in {monthLabel}</span>
              <span className="text-slate-800 dark:text-slate-100">−{fmt(assignedThisMonth)}</span>
            </div>
            {assignedBeyond > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Assigned in Future</span>
                <span className="text-slate-800 dark:text-slate-100">−{fmt(assignedBeyond)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold">
              <span className="text-slate-600 dark:text-slate-300">=</span>
              <span className="text-slate-800 dark:text-slate-100">−{fmt(outTotal)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t-2 border-slate-300 dark:border-slate-600 pt-2 font-semibold text-base">
            <span className="text-slate-700 dark:text-slate-200">Total Ready to Assign</span>
            <span className={cn(readyToAssign < 0 ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400")}>
              {fmt(readyToAssign)}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Cash overspending only counts money that left a debit account without being budgeted
          for it — credit card spending doesn&apos;t count here, since that&apos;s tracked
          through the card&apos;s own balance instead. Once counted the month after it happens,
          it&apos;s permanent — assigning more to that category later is separate, new spending
          of fresh money, not a way to undo the overspend.{" "}
          {assignedBeyond > 0 &&
            "\"Assigned in Future\" is money you've already committed to a later month — it doesn't reduce Ready to Assign once you get there, since that month accounts for it itself."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
