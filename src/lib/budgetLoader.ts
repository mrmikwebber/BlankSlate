// Shared server-side data loader for budget computation.
// Used by all /api/budget/* routes to load source-of-truth data and
// produce a BudgetState via computeBudgetState().

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBudgetState,
  normalizeTransactions,
  type RawDbTransaction,
} from "../../lib/budgetMath";
import type {
  AccountMeta,
  AssignmentRecord,
  BudgetState,
  BudgetStateInput,
  CategoryGroupMeta,
  CategoryItemMeta,
  GlobalAssignmentRecord,
  PlannedIncomeRecord,
} from "../types/budget";

export async function loadBudgetState(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string
): Promise<BudgetState> {
  const [
    accountsResult,
    transactionsResult,
    groupsResult,
    itemsResult,
    assignmentsResult,
    globalAssignmentsResult,
    plannedIncomeResult,
  ] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, issuer")
        .eq("user_id", userId),

      supabase
        .from("transactions")
        .select(
          "id, account_id, date, payee, category, category_group, balance, category_item_id, cleared, approved"
        )
        .eq("user_id", userId)
        .eq("budget_id", budgetId)
        .order("date", { ascending: true }),

      supabase
        .from("category_groups")
        .select("id, name, sort_order")
        .eq("user_id", userId)
        .eq("budget_id", budgetId)
        .order("sort_order", { ascending: true }),

      supabase
        .from("category_items")
        .select(
          "id, group_id, name, sort_order, snoozed, target, notes, notes_history, is_discretionary_pool, hide_from_insights"
        )
        .eq("user_id", userId)
        .eq("budget_id", budgetId)
        .order("sort_order", { ascending: true }),

      supabase
        .from("budget_assignments")
        .select("category_item_id, month, assigned")
        .eq("user_id", userId)
        .eq("budget_id", budgetId),

      supabase
        .from("global_assignments")
        .select("category_item_id, month, assigned")
        .eq("user_id", userId)
        .eq("budget_id", budgetId),

      supabase
        .from("planned_income")
        .select("month, amount")
        .eq("user_id", userId)
        .eq("budget_id", budgetId),
    ]);

  if (accountsResult.error) throw accountsResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (globalAssignmentsResult.error) throw globalAssignmentsResult.error;
  if (plannedIncomeResult.error) throw plannedIncomeResult.error;

  const accounts: AccountMeta[] = (accountsResult.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as "debit" | "credit",
    issuer: a.issuer ?? undefined,
  }));

  const rawTransactions = (transactionsResult.data ?? []) as RawDbTransaction[];
  const normalizedTx = normalizeTransactions(rawTransactions, accounts);

  // Group items by their group_id
  const itemsByGroup = new Map<string, CategoryItemMeta[]>();
  for (const item of itemsResult.data ?? []) {
    if (!itemsByGroup.has(item.group_id)) itemsByGroup.set(item.group_id, []);
    itemsByGroup.get(item.group_id)!.push({
      id: item.id,
      groupId: item.group_id,
      name: item.name,
      sortOrder: item.sort_order,
      snoozed: item.snoozed ?? false,
      target: item.target ?? undefined,
      notes: item.notes ?? undefined,
      notes_history: item.notes_history ?? undefined,
      isDiscretionaryPool: item.is_discretionary_pool ?? false,
      isHiddenFromInsights: item.hide_from_insights ?? false,
    });
  }

  const categoryGroups: CategoryGroupMeta[] = (groupsResult.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    sortOrder: g.sort_order,
    notes: undefined,
    notes_history: undefined,
    items: itemsByGroup.get(g.id) ?? [],
  }));

  const assignments: AssignmentRecord[] = (assignmentsResult.data ?? []).map((a) => ({
    categoryItemId: a.category_item_id,
    month: a.month,
    assigned: a.assigned,
  }));

  const globalAssignments: GlobalAssignmentRecord[] = (globalAssignmentsResult.data ?? []).map((a) => ({
    categoryItemId: a.category_item_id,
    month: a.month,
    assigned: a.assigned,
  }));

  const plannedIncome: PlannedIncomeRecord[] = (plannedIncomeResult.data ?? []).map((p) => ({
    month: p.month,
    amount: p.amount,
  }));

  const input: BudgetStateInput = {
    userId,
    accounts,
    transactions: normalizedTx,
    assignments,
    categoryGroups,
    globalAssignments,
    plannedIncome,
  };

  return computeBudgetState(input);
}
