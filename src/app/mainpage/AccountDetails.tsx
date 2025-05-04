"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { parseISO, format } from "date-fns";

export default function AccountDetails() {
  const { id } = useParams();
  const { budgetData, currentMonth } = useBudgetContext();
  const { accounts, addTransaction, deleteTransaction } = useAccountContext();

  const [showForm, setShowForm] = useState(false);
  const [isNegative, setIsNegative] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    payee: "",
    category: "",
    category_group: "",
    balance: "",
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    txId: number;
    accountId: number;
  } | null>(null);

  const formRowRef = useRef<HTMLTableRowElement | null>(null);
  const payeeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (showForm && formRowRef.current) {
      formRowRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      payeeInputRef.current?.focus();
    }
  }, [showForm]);

  const account = accounts.find((acc) => acc.id.toString() === id);
  if (!account) return <p className="text-center mt-10">Account not found.</p>;

  const handleAddTransaction = () => {
    addTransaction(account.id, {
      ...newTransaction,
      date: new Date(newTransaction.date),
      balance: isNegative
      ? -1 * Number(newTransaction.balance)
      : Number(newTransaction.balance),
    });

    setNewTransaction({
      date: new Date().toISOString().split("T")[0],
      payee: "",
      category: "",
      category_group: "",
      balance: "",
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
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded"
          >
            + Add Transaction
          </button>
        )}
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

          {showForm && (
            <tr
              ref={formRowRef}
              className="bg-gray-50 transition-opacity duration-300 opacity-100"
            >
              <td className="border p-2">
                <input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) =>
                    setNewTransaction({
                      ...newTransaction,
                      date: e.target.value,
                    })
                  }
                  className="w-full p-1 border rounded"
                />
              </td>
              <td className="border p-2">
                <input
                  ref={payeeInputRef}
                  type="text"
                  value={newTransaction.payee}
                  onChange={(e) =>
                    setNewTransaction({
                      ...newTransaction,
                      payee: e.target.value,
                    })
                  }
                  className="w-full p-1 border rounded"
                  placeholder="Payee"
                  required
                />
              </td>
              <td className="border p-2">
                <select
                  value={newTransaction.category}
                  onChange={(e) =>
                    setNewTransaction({
                      ...newTransaction,
                      category: e.target.value,
                    })
                  }
                  className="w-full p-1 border rounded"
                  required
                >
                  <option value="" disabled hidden>
                    Select Category
                  </option>
                  {budgetData[currentMonth].categories.flatMap((cat) =>
                    cat.categoryItems.map((item) => (
                      <option key={item.name} value={item.name}>
                        {cat.name} → {item.name}
                      </option>
                    ))
                  )}
                </select>
              </td>
              <td className="border p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNegative(!isNegative)}
                    className={`rounded px-2 py-1 font-bold ${
                      isNegative ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {isNegative ? "−" : "+"}
                  </button>
                  <input
                    type="number"
                    value={newTransaction.balance}
                    onChange={(e) =>
                      setNewTransaction({
                        ...newTransaction,
                        balance: e.target.value,
                      })
                    }
                    className="w-full p-1 border rounded"
                    required
                  />

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddTransaction();
                    }}
                    className="bg-teal-600 text-white px-2 py-1 rounded"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
