"use client"
import { createContext, useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
interface Transaction {
  id: number;
  date: Date;
  payee: string;
  category: string;
  categoryGroup: string;
  account: string;
  balance: number;
  outflow: boolean;
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
  updateBalance: (id: number, newBalance: number) => void;
  addAccount: (newAccount) => void;
  setAccounts: (accounts) => void;
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
  const [hasInitalized, setHasInitalized] = useState(false);

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
    
      setAccounts(data || []); // 👈 empty array if new user
    };
    

    fetchAccounts().then(() => {
      setHasInitalized(true);
    });
  }, [user]);

  const resetAccounts = () => {
    setAccounts([]);
    setLoading(true);
  };

  const updateBalance = async (id, newBalance) => {
    const { error } = await supabase
      .from("accounts")
      .update({ balance: newBalance })
      .eq("id", id);
  
    if (error) {
      console.error("Error updating balance:", error);
      return;
    }
  
    // Then update local state
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === id ? { ...account, balance: newBalance } : account
      )
    );
  };

  const addTransaction = async (accountId, transaction) => {
    const { data, error } = await supabase.from("transactions").insert([
      {
        ...transaction,
        user_id: user.id,
        account_id: accountId,
      },
    ]);

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
    }
  };

  const addAccount = async (account) => {
    const { data, error } = await supabase.from("accounts").insert([
      {
        ...account,
        user_id: user.id,
      },
    ]);

    if (error) {
      console.error("Add account failed:", error);
    } else {
      setAccounts((prev) => [...prev, { ...account, id: data[0].id, transactions: [] }]);
    }
  };

  return (
    <AccountContext.Provider value={{ accounts, updateBalance, addTransaction, addAccount, loading, resetAccounts }}>
      {children}
    </AccountContext.Provider>
  );
};
