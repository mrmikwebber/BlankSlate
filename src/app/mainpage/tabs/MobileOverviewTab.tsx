"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { isSameMonth, parseISO } from "date-fns";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function MobileOverviewTab() {
  const { accounts } = useAccountContext();
  const { currentMonth, budgetView } = useBudgetContext();

  // Category names the user has flagged to exclude from Insights charts.
  const hiddenCategoryNames = useMemo(() => {
    const names = new Set<string>();
    budgetView?.categories.forEach((g) =>
      g.categoryItems.forEach((i) => {
        if (i.isHiddenFromInsights) names.add(i.name);
      })
    );
    return names;
  }, [budgetView]);

  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#A728F5",
    "#FF2D55",
  ];

  const totalInflow = useMemo(() => {
    return accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        return (
          tx.category === "Ready to Assign" &&
          tx.date &&
          isSameMonth(
            typeof tx.date === "string" ? parseISO(tx.date) : tx.date,
            parseISO(currentMonth)
          )
        );
      })
      .reduce((sum, tx) => sum + tx.balance, 0);
  }, [accounts, currentMonth]);

  const spendingData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    const accountNames = new Set(accounts.map((a) => a.name));

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        if (
          tx.category === "Ready to Assign" ||
          tx.category_group === "Reconciliation (Hidden)" ||
          (tx.category && hiddenCategoryNames.has(tx.category)) ||
          accountNames.has(tx.category)
        )
          return;
        if (
          tx.balance < 0 &&
          tx.date &&
          isSameMonth(
            typeof tx.date === "string" ? parseISO(tx.date) : tx.date,
            parseISO(currentMonth)
          )
        ) {
          if (!categoryTotals[tx.category]) {
            categoryTotals[tx.category] = 0;
          }
          categoryTotals[tx.category] += Math.abs(tx.balance);
        }
      });
    });

    return Object.entries(categoryTotals)
      .map(([category, amount], index) => ({
        name: category,
        value: amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [accounts, currentMonth, hiddenCategoryNames]);

  const totalSpending = spendingData.reduce(
    (sum, category) => sum + (category.value as number),
    0
  );

  const accountsTotal = accounts.reduce((sum, acc) => {
    const balance = acc.transactions?.reduce((s, tx) => s + tx.balance, 0) ?? 0;
    return sum + balance;
  }, 0);

  return (
    <div className="space-y-4 pb-24 text-slate-900 dark:text-slate-200">
      {/* Key Metrics — Ready to Assign leads as the hero figure; everything
          else is supporting detail below it, not an equal peer. */}
      <Card className="shadow-none border border-ledger-200 dark:border-ledger-800/40 bg-ledger-50 dark:bg-ledger-900/30 text-ledger-800 dark:text-ledger-200">
        <CardContent className="pt-4 pb-5">
          <p className="text-xs text-ledger-700 font-medium mb-1.5">Ready to Assign</p>
          <p className="text-3xl font-bold font-mono tabular-nums tracking-tight text-ledger-600">
            {formatToUSD(totalInflow)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Card className="shadow-none border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200">
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[10px] text-red-700 font-medium mb-1.5 leading-tight">Spending</p>
            <p className="text-sm font-bold font-mono tabular-nums text-red-600">
              {formatToUSD(totalSpending)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[10px] text-slate-600 font-medium mb-1.5 leading-tight">Balances</p>
            <p className="text-sm font-bold font-mono tabular-nums">
              {formatToUSD(accountsTotal)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <CardContent className="pt-3 pb-3 px-3">
            <p className="text-[10px] text-slate-600 font-medium mb-1.5 leading-tight">Accounts</p>
            <p className="text-sm font-bold">
              {accounts.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Spending Distribution Chart */}
      {spendingData.length > 0 && (
        <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-sm">Spending Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <PieChart width={280} height={180}>
              <Pie
                data={spendingData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {spendingData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value) => formatToUSD(value as number)}
              />
            </PieChart>
          </CardContent>
        </Card>
      )}

      {/* Top Categories */}
      {spendingData.length > 0 && (
        <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-sm">Top Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {spendingData.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <div className="flex items-center gap-2 flex-1">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{item.name}</span>
                  </div>
                  <span className="font-semibold ml-2 flex-shrink-0">
                    {formatToUSD(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
