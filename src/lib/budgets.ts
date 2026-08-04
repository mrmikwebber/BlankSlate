// Resolves a user's current (non-archived) budget, creating one lazily on
// first access if none exists yet — this codebase has no signup-provisioning
// hook, so this is the one guaranteed place every user ends up with a budget.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentBudgetId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  // No current budget yet — create one. Race-safe: the partial unique index
  // (budgets(user_id) WHERE archived_at IS NULL) means a concurrent request
  // creating the same user's first budget loses the insert, not both ending
  // up with two "current" budgets.
  const { data: inserted, error: insertError } = await supabase
    .from("budgets")
    .insert({ user_id: userId, name: "My Budget", archived_at: null })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted) return inserted.id;

  // Lost the race — a concurrent request already created it, re-select.
  const { data: afterConflict, error: reselectError } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .single();

  if (reselectError || !afterConflict) {
    throw insertError ?? reselectError ?? new Error("Failed to resolve current budget");
  }
  return afterConflict.id;
}
