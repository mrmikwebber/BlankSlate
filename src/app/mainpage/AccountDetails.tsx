"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Transaction, useAccountContext } from "@/app/context/AccountContext";
import { useUndoRedo } from "@/app/context/UndoRedoContext";
import { useAuth } from "@/app/context/AuthContext";
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
import { Plus, Edit2, Trash2, ArrowLeft, CheckCircle2, Circle, Flag, RefreshCw, WifiOff } from "lucide-react";
import TellerConnect, { TellerEnrollmentData } from "@/components/TellerConnect";

export default function AccountDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { accounts, addTransaction, addTransactionWithMirror, deleteTransactionWithMirror, editAccountName, refreshSingleAccount, toggleCleared, toggleApproved, approveAll } =
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

  const [enrollment, setEnrollment] = useState<{
    last_synced_at: string | null;
    teller_status?: string;
    teller_account_id?: string;
  } | null | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  const account = accounts.find((acc) => acc.id.toString() === id);
  const accountBalance =
    account?.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ?? 0;

  const sanitizedReconcileInput = reconcileInput.replace(/[^0-9.-]/g, "");
  const parsedReconcileTarget = reconcileInput
    ? Number.parseFloat(sanitizedReconcileInput)
    : Number.NaN;
  const reconcileDifference = Number.isNaN(parsedReconcileTarget)
    ? null
    : parsedReconcileTarget - accountBalance;

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

  const startEdit = (tx: Transaction) => {
    setEditedTransaction(tx);
    setEditingTransactionId(tx.id);
    setShowForm(false);
  };

  const handleRenameAccount = async () => {
    if (!account || !newAccountName) return;
    await editAccountName(Number(account.id), newAccountName);
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
    await refreshSingleAccount(Number(account.id));

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
        await refreshSingleAccount(Number(account.id));
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
              account_id: Number(account.id),
              user_id: user?.id,
            },
          ]).select();

          if (!error && restoredData) {
            currentDeletedTxIds = currentDeletedTxIds.map(txId => txId === tx.id ? restoredData[0].id : txId);
          } else {
            console.error("Error restoring transaction:", error);
          }
        }
        await refreshSingleAccount(Number(account.id));
      },
    });
    
    // Clear selection
    setSelectedTxIds(new Set());
    setBulkContextMenu(null);
  };

  const handleReconcileSubmit = async () => {
    if (!account) return;
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

    await addTransaction(Number(account.id), {
      date: today,
      payee: "Reconciliation Adjustment",
      category: "Reconciliation (Hidden)",
      category_group: "Reconciliation (Hidden)",
      balance: difference,
    });

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
    if (selectedTxIds.size === account.transactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(account.transactions.map(tx => tx.id)));
    }
  };

  const categoryLabel = useMemo(
    () =>
      (tx: Transaction) => {
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
        const dateCompare = (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
        // If dates are equal, sort by ID descending (newest first) for desc, or ascending for asc
        if (dateCompare === 0) {
          return dir === -1 ? b.id - a.id : a.id - b.id;
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

  // Fetch Teller enrollment status for this account, then verify with Teller
  // if the status is 'active' (catches pre-existing disconnections before the
  // teller_status column was added)
  useEffect(() => {
    if (!account) return;
    setEnrollment(undefined);
    supabase
      .from("teller_enrollments")
      .select("last_synced_at, teller_status, teller_account_id")
      .eq("account_id", account.id)
      .single()
      .then(({ data }) => {
        setEnrollment(data ?? null);
      });
  }, [account?.id]);

  const handleSync = async () => {
    if (!account || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/teller/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const body = await res.json() as { synced?: number; error?: string; disconnected?: boolean };
      if (!res.ok) {
        setSyncMessage(body.error ?? "Sync failed");
        if (body.disconnected) {
          setEnrollment((prev) => prev ? { ...prev, teller_status: "disconnected" } : prev);
        }
      } else {
        setSyncMessage(body.synced === 0 ? "Already up to date" : `${body.synced} new transaction${body.synced !== 1 ? "s" : ""} added`);
        setEnrollment({ last_synced_at: new Date().toISOString() });
        await refreshSingleAccount(Number(account.id));
      }
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleReconnect = async (data: TellerEnrollmentData) => {
    if (!account || !enrollment?.teller_account_id) return;
    setReconnectError(null);
    try {
      const res = await fetch("/api/teller/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.accessToken,
          enrollmentId: data.enrollmentId,
          selectedAccountIds: [enrollment.teller_account_id],
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Reconnect failed");
      }
      // Re-fetch enrollment to clear the disconnected status
      const { data: fresh } = await supabase
        .from("teller_enrollments")
        .select("last_synced_at, teller_status, teller_account_id")
        .eq("account_id", account.id)
        .single();
      setEnrollment(fresh ?? null);
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : "Reconnect failed");
    }
  };

  const syncCooldownLabel = (): string | null => {
    if (!enrollment?.last_synced_at) return null;
    const ms = Date.now() - new Date(enrollment.last_synced_at).getTime();
    const msInHour = 60 * 60 * 1000;
    if (ms < msInHour) {
      const minutesLeft = Math.ceil((msInHour - ms) / 60000);
      return `Available in ${minutesLeft}m`;
    }
    return null;
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
        deleteTransactionWithMirror(Number(account.id), selectedTxId);
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
    return <p className="text-center mt-10">Account not found.</p>;
  }

  return (
    <div className="relative bg-white dark:bg-slate-950 min-h-screen">
      {/* Context menu */}
      {contextMenu && (
        <div
          data-cy="tx-context-menu"
          className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl dark:shadow-2xl text-sm overflow-hidden"
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
            className="px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-950 text-teal-600 dark:text-teal-400 w-full text-left font-medium transition-colors"
          >
            Edit Transaction
          </button>
          <button
            data-cy="context-duplicate-transaction"
            onClick={() => {
              const tx = account.transactions.find((t) => t.id === contextMenu.txId);
              if (tx) {
                const txData = { date: tx.date, payee: tx.payee, category: tx.category, category_group: tx.category_group, balance: tx.balance };
                const transferMatch = tx.payee?.match(/^(Transfer|Payment) (to|from) (.+)/);
                if (transferMatch) {
                  const otherAccountName = transferMatch[3];
                  const otherAccount = accounts.find((a) => a.name === otherAccountName);
                  if (otherAccount) {
                    // Find existing mirror to copy its data exactly
                    const mirrorTx = otherAccount.transactions.find(
                      (t) => t.date === tx.date && t.balance === -tx.balance && t.payee?.includes(account.name)
                    );
                    const mirrorData = mirrorTx
                      ? { date: mirrorTx.date, payee: mirrorTx.payee, category: mirrorTx.category, category_group: mirrorTx.category_group, balance: mirrorTx.balance }
                      : { date: tx.date, payee: `${transferMatch[1]} ${transferMatch[2] === "to" ? "from" : "to"} ${account.name}`, category: tx.category_group === "Credit Card Payments" ? account.name : null, category_group: tx.category_group ?? null, balance: -tx.balance };
                    addTransactionWithMirror(Number(account.id), txData, Number(otherAccount.id), mirrorData);
                  } else {
                    addTransaction(Number(account.id), txData);
                  }
                } else {
                  addTransaction(Number(account.id), txData);
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
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
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
          {isEditingAccountName ? (
            <div className="flex items-center gap-2">
              <Input
                className="text-lg font-semibold border-b-2 border-teal-500 focus-visible:ring-0 bg-transparent text-slate-800 dark:text-slate-100 h-auto px-0"
                value={newAccountName ?? ""}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
              <Button onClick={handleRenameAccount} size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white">Save</Button>
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
              className={`font-mono font-semibold ${accountBalance < 0 ? "text-red-600 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}
            >
              {accountBalance.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
            {" "}balance
          </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {enrollment && enrollment.teller_status !== "disconnected" && (() => {
            const cooldown = syncCooldownLabel();
            return (
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  onClick={() => void handleSync()}
                  disabled={syncing || !!cooldown}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  title={cooldown ?? "Sync bank transactions"}
                >
                  <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : cooldown ?? "Sync"}
                </Button>
                {syncMessage && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{syncMessage}</span>
                )}
              </div>
            );
          })()}
          <Button
            onClick={() => { setReconcileInput(accountBalance.toFixed(2)); setReconcileError(null); setReconcileOpen(true); }}
            variant="outline"
            size="sm"
            className="text-xs h-8"
          >
            Reconcile
          </Button>
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
              className="h-8 bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Disconnected banner */}
      {enrollment?.teller_status === "disconnected" && (
        <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
            Bank connection lost — reconnect to resume syncing
          </span>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <TellerConnect onEnrollmentReady={handleReconnect} />
            {reconnectError && (
              <span className="text-[10px] text-red-600 dark:text-red-400">{reconnectError}</span>
            )}
          </div>
        </div>
      )}

      {/* Unapproved banner */}
      {(() => {
        const unapprovedCount = account.transactions.filter((t) => !t.approved).length;
        return unapprovedCount > 0 ? (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              {unapprovedCount} transaction{unapprovedCount !== 1 ? "s" : ""} need review
            </span>
            <button
              onClick={() => void approveAll(Number(account.id))}
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline underline-offset-2"
            >
              Approve all
            </button>
          </div>
        ) : null;
      })()}

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
                  checked={account.transactions.length > 0 && selectedTxIds.size === account.transactions.length}
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
                accountId={Number(account.id)}
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
                  accountId={Number(account.id)}
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
                        ? "bg-teal-50 dark:bg-teal-950/40"
                        : !tx.approved
                          ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : idx % 2 === 0
                            ? "bg-white dark:bg-slate-950"
                            : "bg-slate-50/60 dark:bg-slate-900/40"
                  } ${selectedTxId === tx.id ? "ring-1 ring-inset ring-teal-400 dark:ring-teal-600" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                  onClick={() => setSelectedTxId(tx.id)}
                  onDoubleClick={() => startEdit(tx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedTxId(tx.id);
                    if (selectedTxIds.size > 0) {
                      setBulkContextMenu({ x: e.clientX, y: e.clientY });
                    } else {
                      setContextMenu({ x: e.clientX, y: e.clientY, txId: tx.id, accountId: Number(account.id) });
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
                    onClick={(e) => { e.stopPropagation(); void toggleApproved(Number(account.id), tx.id); }}
                    title={tx.approved ? "Approved — click to unapprove" : "Needs review — click to approve"}
                  >
                    {tx.approved
                      ? <CheckCircle2 className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                      : <Flag className="h-4 w-4 text-amber-400 dark:text-amber-500 mx-auto" />
                    }
                  </td>
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => { e.stopPropagation(); void toggleCleared(Number(account.id), tx.id); }}
                    title={tx.cleared ? "Cleared — click to uncleared" : "Uncleared — click to clear"}
                  >
                    {tx.cleared
                      ? <CheckCircle2 className="h-4 w-4 text-teal-500 dark:text-teal-400 mx-auto" />
                      : <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                    }
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                    {tx.date && format(parseISO(tx.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-2.5 truncate max-w-xs text-[13px] font-medium text-slate-800 dark:text-slate-100">
                    {tx.payee}
                  </td>
                  <td className="px-3 py-2.5 truncate max-w-xs text-[12px] text-slate-500 dark:text-slate-400">
                    {tx.payee && (tx.payee.startsWith("Transfer") || tx.payee.startsWith("Payment"))
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
                    className={`px-3 py-2.5 text-right font-mono font-semibold text-[13px] ${tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}
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
              Enter the real-world balance for this account. If it differs, a hidden reconciliation transaction will be added without touching your budget categories.
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
              type="number"
              value={reconcileInput}
              onChange={(e) => {
                setReconcileInput(e.target.value);
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
            <Button onClick={() => void handleReconcileSubmit()} className="bg-teal-600 hover:bg-teal-700 text-white">
              Create Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
