import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { fetchSimplefinAccounts } from "@/lib/simplefin";
import { getCurrentBudgetId } from "@/lib/budgets";

interface LinkRequest {
  simplefinAccountId: string;
  simplefinAccountName?: string;
  orgName?: string;
  blankslateAccountId: string | null;
  newAccount?: { name: string; type: "debit" | "credit"; importMode?: "fresh" | "history" };
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LinkRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.simplefinAccountId) {
    return NextResponse.json({ error: "simplefinAccountId is required" }, { status: 400 });
  }
  if (!body.blankslateAccountId && !body.newAccount?.name?.trim()) {
    return NextResponse.json(
      { error: "blankslateAccountId or newAccount is required" },
      { status: 400 }
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("simplefin_connections")
    .select("id, access_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "No SimpleFin connection found" }, { status: 404 });
  }

  let blankslateAccountId = body.blankslateAccountId;
  // "fresh" accounts get a Starting Balance transaction and skip historical
  // backfill (link's last_synced_at is set to now below); "history" — the
  // default for existing-account mappings — keeps the normal lookback sync.
  let startFresh = false;

  if (!blankslateAccountId && body.newAccount) {
    const { data: newAcct, error: acctError } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        name: body.newAccount.name.trim(),
        type: body.newAccount.type,
      })
      .select("id")
      .single();

    if (acctError || !newAcct) {
      console.error("[simplefin/link] account create error:", acctError);
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    blankslateAccountId = newAcct.id;
    startFresh = (body.newAccount.importMode ?? "fresh") === "fresh";

    if (startFresh) {
      try {
        const [simplefinAccount] = await fetchSimplefinAccounts(connection.access_url, {
          accountIds: [body.simplefinAccountId],
          balancesOnly: true,
        });

        if (simplefinAccount) {
          const isCredit = body.newAccount.type === "credit";
          const currentBudgetId = await getCurrentBudgetId(supabase, user.id);
          const { error: startingBalanceError } = await supabase.from("transactions").insert({
            user_id: user.id,
            budget_id: currentBudgetId,
            account_id: blankslateAccountId,
            date: new Date().toISOString(),
            payee: "Starting Balance",
            category: isCredit ? "Category Not Needed" : "Ready to Assign",
            category_group: isCredit ? null : "Ready to Assign",
            balance: parseFloat(simplefinAccount.balance),
          });
          if (startingBalanceError) {
            console.error("[simplefin/link] starting balance insert error:", startingBalanceError);
          }
        }
      } catch (err) {
        console.error("[simplefin/link] fresh-start balance fetch failed:", err);
      }
    }
  } else if (blankslateAccountId) {
    const { data: existing, error: existingError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", blankslateAccountId)
      .eq("user_id", user.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  }

  const { data: link, error: linkError } = await supabase
    .from("simplefin_account_links")
    .upsert(
      {
        user_id: user.id,
        connection_id: connection.id,
        simplefin_account_id: body.simplefinAccountId,
        simplefin_account_name: body.simplefinAccountName ?? null,
        org_name: body.orgName ?? null,
        blankslate_account_id: blankslateAccountId,
        last_synced_at: startFresh ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,simplefin_account_id" }
    )
    .select("id, simplefin_account_id, simplefin_account_name, org_name, blankslate_account_id, last_synced_at")
    .single();

  if (linkError) {
    console.error("[simplefin/link] upsert error:", linkError);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }

  return NextResponse.json(link, { status: 201 });
}
