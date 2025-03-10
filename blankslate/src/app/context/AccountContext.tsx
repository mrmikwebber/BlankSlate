"use client"
import { createContext, useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from 'uuid';

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

  const [accounts, setAccounts] = useState<Account[]>([
    { id: 1, name: "OneAz", issuer: "visa", balance: 0, type: "debit", transactions: []},
    { id: 2, name: "Gold Card", issuer: "amex", balance: 0, type: "credit", transactions: []},
    { id: 3, name: "Bilt", issuer: "mastercard", balance: 0, type: "credit", transactions: []},
    { id: 4, name: "Amex Checking", issuer: "amex", balance: 0, type: "debit", transactions: []},
  ]);

  const initializeTransactions = (initialTransactions) => {
    initialTransactions.forEach(({ accountId, ...transaction }) => {
      addTransaction(accountId, transaction);
    });
  };

  useEffect(() => {
    initializeTransactions([
      { accountId: 1, date: new Date('2025-03-18'), payee: 'American Express Payroll', category: 'Ready to Assign', categoryGroup: 'Ready to Assign', outflow: false, balance: 2586.23 },
      { accountId: 1, date: new Date('2025-04-18'), payee: 'American Express Payroll', category: 'Ready to Assign', categoryGroup: 'Ready to Assign', outflow: false, balance: 1123.23 },
      { accountId: 1, date: new Date('2025-04-18'), payee: 'Water Utility', category: 'Bills', categoryGroup: 'Water Utility', outflow: true, balance: -75.46 },
      { accountId: 1, date: new Date('2025-03-22'), payee: 'Spotify', category: 'Subscriptions', categoryGroup: 'Spotify', outflow: true, balance: -10.99 },
      { accountId: 1, date: new Date('2025-03-21'), payee: 'Netflix', category: 'Subscriptions', categoryGroup: 'Netflix',  outflow: true, balance: -14.99 },
      { accountId: 2, date: new Date('2025-03-20'), payee: 'Electric Company', category: 'Bills', categoryGroup: 'Electricity', outflow: true, balance: -45.65 },
      { accountId: 2, date: new Date('2025-04-10'), payee: 'Car Loan Payment', category: 'Bills', categoryGroup: 'Car Loan', outflow: true, balance: -505 },
      { accountId: 3, date: new Date('2025-03-19'), payee: 'YouTube Premium', category: 'Subscriptions', categoryGroup: 'YT Premium', outflow: true, balance: -22.99 },
      { accountId: 3, date: new Date('2025-04-16'), payee: 'Amazon Prime', category: 'Subscriptions', categoryGroup: 'Prime', outflow: true, balance: -9.99 },
      { accountId: 4, date: new Date('2025-04-05'), payee: 'Rent Payment', category: 'Bills', categoryGroup: 'Rent', outflow: true, balance: -1864.12 },
      { accountId: 4, date: new Date('2025-03-12'), payee: 'Adobe Creative Cloud', category: 'Subscriptions', categoryGroup: 'Adobe CC', outflow: true, balance: -21.16 },
      { accountId: 3, date: new Date('2025-04-12'), payee: 'Blank Slate', category: 'Subscriptions', categoryGroup: 'Blank Slate Subscription', outflow: true, balance: -4.99 },
    ]);
  }, []);

  const updateBalance = (id: number, newBalance: number) => {
    setAccounts((prev) =>
      prev.map((account) => (account.id === id ? { ...account, balance: newBalance } : account))
    );
  };

  const addTransaction = (accountId, transactionData) => {
    setAccounts(prevAccounts =>
      prevAccounts.map(account =>
        account.id === accountId
          ? {
              ...account,
              transactions: [
                ...account.transactions,
                { ...transactionData, id: uuidv4(), account: account.name },
              ],
            }
          : account
      )
    );
  };

  const addAccount = (newAccount) => {
    setAccounts((prevAccounts) => [...prevAccounts, newAccount]);
  };

  return (
    <AccountContext.Provider value={{ accounts, updateBalance, addTransaction, addAccount, setAccounts }}>
      {children}
    </AccountContext.Provider>
  );
};
