"use client";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import TotalSpendingTile from "../mainpage/totalSpendingTile";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import { isSameMonth, parseISO } from "date-fns";

export default function SpendingPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const { accounts } = useAccountContext();
  const { currentMonth } = useBudgetContext();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/auth");
    }
  }, [loading, session]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-white dark:bg-slate-950">
        <p className="text-teal-600 dark:text-teal-400 text-lg">Loading spending...</p>
      </div>
    );
  }

  // Aggregate totals for larger summary
  const totals = (() => {
    let inflow = 0;
    let outflow = 0;
    const byCategory: Record<string, number> = {};

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        if (!tx.date) return;
        const d = typeof tx.date === "string" ? parseISO(tx.date) : tx.date;
        if (!isSameMonth(d, parseISO(currentMonth))) return;

        if (tx.category === "Ready to Assign") {
          inflow += tx.balance;
          return;
        }

        if (tx.balance < 0) {
          const amt = Math.abs(tx.balance);
          outflow += amt;
          byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
        }
      });
    });

    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return { inflow, outflow, topCategories };
  })();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4">
      <Card className="bg-zinc-100 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="text-2xl">Total Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-2">
              {/* Large chart & breakdown */}
              <TotalSpendingTile />
            </div>
            <div className="col-span-1">
              <div className="rounded-md bg-white dark:bg-slate-800 p-4">
                <h3 className="text-lg font-semibold mb-2">Summary</h3>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between"><span>Income</span><span className="font-mono">{formatToUSD(totals.inflow)}</span></li>
                  <li className="flex justify-between"><span>Spending</span><span className="font-mono">{formatToUSD(totals.outflow)}</span></li>
                </ul>

                <h4 className="text-sm font-semibold mt-4 mb-2">Top Categories</h4>
                <ul className="text-sm space-y-1 max-h-64 overflow-y-auto pr-1">
                  {totals.topCategories.length === 0 && (
                    <li className="text-slate-500">No spending yet this month</li>
                  )}
                  {totals.topCategories.map(([name, amount]) => (
                    <li key={name} className="flex justify-between">
                      <span className="truncate" title={name}>{name}</span>
                      <span className="font-mono">{formatToUSD(amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
