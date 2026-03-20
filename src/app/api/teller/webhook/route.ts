import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTellerTransactions, toSignedBalance } from "@/lib/tellerClient";

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
    // Teller sends flat fields, not a nested account object
    account_id?: string;
    enrollment_id?: string;
    // Some older docs show a nested account — handle both
    account?: {
      id?: string;
      enrollment_id?: string;
    };
    reason?: string;
  };
}

export async function POST(req: Request) {
  const body = await req.json() as TellerWebhookPayload;

  console.log("[teller/webhook] received:", JSON.stringify(body));

  // Handle enrollment disconnected
  if (body.type === "enrollment.disconnected") {
    const enrollmentId =
      body.payload?.enrollment_id ??
      body.payload?.account?.enrollment_id;
    if (enrollmentId) {
      const supabase = getServiceClient();
      await supabase
        .from("teller_enrollments")
        .delete()
        .eq("enrollment_id", enrollmentId);
    }
    return NextResponse.json({ ok: true });
  }

  // Only process transaction events
  if (body.type !== "transactions.processed") {
    return NextResponse.json({ ok: true });
  }

  const tellerAccountId =
    body.payload?.account_id ??
    body.payload?.account?.id;

  if (!tellerAccountId) {
    console.error("[teller/webhook] Missing account id in payload:", JSON.stringify(body.payload));
    return NextResponse.json({ error: "Missing account id" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Look up enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from("teller_enrollments")
    .select("*")
    .eq("teller_account_id", tellerAccountId)
    .single();

  if (enrollError || !enrollment) {
    console.error("[teller/webhook] Enrollment not found:", tellerAccountId);
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  try {
    const transactions = await getTellerTransactions(
      enrollment.access_token,
      tellerAccountId,
      enrollment.last_teller_transaction_id ?? undefined
    );

    const synced = transactions.filter((t: { status: string }) => t.status === "posted" || t.status === "pending");

    if (synced.length > 0) {
      const rows = synced.map((t: { id: string; date: string; description: string; status: string; details?: { counterparty?: { name?: string } }; amount: string; type: "credit" | "debit" }) => ({
        user_id: enrollment.user_id,
        account_id: enrollment.account_id,
        date: t.date,
        payee: t.details?.counterparty?.name || t.description,
        category: null,
        category_group: null,
        balance: toSignedBalance(t.amount, t.type),
        teller_transaction_id: t.id,
        cleared: t.status === "posted",
        approved: false,
      }));

      const { error: txError } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "teller_transaction_id", ignoreDuplicates: true });

      if (txError) {
        console.error("[teller/webhook] Failed to insert transactions:", txError);
      }

      // Update last seen transaction ID (use first posted for cursor, pending may not advance)
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
    console.error("[teller/webhook] Sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
