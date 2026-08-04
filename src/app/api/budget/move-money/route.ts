import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { getCurrentBudgetId } from "@/lib/budgets";
import { serializeMonthView } from "../../../../../lib/budgetMath";
import type { MoveMoneRequest } from "@/types/budget";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MoveMoneRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { month, sourceItemId, destinationItemId, amount } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — expected YYYY-MM" }, { status: 400 });
  }
  if (!sourceItemId || !destinationItemId) {
    return NextResponse.json({ error: "sourceItemId and destinationItemId are required" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  // Fetch current assignments for both items
  const { data: existingAssignments } = await supabase
    .from("budget_assignments")
    .select("category_item_id, assigned")
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId)
    .eq("month", month)
    .in("category_item_id", [sourceItemId, destinationItemId]);

  const assignmentMap = new Map(
    (existingAssignments ?? []).map((a) => [a.category_item_id, a.assigned])
  );

  const sourceAssigned = (assignmentMap.get(sourceItemId) ?? 0) - amount;
  const destAssigned = (assignmentMap.get(destinationItemId) ?? 0) + amount;

  const { error: upsertError } = await supabase
    .from("budget_assignments")
    .upsert(
      [
        { user_id: user.id, budget_id: currentBudgetId, category_item_id: sourceItemId, month, assigned: sourceAssigned },
        { user_id: user.id, budget_id: currentBudgetId, category_item_id: destinationItemId, month, assigned: destAssigned },
      ],
      { onConflict: "user_id,category_item_id,month" }
    );

  if (upsertError) {
    console.error("[budget/move-money] upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to move money" }, { status: 500 });
  }

  try {
    const state = await loadBudgetState(supabase, user.id, currentBudgetId);
    const view = serializeMonthView(state, month);
    return NextResponse.json(view);
  } catch (err) {
    console.error("[budget/move-money] compute error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
