import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { loadBudgetState } from "@/lib/budgetLoader";
import { serializeMonthView } from "../../../../../../lib/budgetMath";

// Read-only snapshot of a (usually archived) budget: its month-by-month
// category breakdown plus each account's register, for browsing at
// /archived/[budgetId]. No mutation surface — this route is GET-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: budgetId } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: budget, error: budgetError } = await supabase
    .from("budgets")
    .select("id, name, archived_at, created_at")
    .eq("id", budgetId)
    .eq("user_id", user.id)
    .single();

  if (budgetError || !budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  const [{ data: txMonths }, { data: assignmentMonths }, { data: accounts }, { data: transactions }] =
    await Promise.all([
      supabase.from("transactions").select("date").eq("user_id", user.id).eq("budget_id", budgetId),
      supabase.from("budget_assignments").select("month").eq("user_id", user.id).eq("budget_id", budgetId),
      supabase.from("accounts").select("id, name, type").eq("user_id", user.id),
      supabase
        .from("transactions")
        .select("id, account_id, date, payee, category, category_group, balance, cleared")
        .eq("user_id", user.id)
        .eq("budget_id", budgetId)
        .order("date", { ascending: true }),
    ]);

  // Real months this budget actually had activity in — not the calc
  // engine's padded 24-month-forward horizon.
  const realMonths = new Set<string>();
  for (const tx of txMonths ?? []) realMonths.add((tx.date as string).slice(0, 7));
  for (const a of assignmentMonths ?? []) realMonths.add(a.month as string);
  const months = [...realMonths].sort();

  const state = await loadBudgetState(supabase, user.id, budgetId);
  const monthViews = months.map((month) => serializeMonthView(state, month));

  const txByAccount = new Map<string, unknown[]>();
  for (const tx of transactions ?? []) {
    const key = String(tx.account_id);
    if (!txByAccount.has(key)) txByAccount.set(key, []);
    txByAccount.get(key)!.push(tx);
  }
  const accountsWithRegister = (accounts ?? []).map((a) => ({
    ...a,
    transactions: txByAccount.get(String(a.id)) ?? [],
    balance: (txByAccount.get(String(a.id)) ?? []).reduce(
      (sum: number, t) => sum + (t as { balance: number }).balance,
      0
    ),
  }));

  return NextResponse.json({
    budget,
    months: monthViews,
    accounts: accountsWithRegister,
  });
}
