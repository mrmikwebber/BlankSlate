"use client";

import * as React from "react";
import { Account } from "@/app/context/AccountContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

interface Props {
  account: Account;
  onClick?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  disableNavigate?: boolean;
}

function getAccountTypeLabel(type: string, name: string): string {
  if (type === "credit") return "Credit card";
  const upper = name.toUpperCase();
  if (upper.includes("SAV")) return "Savings";
  if (upper.includes("CHECK")) return "Checking";
  return "Cash";
}

export default function AccountCardCompact({
  account,
  onClick,
  onContextMenu,
  disableNavigate,
}: Props) {
  const handleNavigate = () => {
    if (onClick) {
      onClick(String(account.id));
      return;
    }

    if (disableNavigate) return;

    redirect(`/accounts/${account?.id}`);
  };

  const computedBalance =
    account.transactions?.reduce((sum, tx) => sum + tx.balance, 0) ??
    account.balance ??
    0;

  const isNegative = computedBalance < 0;
  const typeLabel = getAccountTypeLabel(account.type, account.name);

  const transactions = account.transactions ?? [];
  const transactionCount = transactions.length;
  const lastTx = transactionCount > 0 ? transactions[transactionCount - 1] : null;
  const pendingCount = transactions.filter((tx) => !tx.approved).length;

  let lastDate: string | null = null;
  if (lastTx?.date) {
    const d = new Date(lastTx.date);
    if (!isNaN(d.getTime())) {
      lastDate = d.toLocaleDateString();
    }
  }

  const stripeColor =
    account.type === "credit" ? "bg-amber-400" : "bg-emerald-500";

  // Calculate this month's activity
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const monthActivity = transactions
    .filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
    })
    .reduce((sum, tx) => sum + tx.balance, 0);

  return (
    <Card
      onClick={handleNavigate}
      onContextMenu={onContextMenu}
      className={cn(
        "group w-full cursor-pointer rounded-lg border transition-all overflow-hidden relative",
        "bg-white dark:bg-slate-900 hover:shadow-md dark:hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700",
        isNegative && "border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 hover:border-red-300 dark:hover:border-red-800"
      )}
    >
      {/* Colored stripe */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", stripeColor)} />
      
      {/* Top row – condensed */}
      <div className="flex items-center justify-between px-3 py-2 relative">
        <div className="flex flex-col min-w-0 gap-0.5">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {typeLabel}
          </span>
          <h3 className="font-medium text-sm truncate text-slate-900 dark:text-slate-100">
            {account.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
          </h3>
        </div>

        <div className="flex flex-col items-end gap-1">
          <p
            className={cn(
              "text-base font-semibold font-mono leading-none",
              isNegative ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {formatToUSD(computedBalance)}
          </p>
          {account.tellerDisconnected ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 leading-none">
              Disconnected
            </span>
          ) : pendingCount > 0 ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 leading-none">
              {pendingCount} pending
            </span>
          ) : null}
        </div>
      </div>

      {/* Hover details – still envelope-y, but compact */}
      <div className="px-3 pb-2 mb-1 overflow-hidden max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-150 ease-out">
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-1 flex flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex justify-between">
            <span className="font-medium">Transactions</span>
            <span>{transactionCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Last activity</span>
            <span>{lastDate ?? "No activity yet"}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-500 pb-1">
            This month: {formatToUSD(monthActivity)}
          </p>
        </div>
      </div>
    </Card>
  );
}
