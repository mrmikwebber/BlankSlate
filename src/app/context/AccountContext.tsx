"use client"
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
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



  const addTransaction = async (accountId, transaction) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
        account_id: accountId,
      },
    ]).select();

    setRecentTransactions((prev) => [
      ...prev.slice(-9),
      {
        ...data[0],
        timestamp: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Add transaction failed:", error);
    } else {
      await refreshSingleAccount(accountId);
      return data;
    }
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
      console.error("Error refreshing account:", error);
      return;
    }

    const updated = normalizeAccount(data);

    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accountId ? updated : acc))
    );
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
    } else {
      const newTransaction = {
        ...defaultTransaction,
        balance: account.balance,
      }
      const generatedTransaction = await addTransaction(data[0].id, newTransaction);
      setAccounts((prev) => [...prev, { ...account, id: data[0].id, transactions: generatedTransaction }]);
    }
  };

  const deleteAccount = async (accountId: number) => {
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

  const deleteTransaction = async (accountId: number, transactionId: number) => {
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
    }
  };

  const deleteTransactionWithMirror = async (
    accountId: number,
    transactionId: number
  ) => {
    const account = accounts.find((a) => a.id === accountId);
    const transaction = account?.transactions.find((t) => t.id === transactionId);
    if (!transaction || !account) return;

    // Delete the main transaction
    await deleteTransaction(accountId, transactionId);

    // Try to find and delete the mirrored transaction
    const mirrorAccount = accounts.find((a) =>
      a.transactions.some(
        (t) =>
          t.date === transaction.date &&
          t.category === transaction.category &&
          t.balance === -transaction.balance &&
          t.payee?.includes(account.name)
      )
    );

    if (mirrorAccount) {
      const mirror = mirrorAccount.transactions.find(
        (t) =>
          t.date === transaction.date &&
          t.category === transaction.category &&
          t.balance === -transaction.balance &&
          t.payee?.includes(account.name)
      );
      if (mirror) {
        await deleteTransaction(mirrorAccount.id, mirror.id);
      }
    }
  };

  const contextValue = useMemo(
    () => ({
      accounts,
      addTransaction,
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
    }),
    [accounts, recentTransactions, savedPayees]
  );

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};
