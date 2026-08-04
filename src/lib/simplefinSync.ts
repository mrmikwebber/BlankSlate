// Shared SimpleFin sync logic used by both the user-triggered "Sync Now"
// route (src/app/api/simplefin/sync/route.ts) and the daily cron route
// (src/app/api/cron/simplefin-sync/route.ts). Kept provider-agnostic on the
// Supabase client type so either a cookie-scoped route handler client or a
// service-role admin client can call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSimplefinAccounts } from "@/lib/simplefin";
import { getCurrentBudgetId } from "@/lib/budgets";

const DEFAULT_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;
// SimpleFin/bank aggregators often report `posted` at day granularity rather
// than the exact time, so a precise last-synced watermark can silently skip
// transactions that post the same day but before the watermark's time-of-day.
// Re-request a couple days of overlap every sync to catch those; safe because
// results are deduped via the tombstone table and upserted by
// simplefin_transaction_id.
const SYNC_OVERLAP_SECONDS = 2 * 24 * 60 * 60;

export type SimplefinSyncErrorCode =
  | "no_connection"
  | "no_links"
  | "links_fetch_failed"
  | "fetch_failed"
  | "save_failed";

export class SimplefinSyncError extends Error {
  code: SimplefinSyncErrorCode;
  constructor(code: SimplefinSyncErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SimplefinBalancePull {
  linkId: string;
  blankslateAccountId: string;
  simplefinAccountId: string;
  currentTrueBalance: number;
}

// Balance-only pull for every one of a user's linked accounts in a single
// SimpleFin request — used by Fresh Start to true up account balances
// without pulling/upserting transaction history. Unlike
// syncSimplefinConnection, never touches the `transactions` table.
export async function pullCurrentBalances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<SimplefinBalancePull[]> {
  const { data: connection, error: connectionError } = await supabase
    .from("simplefin_connections")
    .select("id, access_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (connectionError || !connection) {
    throw new SimplefinSyncError("no_connection", "No SimpleFin connection found");
  }

  const { data: links, error: linksError } = await supabase
    .from("simplefin_account_links")
    .select("id, simplefin_account_id, blankslate_account_id")
    .eq("user_id", userId)
    .not("blankslate_account_id", "is", null);

  if (linksError) {
    console.error("[simplefinSync] pullCurrentBalances links fetch error:", linksError);
    throw new SimplefinSyncError("links_fetch_failed", "Failed to load linked accounts");
  }

  if (!links || links.length === 0) {
    throw new SimplefinSyncError("no_links", "No accounts linked");
  }

  let simplefinAccounts;
  try {
    simplefinAccounts = await fetchSimplefinAccounts(connection.access_url, {
      accountIds: links.map((l) => l.simplefin_account_id),
      balancesOnly: true,
    });
  } catch (err) {
    console.error("[simplefinSync] pullCurrentBalances fetch error:", err);
    throw new SimplefinSyncError("fetch_failed", "Failed to fetch balances from SimpleFin");
  }

  const pulls: SimplefinBalancePull[] = [];
  for (const link of links) {
    const account = simplefinAccounts.find((a) => a.id === link.simplefin_account_id);
    if (!account) continue;
    pulls.push({
      linkId: link.id,
      blankslateAccountId: String(link.blankslate_account_id),
      simplefinAccountId: link.simplefin_account_id,
      currentTrueBalance: parseFloat(account.balance),
    });
  }

  return pulls;
}

export interface SimplefinSyncResult {
  accountsSynced: number;
  newTransactions: number;
}

export async function syncSimplefinConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<SimplefinSyncResult> {
  const { data: connection, error: connectionError } = await supabase
    .from("simplefin_connections")
    .select("id, access_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (connectionError || !connection) {
    throw new SimplefinSyncError("no_connection", "No SimpleFin connection found");
  }

  const { data: links, error: linksError } = await supabase
    .from("simplefin_account_links")
    .select("id, simplefin_account_id, blankslate_account_id, last_synced_at")
    .eq("user_id", userId)
    .not("blankslate_account_id", "is", null);

  if (linksError) {
    console.error("[simplefinSync] links fetch error:", linksError);
    throw new SimplefinSyncError("links_fetch_failed", "Failed to load linked accounts");
  }

  if (!links || links.length === 0) {
    throw new SimplefinSyncError("no_links", "No accounts linked");
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, userId);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const startDate = links.reduce((earliest, link) => {
    const linkStart = link.last_synced_at
      ? Math.floor(new Date(link.last_synced_at).getTime() / 1000) - SYNC_OVERLAP_SECONDS
      : nowSeconds - DEFAULT_LOOKBACK_SECONDS;
    return Math.min(earliest, linkStart);
  }, nowSeconds);

  let simplefinAccounts;
  try {
    simplefinAccounts = await fetchSimplefinAccounts(connection.access_url, {
      accountIds: links.map((l) => l.simplefin_account_id),
      startDate,
      pending: true,
    });
  } catch (err) {
    console.error("[simplefinSync] fetch error:", err);
    throw new SimplefinSyncError("fetch_failed", "Failed to fetch data from SimpleFin");
  }

  const { data: tombstoned } = await supabase
    .from("deleted_simplefin_transactions")
    .select("simplefin_transaction_id")
    .eq("user_id", userId);
  const tombstonedIds = new Set((tombstoned ?? []).map((t) => t.simplefin_transaction_id));

  const rows: Array<{
    user_id: string;
    budget_id: string;
    account_id: string;
    date: string;
    payee: string;
    category: null;
    category_group: null;
    category_item_id: null;
    balance: number;
    cleared: boolean;
    pending: boolean;
    approved: boolean;
    simplefin_transaction_id: string;
  }> = [];

  let accountsSynced = 0;
  // Institutions don't consistently keep the same transaction id once a
  // pending charge posts — some do, some issue a fresh id and let the
  // pending one simply drop out of the feed. Track which (account, id)
  // pairs are still-pending or newly-posted in *this* fetch so stale local
  // pending rows that fell out of the feed can be cleaned up below.
  const seenIdsByAccount = new Map<string, Set<string>>();
  const startDateIso = new Date(startDate * 1000).toISOString().slice(0, 10);

  for (const link of links) {
    const account = simplefinAccounts.find((a) => a.id === link.simplefin_account_id);
    if (!account) continue;
    accountsSynced += 1;

    const seenIds = new Set<string>();
    seenIdsByAccount.set(String(link.blankslate_account_id), seenIds);

    for (const tx of account.transactions ?? []) {
      if (tombstonedIds.has(tx.id)) continue;
      seenIds.add(tx.id);
      // `posted` is 0 for a still-pending transaction per the SimpleFin spec —
      // fall back to `transacted_at` (when the charge actually happened) so
      // pending rows don't land on the Unix epoch.
      const txEpochSeconds = tx.posted || tx.transacted_at || Math.floor(Date.now() / 1000);
      rows.push({
        user_id: userId,
        budget_id: currentBudgetId,
        account_id: String(link.blankslate_account_id),
        date: new Date(txEpochSeconds * 1000).toISOString().slice(0, 10),
        payee: tx.payee?.trim() || tx.description?.trim() || "Unknown",
        category: null,
        category_group: null,
        category_item_id: null,
        balance: parseFloat(tx.amount),
        cleared: !tx.pending,
        pending: Boolean(tx.pending),
        approved: false,
        simplefin_transaction_id: tx.id,
      });
    }
  }

  // Clean up stale pending rows: still uncleared, untouched by the user
  // (never approved or categorized), dated within this fetch's window, but
  // no longer present in the feed at all — almost always because the
  // institution posted it under a different transaction id.
  for (const [accountId, seenIds] of seenIdsByAccount) {
    const { data: stalePending } = await supabase
      .from("transactions")
      .select("id, simplefin_transaction_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("cleared", false)
      .eq("approved", false)
      .is("category", null)
      .not("simplefin_transaction_id", "is", null)
      .gte("date", startDateIso);

    const idsToDelete = (stalePending ?? [])
      .filter((t) => !seenIds.has(t.simplefin_transaction_id))
      .map((t) => t.id);

    if (idsToDelete.length > 0) {
      await supabase.from("transactions").delete().in("id", idsToDelete);
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

    const newRows = rows.filter((r) => !existingIds.has(r.simplefin_transaction_id));
    const existingRows = rows.filter((r) => existingIds.has(r.simplefin_transaction_id));
    newTransactions = newRows.length;

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("transactions").insert(newRows);
      if (insertError) {
        console.error("[simplefinSync] insert error:", insertError);
        throw new SimplefinSyncError("save_failed", "Failed to save transactions");
      }
    }

    // Refetching the same overlap window every sync (needed to catch a
    // pending charge's amount/payee changing once it posts) must never
    // touch category/category_group/category_item_id/approved on a row
    // that already exists — those are the user's own work, and blindly
    // upserting the full row would silently null them back out every time
    // the transaction resyncs.
    for (const row of existingRows) {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          date: row.date,
          payee: row.payee,
          balance: row.balance,
          cleared: row.cleared,
          pending: row.pending,
        })
        .eq("simplefin_transaction_id", row.simplefin_transaction_id);
      if (updateError) {
        console.error("[simplefinSync] update error:", updateError);
        throw new SimplefinSyncError("save_failed", "Failed to save transactions");
      }
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

  return { accountsSynced, newTransactions };
}
