import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentBudgetId } from "@/lib/budgets";
import { pullCurrentBalances, SimplefinSyncError } from "@/lib/simplefinSync";

interface FreshStartRequest {
  archivedBudgetName?: string;
}

// "Fresh Start": archive the current budget under a chosen name, create a
// genuinely new one, copy category *structure* (not money) into it, and seed
// each account's opening balance in the new budget — via a real SimpleFin
// balance pull for linked accounts, or carried forward from the old budget's
// derived balance for manual ones. Nothing is deleted; the archived budget
// stays fully intact and browsable at /archived/[budgetId].
export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FreshStartRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const archivedBudgetName = body.archivedBudgetName?.trim();
  if (!archivedBudgetName) {
    return NextResponse.json({ error: "archivedBudgetName is required" }, { status: 400 });
  }

  const oldBudgetId = await getCurrentBudgetId(supabase, user.id);

  const { error: archiveError } = await supabase
    .from("budgets")
    .update({ name: archivedBudgetName, archived_at: new Date().toISOString() })
    .eq("id", oldBudgetId)
    .eq("user_id", user.id);

  if (archiveError) {
    console.error("[budget/fresh-start] archive error:", archiveError);
    return NextResponse.json({ error: "Failed to archive current budget" }, { status: 500 });
  }

  const { data: newBudget, error: newBudgetError } = await supabase
    .from("budgets")
    .insert({ user_id: user.id, name: "New Budget", archived_at: null })
    .select("id")
    .single();

  if (newBudgetError || !newBudget) {
    console.error("[budget/fresh-start] new budget insert error:", newBudgetError);
    return NextResponse.json({ error: "Failed to create new budget" }, { status: 500 });
  }
  const newBudgetId = newBudget.id as string;

  // --- Copy category structure (groups/items), not money ---
  const { data: oldGroups, error: groupsError } = await supabase
    .from("category_groups")
    .select("id, name, sort_order")
    .eq("user_id", user.id)
    .eq("budget_id", oldBudgetId)
    .order("sort_order", { ascending: true });

  if (groupsError) {
    console.error("[budget/fresh-start] groups fetch error:", groupsError);
    return NextResponse.json({ error: "Failed to load category groups" }, { status: 500 });
  }

  const groupIdMap = new Map<string, string>(); // old group id -> new group id
  for (const group of oldGroups ?? []) {
    const { data: newGroup, error: newGroupError } = await supabase
      .from("category_groups")
      .insert({ user_id: user.id, budget_id: newBudgetId, name: group.name, sort_order: group.sort_order })
      .select("id")
      .single();
    if (newGroupError || !newGroup) {
      console.error("[budget/fresh-start] group copy error:", newGroupError);
      return NextResponse.json({ error: "Failed to copy category groups" }, { status: 500 });
    }
    groupIdMap.set(group.id, newGroup.id);
  }

  if (groupIdMap.size > 0) {
    const { data: oldItems, error: itemsError } = await supabase
      .from("category_items")
      .select(
        "group_id, name, sort_order, snoozed, target, notes, notes_history, is_discretionary_pool, hide_from_insights, discretionary_target"
      )
      .eq("user_id", user.id)
      .eq("budget_id", oldBudgetId)
      .in("group_id", [...groupIdMap.keys()])
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error("[budget/fresh-start] items fetch error:", itemsError);
      return NextResponse.json({ error: "Failed to load category items" }, { status: 500 });
    }

    if (oldItems && oldItems.length > 0) {
      const newItemRows = oldItems.map((item) => ({
        user_id: user.id,
        budget_id: newBudgetId,
        group_id: groupIdMap.get(item.group_id)!,
        name: item.name,
        sort_order: item.sort_order,
        snoozed: item.snoozed,
        target: item.target,
        notes: item.notes,
        notes_history: item.notes_history,
        is_discretionary_pool: item.is_discretionary_pool,
        hide_from_insights: item.hide_from_insights,
        discretionary_target: item.discretionary_target,
      }));
      const { error: itemsInsertError } = await supabase.from("category_items").insert(newItemRows);
      if (itemsInsertError) {
        console.error("[budget/fresh-start] items copy error:", itemsInsertError);
        return NextResponse.json({ error: "Failed to copy category items" }, { status: 500 });
      }
    }
  }

  // --- Seed opening balances into the new budget ---
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("user_id", user.id);

  if (accountsError) {
    console.error("[budget/fresh-start] accounts fetch error:", accountsError);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }

  const { data: oldTx, error: oldTxError } = await supabase
    .from("transactions")
    .select("account_id, balance")
    .eq("user_id", user.id)
    .eq("budget_id", oldBudgetId);

  if (oldTxError) {
    console.error("[budget/fresh-start] old transactions fetch error:", oldTxError);
    return NextResponse.json({ error: "Failed to load old budget transactions" }, { status: 500 });
  }

  const derivedBalanceByAccount = new Map<string, number>();
  for (const tx of oldTx ?? []) {
    derivedBalanceByAccount.set(
      tx.account_id,
      (derivedBalanceByAccount.get(tx.account_id) ?? 0) + tx.balance
    );
  }

  let pulls: Awaited<ReturnType<typeof pullCurrentBalances>> = [];
  try {
    pulls = await pullCurrentBalances(supabase, user.id);
  } catch (err) {
    const skippable =
      err instanceof SimplefinSyncError && (err.code === "no_connection" || err.code === "no_links");
    if (!skippable) {
      console.error("[budget/fresh-start] balance pull failed:", err);
      return NextResponse.json({ error: "Failed to pull balances from SimpleFin" }, { status: 502 });
    }
  }
  const pullByAccountId = new Map(pulls.map((p) => [p.blankslateAccountId, p]));

  const seeded: Array<{ accountId: string; accountName: string; balance: number; source: "simplefin" | "manual" }> = [];
  const skipped: Array<{ accountId: string; accountName: string }> = [];

  for (const account of accounts ?? []) {
    const pull = pullByAccountId.get(String(account.id));
    const balance = pull ? pull.currentTrueBalance : derivedBalanceByAccount.get(account.id) ?? 0;

    if (Math.abs(balance) < 0.005) {
      skipped.push({ accountId: account.id, accountName: account.name });
      continue;
    }

    const isCredit = account.type === "credit";
    const { error: startingBalanceError } = await supabase.from("transactions").insert({
      user_id: user.id,
      budget_id: newBudgetId,
      account_id: account.id,
      date: new Date().toISOString(),
      payee: "Starting Balance",
      category: isCredit ? "Category Not Needed" : "Ready to Assign",
      category_group: isCredit ? null : "Ready to Assign",
      balance,
    });

    if (startingBalanceError) {
      console.error("[budget/fresh-start] starting balance insert error:", startingBalanceError);
      return NextResponse.json({ error: "Failed to seed account balances" }, { status: 500 });
    }

    seeded.push({
      accountId: account.id,
      accountName: account.name,
      balance,
      source: pull ? "simplefin" : "manual",
    });
  }

  // SimpleFin-linked accounts: next sync should only pull forward from today.
  const { error: linksResetError } = await supabase
    .from("simplefin_account_links")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (linksResetError) {
    console.error("[budget/fresh-start] link last_synced_at reset error:", linksResetError);
  }

  return NextResponse.json({
    archivedBudgetId: oldBudgetId,
    newBudgetId,
    seeded,
    skipped,
  });
}
