import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { CreateItemRequest } from "@/types/budget";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateItemRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Verify the group belongs to this user
  const { data: group, error: groupError } = await supabase
    .from("category_groups")
    .select("id")
    .eq("id", body.groupId)
    .eq("user_id", user.id)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Category group not found" }, { status: 404 });
  }

  // Determine next sort_order within this group
  const { data: existing } = await supabase
    .from("category_items")
    .select("sort_order")
    .eq("group_id", body.groupId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder =
    body.sortOrder !== undefined
      ? body.sortOrder
      : ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data: item, error } = await supabase
    .from("category_items")
    .insert({
      user_id: user.id,
      group_id: body.groupId,
      name: body.name.trim(),
      sort_order: nextOrder,
    })
    .select("id, group_id, name, sort_order, snoozed, target, notes, notes_history")
    .single();

  if (error) {
    console.error("[category-item] POST error:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }

  return NextResponse.json(item, { status: 201 });
}
