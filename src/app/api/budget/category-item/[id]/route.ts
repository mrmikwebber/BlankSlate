import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { UpdateItemRequest } from "@/types/budget";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("category_items")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, group_id, name, sort_order, snoozed, target, notes, notes_history")
    .single();

  if (error) {
    console.error("[category-item/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
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
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[category-item/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
