import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { format, parseISO } from "date-fns";
import { getCurrentBudgetId } from "@/lib/budgets";

function formatAmount(value: number): string {
  return `$${Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(",");
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const budgetId = await getCurrentBudgetId(supabase, user.id);

    const [txResult, accountResult, itemResult, groupResult] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, date, payee, category, category_group, balance, category_item_id, cleared, approved")
        .eq("user_id", user.id)
        .eq("budget_id", budgetId)
        .order("date", { ascending: false }),
      supabase.from("accounts").select("id, name").eq("user_id", user.id),
      supabase.from("category_items").select("id, name, group_id").eq("user_id", user.id).eq("budget_id", budgetId),
      supabase.from("category_groups").select("id, name").eq("user_id", user.id).eq("budget_id", budgetId),
    ]);

    if (txResult.error) throw txResult.error;
    if (accountResult.error) throw accountResult.error;
    if (itemResult.error) throw itemResult.error;
    if (groupResult.error) throw groupResult.error;

    const accountById = new Map((accountResult.data ?? []).map((a) => [a.id as string, a.name as string]));
    const groupById = new Map((groupResult.data ?? []).map((g) => [g.id as string, g.name as string]));
    const itemById = new Map((itemResult.data ?? []).map((i) => [i.id as string, { name: i.name as string, groupId: i.group_id as string }]));

    const rows: string[] = [
      csvRow(["Account", "Flag", "Date", "Payee", "Category Group/Category", "Category Group", "Category", "Memo", "Outflow", "Inflow", "Cleared"]),
    ];

    for (const tx of txResult.data ?? []) {
      const accountName = accountById.get(tx.account_id as string) ?? "";
      const balance = tx.balance as number;

      // Resolve category names — prefer FK lookup, fall back to text columns
      let categoryGroup = tx.category_group as string ?? "";
      let category = tx.category as string ?? "";

      if (tx.category_item_id) {
        const item = itemById.get(tx.category_item_id as string);
        if (item) {
          category = item.name;
          categoryGroup = groupById.get(item.groupId) ?? categoryGroup;
        }
      }

      const categoryGroupCategory = category ? `${categoryGroup}: ${category}` : "";
      const outflow = balance < 0 ? formatAmount(balance) : "$0.00";
      const inflow = balance > 0 ? formatAmount(balance) : "$0.00";
      const dateStr = tx.date ? format(parseISO(tx.date as string), "MM/dd/yyyy") : "";
      const cleared = tx.cleared ? "Cleared" : "Uncleared";

      rows.push(csvRow([
        accountName,
        "",
        dateStr,
        tx.payee as string ?? "",
        categoryGroupCategory,
        categoryGroup,
        category,
        "",
        outflow,
        inflow,
        cleared,
      ]));
    }

    const csv = rows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="blankslate-register-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      },
    });
  } catch (err) {
    console.error("[export/register] error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
