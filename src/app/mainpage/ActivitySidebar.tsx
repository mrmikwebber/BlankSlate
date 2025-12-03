"use client";
import { useEffect, useState } from "react";
import { useBudgetContext } from "../context/BudgetContext";
import { useAccountContext } from "../context/AccountContext";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

export default function ActivitySidebar({ page }) {
  const { recentChanges } = useBudgetContext();
  const { recentTransactions } = useAccountContext();

  const [activity, setActivity] = useState<any[]>([]);

  const router = useRouter();

  useEffect(() => {
    const merged = [
      ...recentChanges.map((c) => ({ ...c, type: "change" })),
      ...recentTransactions.map((t) => ({ ...t, type: "transaction" })),
    ];
    merged.sort(
      (a, b) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp).getTime()
    );
    setActivity(merged);
  }, [recentChanges, recentTransactions]);

  return (
    <div data-cy="activity-sidebar" className="w-64 bg-white border-r p-4 space-y-3 shadow-sm overflow-y-auto h-screen">
      {page === "account" && (
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center text-sm text-gray-600 hover:text-teal-600 transition font-medium mb-3"
        >
          <span className="mr-1 text-base">←</span> Back to Dashboard
        </button>
      )}
      <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
      <ul data-cy="recent-activity-list" className="text-sm space-y-2">
        {activity.length === 0 && (
          <li className="text-gray-400">No recent updates</li>
        )}
        {activity.map((item, idx) => (
          <li
            key={idx}
            data-cy="activity-item"
            data-activity-type={item.type}
            className="border-l-4 pl-3 border-blue-200 bg-slate-50 p-2 rounded-md"
          >
            {item.type === "transaction" ? (
              <>
                <p className="text-gray-700">
                  💸 <strong>{item.payee}</strong> ({item.category})
                </p>
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(item.timestamp))} ago —{" "}
                  {item.balance < 0 ? "Spent" : "Received"}{" "}
                  {Math.abs(item.balance)}
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-700">
                  📝 <strong>{item.description}</strong>
                </p>
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(item.timestamp))} ago
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
