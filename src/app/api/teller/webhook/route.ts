import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTellerTransactions, toSignedBalance } from "@/lib/tellerClient";

type TxRow = {
  user_id: string;
  account_id: string;
  date: string;
  payee: string | null;
  category: string | null;
  category_group: string | null;
  balance: number;
  teller_transaction_id: string;
  cleared: boolean;
  approved: boolean;
};

type CandidateRow = {
  id: string;
  date: string;
  payee: string | null;
  balance: number;
  cleared: boolean;
};

function normalizePayee(payee: string | null | undefined): string {
  return (payee ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function txKey(date: string, balance: number, payee: string | null | undefined): string {
  return `${date}|${Math.round(balance * 100)}|${normalizePayee(payee)}`;
}

// Service role client — bypasses RLS since webhooks have no user session
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  return createClient(url, key);
}

interface TellerWebhookPayload {
  id: string;
  type: string;
  payload: {
    enrollment_id?: string;
    reason?: string;
    // transactions.processed: account_id lives on each transaction item
    transactions?: { account_id?: string }[];
    // Fallback flat fields (some event types)
    account_id?: string;
    account?: {
      id?: string;
      enrollment_id?: string;
    };
  };
}

export async function POST(req: Request) {
  const DEBUG_TELLER = process.env.NEXT_PUBLIC_DEBUG_TELLER === "true";
  let body: TellerWebhookPayload;
  try {
    body = await req.json() as TellerWebhookPayload;
  } catch {
    // Vercel sends an empty POST during deployment verification — ignore it
    return NextResponse.json({ ok: true });
  }

  if (!body?.type) {
    // Not a valid Teller event (e.g. deployment ping with no body)
    return NextResponse.json({ ok: true });
  }

  if (DEBUG_TELLER) console.log("[teller/webhook] received:", JSON.stringify(body));

  // Handle enrollment disconnected — mark as disconnected rather than deleting
  // so the UI can prompt the user to reconnect
  if (body.type === "enrollment.disconnected") {
    const enrollmentId =
      body.payload?.enrollment_id ??
      body.payload?.account?.enrollment_id;
    if (enrollmentId) {
      const supabase = getServiceClient();
      const { error } = await supabase
        .from("teller_enrollments")
        .update({ teller_status: "disconnected" })
        .eq("enrollment_id", enrollmentId);
      if (error) {
        if (DEBUG_TELLER) console.error("[teller/webhook] Failed to mark enrollment disconnected:", error);
      } else {
        if (DEBUG_TELLER) console.log("[teller/webhook] Marked enrollment disconnected:", enrollmentId, "reason:", body.payload?.reason);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Only process transaction events
  if (body.type !== "transactions.processed") {
    return NextResponse.json({ ok: true });
  }

  const enrollmentId = body.payload?.enrollment_id;
  if (!enrollmentId) {
    if (DEBUG_TELLER) console.error("[teller/webhook] Missing enrollment_id in payload:", JSON.stringify(body.payload));
    return NextResponse.json({ error: "Missing enrollment_id" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Look up ALL accounts for this enrollment (one row per account)
  let { data: enrollments, error: enrollError } = await supabase
    .from("teller_enrollments")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .neq("is_archived", true);

  // Fallback: enrollment_id in DB may be stale — look up by teller_account_id instead
  if (enrollError || !enrollments?.length) {
    const tellerAccountIds = [
      ...new Set(
        (body.payload.transactions ?? [])
          .map((t) => t.account_id)
          .filter((id): id is string => !!id)
      ),
    ];

    if (tellerAccountIds.length > 0) {
      ({ data: enrollments, error: enrollError } = await supabase
        .from("teller_enrollments")
        .select("*")
        .in("teller_account_id", tellerAccountIds)
        .neq("is_archived", true));
    }
  }

  if (enrollError || !enrollments?.length) {
    if (DEBUG_TELLER) console.error("[teller/webhook] No enrollments found for:", enrollmentId);
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  try {
    for (const enrollment of enrollments) {
      const transactions = await getTellerTransactions(
        enrollment.access_token,
        enrollment.teller_account_id,
        enrollment.last_teller_transaction_id ?? undefined
      );

      const fallbackCutoffDate =
        !enrollment.last_teller_transaction_id && enrollment.last_synced_at
          ? new Date(enrollment.last_synced_at).toISOString().slice(0, 10)
          : null;

      const synced = transactions
        .filter((t: { status: string }) => t.status === "posted" || t.status === "pending")
        .filter((t: { date: string }) => (fallbackCutoffDate ? t.date >= fallbackCutoffDate : true));

      const isCreditAccount = enrollment.teller_account_type === "credit_card";

      if (synced.length === 0) {
        if (!enrollment.last_teller_transaction_id && transactions.length > 0) {
          const cursorSource = transactions as Array<{ id: string; status: string }>;
          await supabase
            .from("teller_enrollments")
            .update({
              last_teller_transaction_id: cursorSource.find((t) => t.status === "posted")?.id ?? cursorSource[0].id,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", enrollment.id);
        }
        continue;
      }

      const rows: TxRow[] = synced.map((t: { id: string; date: string; description: string; status: string; details?: { counterparty?: { name?: string } }; amount: string; type: "credit" | "debit" }) => ({
        user_id: enrollment.user_id,
        account_id: enrollment.account_id,
        date: t.date,
        payee: t.details?.counterparty?.name || t.description,
        category: null,
        category_group: null,
        balance: toSignedBalance(t.amount, t.type, isCreditAccount),
        teller_transaction_id: t.id,
        cleared: t.status === "posted",
        approved: false,
      }));

      const dates = rows.map((r) => r.date);
      const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
      const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

      const { data: manualCandidates, error: candidatesError } = await supabase
        .from("transactions")
        .select("id,date,payee,balance,cleared")
        .eq("user_id", enrollment.user_id)
        .eq("account_id", enrollment.account_id)
        .is("teller_transaction_id", null)
        .gte("date", minDate)
        .lte("date", maxDate);

      if (candidatesError) {
        if (DEBUG_TELLER) console.error("[teller/webhook] Failed to load reconciliation candidates:", candidatesError);
      }

      const candidateBuckets = new Map<string, CandidateRow[]>();
      for (const c of (manualCandidates ?? []) as CandidateRow[]) {
        const key = txKey(c.date, Number(c.balance), c.payee);
        const bucket = candidateBuckets.get(key);
        if (bucket) {
          bucket.push(c);
        } else {
          candidateBuckets.set(key, [c]);
        }
      }

      const unmatchedRows: TxRow[] = [];
      const matchedPairs: Array<{ row: TxRow; candidate: CandidateRow }> = [];

      for (const row of rows) {
        const key = txKey(row.date, row.balance, row.payee);
        const bucket = candidateBuckets.get(key);
        if (bucket && bucket.length > 0) {
          const candidate = bucket.shift()!;
          matchedPairs.push({ row, candidate });
          continue;
        }
        unmatchedRows.push(row);
      }

      for (const match of matchedPairs) {
        const { error: reconcileError } = await supabase
          .from("transactions")
          .update({
            teller_transaction_id: match.row.teller_transaction_id,
            cleared: match.candidate.cleared || match.row.cleared,
          })
          .eq("id", match.candidate.id)
          .is("teller_transaction_id", null);

        if (reconcileError) {
          if (DEBUG_TELLER) console.error("[teller/webhook] Failed to reconcile transaction:", reconcileError);
          unmatchedRows.push(match.row);
        }
      }

      let txError: unknown = null;
      if (unmatchedRows.length > 0) {
        ({ error: txError } = await supabase
          .from("transactions")
          .upsert(unmatchedRows, { onConflict: "teller_transaction_id", ignoreDuplicates: true }));
      }

      if (txError) {
        if (DEBUG_TELLER) console.error("[teller/webhook] Failed to insert transactions for account:", enrollment.teller_account_id, txError);
      }

      // Update cursor to the most recent posted transaction
      const firstPosted = synced.find((t: { status: string }) => t.status === "posted");
      if (firstPosted) {
        await supabase
          .from("teller_enrollments")
          .update({
            last_teller_transaction_id: (firstPosted as { id: string }).id,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", enrollment.id);
      }
    }
  } catch (err) {
    if (DEBUG_TELLER) console.error("[teller/webhook] Sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
