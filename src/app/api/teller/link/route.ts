import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getTellerTransactions } from "@/lib/tellerClient";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    accountId: string;
    accessToken: string;
    enrollmentId: string;
    tellerAccountId: string;
    institutionName: string;
    tellerAccountType: string;
  };

  const { accountId, accessToken, enrollmentId, tellerAccountId, institutionName, tellerAccountType } = body;

  if (!accountId || !accessToken || !enrollmentId || !tellerAccountId) {
    return NextResponse.json({ error: "accountId, accessToken, enrollmentId, and tellerAccountId are required" }, { status: 400 });
  }

  // Verify the account belongs to this user
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Fetch the most recent Teller transaction to use as the cursor.
  // This ensures the webhook only delivers transactions that happen AFTER
  // the link date — no historical duplicates from Teller will be synced.
  let lastTellerTransactionId: string | null = null;
  try {
    const recentTx = await getTellerTransactions(accessToken, tellerAccountId);
    const firstPosted = recentTx.find((t) => t.status === "posted");
    if (firstPosted) lastTellerTransactionId = firstPosted.id;
  } catch {
    // Non-fatal — webhook will just sync all future transactions
  }

  // Upsert the enrollment record pointing to the existing account
  const { error: enrollError } = await supabase
    .from("teller_enrollments")
    .upsert(
      {
        user_id: user.id,
        account_id: accountId,
        enrollment_id: enrollmentId,
        access_token: accessToken,
        institution_name: institutionName ?? null,
        teller_account_id: tellerAccountId,
        teller_account_type: tellerAccountType ?? null,
        last_teller_transaction_id: lastTellerTransactionId,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,teller_account_id" }
    );

  if (enrollError) {
    console.error("[teller/link] Failed to save enrollment:", enrollError);
    return NextResponse.json({ error: "Failed to save enrollment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
