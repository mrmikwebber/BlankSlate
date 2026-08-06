"use client";

import { useState, type ReactNode } from "react";
import { format, parseISO, subMonths } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  dialogSheetOnMobile,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function PlanningModeToggle() {
  const { planningMode, setPlanningMode } = useBudgetContext();
  return (
    <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
      <button
        type="button"
        data-cy="planning-mode-period"
        onClick={() => setPlanningMode("period")}
        className={cn(
          "px-2 py-0.5 rounded transition-colors",
          planningMode === "period"
            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Period
      </button>
      <button
        type="button"
        data-cy="planning-mode-global"
        onClick={() => setPlanningMode("global")}
        className={cn(
          "px-2 py-0.5 rounded transition-colors",
          planningMode === "global"
            ? "bg-amber-200 dark:bg-amber-700/60 text-amber-900 dark:text-amber-100 font-semibold"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Global
      </button>
    </div>
  );
}

// Uncontrolled-feeling number input for the one Global-mode planning value
// that isn't a per-category cell — commits on blur/Enter like
// EditableAssigned/TargetInlineEditor's inputs, but plain (no mathjs
// expression support needed for a single lump-sum figure).
function PlannedIncomeInput({ month, value }: { month: string; value: number }) {
  const { setPlannedIncome } = useBudgetContext();
  const [inputValue, setInputValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  const commit = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    setPlannedIncome(month, isNaN(parsed) ? 0 : parsed);
  };

  return (
    <Input
      data-cy="planned-income-input"
      type="number"
      value={isEditing ? inputValue : String(value)}
      onFocus={() => {
        setIsEditing(true);
        setInputValue(String(value));
      }}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-6 w-24 text-right font-mono text-xs tabular-nums px-1.5"
    />
  );
}

// Wraps any Ready to Assign display so clicking it opens a breakdown of the
// math behind the figure, matching YNAB's own "Ready to Assign" breakdown:
// leftover from last month + this month's income - last month's cash
// overspending - this month's assigned = Ready to Assign. This is genuinely
// specific to whichever month is currently in view (see
// BudgetContext.currentMonth) — RTA is sequential/per-month, not one figure
// shared across every month.
export default function ReadyToAssignBreakdown({ children }: { children: ReactNode }) {
  const { budgetView, currentMonth, planningMode } = useBudgetContext();

  const prevMonthLeftover = budgetView?.rta_prev_month_leftover ?? 0;
  const incomeThisMonth = budgetView?.rta_income_this_month ?? 0;
  const overspendPrevMonth = budgetView?.rta_overspend_prev_month ?? 0;
  const assignedThisMonth = budgetView?.rta_assigned_this_month ?? 0;
  const readyToAssign = budgetView?.ready_to_assign ?? 0;

  // Global planning mode — single-month preview, computed client-side from
  // the same per-item globalAssigned the assign cells already show, so this
  // stays consistent with computeBudgetState's own formula (real RTA +
  // planned income - only the *excess* of shadow assigned over real
  // assigned) without the server needing to expose a second redundant total.
  const isGlobal = planningMode === "global";
  const globalPlannedIncome = budgetView?.global_planned_income ?? 0;
  const globalReadyToAssign = budgetView?.global_ready_to_assign ?? 0;
  const globalAssignedTotal = (budgetView?.categories ?? [])
    .flatMap((c) => c.categoryItems)
    .reduce((sum, i) => sum + (i.globalAssigned ?? 0), 0);
  const globalAssignedDelta = globalAssignedTotal - assignedThisMonth;

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

  // In Global mode the same "In total - Out total = headline" shape holds —
  // it's the exact real math above, plus planned income on the In side and
  // only the *excess* of shadow-assigned over real-assigned on the Out side
  // (matches computeBudgetState's formula, see the comment above).
  const displayInTotal = isGlobal ? inTotal + globalPlannedIncome : inTotal;
  const displayOutTotal = isGlobal ? outTotal + globalAssignedDelta : outTotal;
  const displayTotal = isGlobal ? globalReadyToAssign : readyToAssign;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={cn(dialogSheetOnMobile, "sm:max-w-sm")}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Ready to Assign Breakdown</DialogTitle>
            <PlanningModeToggle />
          </div>
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
            {isGlobal && (
              <div className="flex justify-between items-center">
                <span className="text-amber-700 dark:text-amber-400">Planned future income</span>
                <PlannedIncomeInput month={currentMonth} value={globalPlannedIncome} />
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold">
              <span className="text-slate-600 dark:text-slate-300">=</span>
              <span className="text-slate-800 dark:text-slate-100">{fmt(displayInTotal)}</span>
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
            {isGlobal && globalAssignedDelta !== 0 && (
              <div className="flex justify-between">
                <span className="text-amber-700 dark:text-amber-400">Extra planned assigned</span>
                <span className="text-amber-700 dark:text-amber-400">−{fmt(globalAssignedDelta)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold">
              <span className="text-slate-600 dark:text-slate-300">=</span>
              <span className="text-slate-800 dark:text-slate-100">−{fmt(displayOutTotal)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t-2 border-slate-300 dark:border-slate-600 pt-2 font-semibold text-base">
            <span className="text-slate-700 dark:text-slate-200">
              Total {isGlobal ? "Global " : ""}Ready to Assign
            </span>
            <span
              data-cy="rta-breakdown-total"
              className={cn(displayTotal < 0 ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400")}
            >
              {fmt(displayTotal)}
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
