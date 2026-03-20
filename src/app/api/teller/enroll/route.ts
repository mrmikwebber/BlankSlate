import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  getTellerAccounts,
  getTellerAccountBalance,
  getTellerTransactions,
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
    selectedAccountIds?: string[];
  };

  const { accessToken, enrollmentId, selectedAccountIds } = body;
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

  let openAccounts = tellerAccounts.filter((a) => a.status === "open");

  // If the caller specified which accounts to import, filter to those
  if (selectedAccountIds && selectedAccountIds.length > 0) {
    const selectedSet = new Set(selectedAccountIds);
    openAccounts = openAccounts.filter((a) => selectedSet.has(a.id));
  }

  const createdAccounts: { id: string; name: string }[] = [];

  for (const tellerAccount of openAccounts) {
    const institutionName = tellerAccount.institution.name;
    const accountName = tellerAccount.name || `${institutionName} ${tellerAccount.subtype.replace(/_/g, " ")}`;
    const accountType: "credit" | "debit" =
      tellerAccount.type === "credit" ? "credit" : "debit";
    const issuer = guessIssuer(institutionName);

    // Check if this Teller account is already enrolled for this user
    const { data: existingEnrollment } = await supabase
      .from("teller_enrollments")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("teller_account_id", tellerAccount.id)
      .single();

    if (existingEnrollment) {
      // Check if the linked BS account still exists
      const { data: existingAccount } = await supabase
        .from("accounts")
        .select("id, name")
        .eq("id", existingEnrollment.account_id)
        .single();

      if (existingAccount) {
        // Account already exists — just refresh the enrollment credentials
        await supabase
          .from("teller_enrollments")
          .update({
            enrollment_id: enrollmentId,
            access_token: accessToken,
            last_synced_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("teller_account_id", tellerAccount.id);

        createdAccounts.push({ id: existingAccount.id, name: existingAccount.name });
        continue;
      }
      // Account was deleted — fall through to create a new one
    }

    // Fetch current balance from Teller to use as starting balance
    let startingBalance = 0;
    try {
      const tellerBalance = await getTellerAccountBalance(accessToken, tellerAccount.id);
      const ledger = parseFloat(tellerBalance.ledger);
      // Credit balances represent debt — store as negative, matching manual account behavior
      startingBalance = accountType === "credit" ? -Math.abs(ledger) : ledger;
    } catch (err) {
      console.error("[teller/enroll] Failed to fetch balance for", tellerAccount.id, err);
    }

    // Fetch most recent transaction ID to use as cursor (matches what the link route does)
    let lastTellerTransactionId: string | null = null;
    try {
      const recentTx = await getTellerTransactions(accessToken, tellerAccount.id);
      const firstPosted = recentTx.find((t) => t.status === "posted");
      if (firstPosted) lastTellerTransactionId = firstPosted.id;
    } catch {
      // Non-fatal — webhook will sync all future transactions
    }

    // Create the BlankSlate account
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

    // Create a "Starting Balance" transaction so the account opens at the right value
    if (startingBalance !== 0) {
      const { error: startingBalanceError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          account_id: newAccount.id,
          date: new Date().toISOString().split("T")[0],
          payee: "Starting Balance",
          category: accountType === "credit" ? "Category Not Needed" : "Ready to Assign",
          category_group: accountType === "credit" ? "Category Not Needed" : "Ready to Assign",
          balance: startingBalance,
          cleared: true,
          approved: true,
        });

      if (startingBalanceError) {
        console.error("[teller/enroll] Failed to insert starting balance:", startingBalanceError);
      }
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
          last_teller_transaction_id: lastTellerTransactionId,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,teller_account_id" }
      );

    if (enrollError) {
      console.error("[teller/enroll] Failed to save enrollment:", enrollError);
    }

    createdAccounts.push({ id: newAccount.id, name: accountName });
  }

  return NextResponse.json({ accounts: createdAccounts });
}
