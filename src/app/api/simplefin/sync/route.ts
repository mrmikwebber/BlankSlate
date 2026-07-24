import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { SimplefinSyncError, syncSimplefinConnection } from "@/lib/simplefinSync";

const STATUS_BY_CODE: Record<string, number> = {
  no_connection: 404,
  no_links: 400,
  links_fetch_failed: 500,
  fetch_failed: 502,
  save_failed: 500,
};

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSimplefinConnection(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SimplefinSyncError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 500 });
    }
    console.error("[simplefin/sync] unexpected error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
