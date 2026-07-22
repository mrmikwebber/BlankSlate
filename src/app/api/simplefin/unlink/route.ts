import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

interface UnlinkRequest {
  linkId: string;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UnlinkRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.linkId) {
    return NextResponse.json({ error: "linkId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("simplefin_account_links")
    .delete()
    .eq("id", body.linkId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[simplefin/unlink] delete error:", error);
    return NextResponse.json({ error: "Failed to unlink account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
