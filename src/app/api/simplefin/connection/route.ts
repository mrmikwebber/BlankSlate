import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection, error: connectionError } = await supabase
    .from("simplefin_connections")
    .select("id, created_at, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError) {
    console.error("[simplefin/connection] fetch error:", connectionError);
    return NextResponse.json({ error: "Failed to load connection" }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json({ connected: false, links: [] });
  }

  const { data: links, error: linksError } = await supabase
    .from("simplefin_account_links")
    .select("id, simplefin_account_id, simplefin_account_name, org_name, blankslate_account_id, last_synced_at, accounts(name)")
    .eq("user_id", user.id);

  if (linksError) {
    console.error("[simplefin/connection] links fetch error:", linksError);
    return NextResponse.json({ error: "Failed to load linked accounts" }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    lastSyncedAt: connection.last_synced_at,
    links: (links ?? []).map((l) => ({
      id: l.id,
      simplefinAccountId: l.simplefin_account_id,
      simplefinAccountName: l.simplefin_account_name,
      orgName: l.org_name,
      blankslateAccountId: l.blankslate_account_id,
      blankslateAccountName:
        (l.accounts as unknown as { name: string } | null)?.name ?? null,
      lastSyncedAt: l.last_synced_at,
    })),
  });
}

export async function DELETE() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("simplefin_connections")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("[simplefin/connection] delete error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
