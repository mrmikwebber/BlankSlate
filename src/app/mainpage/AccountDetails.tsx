"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { parseISO, format } from "date-fns";
import InlineTransactionRow from "./InlineTransactionRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Edit2, Trash2 } from "lucide-react";

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
    <div className="mx-auto p-8 relative bg-slate-50 min-h-screen">
      {/* Context menu */}
      {contextMenu && (
        <div
          data-cy="tx-context-menu"
          className="fixed z-50 bg-white border border-slate-300 rounded-lg shadow-xl text-sm overflow-hidden"
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
            className="px-4 py-2.5 hover:bg-red-50 text-red-600 w-full text-left font-medium transition-colors"
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
            className="px-4 py-2.5 hover:bg-teal-50 text-teal-600 w-full text-left font-medium transition-colors border-t border-slate-200"
          >
            Edit Transaction
          </button>
        </div>
      )}

      {/* Header / balance */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          {isEditingAccountName ? (
            <div className="flex items-center gap-3">
              <Input
                className="text-2xl font-bold border-b-2 border-primary focus-visible:ring-0 bg-transparent text-slate-800 h-auto px-0"
                value={newAccountName ?? ""}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
              <Button
                onClick={handleRenameAccount}
                size="sm"
              >
                Save
              </Button>
              <Button
                onClick={() => {
                  setNewAccountName(account.name);
                  setIsEditingAccountName(false);
                }}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div>
              <h1
                className="text-2xl font-bold text-slate-800"
                data-cy="account-name"
              >{`${account.name}`}</h1>
            </div>
          )}

          <p className="text-base text-slate-600 mt-2">
            Balance:{" "}
            <span
              data-cy="account-balance"
              className={`font-bold font-mono text-lg ${accountBalance < 0 ? "text-red-600" : "text-green-600"
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
          <Button
            onClick={() => setIsEditingAccountName(true)}
            variant="ghost"
            size="sm"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Rename
          </Button>
        )}
      </div>

      {/* Transactions header + add button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Transactions</h2>
        {!showForm && !editingTransactionId && (
          <Button
            data-cy="add-transaction-button"
            onClick={() => setShowForm(true)}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Transaction
          </Button>
        )}
      </div>

      {/* Transactions table */}
      <div className="rounded-lg border border-slate-300 bg-white shadow-sm overflow-x-auto overflow-y-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-300">
              <th className="px-4 py-3 text-left border-r border-slate-200">Date</th>
              <th className="px-4 py-3 text-left border-r border-slate-200">Payee</th>
              <th className="px-4 py-3 text-left border-r border-slate-200">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
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
                  className={`transition-colors cursor-default border-b border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } ${selectedTxId === tx.id
                      ? "ring-2 ring-teal-500 ring-inset bg-teal-50"
                      : "hover:bg-slate-100"
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
                  <td className="px-4 py-3 whitespace-nowrap border-r border-slate-200 text-slate-700">
                    {tx.date &&
                      format(parseISO(tx.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs border-r border-slate-200 text-slate-800">
                    {tx.payee}
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs border-r border-slate-200 text-slate-600 text-xs">
                    {tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
                      ? tx.payee
                      : tx.category_group && tx.category
                        ? `${tx.category_group}: ${tx.category}`
                        : tx.category || tx.category_group || ""}
                  </td>
                  <td
                    data-cy="transaction-amount"
                    className={`px-4 py-3 text-right font-bold font-mono ${tx.balance < 0 ? "text-red-600" : "text-green-600"
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
