import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { isAdminUser, normalizeAdminList } from "@/lib/admin";

export async function GET() {
  const supabaseAuth = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }

  const adminEmails = normalizeAdminList(process.env.ADMIN_EMAILS);
  const adminIds = normalizeAdminList(process.env.ADMIN_USER_IDS);

  const isAdmin = isAdminUser(
    { email: user.email, id: user.id },
    { emails: adminEmails, ids: adminIds }
  );

  return NextResponse.json({ isAdmin }, { status: 200 });
}
