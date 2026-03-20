import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getTellerTransactions, toSignedBalance } from "@/lib/tellerClient";

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
    .single();

  if (enrollError || !enrollment) {
    return NextResponse.json(
      { error: "No Teller enrollment found for this account" },
      { status: 404 }
    );
  }

  // Rate limit: 1 sync per hour per account
  if (enrollment.last_synced_at) {
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

    const synced = transactions.filter((t) => t.status === "posted" || t.status === "pending");
    let inserted = 0;

    if (synced.length > 0) {
      const rows = synced.map((t) => ({
        user_id: user.id,
        account_id: accountId,
        date: t.date,
        payee: t.details?.counterparty?.name || t.description,
        category: null,
        category_group: null,
        balance: toSignedBalance(t.amount, t.type),
        teller_transaction_id: t.id,
        cleared: t.status === "posted",
        approved: false,
      }));

      const { data: upserted, error: txError } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "teller_transaction_id", ignoreDuplicates: true })
        .select();

      if (txError) {
        console.error("[teller/sync] Failed to upsert transactions:", txError);
        return NextResponse.json({ error: "Failed to sync transactions" }, { status: 500 });
      }

      inserted = upserted?.length ?? 0;

      await supabase
        .from("teller_enrollments")
        .update({
          last_teller_transaction_id: synced.find((t) => t.status === "posted")?.id ?? synced[0].id,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);
    }

    return NextResponse.json({ synced: inserted });
  } catch (err) {
    console.error("[teller/sync] Error:", err);
    return NextResponse.json({ error: "Failed to contact Teller" }, { status: 502 });
  }
}
