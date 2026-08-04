import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentBudgetId } from "@/lib/budgets";
import type { CreateGroupRequest } from "@/types/budget";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateGroupRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  // Determine next sort_order
  const { data: existing } = await supabase
    .from("category_groups")
    .select("sort_order")
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data: group, error } = await supabase
    .from("category_groups")
    .insert({ user_id: user.id, budget_id: currentBudgetId, name: body.name.trim(), sort_order: nextOrder })
    .select("id, name, sort_order")
    .single();

  if (error) {
    console.error("[category-group] POST error:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }

  return NextResponse.json(group, { status: 201 });
}
