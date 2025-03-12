"use client";
import { useMemo, useState } from "react";
import AccountTile from "./accountTile";
import { useAccountContext } from "../context/AccountContext";
import AddAccountModal from "./AddAccountModal";

export default function AllAccountsTile() {
  const { accounts, addAccount } = useAccountContext();
  const [showModal, setShowModal] = useState(false);

  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  const computedAccounts = useMemo(() =>
    accounts.map(account => (
      {
        ...account,
        balance: account.transactions.reduce((sum, tx) => sum + tx.balance, 0)
      }
    ))
  , [accounts]);

  return (
    <div className="flex flex-col bg-zinc-100 rounded-md p-2">
      <div className="flex justify-between">
        <h1>Accounts</h1>
        <button
        onClick={() => setShowModal(true)}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Add Account
        
        </button>
        {showModal && (
        <AddAccountModal onAddAccount={handleAddAccount} onClose={() => setShowModal(false)} />
      )}
      </div>
      <h2>Cash</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
      {computedAccounts.map((account) => (account.type === 'debit' && <AccountTile key={account.id} account={account}/>
      ))}
      </div>
      <h2>Credit</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
      {computedAccounts.map((account) => (
        account.type === 'credit' && <AccountTile key={account.id} account={account}/>
      ))}
      </div>
    </div>
  );
}