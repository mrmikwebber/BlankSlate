import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { getCurrentBudgetId } from "@/lib/budgets";
import { serializeMonthView, readTodayMonthParam } from "../../../../../lib/budgetMath";
import type { PlannedIncomeRequest } from "@/types/budget";

export async function PATCH(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PlannedIncomeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { month, amount } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — expected YYYY-MM" }, { status: 400 });
  }
  if (typeof amount !== "number") {
    return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  const { error: upsertError } = await supabase
    .from("planned_income")
    .upsert(
      {
        user_id: user.id,
        budget_id: currentBudgetId,
        month,
        amount,
      },
      { onConflict: "user_id,budget_id,month" }
    );

  if (upsertError) {
    console.error("[budget/planned-income] upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to save planned income" }, { status: 500 });
  }

  try {
    const state = await loadBudgetState(supabase, user.id, currentBudgetId);
    const view = serializeMonthView(state, month, readTodayMonthParam(req));
    return NextResponse.json(view);
  } catch (err) {
    console.error("[budget/planned-income] compute error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
