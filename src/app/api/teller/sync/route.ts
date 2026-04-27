import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getTellerTransactions, toSignedBalance } from "@/lib/tellerClient";
import { isAdminUser, normalizeAdminList } from "@/lib/admin";

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

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await req.json() as { accountId: string };
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  // Look up enrollment for this account
  const { data: enrollment, error: enrollError } = await supabase
    .from("teller_enrollments")
    .select("*")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .neq("is_archived", true)
    .single();

  if (enrollError || !enrollment) {
    return NextResponse.json(
      { error: "No Teller enrollment found for this account" },
      { status: 404 }
    );
  }

  const adminEmails = normalizeAdminList(process.env.ADMIN_EMAILS);
  const adminIds = normalizeAdminList(process.env.ADMIN_USER_IDS);
  const isAdmin = isAdminUser(
    { email: user.email, id: user.id },
    { emails: adminEmails, ids: adminIds }
  );

  // Rate limit: 1 sync per hour per account
  if (!isAdmin && enrollment.last_synced_at) {
    const msSinceLastSync = Date.now() - new Date(enrollment.last_synced_at).getTime();
    const msInHour = 60 * 60 * 1000;
    if (msSinceLastSync < msInHour) {
      const minutesLeft = Math.ceil((msInHour - msSinceLastSync) / 60000);
      return NextResponse.json(
        { error: `Sync available again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}` },
        { status: 429 }
      );
    }
  }

  try {
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
      .filter((t) => t.status === "posted" || t.status === "pending")
      .filter((t) => (fallbackCutoffDate ? t.date >= fallbackCutoffDate : true));

    const isCreditAccount = enrollment.teller_account_type === "credit_card";
    let inserted = 0;
    let reconciled = 0;

    if (synced.length > 0) {
      const rows: TxRow[] = synced.map((t) => ({
        user_id: user.id,
        account_id: accountId,
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
        .eq("user_id", user.id)
        .eq("account_id", accountId)
        .is("teller_transaction_id", null)
        .gte("date", minDate)
        .lte("date", maxDate);

      if (candidatesError) {
        console.error("[teller/sync] Failed to load reconciliation candidates:", candidatesError);
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
          console.error("[teller/sync] Failed to reconcile transaction:", reconcileError);
          unmatchedRows.push(match.row);
        } else {
          reconciled += 1;
        }
      }

      let upsertedCount = 0;
      if (unmatchedRows.length > 0) {
        const { data: upserted, error: txError } = await supabase
          .from("transactions")
          .upsert(unmatchedRows, { onConflict: "teller_transaction_id", ignoreDuplicates: true })
          .select();

        if (txError) {
          console.error("[teller/sync] Failed to upsert transactions:", txError);
          return NextResponse.json({ error: "Failed to sync transactions" }, { status: 500 });
        }

        upsertedCount = upserted?.length ?? 0;
      }

      inserted = upsertedCount + reconciled;

      const cursorSource = synced;

      await supabase
        .from("teller_enrollments")
        .update({
          last_teller_transaction_id: cursorSource.find((t) => t.status === "posted")?.id ?? cursorSource[0].id,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);
    } else if (!enrollment.last_teller_transaction_id && transactions.length > 0) {
      const cursorSource = transactions;
      await supabase
        .from("teller_enrollments")
        .update({
          last_teller_transaction_id: cursorSource.find((t) => t.status === "posted")?.id ?? cursorSource[0].id,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);
    }

    return NextResponse.json({ synced: inserted, reconciled });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[teller/sync] Error:", message, err);

    // Missing mTLS credentials — misconfigured server env
    if (message.includes("TELLER_CERT") || message.includes("TELLER_PRIVATE_KEY")) {
      return NextResponse.json(
        { error: "Server misconfiguration: Teller certificates not set" },
        { status: 500 }
      );
    }

    // Teller returned an HTTP error — surface the status code and body
    const tellerApiMatch = message.match(/^Teller API error (\d+): /);
    if (tellerApiMatch) {
      const statusCode = parseInt(tellerApiMatch[1], 10);
      const body = message.slice(tellerApiMatch[0].length).trim();
      console.error(`[teller/sync] Teller API ${statusCode}:`, body);

      if (statusCode === 401 || statusCode === 403) {
        // Mark the enrollment as disconnected so the UI can prompt reconnect
        await supabase
          .from("teller_enrollments")
          .update({ teller_status: "disconnected" })
          .eq("id", enrollment.id);
        return NextResponse.json(
          { error: `Teller enrollment disconnected or access denied (${statusCode})`, disconnected: true },
          { status: 502 }
        );
      }
      if (statusCode === 404) {
        return NextResponse.json(
          { error: "Teller account not found — it may have been removed" },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `Teller API error ${statusCode}: ${body}` },
        { status: 502 }
      );
    }

    // JSON parse failure
    if (message.startsWith("Failed to parse Teller response:")) {
      console.error("[teller/sync] Teller returned non-JSON response");
      return NextResponse.json(
        { error: "Teller returned an unexpected response format" },
        { status: 502 }
      );
    }

    // Network / TLS / DNS error
    return NextResponse.json(
      { error: `Failed to contact Teller: ${message}` },
      { status: 502 }
    );
  }
}
