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
import { supabase } from "@/utils/supabaseClient";
import { useAccountContext, type Account } from "./AccountContext";
import { useUndoRedo } from "./UndoRedoContext";
import { parseYnabPlan, parseYnabRegister } from "@/lib/ynabImport";
import {
  useBudgetMonth,
  invalidateCachedMonth,
  invalidateAllCachedMonths,
  setCachedView,
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

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
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

    // Navigation
    setCurrentMonth: (month: string, direction?: "forward" | "backward") => void;

    // Mutations
    patchAssigned: (categoryItemId: string, month: string, value: number) => Promise<void>;
    moveMoney: (sourceItemId: string, destItemId: string, month: string, amount: number) => Promise<void>;
    addCategoryGroup: (name: string) => Promise<void>;
    deleteCategoryGroup: (id: string) => Promise<void>;
    addItemToCategory: (groupId: string, itemName: string, sortOrder?: number) => Promise<void>;
    deleteCategoryItem: (id: string) => Promise<void>;
    renameCategoryGroup: (id: string, newName: string) => Promise<void>;
    renameCategory: (id: string, newName: string) => Promise<void>;
    reorderCategoryGroups: (orderedIds: { id: string; sortOrder: number }[]) => Promise<void>;
    reorderCategoryItems: (orderedIds: { id: string; sortOrder: number }[]) => Promise<void>;
    setCategorySnooze: (id: string, snoozed: boolean) => Promise<void>;
    setCategoryTarget: (id: string, target: Target | null) => Promise<void>;
    updateCategoryGroupNote: (id: string, text: string) => Promise<void>;
    updateCategoryItemNote: (id: string, text: string) => Promise<void>;
    invalidate: () => void;
    seedDefaultCategories: () => Promise<void>;

    // YNAB import
    importYnabData: (registerFile: File, planFile: File) => Promise<{
      accounts: number;
      transactions: number;
      months: number;
      createdAccounts: { id: string; name: string; type: string }[];
      preservedEnrollments: { accountName: string; tellerAccountId: string; accessToken: string; enrollmentId: string; institutionName: string; tellerAccountType: string; lastTellerTransactionId: string | null }[];
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

  const [currentMonth, setCurrentMonthState] = useState(format(new Date(), "yyyy-MM"));
  const [sandboxMode, setSandboxMode] = useState(false);
  const [importPending, setImportPending] = useState(false);

  // After a mutation the server returns a fresh view — store it to avoid a re-fetch round-trip
  const [mutationView, setMutationView] = useState<ComputedMonthView | null>(null);

  const sandboxBaselineRef = useRef<ComputedMonthView | null>(null);
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
      const view = await apiFetch<ComputedMonthView>("/api/budget/assign", {
        method: "PATCH",
        body: JSON.stringify({ month, categoryItemId, assigned: value }),
      });
      applyMutationResult(view);
    },
    [applyMutationResult]
  );

  const moveMoney = useCallback(
    async (sourceItemId: string, destItemId: string, month: string, amount: number) => {
      const view = await apiFetch<ComputedMonthView>("/api/budget/move-money", {
        method: "POST",
        body: JSON.stringify({ month, sourceItemId, destinationItemId: destItemId, amount }),
      });
      applyMutationResult(view);
    },
    [applyMutationResult]
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
      await apiFetch(`/api/budget/category-group/${id}`, { method: "DELETE" });
      invalidate();
    },
    [invalidate]
  );

  const addItemToCategory = useCallback(
    async (groupId: string, itemName: string, sortOrder?: number) => {
      await apiFetch("/api/budget/category-item", {
        method: "POST",
        body: JSON.stringify({ groupId, name: itemName, sortOrder }),
      });
      invalidate();
    },
    [invalidate]
  );

  const deleteCategoryItem = useCallback(
    async (id: string) => {
      await apiFetch(`/api/budget/category-item/${id}`, { method: "DELETE" });
      invalidate();
    },
    [invalidate]
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

  const renameCategoryGroup = useCallback(
    async (id: string, newName: string) => {
      await apiFetch(`/api/budget/category-group/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      invalidate();
    },
    [invalidate]
  );

  const renameCategory = useCallback(
    async (id: string, newName: string) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      invalidate();
    },
    [invalidate]
  );

  const reorderCategoryGroups = useCallback(
    async (orderedIds: { id: string; sortOrder: number }[]) => {
      await Promise.all(
        orderedIds.map(({ id, sortOrder }) =>
          apiFetch(`/api/budget/category-group/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ sortOrder }),
          })
        )
      );
      invalidate();
    },
    [invalidate]
  );

  const reorderCategoryItems = useCallback(
    async (orderedIds: { id: string; sortOrder: number }[]) => {
      await Promise.all(
        orderedIds.map(({ id, sortOrder }) =>
          apiFetch(`/api/budget/category-item/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ sortOrder }),
          })
        )
      );
      invalidate();
    },
    [invalidate]
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

  const setCategoryTarget = useCallback(
    async (id: string, target: Target | null) => {
      await apiFetch(`/api/budget/category-item/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ target }),
      });
      invalidate();
    },
    [invalidate]
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

      // Snapshot for undo
      importedAccountIdsRef.current = [];
      importedCategoryGroupIdsRef.current = [];

      // Save Teller enrollments so they can be re-linked after import
      const { data: enrollmentData } = await supabase
        .from("teller_enrollments")
        .select("account_id, teller_account_id, access_token, enrollment_id, institution_name, teller_account_type, last_teller_transaction_id")
        .eq("user_id", user.id);

      type SavedEnrollment = { accountName: string; tellerAccountId: string; accessToken: string; enrollmentId: string; institutionName: string; tellerAccountType: string; lastTellerTransactionId: string | null };
      const savedEnrollments: SavedEnrollment[] = [];

      if (enrollmentData && enrollmentData.length > 0) {
        const accountIds = enrollmentData.map((e) => e.account_id as string);
        const { data: accountNameData } = await supabase.from("accounts").select("id, name").in("id", accountIds);
        const nameById = new Map((accountNameData ?? []).map((a) => [a.id as string, a.name as string]));
        for (const e of enrollmentData) {
          const name = nameById.get(e.account_id as string);
          if (!name) continue;
          savedEnrollments.push({ accountName: name.toLowerCase(), tellerAccountId: e.teller_account_id as string, accessToken: e.access_token as string, enrollmentId: e.enrollment_id as string, institutionName: e.institution_name as string, tellerAccountType: e.teller_account_type as string, lastTellerTransactionId: e.last_teller_transaction_id as string | null });
        }
      }

      // Delete existing data (cascades to transactions, items, assignments)
      await supabase.from("accounts").delete().eq("user_id", user.id);
      await supabase.from("category_groups").delete().eq("user_id", user.id);

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
          .insert({ user_id: user.id, name: groupName, sort_order: i })
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
            .insert({ user_id: user.id, group_id: groupId, name: itemName, sort_order: j, snoozed: meta.snoozed ?? false, target: meta.target ?? null, notes: meta.notes ?? null, notes_history: meta.notes_history ?? null })
            .select("id")
            .single();
          if (itemError || !item) throw new Error(`Failed to create category item '${itemName}': ${itemError?.message ?? "unknown"}`);
          itemKeyToId.set(`${groupName}::${itemName}`, item.id);
        }
      }

      // Phase 3: insert transactions now that category_item_id can be resolved
      const txPayloadAll = pendingTransactions.map(({ accountId, accountName, tx }) => ({
        user_id: user.id,
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
      const assignmentRows: { user_id: string; category_item_id: string; month: string; assigned: number }[] = [];
      for (const [month, monthData] of Object.entries(planParsed.budgetData)) {
        for (const cat of monthData.categories || []) {
          for (const item of cat.categoryItems || []) {
            if (!item.assigned) continue;
            const itemId = itemKeyToId.get(`${cat.name}::${item.name}`);
            if (!itemId) continue;
            assignmentRows.push({ user_id: user.id, category_item_id: itemId, month, assigned: item.assigned });
          }
        }
      }

      for (const chunk of chunkArray(assignmentRows, 100)) {
        const { error: assignError } = await supabase
          .from("budget_assignments")
          .upsert(chunk, { onConflict: "user_id,category_item_id,month" });
        if (assignError) throw new Error(`Failed to import assignments: ${assignError.message}`);
      }

      // Update accounts in context
      const { data: refreshedAccounts } = await supabase
        .from("accounts")
        .select("*, transactions(*)")
        .order("date", { foreignTable: "transactions", ascending: true });
      if (refreshedAccounts) setAccounts(refreshedAccounts as Account[]);

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
        preservedEnrollments: savedEnrollments,
      };
    },
    [user?.id, clearHistory, setAccounts, hookInvalidate]
  );

  const confirmImport = useCallback(async () => {
    if (!importPending) return;
    setImportPending(false);
    importedAccountIdsRef.current = [];
    importedCategoryGroupIdsRef.current = [];
  }, [importPending]);

  const undoImport = useCallback(async () => {
    if (!importPending || !user?.id) return;
    // The import wiped all existing accounts and category groups before creating new ones,
    // so undo can safely delete all of them — nothing pre-import needs to be preserved.
    await supabase.from("accounts").delete().eq("user_id", user.id);
    await supabase.from("category_groups").delete().eq("user_id", user.id);
    setImportPending(false);
    importedAccountIdsRef.current = [];
    importedCategoryGroupIdsRef.current = [];
    invalidateAllCachedMonths();
    setMutationView(null);
  }, [importPending, user?.id]);

  // ---------------------------------------------------------------------------
  // Sandbox mode
  // ---------------------------------------------------------------------------

  const enterSandbox = useCallback(() => {
    if (sandboxMode) return;
    sandboxBaselineRef.current = budgetView;
    setSandboxMode(true);
    clearHistory();
  }, [sandboxMode, budgetView, clearHistory]);

  const exitSandbox = useCallback(() => {
    if (!sandboxMode) return;
    sandboxBaselineRef.current = null;
    setSandboxMode(false);
    clearHistory();
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
      if (month === currentMonth) return budgetView?.ready_to_assign ?? 0;
      return 0; // other months not loaded; component should use budgetView directly
    },
    [currentMonth, budgetView]
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
        setCategorySnooze,
        setCategoryTarget,
        updateCategoryGroupNote,
        updateCategoryItemNote,
        invalidate,
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
