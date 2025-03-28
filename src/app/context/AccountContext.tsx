"use client"
import { createContext, useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
interface Transaction {
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

interface AccountContextType {
  accounts: Account[];
  addTransaction: (accountId, transaction) => void;
  addAccount: (newAccount) => void;
  setAccounts: (accounts) => void;
  deleteAccount: (accountId: number) => void;
  deleteTransaction: (accountId: number, transactionId: number) => void;
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
  const [loading, setLoading] = useState(false);

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
    
      setAccounts(data || []);
    };
    

    fetchAccounts();
  }, [user]);

  const resetAccounts = () => {
    setAccounts([]);
    setLoading(true);
  };

  const addTransaction = async (accountId, transaction) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user.id,
        account_id: accountId,
      },
    ]).select();

    if (error) {
      console.error("Add transaction failed:", error);
    } else {
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId
            ? { ...account, transactions: [...account.transactions, data[0]] }
            : account
        )
      );
      return data;
    }
  };

  const defaultTransaction = {
    date: new Date().toISOString(),
    payee: "Initial Balance",
    category: "Ready to Assign",
    category_group: "Ready to Assign",
    balance: 0,
  }

  const addAccount = async (account) => {
    const { data, error } = await supabase.from("accounts").insert([
      {
        ...account,
        user_id: user.id,
      },
    ]).select();

    

    if (error) {
      console.error("Add account failed:", error);
    } else {
      const newTransaction = {
        ...defaultTransaction,
        balance: account.type === 'credit' ? -1 * account.balance : account.balance,
      }
      const generatedTransaction = await addTransaction(data[0].id, newTransaction);
      setAccounts((prev) => [...prev, { ...account, id: data[0].id, transactions: generatedTransaction}]);
    }
  };

  const deleteAccount = async (accountId: number) => {
    setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
  
    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId);
  
    if (error) {
      console.error("Failed to delete account:", error);
    }
  };

  const deleteTransaction = async (accountId: number, transactionId: number) => {
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId
          ? {
              ...acc,
              transactions: acc.transactions.filter((tx) => tx.id !== transactionId),
            }
          : acc
      )
    );
  
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId);
  
    if (error) {
      console.error("Failed to delete transaction:", error);
    }
  };

  return (
    <AccountContext.Provider value={{ accounts, addTransaction, addAccount, deleteAccount, setAccounts, deleteTransaction, resetAccounts }}>
      {children}
    </AccountContext.Provider>
  );
};
