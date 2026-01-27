"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import { isSameMonth, parseISO, parse, format } from "date-fns";

const PieChart = dynamic(
  () => import("recharts").then((recharts) => recharts.PieChart),
  {
    ssr: false,
  }
);

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#A728F5",
  "#FF2D55",
];

const TotalSpendingTile = () => {
  const { accounts } = useAccountContext();
  const { currentMonth } = useBudgetContext();

  const totalInflow = useMemo(() => {
    const currentMonthDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    return accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        const isTransfer = (!tx.category && !tx.category_group) || tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance = tx.category === "Category Not Needed" || tx.category_group === "Starting Balance";
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
  }, [accounts, currentMonth]);

  const spendingData = useMemo(() => {
    const currentMonthDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const categoryTotals = {};

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        const isTransfer = (!tx.category && !tx.category_group) || tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance = tx.category === "Category Not Needed" || tx.category_group === "Starting Balance";
        const isCardPayment = tx.category_group === "Credit Card Payments";
        if (
          tx.category === "Ready to Assign" ||
          tx.category === "Ready To Assign" ||
          isStartingBalance ||
          isCardPayment ||
          isTransfer
        )
          return;
        if (tx.balance < 0 && tx.date && isSameMonth(parseISO(tx.date), currentMonthDate)) {
          if (!categoryTotals[tx.category]) {
            categoryTotals[tx.category] = 0;
          }
          categoryTotals[tx.category] += Math.abs(tx.balance);
        }
      });
    });

    return Object.entries(categoryTotals).map(([category, amount], index) => {
      // Calculate percentage from the full totalOutflow
      return {
        name: category,
        value: amount,
        percentage: 0, // Will be calculated after totalOutflow is known
        color: COLORS[index % COLORS.length],
      };
    });
  }, [accounts, currentMonth]);

  const totalOutflow = (() => {
    const currentMonthDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    return accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        const isTransfer = (!tx.category && !tx.category_group) || tx.payee?.toLowerCase().includes("transfer");
        const isStartingBalance = tx.category === "Category Not Needed" || tx.category_group === "Starting Balance";
        const isCardPayment = tx.category_group === "Credit Card Payments";
        if (isTransfer || isStartingBalance || isCardPayment) return false;
        if (tx.balance >= 0) return false;
        if (!tx.date || !isSameMonth(parseISO(tx.date), currentMonthDate)) return false;
        return true;
      })
      .reduce((sum, tx) => sum + Math.abs(tx.balance), 0);
  })();

  // Recalculate percentages based on totalOutflow
  const spendingDataWithPercentages = spendingData.map(item => ({
    ...item,
    percentage: totalOutflow ? ((item.value as number / totalOutflow) * 100).toFixed(1) : 0,
  }));

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 overflow-hidden max-w-full">
      {/* Header with Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">Total Income</p>
          <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{formatToUSD(totalInflow)}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Total Spending</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{formatToUSD(totalOutflow)}</p>
        </div>
      </div>

      {spendingData.length === 0 || totalOutflow === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
          <div className="text-center py-12">
            <div className="text-6xl mb-4 opacity-20">📊</div>
            <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No Spending Data</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Start adding transactions to see insights</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 overflow-auto">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Spending Breakdown</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start min-w-0 overflow-hidden">
            {/* Chart */}
            <div className="w-full h-80 min-w-0 flex justify-center items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                <Pie
                  data={spendingDataWithPercentages}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={140}
                  innerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                  stroke="none"
                >
                  {spendingDataWithPercentages.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatToUSD(value as number), 'Amount']}
                  contentStyle={{
                    backgroundColor: isDark ? "#0f172a" : "#ffffff",
                    border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px",
                  }}
                  labelStyle={{
                    color: isDark ? "#e2e8f0" : "#1f2937",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                  itemStyle={{
                    color: isDark ? "#e2e8f0" : "#1f2937",
                    fontSize: "14px",
                  }}
                  wrapperStyle={{ outline: "none" }}
                  cursor={{ fill: "transparent" }}
                />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category List */}
            <div className="space-y-3 min-w-0">
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">Categories</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2 min-w-0">
                {spendingDataWithPercentages.map((category, index) => (
                  <div
                    key={index}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-900"
                          style={{ backgroundColor: category.color }}
                        ></span>
                        <span className="text-base font-medium text-slate-900 dark:text-slate-100 truncate" title={category.name}>
                          {category.name}
                        </span>
                      </div>
                      <div className="flex flex-col items-end ml-4 flex-shrink-0">
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {formatToUSD(category.value)}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {category.percentage}% of spending
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TotalSpendingTile;
