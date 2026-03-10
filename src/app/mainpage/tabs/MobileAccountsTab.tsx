"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccountContext } from "@/app/context/AccountContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { cn } from "@/lib/utils";
import AddAccountModal from "../AddAccountModal";

function getAccountAbbr(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("CHECK")) return "CHK";
  if (upper.includes("SAV")) return "SAV";
  if (upper.includes("CASH")) return "CSH";
  if (upper.includes("CREDIT")) return "CRD";
  return name.replace(/\s+/g, "").slice(0, 3).toUpperCase();
}

function getAccountSubtype(acc: { type: string; name: string }): string {
  if (acc.type === "credit") return "Credit card";
  const upper = acc.name.toUpperCase();
  if (upper.includes("SAV")) return "Savings";
  if (upper.includes("CHECK")) return "Checking";
  return "Cash";
}

export default function MobileAccountsTab() {
  const { accounts, addAccount } = useAccountContext();
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);

  const netWorth = useMemo(
    () =>
      accounts.reduce((sum, acc) => {
        const bal =
          acc.transactions?.reduce((s, tx) => s + tx.balance, 0) ??
          acc.balance ??
          0;
        return sum + bal;
      }, 0),
    [accounts]
  );

  const cashAccounts = accounts.filter((a) => a.type === "debit");
  const creditAccounts = accounts.filter((a) => a.type === "credit");

  const renderRow = (acc) => {
    const bal =
      acc.transactions?.reduce((s, tx) => s + tx.balance, 0) ??
      acc.balance ??
      0;
    const abbr = getAccountAbbr(acc.name);
    const subtype = getAccountSubtype(acc);
    const isDebit = acc.type === "debit";

    return (
      <div
        key={acc.id}
        onClick={() => router.push(`/accounts/${acc.id}`)}
        className="flex items-center gap-3 px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800 min-h-[62px]"
      >
        {/* Icon chip */}
        <div
          className={cn(
            "w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[9px] font-bold border",
            isDebit
              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/40"
              : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800/40"
          )}
        >
          {abbr}
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
            {acc.name}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {subtype}
          </p>
        </div>

        {/* Balance */}
        <p
          className={cn(
            "font-mono text-[14px] font-semibold flex-shrink-0",
            bal === 0
              ? "text-slate-300 dark:text-slate-600"
              : bal < 0
              ? "text-red-600 dark:text-red-400"
              : "text-teal-600 dark:text-teal-400"
          )}
        >
          {formatToUSD(bal)}
        </p>

        {/* Chevron */}
        <span className="text-slate-300 dark:text-slate-600 text-base flex-shrink-0">
          ›
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-full pb-24">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">
            Accounts
          </h2>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
            Cash and credit balances
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600 text-white transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Net Worth */}
      <div className="mx-4 mt-3 mb-1 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Net Worth
          </p>
          <p className="font-mono text-[20px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {formatToUSD(netWorth)}
          </p>
        </div>
        <div
          className={cn(
            "text-[11px] font-semibold px-2 py-1 rounded-lg border",
            netWorth >= 0
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-100 dark:border-teal-800/40"
              : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/40"
          )}
        >
          {netWorth >= 0 ? "▲" : "▼"} Total balance
        </div>
      </div>

      {/* Cash accounts */}
      {cashAccounts.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-5 pt-4 pb-2">
            Cash
          </p>
          {cashAccounts.map(renderRow)}
        </>
      )}

      {/* Credit accounts */}
      {creditAccounts.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-5 pt-4 pb-2">
            Credit
          </p>
          {creditAccounts.map(renderRow)}
        </>
      )}

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center px-8">
          <div className="text-4xl mb-3 opacity-20">🏦</div>
          <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
            No accounts yet
          </p>
          <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
            Add your first account to get started
          </p>
        </div>
      )}

      {/* Add account row */}
      <div
        onClick={() => setShowAddModal(true)}
        className="mx-4 mt-3 min-h-[52px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-[13px] font-medium cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
      >
        + Add Account
      </div>

      {showAddModal && (
        <AddAccountModal
          onAddAccount={addAccount}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
