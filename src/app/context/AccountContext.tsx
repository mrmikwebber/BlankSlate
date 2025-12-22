"use client"
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { useUndoRedo } from "./UndoRedoContext";
export interface Transaction {
  id: number;
  date: string;
  payee: string;
  category: string;
  category_group: string;
  account: string;
  balance: number;
}

export interface Account {
  id: number;
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
}

interface AccountContextType {
  accounts: Account[];
  recentTransactions: Transaction[];
  addTransaction: (accountId, transaction) => void;
  addTransactionWithMirror: (accountId: number, transaction: any, mirrorAccountId: number, mirrorTransaction: any) => Promise<void>;
  addAccount: (newAccount) => void;
  setAccounts: (accounts) => void;
  deleteAccount: (accountId: number) => void;
  deleteTransaction: (accountId: number, transactionId: number) => void;
  deleteTransactionWithMirror: (accountId: number, transactionId: number) => void;
  editTransaction: (
    accountId: number,
    transactionId: number,
    updatedTransaction: Partial<Transaction>
  ) => void;
  editAccountName: (accountId: number, newName: string) => void;
  refreshSingleAccount: (accountId: number) => void;
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

  const { user } = useAuth() || { user: null };
  const { registerAction } = useUndoRedo();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savedPayees, setSavedPayees] = useState<SavedPayee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  useEffect(() => {
    if (!user) return;
    const fetchAccounts = async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*, transactions(*)")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching accounts:", error);
        return;
      }

      if (!error && data) {
        setAccounts(data as unknown as Account[]);
      }
    };


    fetchAccounts();
  }, [user]);

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
      .order("last_used_at", { ascending: false })
      .limit(15);

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
    const updated = [data as SavedPayee, ...without];
    return updated.slice(0, 15); // enforce cap
  });
};



  const addTransaction = async (accountId, transaction, skipUndo = false) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
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
            account_id: accountId,
          },
        ]).select();

        if (!insertError && redoData) {
          currentTransactionId = redoData[0].id;
          await refreshSingleAccount(accountId);
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
        }
      },
    });

    return data;
  };

  const addTransactionWithMirror = async (
    accountId: number,
    transaction: any,
    mirrorAccountId: number,
    mirrorTransaction: any
  ) => {
    // Insert both transactions
    const { data: data1, error: error1 } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
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
        account_id: mirrorAccountId,
      },
    ]).select();

    if (error2) {
      console.error("Add mirror transaction failed:", error2);
      // Clean up first transaction
      await supabase.from("transactions").delete().eq("id", data1[0].id);
      return;
    }

    let currentTxId1 = data1[0].id;
    let currentTxId2 = data2[0].id;
    const tx1Data = { ...transaction };
    const tx2Data = { ...mirrorTransaction };

    await refreshSingleAccount(accountId);
    await refreshSingleAccount(mirrorAccountId);

    registerAction({
      description: `Added transfer ${transaction.payee} ($${transaction.balance})`,
      execute: async () => {
        // Re-insert both transactions for redo
        const { data: redoData1, error: insertError1 } = await supabase.from("transactions").insert([
          {
            ...tx1Data,
            user_id: user?.id,
            account_id: accountId,
          },
        ]).select();

        const { data: redoData2, error: insertError2 } = await supabase.from("transactions").insert([
          {
            ...tx2Data,
            user_id: user?.id,
            account_id: mirrorAccountId,
          },
        ]).select();

        if (!insertError1 && redoData1) {
          currentTxId1 = redoData1[0].id;
          await refreshSingleAccount(accountId);
        }
        if (!insertError2 && redoData2) {
          currentTxId2 = redoData2[0].id;
          await refreshSingleAccount(mirrorAccountId);
        }
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
    accountId: number,
    transactionId: number,
    updatedTransaction: Transaction
  ) => {
    const { error } = await supabase
      .from("transactions")
      .update({
        date: updatedTransaction.date,
        payee: updatedTransaction.payee,
        category: updatedTransaction.category,
        category_group: updatedTransaction.category_group,
        balance: updatedTransaction.balance,
      })
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
  };

  const editAccountName = async (accountId: number, newName: string) => {
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
  };


  const defaultTransaction = {
    date: new Date().toISOString(),
    payee: "Initial Balance",
    category: "Ready to Assign",
    category_group: "Ready to Assign",
    balance: 0,
  }

  const refreshSingleAccount = async (accountId) => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*, transactions(*)")
      .eq("id", accountId)
      .single();

    if (error || !data) {
      console.error("❌ Error refreshing account:", error);
      return;
    }

    const updated = normalizeAccount(data);

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
    const newTransaction = {
      ...defaultTransaction,
      balance: account.balance,
    }
    const generatedTransaction = await addTransaction(currentAccountId, newTransaction, true);
    
    setAccounts((prev) => [...prev, { ...account, id: currentAccountId, transactions: generatedTransaction }]);
  };

  const deleteAccount = async (accountId: number | string) => {
    if (!accountId || accountId === 'NaN' || accountId.toString() === 'NaN') {
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
      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
    }
  };

  const deleteTransaction = async (accountId: number, transactionId: number, skipUndo = false) => {
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
          } else {
            console.error("❌ REDO DELETE: Failed", deleteError);
          }
        },
        undo: async () => {
          if (deletedTransaction) {
            // Omit database-generated fields
            const { id, created_at, updated_at, ...transactionData } = deletedTransaction as any;
            const { data: restoreData, error: insertError } = await supabase.from("transactions").insert([
              {
                date: deletedTransaction.date,
                payee: deletedTransaction.payee,
                category: deletedTransaction.category,
                category_group: deletedTransaction.category_group,
                balance: deletedTransaction.balance,
                user_id: user?.id,
                account_id: accountId,
              },
            ]).select();

            if (!insertError && restoreData) {
              currentTransactionId = restoreData[0].id;
              await refreshSingleAccount(accountId);
            } else {
              console.error("❌ UNDO DELETE: Failed", insertError);
            }
          }
        },
      });
    }
  };

  const deleteTransactionWithMirror = async (
    accountId: number,
    transactionId: number
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
      await deleteTransaction(mirrorAccount.id, mirrorTransaction.id, true);
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
          await refreshSingleAccount(mirrorAccount.id);
        }
      },
      undo: async () => {
        // Restore both transactions
        const { data: restoredData, error: insertError1 } = await supabase.from("transactions").insert([
          {
            date: transaction.date,
            payee: transaction.payee,
            category: transaction.category,
            category_group: transaction.category_group,
            balance: transaction.balance,
            user_id: user?.id,
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
              balance: mirrorTransaction.balance,
              user_id: user?.id,
              account_id: mirrorAccount.id,
            },
          ]).select();

          if (!insertError2 && restoredMirror) {
            currentMirrorId = restoredMirror[0].id;
            await refreshSingleAccount(mirrorAccount.id);
          }
        }
      },
    });
  };

  const contextValue = useMemo(
    () => ({
      accounts,
      addTransaction,
      addTransactionWithMirror,
      addAccount,
      deleteAccount,
      setAccounts,
      deleteTransaction,
      deleteTransactionWithMirror,
      editTransaction,
      editAccountName,
      recentTransactions,
      savedPayees,
      upsertPayee,
      refreshSingleAccount
    }),
    [accounts, recentTransactions, savedPayees]
  );

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};
