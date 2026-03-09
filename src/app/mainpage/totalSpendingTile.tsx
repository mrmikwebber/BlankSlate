"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import { isSameMonth, parseISO, parse, subMonths, format } from "date-fns";
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

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v / max) * (height - pad * 2));
    return `${x},${y}`;
  });
  return "M" + pts.join(" L");
}

const TotalSpendingTile = () => {
  const { accounts } = useAccountContext();
  const { currentMonth, budgetData } = useBudgetContext();

  const currentMonthDate = useMemo(
    () => parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date()),
    [currentMonth]
  );

  const monthLabel = useMemo(
    () => format(currentMonthDate, "MMMM yyyy"),
    [currentMonthDate]
  );

  // Total income (inflows) for current month
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

  // Spending by category for current month
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
        percentage: totalOutflow
          ? ((item.value / totalOutflow) * 100).toFixed(1)
          : "0.0",
      })),
    [spendingData, totalOutflow]
  );

  const netSaved = totalInflow - totalOutflow;

  // Last 6 months trend
  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(currentMonthDate, 5 - i);
      return {
        label: i === 5 ? "Now" : format(d, "MMM"),
        spending: getSpendingForMonth(accounts, d),
      };
    });
  }, [accounts, currentMonthDate]);

  // Spending vs Budget (top 8 categories)
  const budgetVsSpending = useMemo(() => {
    if (!budgetData?.[currentMonth]) return spendingWithPct.slice(0, 8).map((item) => ({ ...item, assigned: 0, overspent: true }));
    const assigned: Record<string, number> = {};
    budgetData[currentMonth].categories.forEach((group: { categoryItems: { name: string; assigned?: number }[] }) => {
      group.categoryItems.forEach((item: { name: string; assigned?: number }) => {
        assigned[item.name] = item.assigned ?? 0;
      });
    });
    return spendingWithPct.slice(0, 8).map((item) => {
      const a = assigned[item.name] ?? 0;
      return { ...item, assigned: a, overspent: item.value > a };
    });
  }, [spendingWithPct, budgetData, currentMonth]);

  // Category breakdown (combine spending + assigned)
  const categoryBreakdown = useMemo(() => {
    if (!budgetData?.[currentMonth])
      return spendingWithPct.slice(0, 10).map((item) => ({
        ...item,
        assigned: 0,
        remaining: -item.value,
      }));
    const assigned: Record<string, number> = {};
    budgetData[currentMonth].categories.forEach((group: { categoryItems: { name: string; assigned?: number }[] }) => {
      group.categoryItems.forEach((item: { name: string; assigned?: number }) => {
        assigned[item.name] = item.assigned ?? 0;
      });
    });
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

  return (
    <div className="w-full flex flex-col gap-3 p-4 overflow-y-auto">

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Income */}
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

        {/* Spending */}
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

        {/* Net Saved */}
        <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="absolute top-0 inset-x-0 h-[3px] bg-blue-500 rounded-t-xl" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Net Saved
          </p>
          <p
            className={cn(
              "font-mono text-xl font-semibold",
              netSaved >= 0
                ? "text-blue-600 dark:text-blue-400"
                : "text-red-600 dark:text-red-400"
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

      {/* ── Charts Row ── */}
      {spendingData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Spending Breakdown donut */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
              Spending Breakdown
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Where your money went this month
            </p>
            <div className="flex items-center gap-5">
              {/* Donut */}
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

              {/* Legend */}
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

          {/* Spending vs Budget bars */}
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
        </div>
      )}

      {/* ── Monthly Trend Sparkline ── */}
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
              {/* grid lines */}
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
              {/* area fill */}
              {sparklinePath && (
                <path
                  d={`${sparklinePath} L760,80 L0,80 Z`}
                  fill="url(#trendFill)"
                />
              )}
              {/* line */}
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
              {/* dots */}
              {monthlyTrend.map((m, i) => {
                const max = Math.max(...monthlyTrend.map((x) => x.spending), 1);
                const x = 4 + (i / (monthlyTrend.length - 1)) * 752;
                const y = 80 - 4 - ((m.spending / max) * 72);
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

      {/* ── Category Breakdown Table ── */}
      {categoryBreakdown.length > 0 && (
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
                <tr
                  key={i}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
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
