import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentBudgetId } from "@/lib/budgets";
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
  if (body.groupId !== undefined) updates.group_id = body.groupId;
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
  if (body.snoozed !== undefined) updates.snoozed = body.snoozed;
  if (body.target !== undefined) updates.target = body.target;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.isDiscretionaryPool !== undefined) updates.is_discretionary_pool = body.isDiscretionaryPool;
  if (body.isHiddenFromInsights !== undefined) updates.hide_from_insights = body.isHiddenFromInsights;
  if (body.archived !== undefined) updates.archived_at = body.archived ? new Date().toISOString() : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  const isRenaming = typeof updates.name === "string";
  const isMovingGroup = typeof updates.group_id === "string";

  // Look up the item's pre-update state once, up front, whenever a rename or
  // group move is happening — used below both for the Credit Card Payments
  // guard/sync and for cascading the rename/move to already-categorized
  // transactions (see the cascade block after the update, below).
  let existingItem: { name: string; group_id: string } | null = null;
  let oldGroupName: string | null = null;
  let newGroupName: string | null = null;
  if (isRenaming || isMovingGroup) {
    const { data: existing } = await supabase
      .from("category_items")
      .select("name, group_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId)
      .single();
    existingItem = existing ?? null;

    if (existingItem) {
      const groupIdsToLookup = isMovingGroup
        ? [existingItem.group_id, updates.group_id as string]
        : [existingItem.group_id];
      const { data: groupRows } = await supabase
        .from("category_groups")
        .select("id, name")
        .in("id", groupIdsToLookup)
        .eq("user_id", user.id)
        .eq("budget_id", currentBudgetId);

      oldGroupName = groupRows?.find((g) => g.id === existingItem!.group_id)?.name ?? null;
      newGroupName = isMovingGroup
        ? groupRows?.find((g) => g.id === updates.group_id)?.name ?? null
        : oldGroupName;
    }
  }

  // "Credit Card Payments" is special-cased by exact name match, not a real
  // FK (see ccItemToAccountId in lib/budgetMath.ts) — moving an item into or
  // out of it would either silently stop it from being treated as card debt,
  // or start being treated as one with no matching account. The drag/drop UI
  // already blocks this; guard it server-side too since this is a real state
  // transition, not just a rename.
  if (isMovingGroup && existingItem) {
    const fromIsCc = oldGroupName === "Credit Card Payments";
    const toIsCc = newGroupName === "Credit Card Payments";
    if (fromIsCc !== toIsCc) {
      return NextResponse.json(
        { error: "Cannot move a category into or out of Credit Card Payments" },
        { status: 400 }
      );
    }
  }

  // Credit Card Payments items are linked to their account by exact name
  // match (no real foreign key — see lib/budgetMath.ts ccItemToAccountId).
  // If this rename would break that link, capture the pre-rename name so we
  // can rename the matching account to follow, keeping the link intact.
  let oldNameForCcSync: string | null = null;
  if (isRenaming && existingItem && existingItem.name !== updates.name && oldGroupName === "Credit Card Payments") {
    oldNameForCcSync = existingItem.name;
  }

  const { data, error } = await supabase
    .from("category_items")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId)
    .select("id, group_id, name, sort_order, snoozed, target, notes, notes_history, is_discretionary_pool, hide_from_insights, archived_at")
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

  // Transactions store their own denormalized `category`/`category_group`
  // text (the calc engine only reads `category_item_id`, but the register
  // UI reads this text directly) — without this, a renamed or moved
  // category would keep showing its old label on every transaction already
  // categorized under it, forever, even though the "real" (id-based) link
  // is correct. Cascade it here, once, at the point of mutation.
  if (isRenaming && existingItem && existingItem.name !== updates.name) {
    const { error: cascadeError } = await supabase
      .from("transactions")
      .update({ category: data.name })
      .eq("category_item_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);
    if (cascadeError) {
      console.error("[category-item/[id]] failed to cascade rename to transactions:", cascadeError);
    }
  }
  if (isMovingGroup && newGroupName && oldGroupName !== newGroupName) {
    const { error: cascadeError } = await supabase
      .from("transactions")
      .update({ category_group: newGroupName })
      .eq("category_item_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);
    if (cascadeError) {
      console.error("[category-item/[id]] failed to cascade group move to transactions:", cascadeError);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
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

  const currentBudgetId = await getCurrentBudgetId(supabase, user.id);

  let reassignToItemId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.reassignToItemId === "string") reassignToItemId = body.reassignToItemId;
  } catch {
    // No JSON body sent — plain delete attempt, handled below.
  }

  if (reassignToItemId) {
    const { data: targetItem } = await supabase
      .from("category_items")
      .select("id, name, group_id")
      .eq("id", reassignToItemId)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId)
      .single();
    if (!targetItem) {
      return NextResponse.json({ error: "Invalid reassignment target" }, { status: 400 });
    }
    const { data: targetGroup } = await supabase
      .from("category_groups")
      .select("name")
      .eq("id", targetItem.group_id)
      .single();

    // Re-point every transaction still on the item being deleted at the
    // chosen target before it's gone — both the real link (category_item_id)
    // and the denormalized `category`/`category_group` text the register UI
    // reads directly (see the rename cascade above for the same reasoning).
    const { error: reassignError } = await supabase
      .from("transactions")
      .update({
        category_item_id: targetItem.id,
        category: targetItem.name,
        category_group: targetGroup?.name ?? null,
      })
      .eq("category_item_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);
    if (reassignError) {
      console.error("[category-item/[id]] DELETE reassign error:", reassignError);
      return NextResponse.json({ error: "Failed to reassign transactions" }, { status: 500 });
    }

    // Move assigned funds (every month, not just the one currently in view)
    // onto the target too — the prompt says "existing funds or activity",
    // and leaving them behind would let the item being deleted cascade-delete
    // its budget_assignments rows via FK, quietly handing that money back to
    // Ready to Assign instead of following it to the target category.
    const { data: sourceAssignments } = await supabase
      .from("budget_assignments")
      .select("month, assigned")
      .eq("category_item_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);

    const nonZeroSource = (sourceAssignments ?? []).filter((a) => a.assigned);
    if (nonZeroSource.length > 0) {
      const { data: targetAssignments } = await supabase
        .from("budget_assignments")
        .select("month, assigned")
        .eq("category_item_id", targetItem.id)
        .eq("user_id", user.id)
        .eq("budget_id", currentBudgetId);
      const targetByMonth = new Map((targetAssignments ?? []).map((a) => [a.month, a.assigned]));

      const upserts = nonZeroSource.map((a) => ({
        user_id: user.id,
        budget_id: currentBudgetId,
        category_item_id: targetItem.id,
        month: a.month,
        assigned: (targetByMonth.get(a.month) ?? 0) + a.assigned,
      }));

      const { error: assignError } = await supabase
        .from("budget_assignments")
        .upsert(upserts, { onConflict: "user_id,category_item_id,month" });
      if (assignError) {
        console.error("[category-item/[id]] DELETE reassign assignments error:", assignError);
        return NextResponse.json({ error: "Failed to reassign assigned funds" }, { status: 500 });
      }
    }
  } else {
    // No reassignment target given — refuse to delete if this item still has
    // transactions anywhere in its history (not just the currently-viewed
    // month). Deleting out from under them would silently null their
    // category_item_id via the FK, dropping real spending out of every
    // budget total with no warning.
    const { count: txCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("category_item_id", id)
      .eq("user_id", user.id)
      .eq("budget_id", currentBudgetId);

    if ((txCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "HAS_TRANSACTIONS", transactionCount: txCount },
        { status: 409 }
      );
    }
  }

  // Cascade deletes budget_assignments via FK constraints
  const { error } = await supabase
    .from("category_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("budget_id", currentBudgetId);

  if (error) {
    console.error("[category-item/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
