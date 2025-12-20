"use client";
import { redirect } from "next/navigation";
import { useState, useEffect } from "react";
import { Account, useAccountContext } from "../context/AccountContext";
import { formatToUSD } from "../utils/formatToUSD";

export default function AccountTile({ account: initialAccount }) {
  const [account, setAccount] = useState<Account>();
  const [showConfirm, setShowConfirm] = useState(false);

  const { deleteAccount } = useAccountContext();

  useEffect(() => {
    setAccount(initialAccount);
  }, [initialAccount]);

  const openAccount = () => {
    redirect(`/accounts/${account?.id}`);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    deleteAccount(account?.id);
    setShowConfirm(false);
  };

  const cancelDelete = () => {
    setShowConfirm(false);
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && showConfirm) {
        cancelDelete();
      }
    };
    if (showConfirm) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showConfirm]);

  return (
    <div
      onClick={openAccount}
      className="relative cursor-pointer bg-slate-50 rounded-2xl p-4 shadow-sm hover:shadow-lg transition-shadow flex flex-col justify-between min-h-[180px]"
    >
      {/* Top Row: Icon and Delete */}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <div>
          {account?.type === "credit" ? (
            <span className="text-sm">💳 Credit</span>
          ) : (
            <span className="text-sm">💵 Cash</span>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-500"
        >
          🗑️
        </button>
      </div>

      {/* Card Brand Logo + Name */}
      <div className="mt-3">
        {account?.issuer === "amex" && (
          <span className="text-xs text-blue-900 font-semibold">AMEX</span>
        )}
        {account?.issuer === "visa" && (
          <span className="text-xs text-blue-700 font-semibold">VISA</span>
        )}
        {account?.issuer === "mastercard" && (
          <span className="text-xs text-red-600 font-semibold">MasterCard</span>
        )}
        {account?.issuer === "discover" && (
          <span className="text-xs text-orange-500 font-semibold">Discover</span>
        )}

        <h2 className="mt-1 text-sm font-medium text-gray-800 truncate">
          {account?.name}
        </h2>
      </div>

      {/* Balance */}
      <div
        className={`text-lg font-bold ${
          account?.balance < 0 ? "text-red-600" : "text-green-600"
        }`}
      >
        {formatToUSD(account?.balance)}
      </div>

      {/* Confirm Delete Modal */}
      {showConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="bg-white p-4 border rounded shadow text-sm">
            <p className="mb-2 text-gray-700">
              Are you sure you want to delete this account?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete();
                }}
                className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600"
              >
                Yes, Delete
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cancelDelete();
                }}
                className="bg-gray-200 px-4 py-1 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
