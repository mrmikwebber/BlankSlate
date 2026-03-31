import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  getTellerAccounts,
  getTellerAccountBalance,
} from "@/lib/tellerClient";

const DEBUG_TELLER = process.env.NEXT_PUBLIC_DEBUG_TELLER === "true";


export async function POST(req: Request) {
  if (DEBUG_TELLER) console.log("[teller/accounts] POST start");
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (DEBUG_TELLER) console.log("[teller/accounts] user", user?.id ?? "null");

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { accessToken: string };
  const { accessToken } = body;

  if (!accessToken) {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  if (DEBUG_TELLER) console.log("[teller/accounts] fetching Teller accounts");
  let tellerAccounts;
  try {
    tellerAccounts = await getTellerAccounts(accessToken);
    if (DEBUG_TELLER) console.log("[teller/accounts] got", tellerAccounts.length, "accounts");
  } catch (err) {
    console.error("[teller/accounts] Failed to fetch accounts:", err);
    return NextResponse.json({ error: "Failed to connect to Teller" }, { status: 502 });
  }

  const openAccounts = tellerAccounts.filter((a) => a.status === "open");
  if (DEBUG_TELLER) console.log("[teller/accounts] open accounts:", openAccounts.length);

  const accountsWithBalances = await Promise.all(
    openAccounts.map(async (account) => {
      try {
        const balance = await getTellerAccountBalance(accessToken, account.id);
        if (DEBUG_TELLER) console.log("[teller/accounts] balance for", account.id, balance);
        return {
          id: account.id,
          name: account.name,
          institution: account.institution.name,
          subtype: account.subtype,
          type: account.type,
          last_four: account.last_four,
          ledger_balance: parseFloat(balance.ledger),
        };
      } catch (err) {
        console.error("[teller/accounts] balance fetch failed for", account.id, err);
        return {
          id: account.id,
          name: account.name,
          institution: account.institution.name,
          subtype: account.subtype,
          type: account.type,
          last_four: account.last_four,
          ledger_balance: null,
        };
      }
    })
  );

  if (DEBUG_TELLER) console.log("[teller/accounts] returning", accountsWithBalances.length, "accounts");
  return NextResponse.json({ accounts: accountsWithBalances });
}
