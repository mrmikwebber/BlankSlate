import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  getTellerAccounts,
  getTellerTransactions,
  toSignedBalance,
  guessIssuer,
} from "@/lib/tellerClient";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    accessToken: string;
    enrollmentId: string;
  };

  const { accessToken, enrollmentId } = body;
  if (!accessToken || !enrollmentId) {
    return NextResponse.json(
      { error: "accessToken and enrollmentId are required" },
      { status: 400 }
    );
  }

  // Fetch accounts from Teller
  let tellerAccounts;
  try {
    tellerAccounts = await getTellerAccounts(accessToken);
  } catch (err) {
    console.error("[teller/enroll] Failed to fetch Teller accounts:", err);
    return NextResponse.json(
      { error: "Failed to connect to Teller" },
      { status: 502 }
    );
  }

  const openAccounts = tellerAccounts.filter((a) => a.status === "open");
  const createdAccounts: { id: string; name: string }[] = [];

  for (const tellerAccount of openAccounts) {
    const institutionName = tellerAccount.institution.name;
    const accountName = `${institutionName} ${tellerAccount.subtype.replace(/_/g, " ")}`;
    const accountType: "credit" | "debit" =
      tellerAccount.type === "credit" ? "credit" : "debit";
    const issuer = guessIssuer(institutionName);

    // Create a BlankSlate account (no starting balance transaction — we'll sync real ones)
    const { data: newAccount, error: accountError } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        name: accountName,
        type: accountType,
        issuer,
        balance: 0,
      })
      .select()
      .single();

    if (accountError || !newAccount) {
      console.error("[teller/enroll] Failed to create account:", accountError);
      continue;
    }

    // Save the enrollment record
    const { error: enrollError } = await supabase
      .from("teller_enrollments")
      .upsert(
        {
          user_id: user.id,
          account_id: newAccount.id,
          enrollment_id: enrollmentId,
          access_token: accessToken,
          institution_name: institutionName,
          teller_account_id: tellerAccount.id,
          teller_account_type: tellerAccount.subtype,
        },
        { onConflict: "user_id,teller_account_id" }
      );

    if (enrollError) {
      console.error("[teller/enroll] Failed to save enrollment:", enrollError);
    }

    // Initial transaction sync
    try {
      const transactions = await getTellerTransactions(
        accessToken,
        tellerAccount.id
      );

      const synced = transactions.filter((t) => t.status === "posted" || t.status === "pending");

      if (synced.length > 0) {
        const rows = synced.map((t) => ({
          user_id: user.id,
          account_id: newAccount.id,
          date: t.date,
          payee: t.details?.counterparty?.name || t.description,
          category: null,
          category_group: null,
          balance: toSignedBalance(t.amount, t.type),
          teller_transaction_id: t.id,
          cleared: t.status === "posted",
        }));

        const { error: txError } = await supabase
          .from("transactions")
          .upsert(rows, { onConflict: "teller_transaction_id", ignoreDuplicates: true });

        if (txError) {
          console.error("[teller/enroll] Failed to insert transactions:", txError);
        }

        // Store the most recent transaction ID for future webhook syncs
        const lastId = synced[0].id; // Teller returns newest first
        await supabase
          .from("teller_enrollments")
          .update({
            last_teller_transaction_id: lastId,
            last_synced_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("teller_account_id", tellerAccount.id);
      }
    } catch (err) {
      console.error("[teller/enroll] Failed to sync transactions:", err);
    }

    createdAccounts.push({ id: newAccount.id, name: accountName });
  }

  return NextResponse.json({ accounts: createdAccounts });
}
