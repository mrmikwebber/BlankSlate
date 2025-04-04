"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { parseISO, format } from "date-fns";

export default function AccountDetails() {
  const { id } = useParams();
  const { budgetData, currentMonth } = useBudgetContext();
  const { accounts, addTransaction, deleteTransaction } = useAccountContext();

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const account = accounts.find((acc) => acc.id.toString() === id);

  const [showForm, setShowForm] = useState(false);
  const [isNegative, setIsNegative] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    payee: "",
    category: "",
    category_group: "",
    balance: 0,
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    txId: number;
    accountId: number;
  } | null>(null);

  if (!account) return <p className="text-center mt-10">Account not found.</p>;

  const handleAddTransaction = () => {
    addTransaction(account.id, {
      date: new Date(),
      ...newTransaction,
      balance: isNegative
        ? -1 * newTransaction.balance
        : newTransaction.balance,
    });
    setNewTransaction({
      payee: "",
      category: "",
      category_group: "",
      balance: 0,
    });
    setShowForm(false);
    setIsNegative(false);
  };

  return (
    <div className="mx-auto p-6 relative">
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border rounded shadow-md text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              deleteTransaction(contextMenu.accountId, contextMenu.txId);
              setContextMenu(null);
            }}
            className="px-4 py-2 hover:bg-red-100 text-red-600 w-full text-left"
          >
            Delete Transaction
          </button>
        </div>
      )}
      <h1 className="text-2xl font-bold mb-4">{account.name} Overview</h1>
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold mb-2">Transactions</h2>
        <button
          onClick={() => setShowForm(true)}
          className="mb-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded"
        >
          + Add Transaction
        </button>
      </div>
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Date</th>
            <th className="border p-2">Payee</th>
            <th className="border p-2">Category</th>
            <th className="border p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {account.transactions.map((tx) => (
            <tr
              key={tx.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,                
                  txId: tx.id,
                  accountId: account.id,
                });
              }}
            >
              <td className="border p-2">
                {tx.date && format(parseISO(tx.date), "eee, MMM d yyyy")}
              </td>
              <td className="border p-2">{tx.payee}</td>
              <td className="border p-2">{tx.category}</td>
              <td
                className={`border p-2 ${
                  tx.balance < 0 ? "text-red-500" : "text-green-500"
                }`}
              >
                {tx.balance}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <form
          onSubmit={handleAddTransaction}
          className="p-4 bg-white shadow-md rounded-lg"
        >
          <label className="block mb-2">
            Payee:
            <input
              type="text"
              value={newTransaction.payee}
              onChange={(e) =>
                setNewTransaction({ ...newTransaction, payee: e.target.value })
              }
              className="w-full p-2 border rounded"
              required
            />
          </label>

          <label className="block mb-2">
            Category Group:
            <select
              value={newTransaction.category_group}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  category_group: e.target.value,
                })
              }
              className="w-full p-2 border rounded"
              required
            >
               <option value="" disabled hidden>Select a category group</option>
              <option key="Ready to Assign" value="Ready to Assign">
                Ready to Assign
              </option>
              {budgetData[currentMonth].categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          {newTransaction.category_group !== "" && (
            <label className="block mb-2">
              Category:
              <select
                value={newTransaction.category}
                onChange={(e) =>
                  setNewTransaction({
                    ...newTransaction,
                    category: e.target.value,
                  })
                }
                className="w-full p-2 border rounded"
                required
              >
                 <option value="" disabled hidden>Select a category</option>
                {newTransaction.category_group === "Ready to Assign" && (
                  <option key="Ready to Assign" value="Ready to Assign">
                    Ready to Assign
                  </option>
                )}
                {budgetData[currentMonth].categories
                  .filter(
                    (category) =>
                      category.name === newTransaction.category_group
                  )
                  .map((category) =>
                    category.categoryItems.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))
                  )}
              </select>
            </label>
          )}

          <label className="block mb-2">
            <button
              type="button"
              onClick={() => setIsNegative(!isNegative)}
              className={`rounded px-2 py-1 font-bold ${
                isNegative ? "text-red-600" : "text-green-600"
              }`}
            >
              {isNegative ? "−" : "+"}
            </button>
            Amount:
            <input
              type="number"
              value={Math.abs(newTransaction.balance)}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  balance: Number(e.target.value),
                })
              }
              className="w-full p-2 border rounded"
              required
            />
          </label>

          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 text-white rounded"
          >
            Add Transaction
          </button>
        </form>
      )}
    </div>
  );
}
