"use client";

import { useEffect, useState } from "react";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { useAccountContext } from "@/app/context/AccountContext";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

export default function MobileActivityTab() {
  const { recentChanges } = useBudgetContext();
  const { recentTransactions } = useAccountContext();

  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    const merged = [
      ...recentChanges.map((c) => ({ ...c, type: "change" })),
      ...recentTransactions.map((t) => ({ ...t, type: "transaction" })),
    ];
    merged.sort(
      (a, b) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp).getTime()
    );
    setActivity(merged.slice(0, 50)); // Limit to 50 most recent
  }, [recentChanges, recentTransactions]);

  if (activity.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-24 text-slate-900 dark:text-slate-200">
      {activity.map((item, idx) => (
        <Card key={idx} className="shadow-none border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="pt-4">
            {item.type === "transaction" ? (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                      💸 {item.payee}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {item.category}
                    </p>
                  </div>
                  <span
                    className={`text-base font-bold ml-3 flex-shrink-0 ${
                      item.balance < 0 ? "text-red-600" : "text-green-500"
                    }`}
                  >
                    {item.balance < 0 ? "-" : "+"}${Math.abs(item.balance).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDistanceToNow(new Date(item.timestamp))} ago
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mb-2">
                  📝 {item.description}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDistanceToNow(new Date(item.timestamp))} ago
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
