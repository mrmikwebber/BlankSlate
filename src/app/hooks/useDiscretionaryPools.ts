"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useBudgetContext } from "../context/BudgetContext";
import { useBudgetMonth } from "./useBudgetMonth";
import {
  computePoolAllowance,
  computeTargetComparison,
  type PoolAllowance,
  type TargetComparison,
} from "../utils/discretionaryMath";
import type { ComputedCategoryItem } from "@/types/budget";

export interface DiscretionaryPool {
  id: string;
  name: string;
  available: number;
  allowance: PoolAllowance;
  // Only set when the category has a funding target — compares what's
  // actually left (assigned-based) against what the target implies should
  // be left this month.
  targetComparison: TargetComparison | null;
}

interface DiscretionaryOverride {
  isDiscretionaryPool?: boolean;
  available?: number;
}

export function useDiscretionaryPools() {
  const {
    setCategoryDiscretionaryPool: patchDiscretionaryPool,
    moveMoney,
  } = useBudgetContext();

  // Always anchored to the real current date, independent of whatever month
  // the rest of the app has navigated to.
  const currentPeriodMonth = useMemo(() => format(new Date(), "yyyy-MM"), []);
  const { view, isLoading: viewLoading, invalidate } = useBudgetMonth(currentPeriodMonth);

  // useBudgetMonth flips isLoading back to true on every background refetch,
  // not just the first load. Gating the whole view on that flag meant every
  // mutation (toggling a pool) briefly unmounted the entire tree — including
  // an open "Manage Pools" modal. Track whether we've ever loaded
  // successfully so only the true first load shows a loading state;
  // background refreshes update data in place instead.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!viewLoading && view) setHasLoadedOnce(true);
  }, [viewLoading, view]);

  // BudgetContext owns a SEPARATE useBudgetMonth instance (keyed on whatever
  // month the main budget table has navigated to) from this hook's (always
  // pinned to the real current month) — the two don't sync to each other.
  // Apply mutations locally and instantly here with an exact computed
  // delta, independent of either cache, rather than waiting on a refetch.
  const [overrides, setOverrides] = useState<Map<string, DiscretionaryOverride>>(new Map());

  const mergeOverride = useCallback((id: string, patch: DiscretionaryOverride) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...(prev.get(id) ?? {}), ...patch });
      return next;
    });
  }, []);

  const clearOverride = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Once the server-fetched view itself reflects an override, drop it —
  // keeps the override map from growing stale or unbounded.
  useEffect(() => {
    if (overrides.size === 0 || !view) return;
    const allItems = view.categories.flatMap((g) => g.categoryItems);
    setOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, ov] of prev) {
        const serverItem = allItems.find((i) => i.id === id);
        if (!serverItem) continue;
        const matches = Object.entries(ov).every(([key, value]) => {
          const serverValue = (serverItem as unknown as Record<string, unknown>)[key] ?? null;
          return (value ?? null) === serverValue;
        });
        if (matches) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [view, overrides]);

  const setCategoryDiscretionaryPool = useCallback(
    async (id: string, isDiscretionaryPool: boolean) => {
      mergeOverride(id, { isDiscretionaryPool });
      try {
        await patchDiscretionaryPool(id, isDiscretionaryPool);
      } catch (err) {
        clearOverride(id);
        throw err;
      }
    },
    [patchDiscretionaryPool, mergeOverride, clearOverride]
  );

  // Credit card categories are debt paydown, not impulse-spend money — never
  // eligible as a discretionary pool.
  const allCategoryItems: ComputedCategoryItem[] = useMemo(
    () =>
      (view?.categories ?? [])
        .filter((g) => g.name !== "Credit Card Payments")
        .flatMap((g) => g.categoryItems)
        .map((item) => {
          const override = overrides.get(item.id);
          return override ? { ...item, ...override } : item;
        }),
    [view, overrides]
  );

  const pools: DiscretionaryPool[] = useMemo(() => {
    const today = new Date();
    return allCategoryItems
      .filter((item) => item.isDiscretionaryPool)
      .map((item) => {
        const allowance = computePoolAllowance(item.available, item.activity, today);
        const amountNeeded = item.target?.amountNeeded;
        return {
          id: item.id,
          name: item.name,
          available: item.available,
          allowance,
          targetComparison: amountNeeded
            ? computeTargetComparison(amountNeeded, item.activity, allowance.velocity, today)
            : null,
        };
      });
  }, [allCategoryItems]);

  const totalDaily = pools.reduce((sum, p) => sum + p.allowance.daily, 0);
  const totalWeekly = pools.reduce((sum, p) => sum + p.allowance.weekly, 0);
  const totalRemaining = pools.reduce((sum, p) => sum + p.allowance.remaining, 0);

  // Real money movement between two categories for the current period —
  // the same moveMoney mutation the main budget table uses, so this
  // actually reassigns dollars rather than shuffling a display-only number.
  const shuffleMoney = useCallback(
    async (sourceId: string, destId: string, amount: number) => {
      const source = allCategoryItems.find((i) => i.id === sourceId);
      const dest = allCategoryItems.find((i) => i.id === destId);
      if (!source || !dest || amount <= 0) return;

      mergeOverride(sourceId, { available: source.available - amount });
      mergeOverride(destId, { available: dest.available + amount });
      try {
        await moveMoney(sourceId, destId, currentPeriodMonth, amount);
      } catch (err) {
        clearOverride(sourceId);
        clearOverride(destId);
        throw err;
      }
    },
    [allCategoryItems, moveMoney, currentPeriodMonth, mergeOverride, clearOverride]
  );

  return {
    pools,
    allCategoryItems,
    totalDaily,
    totalWeekly,
    totalRemaining,
    isLoading: viewLoading,
    isInitialLoading: !hasLoadedOnce && viewLoading,
    setCategoryDiscretionaryPool,
    shuffleMoney,
    invalidate,
  };
}
