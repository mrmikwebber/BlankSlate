"use client"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { useUndoRedo } from "./UndoRedoContext";
import { useBudgetSelection } from "./BudgetSelectionContext";
// A plain module-level function (not a React hook) — safe to call here even
// though BudgetContext/useBudgetMonth live in a provider that wraps this one
// (AccountProvider is BudgetProvider's ancestor, so this file can never call
// useBudgetContext() itself). Only clears the shared month-view cache; it
// does NOT force a currently-mounted BudgetContext to re-render — callers
// that need the visible Ready to Assign/activity figures to update
// immediately still need to call the real invalidateAll() from
// useBudgetContext() themselves. This is the fallback that keeps undo/redo
// (whose execute/undo closures live here, not in a component) from serving
// truly-stale cached data on the *next* real fetch.
import { invalidateAllCachedMonths } from "../hooks/useBudgetMonth";
export interface Transaction {
  id: number;
  date: string;
  payee: string;
  category: string;
  category_group: string;
  category_item_id?: string | null;
  account: string;
  account_id?: string | number;
  balance: number;
  cleared: boolean;
  approved: boolean;
  pending?: boolean;
  entered_early?: boolean;
  original_balance?: number | null;
  created_at?: string;
}

export interface Account {
  id: string | number;
  name: string;
  balance: number;
  transactions: Transaction[];
  issuer: "amex" | "visa" | "mastercard" | "discover";
  type: "credit" | "debit";
}

export interface SavedPayee {
  id: number;
  name: string;
  last_used_at: string;
}

interface AccountContextType {
  // ...existing stuff
  savedPayees: SavedPayee[];
  upsertPayee: (name: string) => Promise<void>;
  toggleCleared: (accountId: string | number, transactionId: string | number) => Promise<void>;
  toggleApproved: (accountId: string | number, transactionId: string | number) => Promise<void>;
  approveAll: (accountId: string | number) => Promise<void>;
}

