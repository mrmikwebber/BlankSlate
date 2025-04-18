"use client"
import { createContext, useContext, useEffect, useState } from "react";
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

  const addTransaction = async (accountId, transaction) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user?.id,
        account_id: accountId,
      },
    ]).select();

    if (error) {
      console.error("Add transaction failed:", error);
    } else {
      await refreshSingleAccount(accountId);
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

  const refreshSingleAccount = async (accountId) => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*, transactions(*)")
      .eq("id", accountId)
      .single();
  
    if (!error && data) {
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? data : acc))
      );
    }
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
      console.log(account.balance);
      const newTransaction = {
        ...defaultTransaction,
        balance: account.balance,
      }
      const generatedTransaction = await addTransaction(data[0].id, newTransaction);
      setAccounts((prev) => [...prev, { ...account, id: data[0].id, transactions: generatedTransaction}]);
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
  
    if (error) {
      console.error("Failed to delete transaction:", error);
    } else {
      await refreshSingleAccount(accountId);
    }
  };

  return (
    <AccountContext.Provider value={{ accounts, addTransaction, addAccount, deleteAccount, setAccounts, deleteTransaction }}>
      {children}
    </AccountContext.Provider>
  );
};
