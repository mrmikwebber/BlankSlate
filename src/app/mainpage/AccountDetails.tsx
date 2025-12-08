"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { parseISO, format } from "date-fns";
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

  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [editedTransaction, setEditedTransaction] = useState<any>(null);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [newAccountName, setNewAccountName] = useState<string | undefined>();
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);

  const account = accounts.find((acc) => acc.id.toString() === id);
  const accountBalance =
    account?.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ?? 0;

  useEffect(() => {
    if (account && newAccountName === undefined) {
      setNewAccountName(account.name);
    }
  }, [account, newAccountName]);

  // Close context menu on click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const startEdit = (tx: any) => {
    setEditedTransaction(tx);
    setEditingTransactionId(tx.id);
    setShowForm(false);
  };

  const handleRenameAccount = async () => {
    if (!account || !newAccountName) return;
    await editAccountName(account.id, newAccountName);
    setIsEditingAccountName(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!account) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setEditingTransactionId(null);
        setEditedTransaction(null);
        setShowForm(true);
        return;
      }

      if ((e.key === "e" || e.key === "E") && selectedTxId != null) {
        e.preventDefault();
        const tx = account.transactions.find((t) => t.id === selectedTxId);
        if (tx) {
          startEdit(tx);
        }
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedTxId != null
      ) {
        e.preventDefault();
        deleteTransactionWithMirror(account.id, selectedTxId);
        setSelectedTxId(null);
        return;
      }

      if (e.key === "Escape") {
        if (showForm || editingTransactionId != null) {
          e.preventDefault();
          setShowForm(false);
          setEditingTransactionId(null);
          setEditedTransaction(null);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!account.transactions.length) return;
        e.preventDefault();

        const sorted = [...account.transactions].sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        if (selectedTxId == null) {
          setSelectedTxId(sorted[0].id);
        } else {
          const idx = sorted.findIndex((t) => t.id === selectedTxId);
          if (idx === -1) {
            setSelectedTxId(sorted[0].id);
          } else {
            const nextIndex =
              e.key === "ArrowDown"
                ? Math.min(idx + 1, sorted.length - 1)
                : Math.max(idx - 1, 0);
            setSelectedTxId(sorted[nextIndex].id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [account, selectedTxId, showForm, editingTransactionId, deleteTransactionWithMirror]);

  if (!account) {
    return <p className="text-center mt-10">Account not found.</p>;
  }

  const sortedTransactions = account.transactions
    .slice()
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  return (
    <div className="mx-auto p-6 relative">
      {/* Context menu */}
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
              if (transaction) {
                startEdit(transaction);
              }
              setContextMenu(null);
            }}
            className="px-4 py-2 hover:bg-blue-100 text-blue-600 w-full text-left"
          >
            Edit Transaction
          </button>
        </div>
      )}

      {/* Header / balance */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          {isEditingAccountName ? (
            <div className="flex items-center gap-2">
              <input
                className="text-2xl font-bold border-b border-gray-400 focus:outline-none bg-transparent"
                value={newAccountName ?? ""}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
              <button
                onClick={handleRenameAccount}
                className="text-green-600 hover:underline text-sm"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setNewAccountName(account.name);
                  setIsEditingAccountName(false);
                }}
                className="text-gray-500 hover:underline text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <h1
                className="text-2xl font-bold"
                data-cy="account-name"
              >{`${account.name} Overview`}</h1>
            </div>
          )}

          <p className="text-lg text-gray-800 mt-1">
            Balance:{" "}
            <span
              data-cy="account-balance"
              className={`font-semibold ${accountBalance < 0 ? "text-red-600" : "text-green-600"
                }`}
            >
              {accountBalance.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </span>
          </p>
        </div>

        {!isEditingAccountName && (
          <button
            onClick={() => setIsEditingAccountName(true)}
            className="text-blue-600 hover:underline text-sm"
          >
            Edit name
          </button>
        )}
      </div>

      {/* Transactions header + add button */}
      <div className="flex items-center justify-between mt-2">
        <h2 className="text-xl font-semibold">Transactions</h2>
        {!showForm && !editingTransactionId && (
          <button
            data-cy="add-transaction-button"
            onClick={() => setShowForm(true)}
            className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded shadow-sm text-sm font-medium"
          >
            + Add Transaction
          </button>
        )}
      </div>

      {/* Transactions table */}
      <div className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="bg-gray-100 text-gray-700 uppercase tracking-wide text-xs">
              <th className="p-2 border text-left">Date</th>
              <th className="p-2 border text-left">Payee</th>
              <th className="p-2 border text-left">Category</th>
              <th className="p-2 border text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Inline add row */}
            {showForm && (
              <InlineTransactionRow
                accountId={account.id}
                mode="add"
                autoFocus
                onCancel={() => setShowForm(false)}
                onSave={() => {
                  // keep open for rapid entry; close if you prefer:
                  // setShowForm(false);
                }}
              />
            )}

            {/* Existing transactions */}
            {sortedTransactions.map((tx, idx) =>
              editingTransactionId === tx.id ? (
                <InlineTransactionRow
                  key={`edit-${tx.id}`}
                  accountId={account.id}
                  mode="edit"
                  autoFocus
                  initialData={editedTransaction ?? tx}
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
                  className={`transition-colors cursor-default ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } ${selectedTxId === tx.id
                      ? "ring-2 ring-teal-400 ring-inset bg-teal-50"
                      : "hover:bg-teal-50"
                    }`}
                  onClick={() => setSelectedTxId(tx.id)}
                  onDoubleClick={() => startEdit(tx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedTxId(tx.id);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      txId: tx.id,
                      accountId: account.id,
                    });
                  }}
                >
                  <td className="border p-2 whitespace-nowrap">
                    {tx.date &&
                      format(parseISO(tx.date), "eee, MMM d yyyy")}
                  </td>
                  <td className="border p-2 truncate max-w-xs">
                    {tx.payee}
                  </td>
                  <td className="border p-2 truncate max-w-xs">
                    {tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
                      ? tx.payee
                      : tx.category_group && tx.category
                        ? `${tx.category_group}: ${tx.category}`
                        : tx.category || tx.category_group || ""}
                  </td>
                  <td
                    data-cy="transaction-amount"
                    className={`border p-2 text-right font-semibold ${tx.balance < 0 ? "text-red-600" : "text-green-600"
                      }`}
                  >
                    {tx.balance.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
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
