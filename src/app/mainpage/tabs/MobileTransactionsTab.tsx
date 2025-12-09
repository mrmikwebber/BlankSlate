"use client";

import { useMemo } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

export default function MobileTransactionsTab() {
  const { accounts } = useAccountContext();

  const allTransactions = useMemo(() => {
    const transactions: any[] = [];
    accounts.forEach((account) => {
      account.transactions?.forEach((tx) => {
        transactions.push({
          ...tx,
          accountName: account.name,
        });
      });
    });
    // Sort by date, most recent first
    return transactions.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateB - dateA;
    });
  }, [accounts]);

  if (!allTransactions || allTransactions.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-24">
      {allTransactions.map((tx, idx) => (
        <Card key={idx} className="shadow-none border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {tx.payee}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full font-medium">
                    {tx.category}
                  </span>
                  <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    {tx.accountName}
                  </span>
                </div>
              </div>
              <div className="text-right ml-3 flex-shrink-0">
                <p
                  className={`text-base font-bold ${
                    tx.balance < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {tx.balance < 0 ? "-" : "+"}${Math.abs(tx.balance).toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {tx.date ? format(parseISO(tx.date), "MMM d, yyyy") : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
