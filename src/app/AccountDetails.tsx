"use client";

import { useParams } from "next/navigation";
import { useContext, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useTableContext } from "./context/TableDataContext";
import { useBudgetContext } from "./context/BudgetContext";

export default function AccountDetails() {
  const { id } = useParams();
  const { budgetData, currentMonth } = useBudgetContext();
  const { accounts, addTransaction } = useAccountContext();

  const account = accounts.find((acc) => acc.id === Number(id));

  const [showForm, setShowForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    payee: "",
    category: "",
    categoryGroup: "",
    outflow: false,
    balance: 0,
  });

  if (!account) return <p className="text-center mt-10">Account not found.</p>;

  const handleAddTransaction = () => {
    const amount = newTransaction.outflow
      ? -Math.abs(newTransaction.balance)
      : Math.abs(newTransaction.balance)

    addTransaction(account.id, {
      id: Date.now(),
      date: new Date(),
      ...newTransaction,
      balance: amount,
    });
    setNewTransaction({
      payee: "",
      category: "",
      categoryGroup: "",
      outflow: false,
      balance: 0,
    });
    setShowForm(false);
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
                {new Date(tx.date).toLocaleDateString()}
              </td>
              <td className="border p-2">{tx.payee}</td>
              <td className="border p-2">{tx.category}</td>
              <td
                className={`border p-2 ${
                  tx.outflow ? "text-red-500" : "text-green-500"
                }`}
              >
                {tx.outflow ? `${-1 * tx.balance}` : `${tx.balance}`}
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
              <option value="">Select Category</option>
              <option key="Ready to Assign" value="Ready to Assign">
                Ready to Assign
              </option>
              {budgetData[currentMonth].categories.map((category) =>
                category.categoryItems.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block mb-2">
            Amount:
            <input
              type="number"
              value={newTransaction.balance}
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

          <label className="block mb-2">
            <input
              type="checkbox"
              checked={newTransaction.outflow}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  outflow: e.target.checked,
                })
              }
              className="mr-2"
            />
            Outflow (Check if money is leaving)
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
