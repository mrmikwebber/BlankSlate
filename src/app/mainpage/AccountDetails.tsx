"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useUndoRedo } from "@/app/context/UndoRedoContext";
import { supabase } from "@/utils/supabaseClient";
import { parseISO, format } from "date-fns";
import InlineTransactionRow from "./InlineTransactionRow";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Edit2, Trash2, ArrowLeft } from "lucide-react";

export default function AccountDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { accounts, deleteTransactionWithMirror, editAccountName, refreshSingleAccount } =
    useAccountContext();
  const { registerAction } = useUndoRedo();

  const [showForm, setShowForm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    txId: number;
    accountId: number;
  } | null>(null);
  const [bulkContextMenu, setBulkContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [editedTransaction, setEditedTransaction] = useState<any>(null);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [newAccountName, setNewAccountName] = useState<string | undefined>();
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: "date" | "payee" | "category" | "amount"; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });

  const account = accounts.find((acc) => acc.id.toString() === id);
  const accountBalance =
    account?.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ?? 0;

  useEffect(() => {
    if (account && newAccountName === undefined) {
      setNewAccountName(account.name);
    }
  }, [account, newAccountName]);

  // Close context menu on click and Escape key
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setBulkContextMenu(null);
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setBulkContextMenu(null);
      }
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleEscape);
    };
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

  const handleBulkDelete = async () => {
    if (!account || selectedTxIds.size === 0) return;
    
    // Capture deleted transactions for undo
    const deletedTransactions = account.transactions.filter((tx) =>
      selectedTxIds.has(tx.id)
    );
    
    // Delete all selected transactions directly (without individual undo actions)
    for (const txId of selectedTxIds) {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", txId);

      if (error) {
        console.error("Error deleting transaction:", error);
      }
    }

    // Refresh account to show all deletions at once
    await refreshSingleAccount(account.id);

    // Register undo/redo action for bulk delete
    let currentDeletedTxIds = Array.from(selectedTxIds);
    
    registerAction({
      description: `Deleted ${selectedTxIds.size} transaction(s)`,
      execute: async () => {
        // Re-delete all transactions
        for (const txId of currentDeletedTxIds) {
          await supabase
            .from("transactions")
            .delete()
            .eq("id", txId);
        }
        await refreshSingleAccount(account.id);
      },
      undo: async () => {
        // Re-insert all deleted transactions
        for (const tx of deletedTransactions) {
          const { id, ...txData } = tx;
          const { data: restoredData, error } = await supabase.from("transactions").insert([
            {
              ...txData,
              account_id: account.id,
            },
          ]).select();

          if (!error && restoredData) {
            currentDeletedTxIds = currentDeletedTxIds.map(txId => txId === tx.id ? restoredData[0].id : txId);
          } else {
            console.error("Error restoring transaction:", error);
          }
        }
        await refreshSingleAccount(account.id);
      },
    });
    
    // Clear selection
    setSelectedTxIds(new Set());
    setBulkContextMenu(null);
  };

  const toggleTransactionSelection = (txId: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedTxIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(txId)) {
        newSet.delete(txId);
      } else {
        newSet.add(txId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (!account) return;
    if (selectedTxIds.size === account.transactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(account.transactions.map(tx => tx.id)));
    }
  };

  const categoryLabel = useMemo(
    () =>
      (tx: any) => {
        if (tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))) {
          return tx.payee;
        }
        if (tx.category_group && tx.category) return `${tx.category_group}: ${tx.category}`;
        return tx.category || tx.category_group || "";
      },
    []
  );

  const sortedTransactions = useMemo(() => {
    if (!account) return [];
    const txs = [...account.transactions];
    const dir = sortConfig.direction === "asc" ? 1 : -1;

    txs.sort((a, b) => {
      if (sortConfig.key === "date") {
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      }
      if (sortConfig.key === "payee") {
        return a.payee.localeCompare(b.payee) * dir;
      }
      if (sortConfig.key === "category") {
        return categoryLabel(a).localeCompare(categoryLabel(b)) * dir;
      }
      // amount
      if (a.balance === b.balance) return a.id - b.id;
      return (a.balance - b.balance) * dir;
    });

    return txs;
  }, [account, sortConfig, categoryLabel]);

  const toggleSort = (key: "date" | "payee" | "category" | "amount") => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "date" ? "desc" : "asc" };
    });
  };

  const sortIndicator = (key: "date" | "payee" | "category" | "amount") => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? "▲" : "▼";
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
        // Remove from bulk selection too if present
        setSelectedTxIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(selectedTxId);
          return newSet;
        });
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

        const sorted = sortedTransactions;

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
  }, [account, selectedTxId, showForm, editingTransactionId, deleteTransactionWithMirror, sortedTransactions]);

  if (!account) {
    return <p className="text-center mt-10">Account not found.</p>;
  }

  return (
    <div className="mx-auto p-8 relative bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Context menu */}
      {contextMenu && (
        <div
          data-cy="tx-context-menu"
          className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl dark:shadow-2xl text-sm overflow-hidden"
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
            className="px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 w-full text-left font-medium transition-colors"
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
            className="px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-950 text-teal-600 dark:text-teal-400 w-full text-left font-medium transition-colors border-t border-slate-200 dark:border-slate-700"
          >
            Edit Transaction
          </button>
        </div>
      )}

      {/* Header / balance */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            data-cy="account-back-button"
            onClick={() => router.push("/dashboard")}
            className="mt-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
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
                className="text-2xl font-bold text-slate-800 dark:text-slate-100"
                data-cy="account-name"
              >{`${account.name}`}</h1>
            </div>
          )}

          <p className="text-base text-slate-600 dark:text-slate-400 mt-2">
            Balance:{" "}
            <span
              data-cy="account-balance"
              className={`font-bold font-mono text-lg ${accountBalance < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                }`}
            >
              {accountBalance.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </span>
          </p>
        </div>
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
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Transactions</h2>
          {selectedTxIds.size > 0 && (
            <span className="text-sm text-blue-600 font-medium">
              {selectedTxIds.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <KeyboardShortcuts
            page="accounts"
            shortcuts={[
              { key: "Ctrl+Z / Cmd+Z", description: "Undo last action" },
              { key: "Ctrl+Y / Cmd+Shift+Z", description: "Redo last action" },
              { key: "N", description: "Add new transaction" },
              { key: "E", description: "Edit selected transaction" },
              { key: "Delete / Backspace", description: "Delete selected transaction" },
              { key: "↑ / ↓", description: "Navigate between transactions" },
              { key: "Escape", description: "Cancel/close forms" },
            ]}
          />
          {!showForm && !editingTransactionId && (
            <Button
              data-cy="add-transaction-button"
              onClick={() => setShowForm(true)}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Transactions table */}
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm dark:shadow-md overflow-x-auto overflow-y-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold border-b border-slate-300 dark:border-slate-700">
              <th className="px-2 py-3 text-center border-r border-slate-200 dark:border-slate-700 w-10">
                <input
                  type="checkbox"
                  checked={account.transactions.length > 0 && selectedTxIds.size === account.transactions.length}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </th>
              <th
                className="px-4 py-3 text-left border-r border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                onClick={() => toggleSort("date")}
              >
                <span className="flex items-center gap-1">
                  Date <span className="text-[10px] text-slate-500">{sortIndicator("date")}</span>
                </span>
              </th>
              <th
                className="px-4 py-3 text-left border-r border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                onClick={() => toggleSort("payee")}
              >
                <span className="flex items-center gap-1">
                  Payee <span className="text-[10px] text-slate-500">{sortIndicator("payee")}</span>
                </span>
              </th>
              <th
                className="px-4 py-3 text-left border-r border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                onClick={() => toggleSort("category")}
              >
                <span className="flex items-center gap-1">
                  Category <span className="text-[10px] text-slate-500">{sortIndicator("category")}</span>
                </span>
              </th>
              <th
                className="px-4 py-3 text-right cursor-pointer select-none"
                onClick={() => toggleSort("amount")}
              >
                <span className="flex items-center gap-1 justify-end">
                  Amount <span className="text-[10px] text-slate-500">{sortIndicator("amount")}</span>
                </span>
              </th>
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
                  className={`transition-colors cursor-default border-b border-slate-200 dark:border-slate-700 ${idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-950"
                    } ${selectedTxId === tx.id
                      ? "ring-2 ring-teal-500 ring-inset bg-teal-50 dark:ring-teal-400 dark:bg-teal-950"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    } ${selectedTxIds.has(tx.id) ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                  onClick={() => setSelectedTxId(tx.id)}
                  onDoubleClick={() => startEdit(tx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedTxId(tx.id);
                    
                    // Show bulk context menu if multiple transactions are selected
                    if (selectedTxIds.size > 0) {
                      setBulkContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                      });
                    } else {
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        txId: tx.id,
                        accountId: account.id,
                      });
                    }
                  }}
                >
                  <td 
                    className="px-2 py-3 text-center border-r border-slate-200 dark:border-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTransactionSelection(tx.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTxIds.has(tx.id)}
                      onChange={() => toggleTransactionSelection(tx.id)}
                      className="cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    {tx.date &&
                      format(parseISO(tx.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs border-r border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    {tx.payee}
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs border-r border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs">
                    {tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
                      ? tx.payee
                      : tx.category_group && tx.category
                        ? `${tx.category_group}: ${tx.category}`
                        : tx.category || tx.category_group || ""}
                  </td>
                  <td
                    data-cy="transaction-amount"
                    className={`px-4 py-3 text-right font-bold font-mono ${tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
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

      {/* Bulk delete context menu */}
      {bulkContextMenu && selectedTxIds.size > 0 && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ top: bulkContextMenu.y, left: bulkContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedTxIds.size} Transaction{selectedTxIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
