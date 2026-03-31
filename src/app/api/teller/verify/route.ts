import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getTellerAccountBalance } from "@/lib/tellerClient";

const DEBUG_TELLER = process.env.NEXT_PUBLIC_DEBUG_TELLER === "true";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await req.json() as { accountId: string };
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const { data: enrollment, error: enrollError } = await supabase
    .from("teller_enrollments")
    .select("id, access_token, teller_account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (enrollError || !enrollment) {
    return NextResponse.json({ connected: false });
  }

  try {
    await getTellerAccountBalance(enrollment.access_token, enrollment.teller_account_id);
    return NextResponse.json({ connected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuthError = /Teller API error (401|403)/.test(message);

    if (isAuthError) {
      if (DEBUG_TELLER) console.log("[teller/verify] Enrollment disconnected for account:", accountId);
      await supabase
        .from("teller_enrollments")
        .update({ teller_status: "disconnected" })
        .eq("id", enrollment.id);
      return NextResponse.json({ connected: false, disconnected: true });
    }

    // Non-auth errors (network, cert issues) — don't mark as disconnected
    if (DEBUG_TELLER) console.error("[teller/verify] Error checking enrollment:", message);
    return NextResponse.json({ connected: true });
  }
}
