"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Transaction, useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { parseISO, format } from "date-fns";
import InlineAddTransaction from "./InlineTransactionRow";
import InlineTransactionRow from "./InlineTransactionRow";

export default function AccountDetails() {
  const { id } = useParams();
  const { budgetData, currentMonth } = useBudgetContext();
  const {
    accounts,
    addTransaction,
    deleteTransaction,
    editTransaction,
    editAccountName,
  } = useAccountContext();

  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
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

  const account = accounts.find((acc) => acc.id.toString() === id);

  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [editedTransaction, setEditedTransaction] = useState<any>(null);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [newAccountName, setNewAccountName] = useState(account?.name);

  const formRowRef = useRef<HTMLTableRowElement | null>(null);
  const payeeInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (editingTransactionId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTransactionId]);

  // const handleAddTransaction = () => {
  //   console.log(newTransaction);
  //   addTransaction(account.id, {
  //     ...newTransaction,
  //     date: new Date(newTransaction.date),
  //     balance: isNegative
  //       ? -1 * Number(newTransaction.balance)
  //       : Number(newTransaction.balance),
  //   });
  //   setNewTransaction({
  //     date: new Date().toISOString().split("T")[0],
  //     payee: "",
  //     category: "",
  //     category_group: "",
  //     balance: "",
  //   });
  //   setShowForm(false);
  //   setIsNegative(false);
  // };

  const startEdit = (tx: any) => {
    setEditedTransaction(tx);
    setEditingTransactionId(tx.id);
  };

  const cancelEdit = () => {
    setEditingTransactionId(null);
    setEditedTransaction(null);
  };

  const handleEditTransaction = async () => {
    if (!editedTransaction) return;
    const updated = {
      ...editedTransaction,
      date: editedTransaction.date,
      balance: editedTransaction.isNegative
        ? -1 * Number(editedTransaction.balance)
        : Number(editedTransaction.balance),
    };
    await editTransaction(account.id, editedTransaction.id, updated);
    setEditingTransactionId(null);
    setEditedTransaction(null);
  };

  const handleRenameAccount = async () => {
    await editAccountName(account.id, newAccountName);
    setIsEditingAccountName(false);
  };

  if (!account) return <p className="text-center mt-10">Account not found.</p>;

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
          <button
            onClick={() => {
              const transaction = account.transactions.find(
                (t) => t.id === contextMenu.txId
              );
              console.log(transaction);
              startEdit(transaction);
              setContextMenu(null);
            }}
            className="px-4 py-2 hover:bg-blue-100 text-blue-600 w-full text-left"
          >
            Edit Transaction
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        {isEditingAccountName ? (
          <>
            <input
              className="text-2xl font-bold border-b border-gray-400 focus:outline-none"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
            <button
              onClick={handleRenameAccount}
              className="text-green-600 hover:underline"
            >
              Save
            </button>
            <button
              onClick={() => {
                setNewAccountName(account.name);
                setIsEditingAccountName(false);
              }}
              className="text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{account.name} Overview</h1>
            <button
              onClick={() => setIsEditingAccountName(true)}
              className="text-blue-600 hover:underline text-sm"
            >
              Edit
            </button>
          </>
        )}
      </div>

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
          {account.transactions.map((tx) =>
            editingTransactionId === tx.id ? (
              <InlineAddTransaction
                key={`edit-${tx.id}`}
                accountId={account.id}
                mode="edit"
                initialData={editedTransaction}
                onSave={() => {
                  setEditingTransactionId(null);
                  setEditingTransaction(null);
                }}
                onCancel={() => {
                  setEditingTransactionId(null);
                  setEditingTransaction(null);
                }}
              />
            ) : (
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
            )
          )}
          {showForm && (
            <InlineTransactionRow
              accountId={account.id}
              onCancel={() => {
                setShowForm(false);
              }}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}
