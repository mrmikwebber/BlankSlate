"use client"
import { createContext, useContext, useState } from "react";

interface Transaction {
  id: number;
  date: Date;
  payee: string;
  category: string;
  categoryGroup: string;
  balance: number;
  outflow: boolean;
}

// Define the structure of the account data
interface Account {
  id: number;
  name: string;
  balance: number;
  transactions: Transaction[];
  issuer: "amex" | "visa" | "mastercard" | "discover";
  type: "credit" | "debit";
}

// Define context type
interface AccountContextType {
  accounts: Account[];
  addTransaction: (accountId, transaction) => void;
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

  const oneAZTransactions: Transaction[] = [
    { id: 10, date: new Date('2025-02-18'), payee: 'American Express Payroll', category: 'Ready to Assign', categoryGroup: 'Ready to Assign', outflow: false, balance: 2586.23 },
    { id: 1, date: new Date('2025-02-18'), payee: 'Water Utility', category: 'Bills', categoryGroup: 'Water Utility', outflow: true, balance: -75.46 },
    { id: 2, date: new Date('2025-02-22'), payee: 'Spotify', category: 'Subscriptions', categoryGroup: 'Spotify', outflow: true, balance: -10.99 },
    { id: 3, date: new Date('2025-02-21'), payee: 'Netflix', category: 'Subscriptions', categoryGroup: 'Netflix',  outflow: true, balance: -14.99 },
  ];

  const amexCheckingTransactions: Transaction[] = [
    // Bills
    { id: 4, date: new Date('2025-02-20'), payee: 'Electric Company', category: 'Bills', categoryGroup: 'Electricity', outflow: true, balance: -45.65 },
    { id: 5, date: new Date('2025-02-10'), payee: 'Car Loan Payment', category: 'Bills', categoryGroup: 'Car Loan', outflow: true, balance: -505 },
  ];

  const amexGoldTransactions: Transaction[] = [  
    { id: 6, date: new Date('2025-02-19'), payee: 'YouTube Premium', category: 'Subscriptions', categoryGroup: 'YT Premium', outflow: true, balance: -22.99 },
    { id: 7, date: new Date('2025-02-16'), payee: 'Amazon Prime', category: 'Subscriptions', categoryGroup: 'Prime', outflow: true, balance: -9.99 },
  ];

  const biltTransactions: Transaction[] = [
    // Bills
    { id: 8, date: new Date('2025-02-05'), payee: 'Rent Payment', category: 'Bills', categoryGroup: 'Rent', outflow: true, balance: -1864.12 },
    { id: 9, date: new Date('2025-02-12'), payee: 'Adobe Creative Cloud', category: 'Subscriptions', categoryGroup: 'Adobe CC', outflow: true, balance: -21.16 },
  ];

  const [accounts, setAccounts] = useState<Account[]>([
    { id: 1, name: "OneAz", issuer: "visa", balance: 2350, type: "debit", transactions: oneAZTransactions },
    { id: 2, name: "Gold Card", issuer: "amex", balance: -2000, type: "credit", transactions: amexGoldTransactions  },
    { id: 3, name: "Bilt", issuer: "mastercard", balance: -500, type: "credit", transactions: biltTransactions  },
    { id: 4, name: "Amex Checking", issuer: "amex", balance: 1100, type: "debit", transactions: amexCheckingTransactions  },
  ]);

  const updateBalance = (id: number, newBalance: number) => {
    setAccounts((prev) =>
      prev.map((account) => (account.id === id ? { ...account, balance: newBalance } : account))
    );
  };

  const addTransaction = (accountId, transaction) => {
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) =>
        acc.id === accountId
          ? { ...acc, transactions: [...acc.transactions, transaction] }
          : acc
      )
    );
  };

  return (
    <AccountContext.Provider value={{ accounts, updateBalance, addTransaction }}>
      {children}
    </AccountContext.Provider>
  );
};
