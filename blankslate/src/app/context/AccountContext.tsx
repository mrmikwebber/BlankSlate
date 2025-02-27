"use client"
import { createContext, useContext, useState } from "react";

// Define the structure of the account data
interface Account {
  id: number;
  name: string;
  balance: number;
  issuer: "amex" | "visa" | "mastercard" | "discover";
  type: "credit" | "debit";
}

// Define context type
interface AccountContextType {
  accounts: Account[];
  updateBalance: (id: number, newBalance: number) => void;
}

// Create context with default values
const AccountContext = createContext<AccountContextType | undefined>(undefined);

// Custom hook for using the context
export const useAccountContext = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccountContext must be used within an AccountProvider");
  }
  return context;
};

// Provider component
export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<Account[]>([
    { id: 1, name: "OneAz", issuer: "visa", balance: 2350, type: "debit" },
    { id: 2, name: "Gold Card", issuer: "amex", balance: -2000, type: "credit" },
    { id: 3, name: "Bilt", issuer: "mastercard", balance: -500, type: "credit" },
    { id: 4, name: "Amex HYSA", issuer: "amex", balance: 1100, type: "debit" },
  ]);

  const updateBalance = (id: number, newBalance: number) => {
    setAccounts((prev) =>
      prev.map((account) => (account.id === id ? { ...account, balance: newBalance } : account))
    );
  };

  return (
    <AccountContext.Provider value={{ accounts, updateBalance }}>
      {children}
    </AccountContext.Provider>
  );
};
