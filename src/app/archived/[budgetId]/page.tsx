"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { formatToUSD } from "../../utils/formatToUSD";
import { ArrowLeft } from "lucide-react";
import type { ComputedMonthView } from "@/types/budget";

interface SnapshotTransaction {
  id: string;
  account_id: string;
  date: string;
  payee: string | null;
  category: string | null;
  category_group: string | null;
  balance: number;
  cleared: boolean;
}

interface SnapshotAccount {
  id: string;
  name: string;
  type: "debit" | "credit";
  balance: number;
  transactions: SnapshotTransaction[];
}

interface Snapshot {
  budget: { id: string; name: string; archived_at: string | null; created_at: string };
  months: ComputedMonthView[];
  accounts: SnapshotAccount[];
}

export default function ArchivedBudgetPage() {
  const { budgetId } = useParams<{ budgetId: string }>();
  const { session, loading } = useAuth();
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.push("/auth");
  }, [loading, session, router]);

  useEffect(() => {
    if (!session || !budgetId) return;
    fetch(`/api/budgets/${budgetId}/snapshot`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load budget");
        return res.json() as Promise<Snapshot>;
      })
      .then((data) => {
        setSnapshot(data);
        setSelectedMonth(data.months[data.months.length - 1]?.month ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load budget"));
  }, [session, budgetId]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-stone-50 dark:bg-stone-950">
        <p className="text-ledger-600 dark:text-ledger-400 text-lg">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-50 dark:bg-stone-950 px-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-ledger-600 dark:text-ledger-400 underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-stone-50 dark:bg-stone-950">
        <p className="text-stone-500 dark:text-stone-400">Loading archived budget…</p>
      </div>
    );
  }

  const monthView = snapshot.months.find((m) => m.month === selectedMonth) ?? null;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-16">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100">{snapshot.budget.name}</h1>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Archived {snapshot.budget.archived_at ? new Date(snapshot.budget.archived_at).toLocaleDateString() : ""} — read-only
            </p>
          </div>
        </div>

        {/* Accounts */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wide">Accounts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {snapshot.accounts.map((acc) => (
              <div key={acc.id} className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{acc.name}</p>
                <p className="text-lg font-mono tabular-nums text-stone-800 dark:text-stone-100">{formatToUSD(acc.balance)}</p>
                <p className="text-[11px] text-stone-400 dark:text-stone-500">{acc.transactions.length} transaction(s)</p>
              </div>
            ))}
          </div>
        </section>

        {/* Month picker + category breakdown */}
        {snapshot.months.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wide">Category Breakdown</h2>
              <select
                value={selectedMonth ?? ""}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-stone-700 dark:text-stone-200"
              >
                {snapshot.months.map((m) => (
                  <option key={m.month} value={m.month}>{m.month}</option>
                ))}
              </select>
            </div>

            {monthView && (
              <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                <div className="px-4 py-2 bg-stone-100 dark:bg-stone-800 flex justify-between text-xs font-semibold text-stone-500 dark:text-stone-400">
                  <span>Ready to Assign</span>
                  <span className="font-mono tabular-nums">{formatToUSD(monthView.ready_to_assign)}</span>
                </div>
                {monthView.categories.map((group) =>
                  group.categoryItems.length === 0 ? null : (
                    <div key={group.id}>
                      <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide px-4 pt-2.5 pb-1">
                        {group.name}
                      </p>
                      {group.categoryItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between px-4 py-1.5 border-t border-stone-100 dark:border-stone-800 first:border-t-0 text-sm"
                        >
                          <span className="text-stone-700 dark:text-stone-300">{item.name}</span>
                          <span className="flex gap-4 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                            <span>Assigned {formatToUSD(item.assigned)}</span>
                            <span>Activity {formatToUSD(item.activity)}</span>
                            <span className="text-stone-700 dark:text-stone-200">Available {formatToUSD(item.available)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {/* Registers */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wide">Registers</h2>
          {snapshot.accounts.map((acc) => (
            <div key={acc.id} className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
              <p className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-200">
                {acc.name}
              </p>
              {acc.transactions.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400 dark:text-stone-500">No transactions.</p>
              ) : (
                acc.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between px-4 py-1.5 border-t border-stone-100 dark:border-stone-800 first:border-t-0 text-sm"
                  >
                    <span className="text-stone-500 dark:text-stone-400 text-xs w-20 shrink-0">{tx.date}</span>
                    <span className="text-stone-700 dark:text-stone-200 flex-1 truncate px-2">{tx.payee}</span>
                    <span className="text-stone-400 dark:text-stone-500 text-xs w-40 shrink-0 truncate">{tx.category}</span>
                    <span className={`font-mono tabular-nums text-xs ${tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300"}`}>
                      {formatToUSD(tx.balance)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
