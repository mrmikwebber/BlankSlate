import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { serializeMonthView } from "../../../../../lib/budgetMath";
import { format, parse } from "date-fns";

function formatAmount(value: number): string {
  const abs = Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

function monthLabel(yyyyMM: string): string {
  return format(parse(yyyyMM, "yyyy-MM", new Date()), "MMM yyyy");
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(",");
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const state = await loadBudgetState(supabase, user.id);
    const months = [...state.months.keys()].sort();

    const rows: string[] = [
      csvRow(["Month", "Category Group/Category", "Category Group", "Category", "Assigned", "Activity", "Available"]),
    ];

    for (const month of months) {
      const view = serializeMonthView(state, month);
      const label = monthLabel(month);

      for (const group of view.categories) {
        for (const item of group.categoryItems) {
          rows.push(csvRow([
            label,
            `${group.name}: ${item.name}`,
            group.name,
            item.name,
            formatAmount(item.assigned),
            formatAmount(item.activity),
            formatAmount(item.available),
          ]));
        }
      }
    }

    const csv = rows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="blankslate-plan-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      },
    });
  } catch (err) {
    console.error("[export/plan] error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
