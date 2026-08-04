// Bulk recomputation endpoint — called after YNAB import.
// Loads all source-of-truth data, runs computeBudgetState, and serializes
// each requested month (or all months). Returns a summary.

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { getCurrentBudgetId } from "@/lib/budgets";
import { serializeMonthView } from "../../../../../lib/budgetMath";
import type { RecomputeRequest } from "@/types/budget";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RecomputeRequest = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — empty body means recompute all months
  }

  try {
    const budgetId = await getCurrentBudgetId(supabase, user.id);
    const state = await loadBudgetState(supabase, user.id, budgetId);

    const allMonths = [...state.months.keys()].sort();
    const targetMonths =
      body.months && body.months.length > 0
        ? body.months.filter((m) => /^\d{4}-\d{2}$/.test(m))
        : allMonths;

    const views = targetMonths.map((month) => serializeMonthView(state, month));

    return NextResponse.json({
      recomputed: targetMonths,
      monthCount: targetMonths.length,
      views,
    });
  } catch (err) {
    console.error("[budget/recompute] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
