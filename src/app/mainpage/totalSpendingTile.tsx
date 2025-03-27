"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { Pie, Cell, Tooltip, Legend } from "recharts";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import { isSameMonth, parseISO, format } from "date-fns";

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
    return accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        return (
          tx.category === "Ready to Assign" &&
          tx.date && isSameMonth(tx.date instanceof Date ? tx.date : format(parseISO(tx.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM"))
        );
      })
      .reduce((sum, tx) => sum + tx.balance, 0);
  }, [accounts, currentMonth]);

  const spendingData = useMemo(() => {
    const categoryTotals = {};

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        if (tx.category === "Ready To Assign") return;
        if (tx.balance < 0 && tx.date && isSameMonth(tx.date instanceof Date ? tx.date : format(parseISO(tx.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM"))) {
          if (!categoryTotals[tx.category]) {
            categoryTotals[tx.category] = 0;
          }
          categoryTotals[tx.category] += Math.abs(tx.balance);
        }
      });
    });

    return Object.entries(categoryTotals).map(([category, amount], index) => ({
      name: category,
      value: amount,
      percentage: totalInflow ? ((amount / totalInflow) * 100).toFixed(1) : 0,
      color: COLORS[index % COLORS.length],
    }));
  }, [accounts, currentMonth]);

  const totalOutflow = spendingData.reduce(
    (sum, category) => sum + category.value,
    0
  );

  console.log(spendingData);

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mt-6">
      <h2 className="text-lg font-semibold mb-4">Current Month Spending</h2>

      {totalInflow === 0 && totalOutflow === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">No spending data available this month</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            <strong>Total Income:</strong> {formatToUSD(totalInflow)}
          </p>
          <p className="text-sm text-gray-700 mb-4">
            <strong>Total Spending:</strong> {formatToUSD(totalOutflow)}
          </p>

          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex justify-center">
              <PieChart width={300} height={300}>
                <Pie
                  data={spendingData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {spendingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatToUSD(value)} />
              </PieChart>
            </div>

            <div className="mt-6 md:mt-0 md:ml-8 w-full max-w-[300px]">
              <h3 className="text-md font-semibold mb-2">Spending Breakdown</h3>
              <ul className="space-y-2">
                {spendingData.map((category, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center min-w-0">
                      <span
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      ></span>
                      <span className="text-sm truncate" title={category.name}>
                        {category.name}
                      </span>
                    </div>
                    <span className="text-sm font-medium flex-shrink-0 ml-4 whitespace-nowrap">
                      {formatToUSD(category.value)} ({category.percentage}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TotalSpendingTile;
