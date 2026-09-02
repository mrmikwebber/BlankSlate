"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { format, subMonths, parseISO } from "date-fns";
import { useAuth } from "./AuthContext";
import { useBudgetSelection } from "./BudgetSelectionContext";
import { supabase } from "@/utils/supabaseClient";
import { useAccountContext, type Account } from "./AccountContext";
import { useUndoRedo } from "./UndoRedoContext";
import { parseYnabPlan, parseYnabRegister } from "@/lib/ynabImport";
import {
  useBudgetMonth,
  invalidateCachedMonth,
  invalidateAllCachedMonths,
  setCachedView,
  patchRTAForward,
} from "@/app/hooks/useBudgetMonth";
import type {
  ComputedMonthView,
  Target,
  NoteEntry,
} from "@/types/budget";

// ---------------------------------------------------------------------------
// Legacy shape — kept for backward compat with components not yet migrated.
// New components should use budgetView (ComputedMonthView) directly.
// ---------------------------------------------------------------------------
interface LegacyCategoryItem {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  snoozed?: boolean;
  target?: Target;
  notes?: string;
  notes_history?: NoteEntry[];
}
interface LegacyCategory {
  name: string;
  notes?: string;
  notes_history?: NoteEntry[];
  categoryItems: LegacyCategoryItem[];
}
interface LegacyBudgetData {
  categories: LegacyCategory[];
  ready_to_assign?: number;
  assignable_money?: number;
  id?: string;
}

const getPreviousMonth = (month: string) =>
  format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");

