import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { fetchSimplefinAccounts } from "@/lib/simplefin";

const DEFAULT_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection, error: connectionError } = await supabase
    .from("simplefin_connections")
    .select("id, access_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "No SimpleFin connection found" }, { status: 404 });
  }

  const { data: links, error: linksError } = await supabase
    .from("simplefin_account_links")
    .select("id, simplefin_account_id, blankslate_account_id, last_synced_at")
    .eq("user_id", user.id)
    .not("blankslate_account_id", "is", null);

  if (linksError) {
    console.error("[simplefin/sync] links fetch error:", linksError);
    return NextResponse.json({ error: "Failed to load linked accounts" }, { status: 500 });
  }

  if (!links || links.length === 0) {
    return NextResponse.json({ error: "No accounts linked" }, { status: 400 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const startDate = links.reduce((earliest, link) => {
    const linkStart = link.last_synced_at
      ? Math.floor(new Date(link.last_synced_at).getTime() / 1000)
      : nowSeconds - DEFAULT_LOOKBACK_SECONDS;
    return Math.min(earliest, linkStart);
  }, nowSeconds);

  let simplefinAccounts;
  try {
    simplefinAccounts = await fetchSimplefinAccounts(connection.access_url, {
      accountIds: links.map((l) => l.simplefin_account_id),
      startDate,
    });
  } catch (err) {
    console.error("[simplefin/sync] fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch data from SimpleFin" }, { status: 502 });
  }

  const { data: tombstoned } = await supabase
    .from("deleted_simplefin_transactions")
    .select("simplefin_transaction_id")
    .eq("user_id", user.id);
  const tombstonedIds = new Set((tombstoned ?? []).map((t) => t.simplefin_transaction_id));

  const rows: Array<{
    user_id: string;
    account_id: string;
    date: string;
    payee: string;
    category: null;
    category_group: null;
    category_item_id: null;
    balance: number;
    cleared: boolean;
    approved: boolean;
    simplefin_transaction_id: string;
  }> = [];

  let accountsSynced = 0;

  for (const link of links) {
    const account = simplefinAccounts.find((a) => a.id === link.simplefin_account_id);
    if (!account) continue;
    accountsSynced += 1;

    for (const tx of account.transactions ?? []) {
      if (tombstonedIds.has(tx.id)) continue;
      rows.push({
        user_id: user.id,
        account_id: String(link.blankslate_account_id),
        date: new Date(tx.posted * 1000).toISOString().slice(0, 10),
        payee: tx.payee?.trim() || tx.description?.trim() || "Unknown",
        category: null,
        category_group: null,
        category_item_id: null,
        balance: parseFloat(tx.amount),
        cleared: !tx.pending,
        approved: false,
        simplefin_transaction_id: tx.id,
      });
    }
  }

  let newTransactions = 0;

  if (rows.length > 0) {
    const txIds = rows.map((r) => r.simplefin_transaction_id);
    const { data: existing } = await supabase
      .from("transactions")
      .select("simplefin_transaction_id")
      .in("simplefin_transaction_id", txIds);
    const existingIds = new Set((existing ?? []).map((e) => e.simplefin_transaction_id));
    newTransactions = rows.filter((r) => !existingIds.has(r.simplefin_transaction_id)).length;

    const { error: upsertError } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "simplefin_transaction_id" });

    if (upsertError) {
      console.error("[simplefin/sync] upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to save transactions" }, { status: 500 });
    }
  }

  const syncedAt = new Date().toISOString();

  await supabase
    .from("simplefin_account_links")
    .update({ last_synced_at: syncedAt })
    .in(
      "id",
      links.filter((l) => simplefinAccounts.some((a) => a.id === l.simplefin_account_id)).map((l) => l.id)
    );

  await supabase
    .from("simplefin_connections")
    .update({ last_synced_at: syncedAt })
    .eq("id", connection.id);

  return NextResponse.json({ accountsSynced, newTransactions });
}
