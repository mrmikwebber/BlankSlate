import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { serializeMonthView } from "../../../../../lib/budgetMath";
import type { AssignRequest } from "@/types/budget";

export async function PATCH(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AssignRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { month, categoryItemId, assigned } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — expected YYYY-MM" }, { status: 400 });
  }
  if (!categoryItemId) {
    return NextResponse.json({ error: "categoryItemId is required" }, { status: 400 });
  }
  if (typeof assigned !== "number") {
    return NextResponse.json({ error: "assigned must be a number" }, { status: 400 });
  }

  // Verify the category item belongs to this user
  const { data: item, error: itemError } = await supabase
    .from("category_items")
    .select("id")
    .eq("id", categoryItemId)
    .eq("user_id", user.id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: "Category item not found" }, { status: 404 });
  }

  // Upsert the assignment
  const { error: upsertError } = await supabase
    .from("budget_assignments")
    .upsert(
      {
        user_id: user.id,
        category_item_id: categoryItemId,
        month,
        assigned,
      },
      { onConflict: "user_id,category_item_id,month" }
    );

  if (upsertError) {
    console.error("[budget/assign] upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to save assignment" }, { status: 500 });
  }

  try {
    const state = await loadBudgetState(supabase, user.id);
    const view = serializeMonthView(state, month);
    return NextResponse.json(view);
  } catch (err) {
    console.error("[budget/assign] compute error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
