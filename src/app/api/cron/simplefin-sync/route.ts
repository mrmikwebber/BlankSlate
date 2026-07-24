import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SimplefinSyncError, syncSimplefinConnection } from "@/lib/simplefinSync";

// Triggered once a day by the Vercel Cron entry in vercel.json. Runs with a
// service-role client (no logged-in user/cookies exist in a cron
// invocation) and syncs every user's SimpleFin connection in turn, the same
// way the manual "Sync Now" button does for a single user.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: connections, error } = await adminClient
    .from("simplefin_connections")
    .select("user_id");

  if (error) {
    console.error("[cron/simplefin-sync] failed to load connections:", error);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }

  const results: Array<{
    userId: string;
    accountsSynced?: number;
    newTransactions?: number;
    error?: string;
  }> = [];

  for (const { user_id: userId } of connections ?? []) {
    try {
      const result = await syncSimplefinConnection(adminClient, userId);
      results.push({ userId, ...result });
    } catch (err) {
      const message = err instanceof SimplefinSyncError ? err.message : "Unexpected sync error";
      console.error(`[cron/simplefin-sync] sync failed for user ${userId}:`, err);
      results.push({ userId, error: message });
    }
  }

  return NextResponse.json({
    usersProcessed: results.length,
    usersSucceeded: results.filter((r) => !r.error).length,
    results,
  });
}
