"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import {
  isSameMonth,
  parseISO,
  parse,
  subMonths,
  format,
  getDaysInMonth,
} from "date-fns";
import { cn } from "@/lib/utils";

const PieChart = dynamic(
  () => import("recharts").then((recharts) => recharts.PieChart),
  { ssr: false }
);

const COLORS = [
  "#4f91ff",
  "#00c9a7",
  "#a78bfa",
  "#f59e0b",
  "#ff5c6e",
  "#34d399",
  "#fb923c",
  "#e879f9",
];

// ── Widget registry ──────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: "ynab-stats",      label: "Budget Summary",      defaultOn: true  },
  { id: "classic-stats",   label: "Income & Savings",    defaultOn: false },
  { id: "spending-pace",   label: "Spending Pace",       defaultOn: true  },
  { id: "donut",           label: "Spending Breakdown",  defaultOn: true  },
  { id: "budget-bars",     label: "Spending vs Budget",  defaultOn: true  },
  { id: "trend",           label: "Monthly Trend",       defaultOn: true  },
  { id: "category-table",  label: "Category Breakdown",  defaultOn: true  },
] as const;

type WidgetId = (typeof WIDGET_DEFS)[number]["id"];

const STORAGE_KEY = "insights-enabled-widgets";
const DEFAULT_ENABLED: WidgetId[] = WIDGET_DEFS.filter((w) => w.defaultOn).map((w) => w.id);

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSpendingForMonth(
  accounts: ReturnType<typeof useAccountContext>["accounts"],
  monthDate: Date
): number {
  return accounts
    .flatMap((a) => a.transactions)
    .filter((tx) => {
      const isTransfer =
        (!tx.category && !tx.category_group) ||
        tx.payee?.toLowerCase().includes("transfer");
      const isStartingBalance =
        tx.category === "Category Not Needed" ||
        tx.category_group === "Starting Balance";
      const isCardPayment = tx.category_group === "Credit Card Payments";
      return (
        tx.balance < 0 &&
        tx.date &&
        isSameMonth(parseISO(tx.date), monthDate) &&
        !isTransfer &&
        !isStartingBalance &&
        !isCardPayment
      );
    })
    .reduce((sum, tx) => sum + Math.abs(tx.balance), 0);
}

function getCategorySpendingForMonth(
  accounts: ReturnType<typeof useAccountContext>["accounts"],
  monthDate: Date
): Record<string, number> {
  const totals: Record<string, number> = {};
  accounts.flatMap((a) => a.transactions).forEach((tx) => {
    const isTransfer =
      (!tx.category && !tx.category_group) ||
      tx.payee?.toLowerCase().includes("transfer");
    const isStartingBalance =
      tx.category === "Category Not Needed" ||
      tx.category_group === "Starting Balance";
    const isCardPayment = tx.category_group === "Credit Card Payments";
    if (
      tx.balance < 0 &&
      tx.date &&
      tx.category &&
      tx.category !== "Ready to Assign" &&
      tx.category !== "Ready To Assign" &&
      isSameMonth(parseISO(tx.date), monthDate) &&
      !isTransfer &&
      !isStartingBalance &&
      !isCardPayment
    ) {
      totals[tx.category] = (totals[tx.category] ?? 0) + Math.abs(tx.balance);
    }
  });
  return totals;
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return `${x},${y}`;
  });
  return "M" + pts.join(" L");
}

