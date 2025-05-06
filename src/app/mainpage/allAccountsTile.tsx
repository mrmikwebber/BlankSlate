"use client";
import { useState } from "react";
import AccountTile from "./accountTile";
import { useAccountContext } from "../context/AccountContext";
import AddAccountModal from "./AddAccountModal";

export default function AllAccountsTile() {
  const { accounts, addAccount } = useAccountContext();
  const [showModal, setShowModal] = useState(false);

  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  return (
    <div className="bg-white rounded-2xl border shadow p-6 space-y-4">
      <div className="flex justify-between">
        <h1>Accounts</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Account
        </button>
        {showModal && (
          <AddAccountModal
            onAddAccount={handleAddAccount}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
      {accounts.length === 0 ? (
        <div className="text-center text-gray-600 py-6">
          <p className="text-lg mb-4">
            It looks like you dont have any accounts.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-md transition"
          >
            Add Account
          </button>
        </div>
      ) : (
        <>
          <h2>Cash</h2>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {accounts.map(
                (account) =>
                  account.type === "debit" && (
                    <AccountTile key={account.id} account={account} />
                  )
              )}
            </div>
          </div>
          <h2>Credit</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {accounts.map(
              (account) =>
                account.type === "credit" && (
                  <AccountTile key={account.id} account={account} />
                )
            )}
          </div>
        </>
      )}
    </div>
  );
}
