"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import type { ComputedMonthView } from "@/types/budget";

const DEBUG_BUDGET_TABLE = process.env.NEXT_PUBLIC_DEBUG_BUDGET_TABLE === "true";
const budgetLog = (...args: unknown[]) => {
  if (DEBUG_BUDGET_TABLE) console.log("[BudgetMonth]", ...args);
};

// Module-level cache shared across all hook instances.
// Key: "YYYY-MM", Value: latest ComputedMonthView for that month.
const viewCache = new Map<string, ComputedMonthView>();
// Ongoing fetch promises — prevents duplicate in-flight requests for the same month
const pendingFetches = new Map<string, Promise<ComputedMonthView>>();

async function fetchMonthView(month: string): Promise<ComputedMonthView> {
  if (pendingFetches.has(month)) {
    return pendingFetches.get(month)!;
  }

  // See readTodayMonthParam in lib/budgetMath.ts — the server needs the
  // browser's own current month, not its own runtime timezone's, or the
  // "Assigned in Future" RTA deduction silently disappears for several
  // hours around every month boundary on a non-UTC-local user.
  const todayMonth = format(new Date(), "yyyy-MM");
  const promise = fetch(`/api/budget/month/${month}?todayMonth=${todayMonth}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch month ${month}: ${res.status}`);
      return res.json() as Promise<ComputedMonthView>;
    })
    .finally(() => {
      pendingFetches.delete(month);
    });

  pendingFetches.set(month, promise);
  return promise;
}

export function useBudgetMonth(month: string): {
  view: ComputedMonthView | null;
  isLoading: boolean;
  error: string | null;
  invalidate: (targetMonth?: string) => void;
} {
  const [view, setView] = useState<ComputedMonthView | null>(
    () => viewCache.get(month) ?? null
  );
  const [isLoading, setIsLoading] = useState(!viewCache.has(month));
  const [error, setError] = useState<string | null>(null);

  // Track the latest requested month to guard against stale async responses
  const latestMonth = useRef(month);
  latestMonth.current = month;

  const loadMonth = useCallback(
    async (targetMonth: string) => {
      setIsLoading(true);
      setError(null);

      budgetLog("fetch:start", { month: targetMonth });

      try {
        const fetched = await fetchMonthView(targetMonth);

        // Reject stale: only apply if this is still the current month
        if (latestMonth.current !== targetMonth) return;

        // Reject stale: only apply if newer than cached version
        const cached = viewCache.get(targetMonth);
        if (cached && fetched.version <= cached.version) return;

        viewCache.set(targetMonth, fetched);
        setView(fetched);

        const allItems = fetched.categories.flatMap((g) => g.categoryItems);
        budgetLog("fetch:success", {
          month: targetMonth,
          groups: fetched.categories.length,
          items: allItems.length,
          totalAssigned: allItems.reduce((s, i) => s + i.assigned, 0).toFixed(2),
          totalActivity: allItems.reduce((s, i) => s + i.activity, 0).toFixed(2),
          itemsWithActivity: allItems.filter((i) => i.activity !== 0).length,
          readyToAssign: fetched.ready_to_assign,
          version: fetched.version,
        });
      } catch (err) {
        if (latestMonth.current !== targetMonth) return;
        budgetLog("fetch:error", {
          month: targetMonth,
          error: err instanceof Error ? err.message : String(err),
        });
        setError(err instanceof Error ? err.message : "Failed to load budget");
      } finally {
        if (latestMonth.current === targetMonth) {
          setIsLoading(false);
          budgetLog("fetch:done", { month: targetMonth });
        }
      }
    },
    []
  );

  // Load when month changes
  useEffect(() => {
    const cached = viewCache.get(month);
    if (cached) {
      setView(cached);
      setIsLoading(false);
      budgetLog("cache:hit", { month, categories: cached.categories.length, version: cached.version });
    } else {
      setView(null);
      budgetLog("cache:miss", { month });
    }
    loadMonth(month);
  }, [month, loadMonth]);

  // Prefetch adjacent months after the current one loads
  useEffect(() => {
    if (!view || isLoading) return;

    const prefetch = (m: string) => {
      if (!viewCache.has(m) && !pendingFetches.has(m)) {
        fetchMonthView(m)
          .then((fetched) => {
            const cached = viewCache.get(m);
            if (!cached || fetched.version > cached.version) {
              viewCache.set(m, fetched);
            }
          })
          .catch(() => {
            // Prefetch failures are silent
          });
      }
    };

    const [year, monthNum] = month.split("-").map(Number);
    const prev = `${year}-${String(monthNum - 1 || 12).padStart(2, "0")}`.replace(
      /^(\d{4})-0$/,
      `${year - 1}-12`
    );
    const nextYear = monthNum === 12 ? year + 1 : year;
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const next = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

    prefetch(prev);
    prefetch(next);
  }, [view, isLoading, month]);

  const invalidate = useCallback(
    (targetMonth?: string) => {
      const m = targetMonth ?? month;
      viewCache.delete(m);
      if (m === month) {
        loadMonth(month);
      }
    },
    [month, loadMonth]
  );

  return { view, isLoading, error, invalidate };
}

// Invalidate a month from outside a hook instance (e.g., after mutations in context)
export function invalidateCachedMonth(month: string) {
  viewCache.delete(month);
}

// Invalidate all cached months (e.g., after YNAB import)
export function invalidateAllCachedMonths() {
  viewCache.clear();
}

// Directly set a cached view (e.g., from a mutation response to avoid a re-fetch)
export function setCachedView(month: string, view: ComputedMonthView) {
  viewCache.set(month, view);
}

// Ready to Assign is computed sequentially per month (see computeBudgetState)
// — each month's RTA recursively depends on the one before it ("leftover
// from last month" + this month's own income/overspend/assigned) — so
// changing assigned in `fromMonth` also shifts every CACHED month at or
// after it (never before). Rather than tracking deltas through optimistic
// update / server response / rollback separately, just re-walk the cached
// months forward from the new authoritative (or optimistic) RTA for
// `fromMonth`, recomputing each subsequent cached month from its own
// already-known income/overspend/assigned components — naturally idempotent,
// so this can be called once optimistically and again with the real value
// once the server responds, no undo bookkeeping required.
export function patchRTAForward(fromMonth: string, newFromMonthRTA: number) {
  const monthsAtOrAfter = [...viewCache.keys()].filter((m) => m >= fromMonth).sort();
  let runningRta = newFromMonthRTA;
  for (const month of monthsAtOrAfter) {
    const view = viewCache.get(month)!;
    if (month === fromMonth) {
      viewCache.set(month, { ...view, ready_to_assign: runningRta });
      continue;
    }
    const recomputed =
      runningRta + view.rta_income_this_month - view.rta_overspend_prev_month - view.rta_assigned_this_month;
    viewCache.set(month, { ...view, ready_to_assign: recomputed, rta_prev_month_leftover: runningRta });
    runningRta = recomputed;
  }
}

// Read a cached view without triggering a fetch (used for prev-month display in BudgetTable)
export function getCachedView(month: string): ComputedMonthView | null {
  return viewCache.get(month) ?? null;
}
