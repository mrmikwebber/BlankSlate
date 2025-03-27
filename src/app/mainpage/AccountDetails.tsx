"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { parseISO, format } from "date-fns";

export default function AccountDetails() {
  const { id } = useParams();
  const { budgetData, currentMonth } = useBudgetContext();
  const { accounts, addTransaction } = useAccountContext();

  const account = accounts.find((acc) => acc.id === id);

  console.log(account?.transactions);

  console.log(account?.transactions[0].payee);
  console.log(account?.transactions[0].balance);

  const [showForm, setShowForm] = useState(false);
  const [isNegative, setIsNegative] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    payee: "",
    category: "",
    category_group: "",
    balance: 0,
  });

  if (!account) return <p className="text-center mt-10">Account not found.</p>;

  const handleAddTransaction = () => {
    addTransaction(account.id, {
      date: new Date(),
      ...newTransaction,
      balance: isNegative ? -1 * newTransaction.balance : newTransaction.balance,
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
            <tr key={tx.id}>
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
