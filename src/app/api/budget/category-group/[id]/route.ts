import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentBudgetId } from "@/lib/budgets";
import type { UpdateGroupRequest } from "@/types/budget";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateGroupRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  const isRenaming = typeof updates.name === "string";
  let oldName: string | null = null;
  if (isRenaming) {
    const { data: existing } = await supabase
      .from("category_groups")
      .select("name")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId)
      .single();
    oldName = existing?.name ?? null;
  }

  const { data, error } = await supabase
    .from("category_groups")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId)
    .select("id, name, sort_order")
    .single();

  if (error) {
    console.error("[category-group/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }

  // Transactions store their own denormalized `category_group` text (the
  // calc engine only reads `category_item_id`, but the register UI reads
  // this text directly) — cascade a real rename to every already-categorized
  // transaction under this group, or they'd keep showing the old group name
  // forever. Scoped via each item's id, not a blind text match on the old
  // name, so it stays correct even if a transaction's stored text had
  // already drifted from an earlier group move.
  if (isRenaming && oldName !== null && oldName !== data.name) {
    const { data: itemRows } = await supabase
      .from("category_items")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);
    const itemIds = (itemRows ?? []).map((r) => r.id);
    if (itemIds.length > 0) {
      const { error: cascadeError } = await supabase
        .from("transactions")
        .update({ category_group: data.name })
        .in("category_item_id", itemIds)
        .eq("user_id", user.id)
        .eq("budget_id", currentBudgetId);
      if (cascadeError) {
        console.error("[category-group/[id]] failed to cascade rename to transactions:", cascadeError);
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  // Cascade deletes items and assignments via FK constraints
  const { error } = await supabase
    .from("category_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId);

  if (error) {
    console.error("[category-group/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
