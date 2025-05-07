import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { useAccountContext } from "@/app/context/AccountContext";
import AccountCardCompact from "./AccountCardCompact";
import ItemsToAddress from "./ItemsToAddress";
import { isSameMonth, parseISO } from "date-fns";
import { useBudgetContext } from "../context/BudgetContext";
import AddAccountModal from "./AddAccountModal";

export default function SidebarPanel() {
  const [showModal, setShowModal] = useState(false);
  const { accounts, addAccount } = useAccountContext();
  const { currentMonth, budgetData } = useBudgetContext();

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
    const categoryTotals = {};

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        if (tx.category === "Ready To Assign") return;
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

    return Object.entries(categoryTotals).map(([category, amount], index) => ({
      name: category,
      value: amount,
      percentage: totalInflow
        ? (((amount as number) / totalInflow) * 100).toFixed(1)
        : 0,
      color: COLORS[index % COLORS.length],
    }));
  }, [accounts, currentMonth]);

  const creditCardsThatNeedPayment =
  (budgetData[currentMonth]?.categories.find(
    (group) => group.name === "Credit Card Payments"
  )?.categoryItems || [])
    .filter((item) => item.available > 0 || item.activity < 0)
    .map((item) => item.name);

  const totalOutflow = spendingData.reduce(
    (sum, category) => sum + (category.value as number),
    0
  );

  
  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-160px)] w-full text-sm">
      {/* Header Row */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Accounts</h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          Add
        </button>
        {showModal && (
          <AddAccountModal
            onAddAccount={handleAddAccount}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <p className="text-gray-600 text-center">No accounts added yet</p>
      ) : (
        <>
          <div>
            <h3 className="text-xs text-gray-500 uppercase mb-1">Cash</h3>
            <div className="flex flex-wrap gap-2">
              {accounts
                .filter((a) => a.type === "debit")
                .map((acc) => (
                  <AccountCardCompact key={acc.id} account={acc} />
                ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs text-gray-500 uppercase mt-3 mb-1">
              Credit
            </h3>
            <div className="flex flex-wrap gap-2">
              {accounts
                .filter((a) => a.type === "credit")
                .map((acc) => (
                  <AccountCardCompact key={acc.id} account={acc} />
                ))}
            </div>
          </div>
        </>
      )}

      <hr className="border-gray-200" />

      {/* Spending Summary */}
      <div>
        <h3 className="text-sm font-semibold mb-1">Spending This Month</h3>
        <p>
          <strong>Income:</strong> {formatToUSD(totalInflow)}
        </p>
        <p className="mb-2">
          <strong>Spending:</strong> {formatToUSD(totalOutflow)}
        </p>

        <div className="flex justify-center">
          <PieChart width={200} height={200}>
            <Pie
              data={spendingData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              labelLine={false}
            >
              {spendingData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatToUSD(value)} />
          </PieChart>
        </div>

        <ul className="mt-2 space-y-1">
          {spendingData.map((cat, i) => (
            <li key={i} className="flex justify-between">
              <span className="truncate">
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: cat.color }}
                ></span>
                {cat.name}
              </span>
              <span>
                {formatToUSD(cat.value)} ({cat.percentage}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="border-gray-200" />


      <ItemsToAddress
        categories={budgetData[currentMonth]?.categories || []}
        unassignedAmount={budgetData[currentMonth]?.ready_to_assign || 0}
        creditCardsNeedingPayment={creditCardsThatNeedPayment}
      />
    </div>
  );
}
