import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentBudgetId } from "@/lib/budgets";

// Lists a user's budgets — current one first, then most-recently-archived.
// Also guarantees a current budget exists (lazy-creates one on first access).
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  const { data, error } = await supabase
    .from("budgets")
    .select("id, name, archived_at, created_at")
    .eq("user_id", user.id)
    .order("archived_at", { ascending: false, nullsFirst: true });

  if (error) {
    console.error("[budgets] GET error:", error);
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
  }

  return NextResponse.json({ budgets: data ?? [], currentBudgetId });
}
