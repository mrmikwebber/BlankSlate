"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Account, Transaction, useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { useUndoRedo } from "@/app/context/UndoRedoContext";
import { useAuth } from "@/app/context/AuthContext";
import { useBudgetSelection } from "@/app/context/BudgetSelectionContext";
import { supabase } from "@/utils/supabaseClient";
import { parseISO, format } from "date-fns";
import InlineTransactionRow from "./InlineTransactionRow";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, ArrowLeft, CheckCircle2, Circle, Flag, Search, X, Clock, ChevronDown, ChevronRight } from "lucide-react";

// "All Accounts" (route id "all") flattens every account's transactions into
// one read-through list, tagging each with the account it actually belongs
// to so per-row actions (edit/delete/toggle) can still target the right
// account even though the header/table no longer represents a single real
// account row.
type FlatTransaction = Transaction & { account_name: string };

export default function AccountDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentBudgetId } = useBudgetSelection();
  const { accounts, accountsLoading, addTransaction, addTransactionWithMirror, deleteTransactionWithMirror, editAccountName, refreshSingleAccount, toggleCleared, toggleApproved, approveAll } =
    useAccountContext();
  const { invalidateAll } = useBudgetContext();
  const { registerAction } = useUndoRedo();

  const isAllAccountsView = id === "all";

  const [showForm, setShowForm] = useState(false);
  const [addAccountId, setAddAccountId] = useState<string | number | null>(null);
  const [pendingSectionOpen, setPendingSectionOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    txId: string | number;
    accountId: string | number;
  } | null>(null);
  const [bulkContextMenu, setBulkContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [editedTransaction, setEditedTransaction] = useState<Transaction | null>(null);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [newAccountName, setNewAccountName] = useState<string | undefined>();
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: "date" | "payee" | "category" | "amount"; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileInput, setReconcileInput] = useState("");
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const allAccountsTransactions: FlatTransaction[] = useMemo(
    () =>
      accounts.flatMap((acc) =>
        acc.transactions.map((tx) => ({ ...tx, account_name: acc.name }))
      ),
    [accounts]
  );

  const singleAccount = accounts.find((acc) => acc.id.toString() === id);
  const account: Account | undefined = isAllAccountsView
    ? ({
        id: "all",
        name: "All Accounts",
        balance: 0,
        transactions: allAccountsTransactions,
        issuer: undefined,
        type: undefined,
      } as unknown as Account)
    : singleAccount;

  const accountBalance =
    account?.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ?? 0;

  useEffect(() => {
    if (isAllAccountsView && addAccountId == null && accounts.length > 0) {
      setAddAccountId(accounts[0].id);
    }
  }, [isAllAccountsView, addAccountId, accounts]);

  const sanitizedReconcileInput = reconcileInput.replace(/[^0-9.-]/g, "");
  const parsedReconcileTarget = reconcileInput
    ? Number.parseFloat(sanitizedReconcileInput)
    : Number.NaN;
  const reconcileDifference = Number.isNaN(parsedReconcileTarget)
    ? null
    : parsedReconcileTarget - accountBalance;

  // Resolves the real account a (possibly flattened, All-Accounts-view)
  // transaction belongs to — needed everywhere a per-row action (edit,
  // delete, toggle, duplicate) must target that transaction's own account
  // rather than the synthetic "all" pseudo-account.
  const realAccountFor = (tx: Transaction) =>
    accounts.find((acc) => acc.id === tx.account_id) ?? account;

  useEffect(() => {
    if (account && newAccountName === undefined && !isAllAccountsView) {
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

  const startEdit = (tx: Transaction) => {
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

    // In the All-Accounts view a bulk selection can span several real
    // accounts — every account touched needs its own refresh/undo restore.
    const affectedAccountIds = Array.from(
      new Set(deletedTransactions.map((tx) => tx.account_id ?? account.id))
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

    // Refresh every affected account to show all deletions at once
    await Promise.all(affectedAccountIds.map((accId) => refreshSingleAccount(accId)));

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
        await Promise.all(affectedAccountIds.map((accId) => refreshSingleAccount(accId)));
      },
      undo: async () => {
        // Re-insert all deleted transactions
        for (const tx of deletedTransactions) {
          const txData = {
            date: tx.date,
            payee: tx.payee,
            category: tx.category,
            category_group: tx.category_group,
            balance: tx.balance,
          };
          const { data: restoredData, error } = await supabase.from("transactions").insert([
            {
              ...txData,
              account_id: tx.account_id ?? account.id,
              user_id: user?.id,
              budget_id: currentBudgetId,
            },
          ]).select();

          if (!error && restoredData) {
            currentDeletedTxIds = currentDeletedTxIds.map(txId => txId === tx.id ? restoredData[0].id : txId);
          } else {
            console.error("Error restoring transaction:", error);
          }
        }
        await Promise.all(affectedAccountIds.map((accId) => refreshSingleAccount(accId)));
      },
    });

    // Clear selection
    setSelectedTxIds(new Set());
    setBulkContextMenu(null);
  };

  const handleReconcileSubmit = async () => {
    if (!account || isAllAccountsView) return;
    const sanitized = reconcileInput.replace(/[^0-9.-]/g, "");
    const targetBalance = Number.parseFloat(sanitized);

    if (Number.isNaN(targetBalance)) {
      setReconcileError("Enter a valid number for the balance.");
      return;
    }

    const difference = targetBalance - accountBalance;
    if (Math.abs(difference) < 0.005) {
      setReconcileError("Balance already matches; no adjustment needed.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // Debit/asset accounts: the discrepancy is real spendable cash (or a real
    // shortfall) that isn't reflected in the budget yet, so it should move
    // Ready to Assign the same way any other income/outflow would. Credit
    // accounts: a discrepancy there is unlogged card activity or a data error
    // against debt, not new money — crediting Ready to Assign would let you
    // spend against debt, so it stays fully hidden from budget math (see
    // isReconciliation handling in lib/budgetMath.ts).
    const isDebitAccount = account.type === "debit";

    await addTransaction(account.id, {
      date: today,
      payee: "Reconciliation Adjustment",
      category: isDebitAccount ? "Ready to Assign" : "Reconciliation (Hidden)",
      category_group: isDebitAccount ? "Ready to Assign" : "Reconciliation (Hidden)",
      balance: difference,
    });

    // A debit-account reconciliation adjustment moves Ready to Assign, but
    // BudgetContext's cached month view never hears about AccountContext
    // mutations on its own (same gotcha as adding/editing a transaction in
    // InlineTransactionRow) — force a refetch so the dashboard doesn't show
    // a stale RTA until a hard refresh.
    invalidateAll();

    setReconcileOpen(false);
    setReconcileError(null);
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
    if (selectedTxIds.size === postedTransactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(postedTransactions.map(tx => tx.id)));
    }
  };

  const categoryLabel = useMemo(
    () =>
      (tx: Transaction) => {
        // Real (uncategorized) transfers store no category at all, so the
        // payee text ("Transfer to X") is the only useful label. But some
        // banks describe ordinary payments with wording like "Transfer To
        // Cash App" — once a transaction like that has a real category, the
        // category must win over the payee text, not the other way around.
        const hasRealCategory = Boolean(tx.category) || Boolean(tx.category_group);
        if (
          !hasRealCategory &&
          tx.payee &&
          (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
        ) {
          return tx.payee;
        }
        if (tx.category_group && tx.category) return `${tx.category_group}: ${tx.category}`;
        return tx.category || tx.category_group || "";
      },
    []
  );

  // Pending (bank-unposted) transactions get their own review section rather
  // than sitting in the main register — see the Pending section below.
  const postedTransactions = useMemo(
    () => (account?.transactions ?? []).filter((tx) => !tx.pending),
    [account]
  );
  const pendingTransactions = useMemo(
    () => (account?.transactions ?? []).filter((tx) => tx.pending),
    [account]
  );

  // Shared by the main register and the Pending section below, so pending
  // transactions sort the same way (date/payee/category/amount, same
  // same-day tiebreak) instead of sitting in raw insertion order.
  const applySort = (txs: Transaction[]) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;

    // Transaction ids are UUID strings, not sequential numbers — subtracting
    // them for a tiebreak silently produced NaN, which Array.sort treats as
    // "equal," so same-day ties used to just fall back to insertion order
    // (i.e. a newly added transaction landed at the bottom of its day).
    // created_at is a real timestamp and actually reflects insertion order.
    const createdAtCompare = (a: Transaction, b: Transaction) =>
      new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();

    const sorted = [...txs];
    sorted.sort((a, b) => {
      if (sortConfig.key === "date") {
        const dateCompare = (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
        // Same-day tie: newest-added first when sorting newest-date-first,
        // oldest-added first when sorting oldest-date-first — keeps a same
        // day's cluster reading in the same direction as the outer sort.
        if (dateCompare === 0) {
          return createdAtCompare(a, b) * dir;
        }
        return dateCompare;
      }
      if (sortConfig.key === "payee") {
        return a.payee.localeCompare(b.payee) * dir;
      }
      if (sortConfig.key === "category") {
        return categoryLabel(a).localeCompare(categoryLabel(b)) * dir;
      }
      // amount
      if (a.balance === b.balance) return createdAtCompare(a, b);
      return (a.balance - b.balance) * dir;
    });
    return sorted;
  };

  const sortedTransactions = useMemo(() => {
    if (!account) return [];
    const q = searchQuery.trim().toLowerCase();
    const txs = q
      ? postedTransactions.filter(
          (tx) =>
            tx.payee?.toLowerCase().includes(q) ||
            categoryLabel(tx).toLowerCase().includes(q)
        )
      : postedTransactions;
    return applySort(txs);
  }, [account, postedTransactions, sortConfig, categoryLabel, searchQuery]);

  const sortedPendingTransactions = useMemo(
    () => applySort(pendingTransactions),
    [pendingTransactions, sortConfig, categoryLabel]
  );

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
        const tx = account.transactions.find((t) => t.id === selectedTxId);
        deleteTransactionWithMirror(tx?.account_id ?? account.id, selectedTxId);
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

    // Alt+N to add transaction
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setShowForm(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [account, selectedTxId, showForm, editingTransactionId, deleteTransactionWithMirror, sortedTransactions]);

  if (!account) {
    if (accountsLoading) {
      return <p className="text-center mt-10 text-slate-400 dark:text-slate-500">Loading account…</p>;
    }
    return <p className="text-center mt-10">Account not found.</p>;
  }

  return (
    <div className="relative bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Context menu */}
      {contextMenu && (
        <div
          data-cy="tx-context-menu"
          className="fixed z-50 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl dark:shadow-2xl text-sm overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          {(() => {
            const ctxTx = account.transactions.find((t) => t.id === contextMenu.txId);
            return !ctxTx?.approved ? (
              <button
                onClick={() => {
                  void toggleApproved(contextMenu.accountId, contextMenu.txId);
                  setContextMenu(null);
                }}
                className="px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-600 dark:text-amber-400 w-full text-left font-medium transition-colors"
              >
                Approve Transaction
              </button>
            ) : null;
          })()}
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
            className="px-4 py-2.5 hover:bg-ledger-50 dark:hover:bg-ledger-950 text-ledger-600 dark:text-ledger-400 w-full text-left font-medium transition-colors"
          >
            Edit Transaction
          </button>
          <button
            data-cy="context-duplicate-transaction"
            onClick={() => {
              const tx = account.transactions.find((t) => t.id === contextMenu.txId);
              if (tx) {
                const owner = realAccountFor(tx);
                const txData = { date: tx.date, payee: tx.payee, category: tx.category, category_group: tx.category_group, balance: tx.balance };
                const transferMatch = tx.payee?.match(/^(Transfer|Payment) (to|from) (.+)/);
                if (transferMatch) {
                  const otherAccountName = transferMatch[3];
                  const otherAccount = accounts.find((a) => a.name === otherAccountName);
                  if (otherAccount) {
                    // Find existing mirror to copy its data exactly
                    const mirrorTx = otherAccount.transactions.find(
                      (t) => t.date === tx.date && t.balance === -tx.balance && t.payee?.includes(owner.name)
                    );
                    const mirrorData = mirrorTx
                      ? { date: mirrorTx.date, payee: mirrorTx.payee, category: mirrorTx.category, category_group: mirrorTx.category_group, balance: mirrorTx.balance }
                      : { date: tx.date, payee: `${transferMatch[1]} ${transferMatch[2] === "to" ? "from" : "to"} ${owner.name}`, category: tx.category_group === "Credit Card Payments" ? owner.name : null, category_group: tx.category_group ?? null, balance: -tx.balance };
                    addTransactionWithMirror(owner.id, txData, otherAccount.id, mirrorData);
                  } else {
                    addTransaction(owner.id, txData);
                  }
                } else {
                  addTransaction(owner.id, txData);
                }
              }
              setContextMenu(null);
            }}
            className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 w-full text-left font-medium transition-colors border-t border-slate-200 dark:border-slate-700"
          >
            Duplicate Transaction
          </button>
          <button
            data-cy="context-delete-transaction"
            onClick={() => {
              deleteTransactionWithMirror(
                contextMenu.accountId,
                contextMenu.txId
              );
              setContextMenu(null);
            }}
            className="px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 w-full text-left font-medium transition-colors border-t border-slate-200 dark:border-slate-700"
          >
            Delete Transaction
          </button>
        </div>
      )}

      {/* Header / balance */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            data-cy="account-back-button"
            onClick={() => router.push("/dashboard")}
            className="h-8 w-8 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
          {isAllAccountsView ? (
            <h1 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100" data-cy="account-name">All Accounts</h1>
          ) : isEditingAccountName ? (
            <div className="flex items-center gap-2">
              <Input
                className="text-lg font-semibold border-b-2 border-ledger-500 focus-visible:ring-0 bg-transparent text-slate-800 dark:text-slate-100 h-auto px-0"
                value={newAccountName ?? ""}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
              <Button onClick={handleRenameAccount} size="sm" className="h-7 text-xs bg-ledger-600 hover:bg-ledger-700 text-white">Save</Button>
              <Button onClick={() => { setNewAccountName(account.name); setIsEditingAccountName(false); }} variant="outline" size="sm" className="h-7 text-xs">Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100" data-cy="account-name">{account.name}</h1>
              <Button onClick={() => setIsEditingAccountName(true)} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <Edit2 className="h-3 w-3" />
              </Button>
            </div>
          )}
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span
              data-cy="account-balance"
              className={`font-mono font-semibold ${accountBalance < 0 ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400"}`}
            >
              {accountBalance.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
            {" "}balance
          </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              data-cy="account-search-input"
              type="text"
              placeholder="Search payee or category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-56 pl-8 pr-7 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!isAllAccountsView && (
            <Button
              onClick={() => { setReconcileInput(accountBalance.toFixed(2)); setReconcileError(null); setReconcileOpen(true); }}
              variant="outline"
              size="sm"
              className="text-xs h-8"
            >
              Reconcile
            </Button>
          )}
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
            <>
              {isAllAccountsView && (
                <select
                  data-cy="all-accounts-add-target"
                  value={addAccountId?.toString() ?? ""}
                  onChange={(e) => setAddAccountId(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs px-2"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id.toString()}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                data-cy="add-transaction-button"
                onClick={() => setShowForm(true)}
                size="sm"
                disabled={isAllAccountsView && accounts.length === 0}
                className="h-8 bg-ledger-600 hover:bg-ledger-700 text-white dark:bg-ledger-700 dark:hover:bg-ledger-600 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Unapproved banner */}
      {(() => {
        const unapproved = account.transactions.filter((t) => !t.approved);
        const unapprovedCount = unapproved.length;
        const handleApproveAll = () => {
          const affectedAccountIds = Array.from(
            new Set(unapproved.map((t) => t.account_id ?? account.id))
          );
          affectedAccountIds.forEach((accId) => void approveAll(accId));
        };
        return unapprovedCount > 0 ? (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              {unapprovedCount} transaction{unapprovedCount !== 1 ? "s" : ""} need review
            </span>
            <button
              onClick={handleApproveAll}
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline underline-offset-2"
            >
              Approve all
            </button>
          </div>
        ) : null;
      })()}

      {/* Pending section — bank-unposted transactions get reviewed here
          instead of sitting in the main register below. */}
      {pendingTransactions.length > 0 && (
        <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
          <button
            onClick={() => setPendingSectionOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-5 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300"
          >
            <span className="flex items-center gap-1.5">
              {pendingSectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Clock className="h-3.5 w-3.5" />
              Pending ({pendingTransactions.length})
            </span>
          </button>
          {pendingSectionOpen && (
            <table className="w-full text-sm">
              <tbody>
                {sortedPendingTransactions.map((tx) =>
                  editingTransactionId === tx.id ? (
                    <InlineTransactionRow
                      key={`review-${tx.id}`}
                      accountId={tx.account_id ?? account.id}
                      mode="edit"
                      autoFocus
                      finalizeEarly
                      initialData={editedTransaction ?? tx}
                      onSave={() => { setEditingTransactionId(null); setEditedTransaction(null); }}
                      onCancel={() => { setEditingTransactionId(null); setEditedTransaction(null); }}
                    />
                  ) : (
                    <tr key={tx.id} data-cy="pending-transaction-row" data-txid={tx.id} className="border-b border-amber-100 dark:border-amber-900/40 last:border-b-0">
                      {isAllAccountsView && (
                        <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {(tx as FlatTransaction).account_name}
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                        {tx.date && format(parseISO(tx.date), "MMM d, yyyy")}
                      </td>
                      <td className="px-3 py-2 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        {tx.payee}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-semibold text-[13px] ${tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400"}`}
                      >
                        {tx.balance < 0 ? "−" : "+"}{Math.abs(tx.balance).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => { setEditedTransaction(tx); setEditingTransactionId(tx.id); setShowForm(false); }}
                          className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline underline-offset-2"
                          title="Categorize and enter this now — it won't be re-added once your bank posts it, unless the amount changes"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selectedTxIds.size > 0 && (
        <div className="px-5 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900 flex items-center gap-3">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {selectedTxIds.size} selected
          </span>
        </div>
      )}

      {/* Transactions table */}
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2 text-center w-9">
                <input
                  type="checkbox"
                  checked={postedTransactions.length > 0 && selectedTxIds.size === postedTransactions.length}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 text-center w-8 text-slate-400 dark:text-slate-500" title="Approved">
                A
              </th>
              <th className="px-3 py-2 text-center w-8 text-slate-400 dark:text-slate-500" title="Cleared">
                C
              </th>
              {isAllAccountsView && (
                <th className="px-3 py-2 text-left whitespace-nowrap">
                  Account
                </th>
              )}
              <th
                className="px-3 py-2 text-left cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("date")}
              >
                <span className="flex items-center gap-1">
                  Date <span className="text-[9px]">{sortIndicator("date")}</span>
                </span>
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => toggleSort("payee")}
              >
                <span className="flex items-center gap-1">
                  Payee <span className="text-[9px]">{sortIndicator("payee")}</span>
                </span>
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => toggleSort("category")}
              >
                <span className="flex items-center gap-1">
                  Category <span className="text-[9px]">{sortIndicator("category")}</span>
                </span>
              </th>
              <th
                className="px-3 py-2 text-right cursor-pointer select-none"
                onClick={() => toggleSort("amount")}
              >
                <span className="flex items-center gap-1 justify-end">
                  Amount <span className="text-[9px]">{sortIndicator("amount")}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Inline add row */}
            {showForm && (
              <InlineTransactionRow
                accountId={isAllAccountsView ? (addAccountId ?? accounts[0]?.id) : account.id}
                mode="add"
                autoFocus
                onCancel={() => setShowForm(false)}
                onSave={() => {}}
              />
            )}

            {/* Existing transactions */}
            {sortedTransactions.map((tx, idx) =>
              editingTransactionId === tx.id ? (
                <InlineTransactionRow
                  key={`edit-${tx.id}`}
                  accountId={tx.account_id ?? account.id}
                  mode="edit"
                  autoFocus
                  initialData={editedTransaction ?? tx}
                  onSave={() => { setEditingTransactionId(null); setEditedTransaction(null); }}
                  onCancel={() => { setEditingTransactionId(null); setEditedTransaction(null); }}
                />
              ) : (
                <tr
                  key={tx.id}
                  data-cy="transaction-row"
                  data-txid={tx.id}
                  className={`transition-colors cursor-default border-b border-slate-100 dark:border-slate-800 ${
                    selectedTxIds.has(tx.id)
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : selectedTxId === tx.id
                        ? "bg-ledger-50 dark:bg-ledger-950/40"
                        : !tx.approved
                          ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : idx % 2 === 0
                            ? "bg-slate-50 dark:bg-slate-950"
                            : "bg-slate-50/60 dark:bg-slate-900/40"
                  } ${selectedTxId === tx.id ? "ring-1 ring-inset ring-ledger-400 dark:ring-ledger-600" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                  onClick={() => setSelectedTxId(tx.id)}
                  onDoubleClick={() => startEdit(tx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedTxId(tx.id);
                    if (selectedTxIds.size > 0) {
                      setBulkContextMenu({ x: e.clientX, y: e.clientY });
                    } else {
                      setContextMenu({ x: e.clientX, y: e.clientY, txId: tx.id, accountId: tx.account_id ?? account.id });
                    }
                  }}
                >
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => { e.stopPropagation(); toggleTransactionSelection(tx.id); }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTxIds.has(tx.id)}
                      onChange={() => toggleTransactionSelection(tx.id)}
                      className="cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => { e.stopPropagation(); void toggleApproved(tx.account_id ?? account.id, tx.id); }}
                    title={tx.approved ? "Approved — click to unapprove" : "Needs review — click to approve"}
                  >
                    {tx.approved
                      ? <CheckCircle2 className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                      : <Flag className="h-4 w-4 text-amber-400 dark:text-amber-500 mx-auto" />
                    }
                  </td>
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => { e.stopPropagation(); void toggleCleared(tx.account_id ?? account.id, tx.id); }}
                    title={tx.cleared ? "Cleared — click to uncleared" : "Uncleared — click to clear"}
                  >
                    {tx.cleared
                      ? <CheckCircle2 className="h-4 w-4 text-ledger-500 dark:text-ledger-400 mx-auto" />
                      : <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                    }
                  </td>
                  {isAllAccountsView && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                      {(tx as FlatTransaction).account_name}
                    </td>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                    {tx.date && format(parseISO(tx.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-2.5 truncate max-w-xs text-[13px] font-medium text-slate-800 dark:text-slate-100">
                    {tx.payee}
                    {tx.original_balance != null && (
                      <span
                        title={`Entered early at ${tx.original_balance.toLocaleString("en-US", { style: "currency", currency: "USD" })} — posted for a different amount`}
                        className="ml-1.5 align-middle text-[10px] uppercase tracking-wide bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded px-1 py-0.5"
                      >
                        Amount changed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 truncate max-w-xs text-[12px] text-slate-500 dark:text-slate-400">
                    {!tx.category && !tx.category_group && tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
                      ? <span className="text-slate-400 dark:text-slate-500 italic">{tx.payee}</span>
                      : tx.category === "Ready to Assign" || tx.category_group === "Ready to Assign"
                        ? "Ready to Assign"
                        : tx.category === "Category Not Needed"
                          ? "Category Not Needed"
                          : tx.category_group && tx.category
                            ? `${tx.category_group}: ${tx.category}`
                            : (
                              <span className="inline-flex items-center gap-1.5 text-red-500 dark:text-red-400">
                                Uncategorized
                                <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 rounded px-1 py-0.5">needs category</span>
                              </span>
                            )}
                  </td>
                  <td
                    data-cy="transaction-amount"
                    className={`px-3 py-2.5 text-right font-mono font-semibold text-[13px] ${tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400"}`}
                  >
                    {tx.balance < 0 ? "−" : "+"}{Math.abs(tx.balance).toLocaleString("en-US", { style: "currency", currency: "USD" })}
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
          className="fixed z-50 bg-slate-50 border border-slate-200 rounded-md shadow-lg py-1 min-w-[180px]"
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

      <Dialog
        open={reconcileOpen}
        onOpenChange={(open) => {
          setReconcileOpen(open);
          if (open) {
            setReconcileInput(accountBalance.toFixed(2));
            setReconcileError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile balance</DialogTitle>
            <DialogDescription>
              Enter the real-world balance for this account. If it differs, an adjustment transaction will be added
              {account?.type === "debit"
                ? " to Ready to Assign."
                : " as a hidden reconciliation entry, without touching your budget categories."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="reconcile-balance"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Current balance
            </label>
            <Input
              id="reconcile-balance"
              type="text"
              inputMode="decimal"
              value={reconcileInput}
              onChange={(e) => {
                setReconcileInput(e.target.value.replace(/,/g, ""));
                setReconcileError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleReconcileSubmit();
                }
              }}
              autoFocus
            />
            {reconcileError && (
              <p className="text-sm text-red-600 dark:text-red-400">{reconcileError}</p>
            )}
            {!reconcileError && reconcileDifference !== null && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Adjustment to apply: <span className={`font-semibold ${reconcileDifference < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300"}`}>
                  {reconcileDifference.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleReconcileSubmit()} className="bg-ledger-600 hover:bg-ledger-700 text-white">
              Create Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