// ── Component ────────────────────────────────────────────────────────────────
const TotalSpendingTile = () => {
  const { accounts } = useAccountContext();
  const { currentMonth, budgetData } = useBudgetContext();

  // Widget visibility state (persisted to localStorage)
  const [enabledWidgets, setEnabledWidgets] = useState<WidgetId[]>(DEFAULT_ENABLED);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [paceBreakdownOpen, setPaceBreakdownOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setEnabledWidgets(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledWidgets));
  }, [enabledWidgets]);

  // Close selector on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    };
    if (selectorOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectorOpen]);

  const show = (id: WidgetId) => enabledWidgets.includes(id);

  const toggleWidget = (id: WidgetId) => {
    setEnabledWidgets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  // ── Core data ──────────────────────────────────────────────────────────────
  const currentMonthDate = useMemo(
    () => parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date()),
    [currentMonth]
  );

  const monthLabel = useMemo(() => format(currentMonthDate, "MMMM yyyy"), [currentMonthDate]);

  const totalInflow = useMemo(() => {
    return accounts
      .flatMap((a) => a.transactions)
      .filter((tx) => {
        const isTransfer =
          (!tx.category && !tx.category_group) ||
          tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance =
          tx.category === "Category Not Needed" ||
          tx.category_group === "Starting Balance";
        const isCardPayment = tx.category_group === "Credit Card Payments";
        return (
          tx.balance > 0 &&
          tx.date &&
          isSameMonth(parseISO(tx.date), currentMonthDate) &&
          !isTransfer &&
          !isStartingBalance &&
          !isCardPayment
        );
      })
      .reduce((sum, tx) => sum + tx.balance, 0);
  }, [accounts, currentMonthDate]);

  const spendingData = useMemo(() => {
    const totals: Record<string, number> = {};
    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        const isTransfer =
          (!tx.category && !tx.category_group) ||
          tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance =
          tx.category === "Category Not Needed" ||
          tx.category_group === "Starting Balance";
        const isCardPayment = tx.category_group === "Credit Card Payments";
        if (
          tx.category === "Ready to Assign" ||
          tx.category === "Ready To Assign" ||
          isStartingBalance ||
          isCardPayment ||
          isTransfer
        )
          return;
        if (
          tx.balance < 0 &&
          tx.date &&
          isSameMonth(parseISO(tx.date), currentMonthDate)
        ) {
          totals[tx.category] = (totals[tx.category] ?? 0) + Math.abs(tx.balance);
        }
      });
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [accounts, currentMonthDate]);

  const totalOutflow = useMemo(
    () => spendingData.reduce((sum, item) => sum + item.value, 0),
    [spendingData]
  );

  const spendingWithPct = useMemo(
    () =>
      spendingData.map((item) => ({
        ...item,
        percentage: totalOutflow ? ((item.value / totalOutflow) * 100).toFixed(1) : "0.0",
      })),
    [spendingData, totalOutflow]
  );

  const netSaved = totalInflow - totalOutflow;

  // ── YNAB-style stats ───────────────────────────────────────────────────────
  const ynabStats = useMemo(() => {
    if (!budgetData?.[currentMonth]) return { assigned: 0, available: 0 };
    let assigned = 0;
    let available = 0;
    budgetData[currentMonth].categories.forEach(
      (group: { categoryItems: { assigned?: number; available?: number }[] }) => {
        group.categoryItems.forEach((item) => {
          assigned += item.assigned ?? 0;
          available += item.available ?? 0;
        });
      }
    );
    return { assigned, available };
  }, [budgetData, currentMonth]);

  // ── Spending Pace ──────────────────────────────────────────────────────────
  const spendingPace = useMemo(() => {
    const today = new Date();
    const isCurrentRealMonth = isSameMonth(currentMonthDate, today);
    const daysInMonth = getDaysInMonth(currentMonthDate);
    const daysElapsed = isCurrentRealMonth ? Math.max(today.getDate(), 1) : daysInMonth;

    // Gather daily rates from up to 3 past months with actual spending
    const historicalRates: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(currentMonthDate, i);
      const spending = getSpendingForMonth(accounts, d);
      if (spending > 0) {
        historicalRates.push(spending / getDaysInMonth(d));
        if (historicalRates.length >= 3) break;
      }
    }

    if (historicalRates.length === 0) return null;

    const avgDailyRate =
      historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
    const currentDailyRate = daysElapsed > 0 ? totalOutflow / daysElapsed : 0;
    const avgAtThisPoint = avgDailyRate * daysElapsed;
    const diff = totalOutflow - avgAtThisPoint;
    const pct =
      avgAtThisPoint > 0 ? Math.abs((diff / avgAtThisPoint) * 100) : 0;
    const projectedMonthTotal = currentDailyRate * daysInMonth;
    const avgMonthTotal = avgDailyRate * daysInMonth;

    return {
      isAhead: diff > 0,
      pct,
      diff,
      avgAtThisPoint,
      projectedMonthTotal,
      avgMonthTotal,
      daysElapsed,
      daysInMonth,
      currentTotal: totalOutflow,
    };
  }, [accounts, currentMonthDate, totalOutflow]);

  // ── Category Pace Breakdown ────────────────────────────────────────────────
  const categoryPaceBreakdown = useMemo(() => {
    if (!spendingPace) return [];
    const today = new Date();
    const isCurrentRealMonth = isSameMonth(currentMonthDate, today);
    const daysElapsed = isCurrentRealMonth ? Math.max(today.getDate(), 1) : spendingPace.daysInMonth;

    const currentCatSpend = getCategorySpendingForMonth(accounts, currentMonthDate);

    // Gather historical per-category spending for up to 3 past months
    const historicalMonths: Array<{ spending: Record<string, number>; days: number }> = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(currentMonthDate, i);
      const spending = getCategorySpendingForMonth(accounts, d);
      if (Object.keys(spending).length > 0) {
        historicalMonths.push({ spending, days: getDaysInMonth(d) });
        if (historicalMonths.length >= 3) break;
      }
    }
    if (historicalMonths.length === 0) return [];

    // All categories with spending this month
    const categories = Object.keys(currentCatSpend);

    return categories
      .map((cat) => {
        const current = currentCatSpend[cat] ?? 0;
        // Average daily rate for this category across historical months
        const rates = historicalMonths
          .map((m) => (m.spending[cat] ?? 0) / m.days)
          .filter((r) => r > 0);
        const avgDailyRate = rates.length > 0
          ? rates.reduce((a, b) => a + b, 0) / rates.length
          : 0;
        const avgAtThisPoint = avgDailyRate * daysElapsed;
        const diff = current - avgAtThisPoint;
        return { name: cat, current, avgAtThisPoint, diff, isNew: avgDailyRate === 0 };
      })
      .filter((c) => Math.abs(c.diff) > 0.5 || c.isNew)
      .sort((a, b) => b.diff - a.diff);
  }, [spendingPace, accounts, currentMonthDate]);

  // ── Monthly trend ──────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(currentMonthDate, 5 - i);
      return {
        label: i === 5 ? "Now" : format(d, "MMM"),
        spending: getSpendingForMonth(accounts, d),
      };
    });
  }, [accounts, currentMonthDate]);

  // ── Spending vs Budget ─────────────────────────────────────────────────────
  const budgetVsSpending = useMemo(() => {
    if (!budgetData?.[currentMonth])
      return spendingWithPct
        .slice(0, 8)
        .map((item) => ({ ...item, assigned: 0, overspent: true }));
    const assigned: Record<string, number> = {};
    budgetData[currentMonth].categories.forEach(
      (group: { categoryItems: { name: string; assigned?: number }[] }) => {
        group.categoryItems.forEach((item) => {
          assigned[item.name] = item.assigned ?? 0;
        });
      }
    );
    return spendingWithPct.slice(0, 8).map((item) => {
      const a = assigned[item.name] ?? 0;
      return { ...item, assigned: a, overspent: item.value > a };
    });
  }, [spendingWithPct, budgetData, currentMonth]);

  // ── Category breakdown ─────────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    if (!budgetData?.[currentMonth])
      return spendingWithPct.slice(0, 10).map((item) => ({
        ...item,
        assigned: 0,
        remaining: -item.value,
      }));
    const assigned: Record<string, number> = {};
    budgetData[currentMonth].categories.forEach(
      (group: { categoryItems: { name: string; assigned?: number }[] }) => {
        group.categoryItems.forEach((item) => {
          assigned[item.name] = item.assigned ?? 0;
        });
      }
    );
    return spendingWithPct.slice(0, 10).map((item) => ({
      ...item,
      assigned: assigned[item.name] ?? 0,
      remaining: (assigned[item.name] ?? 0) - item.value,
    }));
  }, [spendingWithPct, budgetData, currentMonth]);

  const sparklinePath = useMemo(
    () => buildSparklinePath(monthlyTrend.map((m) => m.spending), 760, 80),
    [monthlyTrend]
  );

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col gap-3 p-4 overflow-y-auto">

      {/* ── Header with widget selector ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Insights — <span className="font-normal text-slate-500 dark:text-slate-400">{monthLabel}</span>
        </p>
        <div className="relative" ref={selectorRef}>
          <button
            onClick={() => setSelectorOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
              selectorOpen
                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Customize
          </button>

          {selectorOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 px-1">
                Visible Widgets
              </p>
              <div className="space-y-0.5">
                {WIDGET_DEFS.map((w) => {
                  const active = enabledWidgets.includes(w.id);
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleWidget(w.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <span
                        className={cn(
                          "w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors",
                          active
                            ? "bg-teal-500 border-teal-500"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {active && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="text-xs text-slate-700 dark:text-slate-300">{w.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setEnabledWidgets(DEFAULT_ENABLED)}
                className="mt-2 w-full text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-center py-1 transition-colors"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── YNAB-style stat cards ── */}
      {show("ynab-stats") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Assigned */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-violet-500 rounded-t-xl" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Assigned This Month
            </p>
            <p className="font-mono text-xl font-semibold text-violet-600 dark:text-violet-400">
              {formatToUSD(ynabStats.assigned)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              Budgeted across all categories
            </p>
          </div>

          {/* Spent */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-orange-500 rounded-t-xl" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Spent This Month
            </p>
            <p className="font-mono text-xl font-semibold text-orange-600 dark:text-orange-400">
              {formatToUSD(totalOutflow)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {ynabStats.assigned > 0
                ? `${((totalOutflow / ynabStats.assigned) * 100).toFixed(0)}% of assigned`
                : "No budget assigned"}
            </p>
          </div>

          {/* Available */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div
              className={cn(
                "absolute top-0 inset-x-0 h-[3px] rounded-t-xl",
                ynabStats.available >= 0 ? "bg-teal-500" : "bg-red-500"
              )}
            />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Available Remaining
            </p>
            <p
              className={cn(
                "font-mono text-xl font-semibold",
                ynabStats.available >= 0
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {ynabStats.available < 0 && "−"}
              {formatToUSD(Math.abs(ynabStats.available))}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {ynabStats.available >= 0 ? "Still available to spend" : "Over budget"}
            </p>
          </div>
        </div>
      )}

      {/* ── Classic Income / Savings stat cards ── */}
      {show("classic-stats") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-teal-500 rounded-t-xl" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Total Income
            </p>
            <p className="font-mono text-xl font-semibold text-teal-600 dark:text-teal-400">
              {formatToUSD(totalInflow)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{monthLabel}</p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-red-500 rounded-t-xl" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Total Spending
            </p>
            <p className="font-mono text-xl font-semibold text-red-600 dark:text-red-400">
              {formatToUSD(totalOutflow)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {totalInflow > 0
                ? `${((totalOutflow / totalInflow) * 100).toFixed(1)}% of income`
                : "No income tracked"}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-blue-500 rounded-t-xl" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Net Saved
            </p>
            <p
              className={cn(
                "font-mono text-xl font-semibold",
                netSaved >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {formatToUSD(netSaved)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {totalInflow > 0
                ? `${((netSaved / totalInflow) * 100).toFixed(1)}% of income retained`
                : "No income tracked"}
            </p>
          </div>
        </div>
      )}

      {/* ── Spending Pace ── */}
      {show("spending-pace") && spendingPace && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Spending Pace
            </p>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Day {spendingPace.daysElapsed} of {spendingPace.daysInMonth}
            </span>
          </div>

          {/* Headline pill — full width */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold mb-3",
              spendingPace.isAhead
                ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                : "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400"
            )}
          >
            {spendingPace.isAhead ? (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            <span className="flex-1">
              {spendingPace.isAhead
                ? `Spending ${spendingPace.pct.toFixed(0)}% more than usual`
                : `Spending ${spendingPace.pct.toFixed(0)}% less than usual`}
            </span>
            <span className="text-xs font-normal opacity-70">
              {spendingPace.isAhead ? `+${formatToUSD(Math.abs(spendingPace.diff))} over pace` : `${formatToUSD(Math.abs(spendingPace.diff))} under pace`}
            </span>
          </div>

          {/* 3-stat row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Spent so far</p>
              <p className="font-mono text-base font-semibold text-slate-800 dark:text-slate-100">
                {formatToUSD(spendingPace.currentTotal)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                avg {formatToUSD(spendingPace.avgAtThisPoint)} by now
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Projected</p>
              <p className={cn(
                "font-mono text-base font-semibold",
                spendingPace.projectedMonthTotal > spendingPace.avgMonthTotal
                  ? "text-red-600 dark:text-red-400"
                  : "text-teal-600 dark:text-teal-400"
              )}>
                {formatToUSD(spendingPace.projectedMonthTotal)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">end of month</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Avg month</p>
              <p className="font-mono text-base font-semibold text-slate-600 dark:text-slate-300">
                {formatToUSD(spendingPace.avgMonthTotal)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">historical avg</p>
            </div>
          </div>

          {/* Progress bar: current vs avg pace */}
          <div className="mt-2 space-y-1">
            {/* Current pace bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 w-16 text-right flex-shrink-0">
                This month
              </span>
              <div className="flex-1 h-[6px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    spendingPace.isAhead ? "bg-red-500" : "bg-teal-500"
                  )}
                  style={{
                    width: `${Math.min(
                      (spendingPace.currentTotal /
                        Math.max(spendingPace.projectedMonthTotal, spendingPace.avgMonthTotal, 1)) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-16 text-right flex-shrink-0">
                {formatToUSD(spendingPace.currentTotal)}
              </span>
            </div>
            {/* Avg pace bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 w-16 text-right flex-shrink-0">
                Avg pace
              </span>
              <div className="flex-1 h-[6px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-300 dark:bg-slate-600"
                  style={{
                    width: `${Math.min(
                      (spendingPace.avgAtThisPoint /
                        Math.max(spendingPace.projectedMonthTotal, spendingPace.avgMonthTotal, 1)) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-16 text-right flex-shrink-0">
                {formatToUSD(spendingPace.avgAtThisPoint)}
              </span>
            </div>
          </div>

          {/* Category breakdown */}
          {categoryPaceBreakdown.length > 0 && (
            <div className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
              <button
                onClick={() => setPaceBreakdownOpen((o) => !o)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors w-full"
              >
                <svg
                  className={cn("w-3 h-3 transition-transform", paceBreakdownOpen && "rotate-90")}
                  fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Category breakdown
              </button>

              {paceBreakdownOpen && (
                <div className="mt-1.5 space-y-1.5">
                  {categoryPaceBreakdown.map((cat) => (
                    <div
                      key={cat.name}
                      className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-2.5 py-2"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200 truncate">
                              {cat.name}
                            </span>
                            {cat.isNew && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0">
                                no history
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                            spent {formatToUSD(cat.current)} · expected {formatToUSD(cat.avgAtThisPoint)}
                          </p>
                        </div>

                        <span
                          className={cn(
                            "text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap",
                            cat.diff > 0
                              ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                              : "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400"
                          )}
                        >
                          {cat.diff > 0 ? `+${formatToUSD(cat.diff)}` : `-${formatToUSD(Math.abs(cat.diff))}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Charts Row ── */}
      {spendingData.length > 0 && (show("donut") || show("budget-bars")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Spending Breakdown donut */}
          {show("donut") && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                Spending Breakdown
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Where your money went this month
              </p>
              <div className="flex items-center gap-5">
                <div className="flex-shrink-0 w-[130px] h-[130px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={spendingWithPct}
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        innerRadius={38}
                        dataKey="value"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {spendingWithPct.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [formatToUSD(v as number), "Amount"]}
                        contentStyle={{
                          backgroundColor: isDark ? "#0f172a" : "#ffffff",
                          border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        labelStyle={{ color: isDark ? "#e2e8f0" : "#1f2937", fontSize: "12px", fontWeight: 600 }}
                        itemStyle={{ color: isDark ? "#e2e8f0" : "#1f2937", fontSize: "12px" }}
                        wrapperStyle={{ outline: "none" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {spendingWithPct.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                        {item.percentage}%
                      </span>
                      <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 flex-shrink-0">
                        {formatToUSD(item.value)}
                      </span>
                    </div>
                  ))}
                  {spendingWithPct.length > 5 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-4">
                      +{spendingWithPct.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Spending vs Budget bars */}
          {show("budget-bars") && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                Spending vs Budget
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                How each category tracks against assigned
              </p>
              <div className="space-y-2.5">
                {budgetVsSpending.slice(0, 7).map((item, i) => {
                  const max = Math.max(item.assigned, item.value, 1);
                  const pct = Math.min((item.value / max) * 100, 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 w-20 text-right flex-shrink-0 truncate">
                        {item.name.length > 12 ? item.name.slice(0, 12) + "…" : item.name}
                      </span>
                      <div className="flex-1 h-[6px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: item.overspent ? "#ef4444" : item.color,
                          }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-mono w-14 text-right flex-shrink-0",
                          item.overspent
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {formatToUSD(item.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <div className="w-4 h-[3px] bg-teal-500 rounded" />
                  Within budget
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <div className="w-4 h-[3px] bg-red-500 rounded" />
                  Overspent
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly Trend Sparkline ── */}
      {show("trend") && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Monthly Spending Trend
            </p>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Last 6 months</span>
          </div>
          {monthlyTrend.every((m) => m.spending === 0) ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
              No spending data across months
            </p>
          ) : (
            <>
              <svg
                width="100%"
                height="80"
                viewBox="0 0 760 80"
                preserveAspectRatio="none"
                className="overflow-visible"
              >
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00c9a7" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#00c9a7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[20, 40, 60].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="760"
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-slate-100 dark:text-slate-800"
                  />
                ))}
                {sparklinePath && (
                  <path d={`${sparklinePath} L760,80 L0,80 Z`} fill="url(#trendFill)" />
                )}
                {sparklinePath && (
                  <path
                    d={sparklinePath}
                    fill="none"
                    stroke="#00c9a7"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {monthlyTrend.map((m, i) => {
                  const max = Math.max(...monthlyTrend.map((x) => x.spending), 1);
                  const x = 4 + (i / (monthlyTrend.length - 1)) * 752;
                  const y = 80 - 4 - (m.spending / max) * 72;
                  const isLast = i === monthlyTrend.length - 1;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={isLast ? 4 : 3}
                      fill="#00c9a7"
                      stroke={isLast ? (isDark ? "#0f172a" : "#ffffff") : "none"}
                      strokeWidth={isLast ? 2 : 0}
                    />
                  );
                })}
              </svg>
              <div className="flex justify-between mt-1.5">
                {monthlyTrend.map((m, i) => (
                  <span
                    key={i}
                    className={cn(
                      "text-[10px]",
                      i === monthlyTrend.length - 1
                        ? "text-teal-600 dark:text-teal-400 font-semibold"
                        : "text-slate-400 dark:text-slate-500"
                    )}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Category Breakdown Table ── */}
      {show("category-table") && categoryBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Category Breakdown
            </p>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{monthLabel}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2">
                  Category
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2">
                  Assigned
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2">
                  Spent
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2">
                  Remaining
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2">
                  % of spending
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryBreakdown.map((item, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                        {item.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatToUSD(item.assigned)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                    {formatToUSD(item.value)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right font-mono text-xs font-medium",
                      item.remaining >= 0
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {item.remaining >= 0 ? "" : "−"}
                    {formatToUSD(Math.abs(item.remaining))}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {item.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {spendingData.length === 0 && totalOutflow === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-16">
          <div className="text-center">
            <div className="text-5xl mb-4 opacity-20">📊</div>
            <p className="text-base font-medium text-slate-600 dark:text-slate-400">
              No Spending Data
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              Start adding transactions to see insights
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TotalSpendingTile;
