const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userId = process.env.ADMIN_USER_IDS;
const oldBudgetId = "1afba404-4d9a-4b5b-b8cb-37ed3547ccea";
const AUG1 = "2026-08-01";

async function main() {
  // 1. Archive old budget, create new one
  const { error: archiveErr } = await supabase
    .from("budgets")
    .update({ name: "Chicago (through July)", archived_at: new Date().toISOString() })
    .eq("id", oldBudgetId).eq("user_id", userId);
  if (archiveErr) throw archiveErr;

  const { data: newBudget, error: newBudgetErr } = await supabase
    .from("budgets")
    .insert({ user_id: userId, name: "My Budget", archived_at: null })
    .select("id").single();
  if (newBudgetErr) throw newBudgetErr;
  const newBudgetId = newBudget.id;
  console.log("New budget:", newBudgetId);

  // 2. Copy category structure
  const { data: oldGroups } = await supabase.from("category_groups").select("id, name, sort_order").eq("user_id", userId).eq("budget_id", oldBudgetId).order("sort_order");
  const groupIdMap = new Map();
  for (const g of oldGroups) {
    const { data: ng, error } = await supabase.from("category_groups").insert({ user_id: userId, budget_id: newBudgetId, name: g.name, sort_order: g.sort_order }).select("id").single();
    if (error) throw error;
    groupIdMap.set(g.id, ng.id);
  }

  const { data: oldItems } = await supabase.from("category_items")
    .select("id, group_id, name, sort_order, snoozed, target, notes, notes_history, is_discretionary_pool, hide_from_insights, discretionary_target")
    .eq("user_id", userId).eq("budget_id", oldBudgetId);
  const itemIdMap = new Map();
  for (const it of oldItems) {
    const { data: ni, error } = await supabase.from("category_items").insert({
      user_id: userId, budget_id: newBudgetId, group_id: groupIdMap.get(it.group_id),
      name: it.name, sort_order: it.sort_order, snoozed: it.snoozed, target: it.target,
      notes: it.notes, notes_history: it.notes_history, is_discretionary_pool: it.is_discretionary_pool,
      hide_from_insights: it.hide_from_insights, discretionary_target: it.discretionary_target,
    }).select("id").single();
    if (error) throw error;
    itemIdMap.set(it.id, ni.id);
  }
  console.log(`Copied ${groupIdMap.size} groups, ${itemIdMap.size} items`);

  // 3. Copy August budget_assignments (current month's planning)
  const { data: augAssignments } = await supabase.from("budget_assignments")
    .select("category_item_id, month, assigned")
    .eq("user_id", userId).eq("budget_id", oldBudgetId).eq("month", "2026-08");
  const newAssignmentRows = augAssignments
    .filter(a => itemIdMap.has(a.category_item_id))
    .map(a => ({ user_id: userId, budget_id: newBudgetId, category_item_id: itemIdMap.get(a.category_item_id), month: a.month, assigned: a.assigned }));
  if (newAssignmentRows.length > 0) {
    const { error } = await supabase.from("budget_assignments").insert(newAssignmentRows);
    if (error) throw error;
  }
  console.log(`Copied ${newAssignmentRows.length} August assignments`);

  // 4. Seed Starting Balance = balance through 7/31 (not today), per account
  const { data: accounts } = await supabase.from("accounts").select("id, name, type").eq("user_id", userId);
  for (const acc of accounts) {
    const { data: through731 } = await supabase.from("transactions").select("balance").eq("account_id", acc.id).eq("budget_id", oldBudgetId).lte("date", "2026-07-31");
    const aug1Balance = (through731 ?? []).reduce((s, t) => s + Number(t.balance), 0);
    if (Math.abs(aug1Balance) < 0.005) continue;
    const isCredit = acc.type === "credit";
    const { error } = await supabase.from("transactions").insert({
      user_id: userId, budget_id: newBudgetId, account_id: acc.id,
      date: "2026-08-01", payee: "Starting Balance",
      category: isCredit ? "Category Not Needed" : "Ready to Assign",
      category_group: isCredit ? null : "Ready to Assign",
      balance: aug1Balance, cleared: true, approved: true, pending: false,
    });
    if (error) throw error;
    console.log(`Seeded ${acc.name} Starting Balance: ${aug1Balance.toFixed(2)}`);
  }

  // 5. Copy every August 1+ transaction, remapping category_item_id
  const { data: augTx } = await supabase.from("transactions")
    .select("account_id, date, payee, category, category_group, category_item_id, balance, cleared, approved, pending, simplefin_transaction_id")
    .eq("user_id", userId).eq("budget_id", oldBudgetId).gte("date", AUG1)
    .order("date");
  const newTxRows = augTx.map(t => ({
    user_id: userId, budget_id: newBudgetId, account_id: t.account_id,
    date: t.date, payee: t.payee, category: t.category, category_group: t.category_group,
    category_item_id: t.category_item_id ? (itemIdMap.get(t.category_item_id) ?? null) : null,
    balance: t.balance, cleared: t.cleared, approved: t.approved, pending: t.pending ?? false,
    simplefin_transaction_id: t.simplefin_transaction_id,
  }));
  if (newTxRows.length > 0) {
    const { error } = await supabase.from("transactions").insert(newTxRows);
    if (error) throw error;
  }
  console.log(`Copied ${newTxRows.length} August transactions`);

  // 6. Reset SimpleFin sync watermark so next sync only pulls forward
  const { error: linkErr } = await supabase.from("simplefin_account_links").update({ last_synced_at: new Date().toISOString() }).eq("user_id", userId);
  if (linkErr) console.error("link reset error:", linkErr);

  console.log("\nDone. New budget id:", newBudgetId);
}
main().then(() => process.exit(0)).catch(e => { console.error("MIGRATION FAILED:", e); process.exit(1); });
