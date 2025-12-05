"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { parseISO, format } from "date-fns";
import InlineAddTransaction from "./InlineTransactionRow";
import InlineTransactionRow from "./InlineTransactionRow";

export default function AccountDetails() {
  const { id } = useParams();
  const { accounts, deleteTransactionWithMirror, editAccountName } =
    useAccountContext();

  const [showForm, setShowForm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    txId: number;
    accountId: number;
  } | null>(null);

  const account = accounts.find((acc) => acc.id.toString() === id);
  const accountBalance =
    account?.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ?? 0;

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

  const startEdit = (tx: any) => {
    setEditedTransaction(tx);
    setEditingTransactionId(tx.id);
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
          data-cy="tx-context-menu"
          className="fixed z-50 bg-white border rounded shadow-md text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button
            data-cy="context-delete-transaction"
            onClick={() => {
              deleteTransactionWithMirror(
                contextMenu.accountId,
                contextMenu.txId
              );
              setContextMenu(null);
            }}
            className="px-4 py-2 hover:bg-red-100 text-red-600 w-full text-left"
          >
            Delete Transaction
          </button>
          <button
            data-cy="context-edit-transaction"
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
            <div>
              <h1 className="text-2xl font-bold" data-cy="account-name">{account.name} Overview</h1>
              <p className="text-lg text-gray-800 mt-1">
                Balance:{" "}
                <span
                  data-cy="account-balance"
                  className={
                    accountBalance < 0 ? "text-red-600" : "text-green-600"
                  }
                >
                  {accountBalance.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </span>
              </p>
            </div>
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
            data-cy="add-transaction-button"
            onClick={() => setShowForm(true)}
            className="mb-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded"
          >
            + Add Transaction
          </button>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm mt-4">
        <table className="w-full border border-gray-300 rounded-md bg-white shadow-sm text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700 uppercase tracking-wide">
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Payee</th>
              <th className="p-2 border">Category</th>
              <th className="p-2 border text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {showForm && (
              <InlineTransactionRow
                accountId={account.id}
                onCancel={() => {
                  setShowForm(false);
                }}
              />
            )}
            {account.transactions
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .map((tx) =>
                editingTransactionId === tx.id ? (
                  <InlineAddTransaction
                    key={`edit-${tx.id}`}
                    accountId={account.id}
                    mode="edit"
                    initialData={editedTransaction}
                    onSave={() => {
                      setEditingTransactionId(null);
                      setEditedTransaction(null);
                    }}
                    onCancel={() => {
                      setEditingTransactionId(null);
                      setEditedTransaction(null);
                    }}
                  />
                ) : (
                  <tr
                    key={tx.id}
                    data-cy="transaction-row"
                    data-txid={tx.id}
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
                      data-cy="transaction-amount"
                      className={`border p-2 text-right font-medium ${
                        tx.balance < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {tx.balance}
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
