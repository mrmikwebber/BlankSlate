import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { claimSetupToken, fetchSimplefinAccounts } from "@/lib/simplefin";

interface ConnectRequest {
  setupToken: string;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ConnectRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.setupToken?.trim()) {
    return NextResponse.json({ error: "setupToken is required" }, { status: 400 });
  }

  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(body.setupToken);
  } catch (err) {
    console.error("[simplefin/connect] claim error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to claim setup token" },
      { status: 400 }
    );
  }

  const { error: upsertError } = await supabase
    .from("simplefin_connections")
    .upsert({ user_id: user.id, access_url: accessUrl }, { onConflict: "user_id" });

  if (upsertError) {
    console.error("[simplefin/connect] upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }

  try {
    const accounts = await fetchSimplefinAccounts(accessUrl, { balancesOnly: true });
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        orgName: a.org?.name ?? null,
      })),
    });
  } catch (err) {
    console.error("[simplefin/connect] initial accounts fetch error:", err);
    return NextResponse.json(
      { error: "Connected, but failed to list accounts — try syncing from settings" },
      { status: 502 }
    );
  }
}