// Every budget-view-returning route needs to know the browser's own current
// month, not the server runtime's — see readTodayMonthParam in
// lib/budgetMath.ts for why (a UTC server and a non-UTC user disagree about
// "today" for several hours around every month boundary). Attached as a
// query param here so it works uniformly across GET/PATCH/POST without
// touching every call site's body.
function withTodayMonth(url: string): string {
  const todayMonth = format(new Date(), "yyyy-MM");
  return `${url}${url.includes("?") ? "&" : "?"}todayMonth=${todayMonth}`;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withTodayMonth(url), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  // DELETE routes (and any other 204) return no body — .json() would throw
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Context definition
// ---------------------------------------------------------------------------

const BudgetContext = createContext<ReturnType<typeof buildContextValue> | null>(null);

function buildContextValue(_placeholder: null) {
  return null as unknown as {
    // Data
    budgetView: ComputedMonthView | null;
    budgetData: Record<string, LegacyBudgetData>; // compat shim
    currentMonth: string;
    isLoading: boolean;
    error: string | null;
    budgetFullyLoaded: boolean;
    sandboxMode: boolean;
    importPending: boolean;
    enterSandbox: () => void;
    exitSandbox: () => void;
    planningMode: "period" | "global";
    setPlanningMode: (mode: "period" | "global") => void;

    // Navigation
    setCurrentMonth: (month: string, direction?: "forward" | "backward") => void;

    // Mutations
    patchAssigned: (categoryItemId: string, month: string, value: number) => Promise<void>;
    moveMoney: (sourceItemId: string, destItemId: string, month: string, amount: number) => Promise<void>;
    addCategoryGroup: (name: string) => Promise<void>;
    deleteCategoryGroup: (id: string) => Promise<void>;
    addItemToCategory: (groupId: string, itemName: string, sortOrder?: number) => Promise<string>;
    deleteCategoryItem: (id: string, reassignToItemId?: string) => Promise<void>;
    renameCategoryGroup: (id: string, newName: string) => Promise<void>;
    renameCategory: (id: string, newName: string) => Promise<void>;
    reorderCategoryGroups: (orderedIds: { id: string; sortOrder: number }[]) => Promise<void>;
    reorderCategoryItems: (orderedIds: { id: string; sortOrder: number }[]) => Promise<void>;
    moveCategoryItemToGroup: (
      itemId: string,
      targetGroupId: string,
      targetOrderedIds: { id: string; sortOrder: number }[],
      sourceOrderedIds: { id: string; sortOrder: number }[]
    ) => Promise<void>;
    setCategorySnooze: (id: string, snoozed: boolean) => Promise<void>;
    setCategoryArchived: (id: string, archived: boolean) => Promise<void>;
    setCategoryTarget: (id: string, target: Target | null) => Promise<void>;
    setGlobalAssigned: (categoryItemId: string, month: string, value: number) => Promise<void>;
    setPlannedIncome: (month: string, amount: number) => Promise<void>;
    setCategoryDiscretionaryPool: (id: string, isDiscretionaryPool: boolean) => Promise<void>;
    setCategoryHideFromInsights: (id: string, isHiddenFromInsights: boolean) => Promise<void>;
    updateCategoryGroupNote: (id: string, text: string) => Promise<void>;
    updateCategoryItemNote: (id: string, text: string) => Promise<void>;
    invalidate: () => void;
    invalidateAll: () => void;
    seedDefaultCategories: () => Promise<void>;

    // YNAB import
    importYnabData: (registerFile: File, planFile: File) => Promise<{
      accounts: number;
      transactions: number;
      months: number;
      createdAccounts: { id: string; name: string; type: string }[];
    }>;
    confirmImport: () => Promise<void>;
    undoImport: () => Promise<void>;

    // Helpers for components that still use name-based lookups (migration bridge)
    getItemIdByName: (groupName: string, itemName: string) => string | null;
    getGroupIdByName: (groupName: string) => string | null;

    // Deprecated stubs kept to avoid breaking unmigrated components
    refreshAllReadyToAssign: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setBudgetData: (updater?: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRecentChanges: (updater?: any) => void;
    recentChanges: { description: string; timestamp: string }[];
    setIsDirty: (v?: boolean) => void;
    getCumulativeAvailable: (data: unknown, itemName: string, groupName: string) => number;
    calculateActivityForMonth: (month: string, itemName: string, groupName: string) => number;
    calculateCreditCardAccountActivity: (month: string, itemName: string, data: unknown) => number;
    getDisplayedRta: (month: string) => number;
    rtaCarryByMonth: Record<string, number>;
    globalRTA: number;
    deficitBeyond: boolean;
    rtaStartMonth: string;
  };
}

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth() || { user: null };
  const { registerAction, clearHistory } = useUndoRedo();
  const { accounts, setAccounts } = useAccountContext();
  const { currentBudgetId } = useBudgetSelection();

  const [currentMonth, setCurrentMonthState] = useState(format(new Date(), "yyyy-MM"));
  const [sandboxMode, setSandboxMode] = useState(false);
  const [importPending, setImportPending] = useState(false);
  // Session-only, never persisted — Period (real, unchanged behavior) is
  // always the default on load. A stale Global toggle silently making a
  // bigger number look real on next visit would be worse than an extra click.
  const [planningMode, setPlanningMode] = useState<"period" | "global">("period");

  // After a mutation the server returns a fresh view — store it to avoid a re-fetch round-trip
  const [mutationView, setMutationView] = useState<ComputedMonthView | null>(null);

  const importedAccountIdsRef = useRef<string[]>([]);
  const importedCategoryGroupIdsRef = useRef<string[]>([]);

  const { view: hookView, isLoading, error, invalidate: hookInvalidate } = useBudgetMonth(currentMonth);

  // Mutation view takes priority; cleared when month changes or hook delivers fresher data
  const budgetView = useMemo(() => {
    if (!mutationView) return hookView;
    if (hookView && hookView.version > mutationView.version) return hookView;
    return mutationView;
  }, [mutationView, hookView]);

  const invalidate = useCallback(
    (targetMonth?: string) => {
      const m = targetMonth ?? currentMonth;
      setMutationView(null);
      invalidateCachedMonth(m);
      if (m === currentMonth) hookInvalidate();
    },
    [currentMonth, hookInvalidate]
  );

  // RTA and available cascade forward across months, so a transaction change
  // in any month can affect every later one — clear every cached month
  // (same pattern as YNAB import) rather than just the current one.
  const invalidateAll = useCallback(() => {
    invalidateAllCachedMonths();
    setMutationView(null);
    hookInvalidate();
  }, [hookInvalidate]);

  // Clear mutation view on month navigation
  const setCurrentMonth = useCallback(
    (month: string, _direction?: "forward" | "backward") => {
      setMutationView(null);
      setCurrentMonthState(month);
    },
    []
  );

  // After mutations that return a new ComputedMonthView, merge it here
  const applyMutationResult = useCallback(
    (view: ComputedMonthView) => {
      setCachedView(view.month, view);
      if (view.month === currentMonth) {
        setMutationView(view);
      }
    },
    [currentMonth]
  );

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const patchAssigned = useCallback(
    async (categoryItemId: string, month: string, value: number) => {
      // Optimistic: changing this item's assigned amount by `delta` changes
      // this item's available and this month's RTA by exactly `delta` — no
      // approximation needed. Apply that instantly instead of waiting on the
      // round trip, and roll back on failure. RTA is sequential per month
      // (not a single global figure), so the change also ripples forward
      // into any cached later month — patchRTAForward re-walks those from
      // their own already-known income/overspend/assigned, never touching
      // cached months before this one.
      const previousView = budgetView?.month === month ? budgetView : null;

      if (previousView) {
        const item = previousView.categories
          .flatMap((g) => g.categoryItems)
          .find((i) => i.id === categoryItemId);
        const delta = value - (item?.assigned ?? 0);
        const optimisticRta = previousView.ready_to_assign - delta;

        applyMutationResult({
          ...previousView,
          ready_to_assign: optimisticRta,
          rta_assigned_this_month: previousView.rta_assigned_this_month + delta,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((i) =>
              i.id === categoryItemId ? { ...i, assigned: value, available: i.available + delta } : i
            ),
          })),
        });
        patchRTAForward(month, optimisticRta);
      }

      // Sandbox mode never writes real assignments — the optimistic patch
      // above is the entire effect, and exitSandbox()'s invalidate() call
      // reverts it by simply refetching the (untouched) real data.
      if (sandboxMode) return;

      try {
        const view = await apiFetch<ComputedMonthView>("/api/budget/assign", {
          method: "PATCH",
          body: JSON.stringify({ month, categoryItemId, assigned: value }),
        });
        // Reconcile forward from the authoritative value, then restore the
        // one month we have the full, correct view for.
        patchRTAForward(month, view.ready_to_assign);
        applyMutationResult(view);
      } catch (err) {
        if (previousView) {
          patchRTAForward(month, previousView.ready_to_assign);
          applyMutationResult(previousView);
        }
        throw err;
      }
    },
    [applyMutationResult, budgetView, sandboxMode]
  );

  const moveMoney = useCallback(
    async (sourceItemId: string, destItemId: string, month: string, amount: number) => {
      // Same-month transfer between two categories — no RTA impact, so the
      // optimistic patch is just shifting `assigned`/`available` between the
      // two items.
      const previousView = budgetView?.month === month ? budgetView : null;

      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((i) => {
              if (i.id === sourceItemId) return { ...i, assigned: i.assigned - amount, available: i.available - amount };
              if (i.id === destItemId) return { ...i, assigned: i.assigned + amount, available: i.available + amount };
              return i;
            }),
          })),
        });
      }

      // Sandbox mode never writes real transfers — the optimistic patch
      // above is the entire effect, reverted by exitSandbox()'s invalidate().
      if (sandboxMode) return;

      try {
        const view = await apiFetch<ComputedMonthView>("/api/budget/move-money", {
          method: "POST",
          body: JSON.stringify({ month, sourceItemId, destinationItemId: destItemId, amount }),
        });
        applyMutationResult(view);
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView, sandboxMode]
  );

  const addCategoryGroup = useCallback(
    async (name: string) => {
      await apiFetch("/api/budget/category-group", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      invalidate();
    },
    [invalidate]
  );

  const deleteCategoryGroup = useCallback(
    async (id: string) => {
      // Only ever called on an empty group (the UI blocks it otherwise), so
      // removing it has no money/RTA impact — safe to drop it from the list
      // immediately rather than waiting on the round trip.
      const previousView = budgetView;
      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.filter((g) => g.id !== id),
        });
      }

      try {
        await apiFetch(`/api/budget/category-group/${id}`, { method: "DELETE" });
        // Only clear the cache (for other months' next visit) — don't route
        // through invalidateAll()/hookInvalidate() here, since that clears
        // mutationView and lets the stale pre-delete cached view flash back
        // in for a moment before a refetch would resolve. The optimistic
        // view above is already exactly correct (empty-group delete has no
        // money impact), so there's nothing left to reconcile for this month.
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const addItemToCategory = useCallback(
    async (groupId: string, itemName: string, sortOrder?: number) => {
      const created = await apiFetch<{ id: string }>("/api/budget/category-item", {
        method: "POST",
        body: JSON.stringify({ groupId, name: itemName, sortOrder }),
      });
      invalidate();
      return created.id;
    },
    [invalidate]
  );

  const deleteCategoryItem = useCallback(
    async (id: string, reassignToItemId?: string) => {
      // Deleting cascades to that item's budget_assignments across every
      // month, which can shift RTA by an amount we can't know client-side
      // (only this month's assigned is visible here) — so only the row
      // removal itself is optimistic; RTA/available settle in once the
      // server responds and every cached month gets invalidated.
      const previousView = budgetView;
      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.filter((i) => i.id !== id),
          })),
        });
      }

      try {
        await apiFetch(`/api/budget/category-item/${id}`, {
          method: "DELETE",
          ...(reassignToItemId ? { body: JSON.stringify({ reassignToItemId }) } : {}),
        });
        // Same reasoning as deleteCategoryGroup: avoid invalidateAll()'s
        // setMutationView(null), which would let the stale pre-delete view
        // flash back in. Instead fetch the authoritative post-delete view
        // directly and swap it in atomically — mutationView never goes
        // through a null/stale gap. Other cached months are cleared so they
        // pick up the (possibly RTA-shifted) truth on next visit.
        invalidateAllCachedMonths();
        const freshView = await apiFetch<ComputedMonthView>(`/api/budget/month/${currentMonth}`);
        applyMutationResult(freshView);
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView, currentMonth]
  );

  const seedDefaultCategories = useCallback(async () => {
    const defaults: { group: string; items: string[] }[] = [
      { group: "Monthly Bills", items: ["Rent / Mortgage", "Phone", "Internet", "Utilities", "Subscriptions"] },
      { group: "Everyday Expenses", items: ["Groceries", "Dining Out", "Transportation", "Gas", "Personal Care"] },
      { group: "Savings Goals", items: ["Emergency Fund", "Vacation", "Home"] },
      { group: "Health", items: ["Medical", "Gym / Fitness", "Prescriptions"] },
      { group: "Fun", items: ["Entertainment", "Hobbies", "Clothing"] },
    ];
    for (const { group, items } of defaults) {
      const created = await apiFetch<{ id: string }>("/api/budget/category-group", {
        method: "POST",
        body: JSON.stringify({ name: group }),
      });
      for (let i = 0; i < items.length; i++) {
        await apiFetch("/api/budget/category-item", {
          method: "POST",
          body: JSON.stringify({ groupId: created.id, name: items[i], sortOrder: i }),
        });
      }
    }
    invalidate();
  }, [invalidate]);

  // None of the mutations below (rename, reorder, move-group, target) affect
  // money/RTA — only display fields or a group_id/sort_order — so each one
  // patches `budgetView` instantly instead of waiting on the round trip, the
  // same "apply now, reconcile on success, roll back on failure" shape as
  // patchAssigned above. On success they call invalidateAllCachedMonths()
  // (not invalidate()/hookInvalidate()) so *other* cached months pick up the
  // change on next visit without nulling out this month's already-correct
  // optimistic view and causing a stale-then-fresh flash (same reasoning as
  // deleteCategoryGroup/deleteCategoryItem above).

  const renameCategoryGroup = useCallback(
    async (id: string, newName: string) => {
      const previousView = budgetView;
      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) =>
            g.id === id ? { ...g, name: newName } : g
          ),
        });
      }
      try {
        await apiFetch(`/api/budget/category-group/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newName }),
        });
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const renameCategory = useCallback(
    async (id: string, newName: string) => {
      const previousView = budgetView;
      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((i) =>
              i.id === id ? { ...i, name: newName } : i
            ),
          })),
        });
      }
      try {
        await apiFetch(`/api/budget/category-item/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newName }),
        });
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const reorderCategoryGroups = useCallback(
    async (orderedIds: { id: string; sortOrder: number }[]) => {
      const previousView = budgetView;
      if (previousView) {
        const order = new Map(orderedIds.map((o) => [o.id, o.sortOrder]));
        const reordered = [...previousView.categories].sort(
          (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
        );
        applyMutationResult({ ...previousView, categories: reordered });
      }
      try {
        await Promise.all(
          orderedIds.map(({ id, sortOrder }) =>
            apiFetch(`/api/budget/category-group/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ sortOrder }),
            })
          )
        );
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const reorderCategoryItems = useCallback(
    async (orderedIds: { id: string; sortOrder: number }[]) => {
      const previousView = budgetView;
      if (previousView) {
        const order = new Map(orderedIds.map((o) => [o.id, o.sortOrder]));
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) =>
            g.categoryItems.some((i) => order.has(i.id))
              ? { ...g, categoryItems: [...g.categoryItems].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }
              : g
          ),
        });
      }
      try {
        await Promise.all(
          orderedIds.map(({ id, sortOrder }) =>
            apiFetch(`/api/budget/category-item/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ sortOrder }),
            })
          )
        );
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  // Moves an item to a different group (drag-and-drop across groups in
  // BudgetTable) and resequences both the target group (item inserted at its
  // dropped position) and the source group (closing the gap left behind) in
  // one batch. `targetOrderedIds` must already include the moved item at its
  // new position; `sourceOrderedIds` must not.
  const moveCategoryItemToGroup = useCallback(
    async (
      itemId: string,
      targetGroupId: string,
      targetOrderedIds: { id: string; sortOrder: number }[],
      sourceOrderedIds: { id: string; sortOrder: number }[]
    ) => {
      const previousView = budgetView;
      if (previousView) {
        const byId = new Map(
          previousView.categories.flatMap((g) => g.categoryItems).map((i) => [i.id, i] as const)
        );
        const reorderByIds = (orderedIds: { id: string; sortOrder: number }[]) =>
          [...orderedIds]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o) => byId.get(o.id))
            .filter((i): i is NonNullable<typeof i> => Boolean(i));

        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) => {
            if (g.id === targetGroupId) return { ...g, categoryItems: reorderByIds(targetOrderedIds) };
            if (g.categoryItems.some((i) => i.id === itemId)) return { ...g, categoryItems: reorderByIds(sourceOrderedIds) };
            return g;
          }),
        });
      }

      try {
        const movedSortOrder = targetOrderedIds.find((o) => o.id === itemId)?.sortOrder ?? 0;
        await Promise.all([
          apiFetch(`/api/budget/category-item/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ groupId: targetGroupId, sortOrder: movedSortOrder }),
          }),
          ...targetOrderedIds
            .filter((o) => o.id !== itemId)
            .map((o) =>
              apiFetch(`/api/budget/category-item/${o.id}`, {
                method: "PATCH",
                body: JSON.stringify({ sortOrder: o.sortOrder }),
              })
            ),
          ...sourceOrderedIds.map((o) =>
            apiFetch(`/api/budget/category-item/${o.id}`, {
              method: "PATCH",
              body: JSON.stringify({ sortOrder: o.sortOrder }),
            })
          ),
        ]);
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const setCategorySnooze = useCallback(
    async (id: string, snoozed: boolean) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ snoozed }),
      });
      invalidate();
    },
    [invalidate]
  );

  const setCategoryArchived = useCallback(
    async (id: string, archived: boolean) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      invalidate();
    },
    [invalidate]
  );

  const setCategoryTarget = useCallback(
    async (id: string, target: Target | null) => {
      const previousView = budgetView;
      if (previousView) {
        applyMutationResult({
          ...previousView,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((i) =>
              i.id === id ? { ...i, target: target ?? undefined } : i
            ),
          })),
        });
      }
      try {
        await apiFetch(`/api/budget/category-item/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ target }),
        });
        invalidateAllCachedMonths();
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  // Global planning mode — a shadow "assigned" per (item, month), separate
  // from real budget_assignments. Mirrors patchAssigned's optimistic-delta
  // shape (instant local patch, reconcile with the server's authoritative
  // view, roll back on failure) but deliberately does NOT call
  // patchRTAForward — Global mode is single-month only and must never
  // cascade into other cached months or touch real RTA.
  const setGlobalAssigned = useCallback(
    async (categoryItemId: string, month: string, value: number) => {
      const previousView = budgetView?.month === month ? budgetView : null;

      if (previousView) {
        const item = previousView.categories
          .flatMap((g) => g.categoryItems)
          .find((i) => i.id === categoryItemId);
        const delta = value - (item?.globalAssigned ?? 0);

        applyMutationResult({
          ...previousView,
          global_ready_to_assign: previousView.global_ready_to_assign - delta,
          categories: previousView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((i) =>
              // Only this item's own globalAvailable can be shifted exactly
              // client-side (its shadow activity never depends on its own
              // assigned amount) — a Credit Card Payments item this edit
              // funds isn't in this map and stays stale until the server
              // response lands, same as any other cross-item effect.
              i.id === categoryItemId
                ? { ...i, globalAssigned: value, globalAvailable: i.globalAvailable + delta }
                : i
            ),
          })),
        });
      }

      try {
        const view = await apiFetch<ComputedMonthView>("/api/budget/global-assign", {
          method: "PATCH",
          body: JSON.stringify({ month, categoryItemId, assigned: value }),
        });
        applyMutationResult(view);
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const setPlannedIncome = useCallback(
    async (month: string, amount: number) => {
      const previousView = budgetView?.month === month ? budgetView : null;

      if (previousView) {
        const delta = amount - previousView.global_planned_income;
        applyMutationResult({
          ...previousView,
          global_planned_income: amount,
          global_ready_to_assign: previousView.global_ready_to_assign + delta,
        });
      }

      try {
        const view = await apiFetch<ComputedMonthView>("/api/budget/planned-income", {
          method: "PATCH",
          body: JSON.stringify({ month, amount }),
        });
        applyMutationResult(view);
      } catch (err) {
        if (previousView) applyMutationResult(previousView);
        throw err;
      }
    },
    [applyMutationResult, budgetView]
  );

  const setCategoryDiscretionaryPool = useCallback(
    async (id: string, isDiscretionaryPool: boolean) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDiscretionaryPool }),
      });
      // This flag never feeds budget math (unlike assigned/activity), so a
      // full month invalidate+recompute here was pure overhead — and the
      // visible cause of Ready to Assign flickering on every toggle. Patch
      // the one item in place instead.
      if (budgetView) {
        applyMutationResult({
          ...budgetView,
          categories: budgetView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((item) =>
              item.id === id ? { ...item, isDiscretionaryPool } : item
            ),
          })),
        });
      }
    },
    [budgetView, applyMutationResult]
  );

  const setCategoryHideFromInsights = useCallback(
    async (id: string, isHiddenFromInsights: boolean) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isHiddenFromInsights }),
      });
      // Same reasoning as setCategoryDiscretionaryPool — this flag never
      // feeds budget math, so patch the one item in place rather than
      // triggering a full invalidate+recompute.
      if (budgetView) {
        applyMutationResult({
          ...budgetView,
          categories: budgetView.categories.map((g) => ({
            ...g,
            categoryItems: g.categoryItems.map((item) =>
              item.id === id ? { ...item, isHiddenFromInsights } : item
            ),
          })),
        });
      }
    },
    [budgetView, applyMutationResult]
  );

  const updateCategoryGroupNote = useCallback(
    async (id: string, text: string) => {
      await apiFetch(`/api/budget/category-group/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: text }),
      });
      invalidate();
    },
    [invalidate]
  );

  const updateCategoryItemNote = useCallback(
    async (id: string, text: string) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: text }),
      });
      invalidate();
    },
    [invalidate]
  );

  // ---------------------------------------------------------------------------
  // YNAB Import
  // ---------------------------------------------------------------------------

  const importYnabData = useCallback(
    async (registerFile: File, planFile: File) => {
      if (!user?.id) throw new Error("Please sign in before importing.");
      if (!currentBudgetId) throw new Error("No current budget resolved yet — try again in a moment.");

      // Snapshot for undo
      importedAccountIdsRef.current = [];
      importedCategoryGroupIdsRef.current = [];

      // Delete existing data. Accounts stay budget-agnostic — a YNAB import
      // always replaces the full account list. category_groups (and its
      // cascade to items/assignments/transactions via budget_id) is scoped
      // to only the current budget, so archived budgets are untouched.
      await supabase.from("accounts").delete().eq("user_id", user.id);
      await supabase.from("category_groups").delete().eq("user_id", user.id).eq("budget_id", currentBudgetId);

      const [registerText, planText] = await Promise.all([registerFile.text(), planFile.text()]);
      const registerParsed = parseYnabRegister(registerText);
      const planParsed = parseYnabPlan(planText);

      // Import payees
      if (registerParsed.payees?.length) {
        const payeePayload = registerParsed.payees.map((name) => ({ user_id: user.id, name, last_used_at: new Date().toISOString() }));
        for (const chunk of chunkArray(payeePayload, 100)) {
          await supabase.from("transaction_payees").upsert(chunk, { onConflict: "user_id,name" });
        }
      }

      // Phase 1: insert accounts only — defer transactions until category_item_id is known
      const createdAccounts: { id: string; name: string; type: string }[] = [];
      const pendingTransactions: Array<{ accountId: string; accountName: string; tx: typeof registerParsed.accounts[0]["transactions"][0] }> = [];
      for (const account of registerParsed.accounts) {
        const { data: created, error: accountError } = await supabase
          .from("accounts")
          .insert({ name: account.name, type: account.type, issuer: account.issuer, balance: 0, user_id: user.id })
          .select()
          .single();
        if (accountError || !created) throw new Error(`Failed to create account '${account.name}': ${accountError?.message ?? "unknown"}`);

        importedAccountIdsRef.current.push(created.id);
        createdAccounts.push({ id: created.id, name: created.name, type: created.type });

        for (const tx of account.transactions) {
          pendingTransactions.push({ accountId: created.id, accountName: account.name, tx });
        }
      }

      // Extract category structure from plan (deduplicated across months)
      const groupOrder: string[] = [];
      const groupItemOrder: Record<string, string[]> = {};
      const itemMeta: Record<string, { snoozed?: boolean; target?: Target; notes?: string; notes_history?: NoteEntry[] }> = {};

      for (const monthData of Object.values(planParsed.budgetData)) {
        for (const cat of monthData.categories || []) {
          if (!groupOrder.includes(cat.name)) groupOrder.push(cat.name);
          if (!groupItemOrder[cat.name]) groupItemOrder[cat.name] = [];
          for (const item of cat.categoryItems || []) {
            if (!groupItemOrder[cat.name].includes(item.name)) {
              groupItemOrder[cat.name].push(item.name);
            }
            // Take most recent metadata
            if (item.snoozed || item.target || item.notes) {
              itemMeta[`${cat.name}::${item.name}`] = {
                snoozed: item.snoozed,
                target: item.target as Target | undefined,
                notes: item.notes,
                notes_history: item.notes_history as NoteEntry[] | undefined,
              };
            }
          }
        }
      }

      // Insert category_groups
      const groupNameToId = new Map<string, string>();
      for (let i = 0; i < groupOrder.length; i++) {
        const groupName = groupOrder[i];
        const { data: group, error: groupError } = await supabase
          .from("category_groups")
          .insert({ user_id: user.id, budget_id: currentBudgetId, name: groupName, sort_order: i })
          .select("id")
          .single();
        if (groupError || !group) throw new Error(`Failed to create category group '${groupName}': ${groupError?.message ?? "unknown"}`);
        groupNameToId.set(groupName, group.id);
        importedCategoryGroupIdsRef.current.push(group.id);
      }

      // Insert category_items
      const itemKeyToId = new Map<string, string>(); // "groupName::itemName" → id
      for (const groupName of groupOrder) {
        const groupId = groupNameToId.get(groupName)!;
        const items = groupItemOrder[groupName] ?? [];
        for (let j = 0; j < items.length; j++) {
          const itemName = items[j];
          const meta = itemMeta[`${groupName}::${itemName}`] ?? {};
          const { data: item, error: itemError } = await supabase
            .from("category_items")
            .insert({ user_id: user.id, budget_id: currentBudgetId, group_id: groupId, name: itemName, sort_order: j, snoozed: meta.snoozed ?? false, target: meta.target ?? null, notes: meta.notes ?? null, notes_history: meta.notes_history ?? null })
            .select("id")
            .single();
          if (itemError || !item) throw new Error(`Failed to create category item '${itemName}': ${itemError?.message ?? "unknown"}`);
          itemKeyToId.set(`${groupName}::${itemName}`, item.id);
        }
      }

      // Phase 3: insert transactions now that category_item_id can be resolved
      const txPayloadAll = pendingTransactions.map(({ accountId, accountName, tx }) => ({
        user_id: user.id,
        budget_id: currentBudgetId,
        account_id: accountId,
        date: tx.date,
        payee: tx.payee,
        category: tx.category,
        category_group: tx.category_group,
        balance: tx.balance,
        // Resolve FK — income/special transactions won't match and correctly get null
        category_item_id: itemKeyToId.get(`${tx.category_group}::${tx.category}`) ?? null,
      }));
      for (const chunk of chunkArray(txPayloadAll, 100)) {
        const { error: txError } = await supabase.from("transactions").insert(chunk);
        if (txError) throw new Error(`Failed to import transactions: ${txError.message}`);
      }

      // Insert budget_assignments
      const assignmentRows: { user_id: string; budget_id: string; category_item_id: string; month: string; assigned: number }[] = [];
      for (const [month, monthData] of Object.entries(planParsed.budgetData)) {
        for (const cat of monthData.categories || []) {
          for (const item of cat.categoryItems || []) {
            if (!item.assigned) continue;
            const itemId = itemKeyToId.get(`${cat.name}::${item.name}`);
            if (!itemId) continue;
            assignmentRows.push({ user_id: user.id, budget_id: currentBudgetId, category_item_id: itemId, month, assigned: item.assigned });
          }
        }
      }

      for (const chunk of chunkArray(assignmentRows, 100)) {
        const { error: assignError } = await supabase
          .from("budget_assignments")
          .upsert(chunk, { onConflict: "user_id,category_item_id,month" });
        if (assignError) throw new Error(`Failed to import assignments: ${assignError.message}`);
      }

      // Update accounts in context. Two separate queries, not an embedded
      // `accounts(*, transactions(*))` select — same reasoning as
      // AccountContext.fetchAccounts: a dot-filter on a non-`!inner` embed
      // doesn't actually filter, so budget_id has to be applied client-side.
      const [{ data: refreshedAccounts }, { data: refreshedTx }] = await Promise.all([
        supabase.from("accounts").select("*"),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("budget_id", currentBudgetId)
          .order("date", { ascending: true }),
      ]);
      if (refreshedAccounts) {
        const txByAccount = new Map<string, unknown[]>();
        for (const tx of refreshedTx ?? []) {
          const key = String((tx as { account_id: string }).account_id);
          if (!txByAccount.has(key)) txByAccount.set(key, []);
          txByAccount.get(key)!.push(tx);
        }
        const withTransactions = refreshedAccounts.map((acc) => ({
          ...acc,
          transactions: txByAccount.get(String(acc.id)) ?? [],
        }));
        setAccounts(withTransactions as unknown as Account[]);
      }

      // Set latest month and clear all caches, then force a re-fetch
      const months = Object.keys(planParsed.budgetData).sort();
      const latestMonth = months[months.length - 1];
      if (latestMonth) setCurrentMonthState(latestMonth);
      invalidateAllCachedMonths();
      setMutationView(null);
      // Force re-fetch even if currentMonth didn't change (hook only reacts to month change)
      hookInvalidate();

      setImportPending(true);
      clearHistory();

      return {
        accounts: registerParsed.accounts.length,
        transactions: registerParsed.transactionCount,
        months: planParsed.monthCount,
        createdAccounts: createdAccounts,
      };
    },
    [user?.id, currentBudgetId, clearHistory, setAccounts, hookInvalidate]
  );

  const confirmImport = useCallback(async () => {
    if (!importPending) return;
    setImportPending(false);
    importedAccountIdsRef.current = [];
    importedCategoryGroupIdsRef.current = [];
  }, [importPending]);

  const undoImport = useCallback(async () => {
    if (!importPending || !user?.id || !currentBudgetId) return;
    // The import wiped all existing accounts and the current budget's
    // category groups before creating new ones, so undo can safely delete
    // all of them — nothing pre-import needs to be preserved. Other budgets'
    // category_groups (and their cascade) are untouched, same as the import.
    await supabase.from("accounts").delete().eq("user_id", user.id);
    await supabase.from("category_groups").delete().eq("user_id", user.id).eq("budget_id", currentBudgetId);
    setImportPending(false);
    importedAccountIdsRef.current = [];
    importedCategoryGroupIdsRef.current = [];
    invalidateAllCachedMonths();
    setMutationView(null);
  }, [importPending, user?.id, currentBudgetId]);

  // ---------------------------------------------------------------------------
  // Sandbox mode
  // ---------------------------------------------------------------------------

  const enterSandbox = useCallback(() => {
    if (sandboxMode) return;
    setSandboxMode(true);
    clearHistory();
  }, [sandboxMode, clearHistory]);

  const exitSandbox = useCallback(() => {
    if (!sandboxMode) return;
    setSandboxMode(false);
    clearHistory();
    // Nothing was ever written to the server while sandboxMode was true
    // (patchAssigned/moveMoney both skip their real API call in that state),
    // so this refetch is the entire "discard changes" behavior.
    invalidate();
  }, [sandboxMode, clearHistory, invalidate]);

  // ---------------------------------------------------------------------------
  // Helpers for name-based lookup (migration bridge for unmigrated components)
  // ---------------------------------------------------------------------------

  const getItemIdByName = useCallback(
    (groupName: string, itemName: string): string | null =>
      budgetView?.categories
        .find((c) => c.name === groupName)
        ?.categoryItems.find((i) => i.name === itemName)?.id ?? null,
    [budgetView]
  );

  const getGroupIdByName = useCallback(
    (groupName: string): string | null =>
      budgetView?.categories.find((c) => c.name === groupName)?.id ?? null,
    [budgetView]
  );

  // ---------------------------------------------------------------------------
  // Backward-compat shims (deprecated — migrate components to budgetView)
  // ---------------------------------------------------------------------------

  const budgetData: Record<string, LegacyBudgetData> = useMemo(() => {
    if (!budgetView) return {};
    return {
      [currentMonth]: {
        categories: budgetView.categories.map((c) => ({
          name: c.name,
          notes: c.notes,
          notes_history: c.notes_history,
          categoryItems: c.categoryItems.map((i) => ({
            id: i.id,
            name: i.name,
            assigned: i.assigned,
            activity: i.activity,
            available: i.available,
            snoozed: i.snoozed,
            target: i.target,
            notes: i.notes,
            notes_history: i.notes_history,
          })),
        })),
        ready_to_assign: budgetView.ready_to_assign,
      },
    };
  }, [currentMonth, budgetView]);

  const getDisplayedRta = useCallback(
    (month: string): number => {
      if (month !== currentMonth) return 0; // other months not loaded; component should use budgetView directly
      return planningMode === "global"
        ? budgetView?.global_ready_to_assign ?? 0
        : budgetView?.ready_to_assign ?? 0;
    },
    [currentMonth, budgetView, planningMode]
  );

  const rtaCarryByMonth = useMemo(
    () => ({ [currentMonth]: budgetView?.rta_carry ?? 0 }),
    [currentMonth, budgetView]
  );

  return (
    <BudgetContext.Provider
      value={{
        budgetView,
        budgetData,
        currentMonth,
        isLoading,
        error,
        budgetFullyLoaded: !isLoading,
        sandboxMode,
        importPending,
        enterSandbox,
        exitSandbox,
        planningMode,
        setPlanningMode,

        setCurrentMonth,

        patchAssigned,
        moveMoney,
        addCategoryGroup,
        deleteCategoryGroup,
        addItemToCategory,
        deleteCategoryItem,
        renameCategoryGroup,
        renameCategory,
        reorderCategoryGroups,
        reorderCategoryItems,
        moveCategoryItemToGroup,
        setCategorySnooze,
        setCategoryArchived,
        setCategoryTarget,
        setGlobalAssigned,
        setPlannedIncome,
        setCategoryDiscretionaryPool,
        setCategoryHideFromInsights,
        updateCategoryGroupNote,
        updateCategoryItemNote,
        invalidate,
        invalidateAll,
        seedDefaultCategories,

        importYnabData,
        confirmImport,
        undoImport,

        getItemIdByName,
        getGroupIdByName,

        // Deprecated stubs
        refreshAllReadyToAssign: invalidate,
        setBudgetData: () => { console.warn("[BudgetContext] setBudgetData is deprecated. Use mutations and invalidate() instead."); },
        setRecentChanges: () => {},
        recentChanges: [],
        setIsDirty: () => {},
        getCumulativeAvailable: () => 0,
        calculateActivityForMonth: () => 0,
        calculateCreditCardAccountActivity: () => 0,
        getDisplayedRta,
        rtaCarryByMonth,
        globalRTA: budgetView?.ready_to_assign ?? 0,
        deficitBeyond: budgetView?.has_deficit_carry ?? false,
        rtaStartMonth: currentMonth,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
