"use client";
import { useEffect, useState } from "react";
import { useBudgetContext } from "../context/BudgetContext";
import { useAccountContext } from "../context/AccountContext";
import { useUndoRedo } from "../context/UndoRedoContext";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { RotateCcw, RotateCw } from "lucide-react";

export default function ActivitySidebar({ page }) {
  const { recentChanges } = useBudgetContext();
  const { recentTransactions } = useAccountContext();
  const { undo, redo, canUndo, canRedo, undoDescription, redoDescription } = useUndoRedo();

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
    <div data-cy="activity-sidebar" className="w-64 bg-white border-r border-slate-300 p-4 space-y-4 shadow-sm overflow-y-auto h-screen">
      {page === "account" && (
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center text-sm text-slate-600 hover:text-teal-600 transition font-medium mb-3 group"
        >
          <span className="mr-1.5 text-base group-hover:transform group-hover:-translate-x-1 transition-transform">←</span> Back to Dashboard
        </button>
      )}
      
      {/* Undo/Redo buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={canUndo ? `Undo: ${undoDescription}` : "Nothing to undo"}
          className="flex items-center gap-1 px-3 py-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-700 transition"
        >
          <RotateCcw className="h-4 w-4" />
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={canRedo ? `Redo: ${redoDescription}` : "Nothing to redo"}
          className="flex items-center gap-1 px-3 py-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-700 transition"
        >
          <RotateCw className="h-4 w-4" />
          Redo
        </button>
      </div>

      <h2 className="text-lg font-semibold text-slate-800">Recent Activity</h2>
      <ul data-cy="recent-activity-list" className="text-sm space-y-2">
        {activity.length === 0 && (
          <li className="text-slate-400 text-center py-4">No recent updates</li>
        )}
        {activity.map((item, idx) => (
          <li
            key={idx}
            data-cy="activity-item"
            data-activity-type={item.type}
            className="border-l-4 pl-3 border-teal-400 bg-slate-50 p-2.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            {item.type === "transaction" ? (
              <>
                <p className="text-slate-700 text-xs">
                  💸 <strong className="text-slate-800">{item.payee}</strong> <span className="text-slate-500">({item.category})</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {formatDistanceToNow(new Date(item.timestamp))} ago —{" "}
                  <span className={item.balance < 0 ? "text-red-600" : "text-green-600"}>
                    {item.balance < 0 ? "Spent" : "Received"}{" "}
                    ${Math.abs(item.balance).toFixed(2)}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-700 text-xs">
                  📝 <strong className="text-slate-800">{item.description}</strong>
                </p>
                <p className="text-xs text-slate-500 mt-1">
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
