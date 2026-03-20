import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { deleteTellerAccount } from "@/lib/tellerClient";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await req.json() as { accountId: number };
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  console.log("[teller/disconnect] looking up enrollment for accountId:", accountId, "userId:", user.id);

  // Look up enrollment before deleting
  const { data: enrollment, error: lookupError } = await supabase
    .from("teller_enrollments")
    .select("access_token, teller_account_id, institution_name, teller_account_type")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  console.log("[teller/disconnect] enrollment lookup result:", {
    found: !!enrollment,
    teller_account_id: enrollment?.teller_account_id,
    institution_name: enrollment?.institution_name,
    teller_account_type: enrollment?.teller_account_type,
    lookupError: lookupError?.message ?? null,
  });

  if (enrollment) {
    // Revoke on Teller's side (best-effort)
    console.log("[teller/disconnect] calling Teller DELETE /accounts/" + enrollment.teller_account_id);
    try {
      await deleteTellerAccount(enrollment.access_token, enrollment.teller_account_id);
      console.log("[teller/disconnect] Teller account deleted successfully");
    } catch (err) {
      console.error("[teller/disconnect] Failed to revoke on Teller:", err);
      // Continue — still clean up locally
    }

    // Delete local enrollment record
    const { error: deleteError } = await supabase
      .from("teller_enrollments")
      .delete()
      .eq("account_id", accountId)
      .eq("user_id", user.id);

    console.log("[teller/disconnect] local enrollment deleted, error:", deleteError?.message ?? null);
  } else {
    console.log("[teller/disconnect] no enrollment found, skipping Teller revocation");
  }

  return NextResponse.json({ ok: true });
}
