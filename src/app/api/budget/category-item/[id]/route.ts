import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { UpdateItemRequest } from "@/types/budget";

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

  let body: UpdateItemRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
  if (body.snoozed !== undefined) updates.snoozed = body.snoozed;
  if (body.target !== undefined) updates.target = body.target;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.isDiscretionaryPool !== undefined) updates.is_discretionary_pool = body.isDiscretionaryPool;
  if (body.isHiddenFromInsights !== undefined) updates.hide_from_insights = body.isHiddenFromInsights;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Credit Card Payments items are linked to their account by exact name
  // match (no real foreign key — see lib/budgetMath.ts ccItemToAccountId).
  // If this rename would break that link, capture the pre-rename name so we
  // can rename the matching account to follow, keeping the link intact.
  let oldNameForCcSync: string | null = null;
  if (typeof updates.name === "string") {
    const { data: existing } = await supabase
      .from("category_items")
      .select("name, group_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (existing && existing.name !== updates.name) {
      const { data: groupRow } = await supabase
        .from("category_groups")
        .select("name")
        .eq("id", existing.group_id)
        .eq("user_id", user.id)
        .single();
      if (groupRow?.name === "Credit Card Payments") {
        oldNameForCcSync = existing.name;
      }
    }
  }

  const { data, error } = await supabase
    .from("category_items")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, group_id, name, sort_order, snoozed, target, notes, notes_history, is_discretionary_pool, hide_from_insights")
    .single();

  if (error) {
    console.error("[category-item/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }

  if (oldNameForCcSync) {
    const { error: accountRenameError } = await supabase
      .from("accounts")
      .update({ name: data.name })
      .eq("user_id", user.id)
      .eq("type", "credit")
      .eq("name", oldNameForCcSync);
    if (accountRenameError) {
      console.error("[category-item/[id]] failed to sync account name:", accountRenameError);
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

  // Cascade deletes budget_assignments via FK constraints
  const { error } = await supabase
    .from("category_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[category-item/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