interface AccountContextType {
  toggleCleared: (accountId: string | number, transactionId: string | number) => Promise<void>;
  accounts: Account[];
  accountsLoading: boolean;
  recentTransactions: Transaction[];
  addTransaction: (accountId: string | number, transaction: Record<string, unknown>) => void;
  addTransactionWithMirror: (accountId: string | number, transaction: Record<string, unknown>, mirrorAccountId: string | number, mirrorTransaction: Record<string, unknown>) => Promise<void>;
  addAccount: (newAccount: Record<string, unknown>) => void;
  setAccounts: Dispatch<SetStateAction<Account[]>>;
  deleteAccount: (accountId: string | number) => void;
  deleteTransaction: (accountId: string | number, transactionId: string | number) => void;
  deleteTransactionWithMirror: (accountId: string | number, transactionId: string | number) => void;
  editTransaction: (
    accountId: string | number,
    transactionId: string | number,
    updatedTransaction: Partial<Transaction>
  ) => void;
  editAccountName: (accountId: string | number, newName: string) => void;
  refreshSingleAccount: (accountId: string | number) => void;
  refetchAccounts: () => Promise<void>;
  reorderAccounts: (
    draggedId: string | number,
    targetId: string | number,
    position?: "before" | "after"
  ) => void;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccountContext = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccountContext must be used within an AccountProvider");
  }
  return context;
};

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const { user, isRecoverySession } = useAuth() || { user: null, isRecoverySession: false };
  const { registerAction } = useUndoRedo();
  const { currentBudgetId } = useBudgetSelection();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [savedPayees, setSavedPayees] = useState<SavedPayee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const fetchGenRef = useRef(0);

  const orderKey = useMemo(
    () => (user?.id ? `account-order:${user.id}` : null),
    [user?.id]
  );

  const loadOrder = (): string[] | null => {
    if (!orderKey || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(orderKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as (string | number)[];
      return parsed.map(String);
    } catch (err) {
      console.warn("Failed to load account order", err);
      return null;
    }
  };

  const saveOrder = (ids: string[]) => {
    if (!orderKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(orderKey, JSON.stringify(ids));
    } catch (err) {
      console.warn("Failed to save account order", err);
    }
  };

  const toOrderedIds = (list: Account[]): string[] =>
    list.map((account) => String(account.id));

  const applyOrder = (list: Account[], order: string[] | null) => {
    if (!order || order.length === 0) return list;
    const map = new Map(list.map((a) => [String(a.id), a] as const));
    const ordered: Account[] = [];
    order.forEach((id) => {
      const acc = map.get(String(id));
      if (acc) {
        ordered.push(acc);
        map.delete(String(id));
      }
    });
    // append any new accounts not yet in order (includes migration case where
    // old numeric IDs don't match UUID string IDs — all accounts fall through here)
    map.forEach((acc) => ordered.push(acc));
    console.log(`[AccountContext] applyOrder — order.length=${order.length} matched=${ordered.length - (map.size > 0 ? 0 : 0)} total=${ordered.length}`);
    return ordered;
  };
  const fetchAccounts = async () => {
    if (!user || isRecoverySession || !currentBudgetId) {
      console.log("[AccountContext] fetchAccounts skipped — user:", !!user, "isRecoverySession:", isRecoverySession, "currentBudgetId:", currentBudgetId);
      return;
    }
    const gen = ++fetchGenRef.current;
    console.log(`[AccountContext] fetchAccounts start — gen=${gen} user=${user.id} budget=${currentBudgetId}`);

    // Two separate queries rather than an embedded `accounts(*, transactions(*))`
    // select: accounts stay budget-agnostic, but a dot-filter on an embedded
    // (non-`!inner`) resource is a Supabase no-op — it would silently return
    // every transaction across every budget mixed together. Filtering and
    // stitching client-side avoids that footgun.
    const [{ data: accountsData, error: accountsError }, { data: txData, error: txError }] =
      await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", user.id),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("budget_id", currentBudgetId),
      ]);

    if (gen !== fetchGenRef.current) {
      console.warn(`[AccountContext] fetchAccounts stale result dropped — gen=${gen} current=${fetchGenRef.current}`);
      return;
    }

    if (accountsError || txError) {
      console.error("[AccountContext] fetchAccounts error:", accountsError?.message, txError?.message);
      setAccountsLoading(false);
      return;
    }

    console.log(`[AccountContext] fetchAccounts complete — gen=${gen} returned ${accountsData?.length ?? 0} accounts:`, accountsData?.map(a => `${a.id}:${a.name}`));
    if (accountsData) {
      const txByAccount = new Map<string, unknown[]>();
      for (const tx of txData ?? []) {
        const key = String((tx as { account_id: string }).account_id);
        if (!txByAccount.has(key)) txByAccount.set(key, []);
        txByAccount.get(key)!.push(tx);
      }
      const withTransactions = accountsData.map((acc) => ({
        ...acc,
        transactions: txByAccount.get(String(acc.id)) ?? [],
      }));
      const normalized = (withTransactions as unknown as Account[]).map((acc) => normalizeAccount(acc));
      const ordered = applyOrder(normalized, loadOrder());
      setAccounts(ordered);
    }
    setAccountsLoading(false);
  };

  useEffect(() => {
    console.log("[AccountContext] user changed — id:", user?.id ?? "null", "isRecoverySession:", isRecoverySession, "currentBudgetId:", currentBudgetId);
    if (!user || isRecoverySession) {
      setAccountsLoading(false);
      return;
    }
    if (!currentBudgetId) {
      // Still waiting on BudgetSelectionContext to resolve — stay loading.
      return;
    }
    fetchAccounts();
  }, [user, isRecoverySession, currentBudgetId]);

  // Realtime: refresh an account whenever a transaction is inserted
  useEffect(() => {
    // Also re-subscribe once currentBudgetId resolves — refreshSingleAccount
    // closes over it and no-ops while it's null, which it is on first mount
    // (BudgetSelectionContext resolves asynchronously after `user`).
    if (!user || !currentBudgetId) return;

    const channel = supabase
      .channel("transactions-insert")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const accountId = (payload.new as { account_id: number }).account_id;
          if (accountId) refreshSingleAccount(accountId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentBudgetId]);

  useEffect(() => {
  if (!user) {
    setSavedPayees([]);
    return;
  }

  const fetchPayees = async () => {
    const { data, error } = await supabase
      .from("transaction_payees")
      .select("*")
      .eq("user_id", user.id)
      .order("last_used_at", { ascending: false });

    if (error) {
      console.error("[AccountContext] Error fetching payees", error);
      return;
    }

    setSavedPayees(data as SavedPayee[]);
  };

  fetchPayees();
}, [user]);

const upsertPayee = async (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { data, error } = await supabase
    .from("transaction_payees")
    .upsert(
      {
        user_id: user?.id,
        name: trimmed,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" } // use the unique constraint
    )
    .select()
    .single();

  if (error) {
    console.error("[AccountContext] Error upserting payee", error);
    return;
  }

  setSavedPayees((prev) => {
    const without = prev.filter((p) => p.name !== trimmed);
    return [data as SavedPayee, ...without];
  });
};



  const addTransaction = async (accountId, transaction, skipUndo = false) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
        budget_id: currentBudgetId,
        account_id: accountId,
      },
    ]).select();

    if (error) {
      console.error("Add transaction failed:", error);
      return;
    }

    let currentTransactionId = data[0].id;
    const transactionData = { ...transaction };

    await refreshSingleAccount(accountId);
    invalidateAllCachedMonths();

    if (skipUndo) {
      return data;
    }

    registerAction({
      description: `Added transaction ${transaction.payee} ($${transaction.balance})`,
      execute: async () => {
        // Re-insert the transaction for redo
        const { data: redoData, error: insertError } = await supabase.from("transactions").insert([
          {
            ...transactionData,
            user_id: user?.id,
            budget_id: currentBudgetId,
            account_id: accountId,
          },
        ]).select();

        if (!insertError && redoData) {
          currentTransactionId = redoData[0].id;
          await refreshSingleAccount(accountId);
          invalidateAllCachedMonths();
        } else {
          console.error('❌ REDO: Insert failed', insertError);
        }
      },
      undo: async () => {
        const { error: deleteError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", currentTransactionId);

        if (!deleteError) {
          await refreshSingleAccount(accountId);
          invalidateAllCachedMonths();
        }
      },
    });

    return data;
  };

  const addTransactionWithMirror = async (
    accountId: string | number,
    transaction: Record<string, unknown>,
    mirrorAccountId: string | number,
    mirrorTransaction: Record<string, unknown>
  ) => {
    // Insert both transactions
    const { data: data1, error: error1 } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
        budget_id: currentBudgetId,
        account_id: accountId,
      },
    ]).select();

    if (error1) {
      console.error("Add transaction failed:", error1);
      return;
    }

    const { data: data2, error: error2 } = await supabase.from("transactions").insert([
      {
        ...mirrorTransaction,
        user_id: user?.id,
        budget_id: currentBudgetId,
        account_id: mirrorAccountId,
      },
    ]).select();

    if (error2) {
      console.error("Add mirror transaction failed:", error2);
      // Clean up first transaction
      const id1ToClean = data1?.[0]?.id;
      if (id1ToClean) await supabase.from("transactions").delete().eq("id", id1ToClean);
      return;
    }

    // Refresh both accounts before accessing IDs so mirrors always appear even if ID
    // retrieval fails (e.g. when Supabase SELECT-after-INSERT returns empty due to RLS).
    await refreshSingleAccount(accountId);
    await refreshSingleAccount(mirrorAccountId);
    invalidateAllCachedMonths();

    let currentTxId1 = data1?.[0]?.id ?? null;
    let currentTxId2 = data2?.[0]?.id ?? null;
    const tx1Data = { ...transaction };
    const tx2Data = { ...mirrorTransaction };

    registerAction({
      description: `Added transfer ${transaction.payee} ($${transaction.balance})`,
      execute: async () => {
        // Re-insert both transactions for redo
        const { data: redoData1, error: insertError1 } = await supabase.from("transactions").insert([
          {
            ...tx1Data,
            user_id: user?.id,
            budget_id: currentBudgetId,
            account_id: accountId,
          },
        ]).select();

        const { data: redoData2, error: insertError2 } = await supabase.from("transactions").insert([
          {
            ...tx2Data,
            user_id: user?.id,
            budget_id: currentBudgetId,
            account_id: mirrorAccountId,
          },
        ]).select();

        if (!insertError1 && redoData1) {
          currentTxId1 = redoData1?.[0]?.id ?? currentTxId1;
          await refreshSingleAccount(accountId);
        }
        if (!insertError2 && redoData2) {
          currentTxId2 = redoData2?.[0]?.id ?? currentTxId2;
          await refreshSingleAccount(mirrorAccountId);
        }
        invalidateAllCachedMonths();
      },
      undo: async () => {
        // Delete both transactions
        const { error: deleteError1 } = await supabase
          .from("transactions")
          .delete()
          .eq("id", currentTxId1);

        const { error: deleteError2 } = await supabase
          .from("transactions")
          .delete()
          .eq("id", currentTxId2);

        if (!deleteError1) {
          await refreshSingleAccount(accountId);
        }
        if (!deleteError2) {
          await refreshSingleAccount(mirrorAccountId);
        }
        invalidateAllCachedMonths();
      },
    });
  };

  const normalizeAccount = (raw: { transactions?: Array<{ balance?: number }> } & Partial<Account>): Account => {
    const txs = raw.transactions ?? [];
    const computedBalance = txs.reduce(
      (sum: number, tx) => sum + (tx.balance ?? 0),
      0
    );

    return {
      ...raw,
      balance: computedBalance,
      transactions: txs,
    } as Account;
  };

  const editTransaction = async (
    accountId: string | number,
    transactionId: string | number,
    updatedTransaction: Partial<Transaction>
  ) => {
    const updatePayload: Record<string, unknown> = {
      date: updatedTransaction.date,
      payee: updatedTransaction.payee,
      category: updatedTransaction.category,
      category_group: updatedTransaction.category_group,
      category_item_id: updatedTransaction.category_item_id ?? null,
      balance: updatedTransaction.balance,
      cleared: updatedTransaction.cleared ?? false,
    };
    // Only touched when explicitly provided (e.g. finalizing a pending
    // transaction early) — normal edits never pass these, so they must stay
    // out of the payload entirely rather than defaulting to false/null and
    // silently clobbering an already-reviewed transaction.
    if (updatedTransaction.pending !== undefined) updatePayload.pending = updatedTransaction.pending;
    if (updatedTransaction.entered_early !== undefined) updatePayload.entered_early = updatedTransaction.entered_early;
    if (updatedTransaction.approved !== undefined) updatePayload.approved = updatedTransaction.approved;

    const { error } = await supabase
      .from("transactions")
      .update(updatePayload)
      .eq("id", transactionId)
      .eq("account_id", accountId);

    setRecentTransactions((prev) => {
      const updated = prev.map((t) =>
        t.id === updatedTransaction.id ? { ...updatedTransaction, timestamp: new Date().toISOString() } : t
      );
      return [...updated.slice(-10)];
    });

    if (error) {
      console.error("Failed to update transaction:", error.message);
      return;
    }

    setAccounts((prevAccounts) =>
      prevAccounts.map((account) => {
        if (account.id !== accountId) return account;

        const updatedTransactions = account.transactions.map((tx) =>
          tx.id === transactionId ? { ...tx, ...updatedTransaction } : tx
        );

        return { ...account, transactions: updatedTransactions };
      })
    );
    invalidateAllCachedMonths();
  };

  const toggleCleared = async (accountId: string | number, transactionId: string | number) => {
    const account = accounts.find((a) => a.id === accountId);
    const tx = account?.transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    const newCleared = !tx.cleared;

    const { error } = await supabase
      .from("transactions")
      .update({ cleared: newCleared })
      .eq("id", transactionId);

    if (error) {
      console.error("Failed to toggle cleared:", error);
      return;
    }

    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id !== accountId
          ? acc
          : {
              ...acc,
              transactions: acc.transactions.map((t) =>
                t.id !== transactionId ? t : { ...t, cleared: newCleared }
              ),
            }
      )
    );
  };

  const toggleApproved = async (accountId: string | number, transactionId: string | number) => {
    const account = accounts.find((a) => a.id === accountId);
    const tx = account?.transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    const newApproved = !tx.approved;

    const { error } = await supabase
      .from("transactions")
      .update({ approved: newApproved })
      .eq("id", transactionId);

    if (error) {
      console.error("Failed to toggle approved:", error);
      return;
    }

    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id !== accountId
          ? acc
          : {
              ...acc,
              transactions: acc.transactions.map((t) =>
                t.id !== transactionId ? t : { ...t, approved: newApproved }
              ),
            }
      )
    );
  };

  const approveAll = async (accountId: string | number) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    const unapprovedIds = account.transactions
      .filter((t) => !t.approved)
      .map((t) => t.id);

    if (unapprovedIds.length === 0) return;

    const { error } = await supabase
      .from("transactions")
      .update({ approved: true })
      .in("id", unapprovedIds);

    if (error) {
      console.error("Failed to approve all:", error);
      return;
    }

    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id !== accountId
          ? acc
          : {
              ...acc,
              transactions: acc.transactions.map((t) => ({ ...t, approved: true })),
            }
      )
    );
  };

  const editAccountName = async (accountId: string | number, newName: string) => {
    const account = accounts.find((a) => a.id === accountId);

    const { error } = await supabase
      .from("accounts")
      .update({ name: newName })
      .eq("id", accountId);

    if (error) {
      console.error("Failed to update account name:", error.message);
      return;
    }

    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId ? { ...acc, name: newName } : acc
      )
    );

    // Credit Card Payments category items are linked to their account by
    // exact name match (no real foreign key — see lib/budgetMath.ts
    // ccItemToAccountId) — a stale name silently breaks that link, so keep
    // the matching category item's name in sync whenever the account is
    // renamed. Not reflected in BudgetContext's cache until its next
    // fetch/month-navigation.
    if (account?.type === "credit" && account.name !== newName && user?.id && currentBudgetId) {
      const { data: ccGroup } = await supabase
        .from("category_groups")
        .select("id")
        .eq("user_id", user.id)
        .eq("budget_id", currentBudgetId)
        .eq("name", "Credit Card Payments")
        .maybeSingle();

      if (ccGroup) {
        const { data: matchingItem } = await supabase
          .from("category_items")
          .select("id")
          .eq("group_id", ccGroup.id)
          .eq("name", account.name)
          .maybeSingle();

        if (matchingItem) {
          const { error: renameError } = await supabase
            .from("category_items")
            .update({ name: newName })
            .eq("id", matchingItem.id);
          if (renameError) {
            console.error("Failed to sync Credit Card Payments category name:", renameError.message);
          }
        }
      }
    }
  };


  const defaultTransaction = {
    date: new Date().toISOString(),
    payee: "Starting Balance",
    category: "Ready to Assign",
    category_group: "Ready to Assign",
    balance: 0,
  }

  const refreshSingleAccount = async (accountId) => {
    console.log("[AccountContext] refreshSingleAccount — accountId:", accountId, "budget:", currentBudgetId);
    if (!currentBudgetId) return;

    const [{ data, error }, { data: txData, error: txError }] = await Promise.all([
      supabase.from("accounts").select("*").eq("id", accountId).single(),
      supabase.from("transactions").select("*").eq("account_id", accountId).eq("budget_id", currentBudgetId),
    ]);

    if (error || !data || txError) {
      console.error("❌ Error refreshing account:", error, txError);
      return;
    }

    const updated = normalizeAccount({ ...data, transactions: txData ?? [] });

    setAccounts((prev) => {
      return prev.map((acc) => (acc.id === accountId ? updated : acc));
    });
  };


  const addAccount = async (account) => {
    const { data, error } = await supabase.from("accounts").insert([
      {
        ...account,
        user_id: user?.id,
      },
    ]).select();
    if (error) {
      console.error("Add account failed:", error);
      return;
    }

    const currentAccountId = data[0].id;
    const isCredit = account.type === "credit";
    const newTransaction = {
      ...defaultTransaction,
      payee: "Starting Balance",
      category: isCredit ? "Category Not Needed" : "Ready to Assign",
      category_group: isCredit ? null : "Ready to Assign",
      balance: account.balance,
    }
    const generatedTransaction = await addTransaction(currentAccountId, newTransaction, true);
    
    setAccounts((prev) => {
      const next = [...prev, { ...account, id: currentAccountId, transactions: generatedTransaction }];
      saveOrder(toOrderedIds(next));
      return next;
    });
  };

  const deleteAccount = async (accountId: number | string) => {
    if (!accountId) {
      console.error("❌ Invalid account ID:", accountId);
      return;
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId);

    if (error) {
      console.error("Failed to delete account:", error);
    } else {
      setAccounts((prev) => {
        // eslint-disable-next-line eqeqeq
        const next = prev.filter((acc) => acc.id != accountId);
        saveOrder(toOrderedIds(next));
        return next;
      });
      invalidateAllCachedMonths();
    }
  };

  const deleteTransaction = async (accountId: string | number, transactionId: string | number, skipUndo = false) => {
    // Capture the transaction data for undo
    const account = accounts.find((a) => a.id === accountId);
    const deletedTransaction = account?.transactions.find((t) => t.id === transactionId);

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId);

    setRecentTransactions((prev) =>
      prev.filter((t) => t.id !== transactionId)
    );

    if (error) {
      console.error("Failed to delete transaction:", error);
    } else {
      await refreshSingleAccount(accountId);
      invalidateAllCachedMonths();

      if (skipUndo) {
        return;
      }

      let currentTransactionId = transactionId;

      registerAction({
        description: `Deleted transaction ${deletedTransaction?.payee} ($${deletedTransaction?.balance})`,
        execute: async () => {
          // Re-delete the transaction for redo
          const { error: deleteError } = await supabase
            .from("transactions")
            .delete()
            .eq("id", currentTransactionId);

          if (!deleteError) {
            await refreshSingleAccount(accountId);
            invalidateAllCachedMonths();
          } else {
            console.error("❌ REDO DELETE: Failed", deleteError);
          }
        },
        undo: async () => {
          if (deletedTransaction) {
            const { data: restoreData, error: insertError } = await supabase.from("transactions").insert([
              {
                date: deletedTransaction.date,
                payee: deletedTransaction.payee,
                category: deletedTransaction.category,
                category_group: deletedTransaction.category_group,
                category_item_id: deletedTransaction.category_item_id ?? null,
                balance: deletedTransaction.balance,
                user_id: user?.id,
                budget_id: currentBudgetId,
                account_id: accountId,
              },
            ]).select();

            if (!insertError && restoreData) {
              currentTransactionId = restoreData[0].id;
              await refreshSingleAccount(accountId);
              invalidateAllCachedMonths();
            } else {
              console.error("❌ UNDO DELETE: Failed", insertError);
            }
          }
        },
      });
    }
  };

  const deleteTransactionWithMirror = async (
    accountId: string | number,
    transactionId: string | number
  ) => {
    const account = accounts.find((a) => a.id === accountId);
    const transaction = account?.transactions.find((t) => t.id === transactionId);
    if (!transaction || !account) return;

    // Try to find the mirrored transaction BEFORE deleting
    const mirrorAccount = accounts.find((a) =>
      a.transactions.some(
        (t) =>
          t.date === transaction.date &&
          t.category === transaction.category &&
          t.balance === -transaction.balance &&
          t.payee?.includes(account.name)
      )
    );

    let mirrorTransaction: Transaction | null = null;
    if (mirrorAccount) {
      const mirror = mirrorAccount.transactions.find(
        (t) =>
          t.date === transaction.date &&
          t.category === transaction.category &&
          t.balance === -transaction.balance &&
          t.payee?.includes(account.name)
      );
      if (mirror) {
        mirrorTransaction = mirror;
      }
    }

    // Delete the main transaction (skipUndo since we'll register a combined action)
    await deleteTransaction(accountId, transactionId, true);

    // Delete mirror transaction if found
    if (mirrorTransaction && mirrorAccount) {
      await deleteTransaction(Number(mirrorAccount.id), mirrorTransaction.id, true);
    }

    // Register combined undo action for both deletions
    let currentTransactionId = transactionId;
    let currentMirrorId = mirrorTransaction?.id || null;

    registerAction({
      description: `Deleted transfer ${transaction.payee} ($${transaction.balance})`,
      execute: async () => {
        // Re-delete both transactions
        await supabase.from("transactions").delete().eq("id", currentTransactionId);
        await refreshSingleAccount(accountId);

        if (currentMirrorId && mirrorAccount) {
          await supabase.from("transactions").delete().eq("id", currentMirrorId);
          await refreshSingleAccount(Number(mirrorAccount.id));
        }
        invalidateAllCachedMonths();
      },
      undo: async () => {
        // Restore both transactions
        const { data: restoredData, error: insertError1 } = await supabase.from("transactions").insert([
          {
            date: transaction.date,
            payee: transaction.payee,
            category: transaction.category,
            category_group: transaction.category_group,
            category_item_id: transaction.category_item_id ?? null,
            balance: transaction.balance,
            user_id: user?.id,
            budget_id: currentBudgetId,
            account_id: accountId,
          },
        ]).select();

        if (!insertError1 && restoredData) {
          currentTransactionId = restoredData[0].id;
          await refreshSingleAccount(accountId);
        }

        if (mirrorTransaction && mirrorAccount) {
          const { data: restoredMirror, error: insertError2 } = await supabase.from("transactions").insert([
            {
              date: mirrorTransaction.date,
              payee: mirrorTransaction.payee,
              category: mirrorTransaction.category,
              category_group: mirrorTransaction.category_group,
              category_item_id: mirrorTransaction.category_item_id ?? null,
              balance: mirrorTransaction.balance,
              user_id: user?.id,
              budget_id: currentBudgetId,
              account_id: mirrorAccount.id,
            },
          ]).select();

          if (!insertError2 && restoredMirror) {
            currentMirrorId = restoredMirror[0].id;
            await refreshSingleAccount(mirrorAccount.id);
          }
        }
        invalidateAllCachedMonths();
      },
    });
  };

  const reorderAccounts = (
    draggedId: string | number,
    targetId: string | number,
    position: "before" | "after" = "before"
  ) => {
    if (!draggedId || !targetId || draggedId === targetId) return;

    const dragged = accounts.find((a) => a.id === draggedId);
    const target = accounts.find((a) => a.id === targetId);
    // Do not allow mixing credit/debit ordering across groups
    if (!dragged || !target || dragged.type !== target.type) return;

    const previousOrder = toOrderedIds(accounts);

    const reorderOnce = (list: Account[]) => {
      const fromIdx = list.findIndex((a) => a.id === draggedId);
      const toIdx = list.findIndex((a) => a.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return list;

      const next = [...list];
      const [moved] = next.splice(fromIdx, 1);
      const insertIdx = Math.min(
        Math.max(position === "after" ? toIdx + (fromIdx < toIdx ? 0 : 1) : toIdx, 0),
        next.length
      );
      next.splice(insertIdx, 0, moved);
      return next;
    };

    const nextList = reorderOnce(accounts);
    if (nextList === accounts) return;

    saveOrder(toOrderedIds(nextList));
    setAccounts(nextList);

    registerAction({
      description: "Reordered accounts",
      execute: async () => {
        setAccounts((prevRun) => {
          const updated = reorderOnce(prevRun);
          saveOrder(toOrderedIds(updated));
          return updated;
        });
      },
      undo: async () => {
        setAccounts((prevUndo) => {
          const ordered = applyOrder(prevUndo, previousOrder);
          saveOrder(previousOrder);
          return ordered;
        });
      },
    });
  };

  const contextValue = useMemo(
    () => ({
      accounts,
      accountsLoading,
      addTransaction,
      addTransactionWithMirror,
      addAccount,
      deleteAccount,
      setAccounts,
      deleteTransaction,
      deleteTransactionWithMirror,
      editTransaction,
      editAccountName,
      toggleCleared,
      toggleApproved,
      approveAll,
      recentTransactions,
      savedPayees,
      upsertPayee,
      refreshSingleAccount,
      refetchAccounts: fetchAccounts,
      reorderAccounts,
    }),
    [accounts, accountsLoading, recentTransactions, savedPayees, reorderAccounts, currentBudgetId]
  );

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};
