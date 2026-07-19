import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { serializeMonthView } from "../../../../../../lib/budgetMath";

const DEBUG_BUDGET_TABLE = process.env.NEXT_PUBLIC_DEBUG_BUDGET_TABLE === "true";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — expected YYYY-MM" }, { status: 400 });
  }

  try {
    const state = await loadBudgetState(supabase, user.id);
    const view = serializeMonthView(state, month);

    if (DEBUG_BUDGET_TABLE) {
      const ms = state.months.get(month);
      const txWithItemId = (state as unknown as { _rawTxCount?: number });
      const totalItems = state.categoryGroups.reduce((sum, g) => sum + g.items.length, 0);
      const totalAssigned = view.categories
        .flatMap((g) => g.categoryItems)
        .reduce((sum, i) => sum + i.assigned, 0);
      const totalActivity = view.categories
        .flatMap((g) => g.categoryItems)
        .reduce((sum, i) => sum + i.activity, 0);

      console.log("[budget/month]", {
        month,
        monthsInState: state.months.size,
        hasMonth: state.months.has(month),
        groups: view.categories.length,
        totalItems,
        totalAssigned,
        totalActivity,
        readyToAssign: view.ready_to_assign,
        rtaCarry: view.rta_carry,
        itemsWithActivity: view.categories.flatMap((g) => g.categoryItems).filter((i) => i.activity !== 0).length,
        zeroActivityItems: view.categories.flatMap((g) => g.categoryItems).filter((i) => i.activity === 0 && i.assigned === 0).length,
      });

      // Per-group summary
      for (const g of view.categories) {
        const gAssigned = g.categoryItems.reduce((s, i) => s + i.assigned, 0);
        const gActivity = g.categoryItems.reduce((s, i) => s + i.activity, 0);
        if (gAssigned !== 0 || gActivity !== 0) {
          console.log(`  [group] ${g.name}: assigned=${gAssigned.toFixed(2)} activity=${gActivity.toFixed(2)}`);
        }
      }
    }

    return NextResponse.json(view);
  } catch (err) {
    console.error("[budget/month] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
