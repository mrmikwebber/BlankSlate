import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { isAdminUser, normalizeAdminList } from "@/lib/admin";

type PortUserPayload = {
  sourceUserId?: string;
  confirm?: boolean;
  replaceExisting?: boolean;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function POST(req: Request) {
  const supabaseAuth = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = normalizeAdminList(process.env.ADMIN_EMAILS);
  const adminIds = normalizeAdminList(process.env.ADMIN_USER_IDS);

  if (adminEmails.length === 0 && adminIds.length === 0) {
    return NextResponse.json({ error: "Admin list not configured" }, { status: 403 });
  }

  const isAdmin = isAdminUser(
    { email: user.email, id: user.id },
    { emails: adminEmails, ids: adminIds }
  );

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PortUserPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceUserId = (body.sourceUserId || "").trim();
  const confirm = Boolean(body.confirm);
  const replaceExisting = body.replaceExisting !== false;

  if (!sourceUserId) {
    return NextResponse.json({ error: "sourceUserId is required" }, { status: 400 });
  }

  if (!confirm) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
  }

  const targetUserId = user.id;
  if (sourceUserId === targetUserId) {
    return NextResponse.json(
      { error: "sourceUserId must be different from your account" },
      { status: 400 }
    );
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase service credentials" },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (replaceExisting) {
    const { error: txDeleteError } = await adminClient
      .from("transactions")
      .delete()
      .eq("user_id", targetUserId);
    if (txDeleteError) {
      return NextResponse.json({ error: txDeleteError.message }, { status: 500 });
    }

    const { error: payeeDeleteError } = await adminClient
      .from("transaction_payees")
      .delete()
      .eq("user_id", targetUserId);
    if (payeeDeleteError) {
      return NextResponse.json({ error: payeeDeleteError.message }, { status: 500 });
    }

    const { error: budgetDeleteError } = await adminClient
      .from("budget_data")
      .delete()
      .eq("user_id", targetUserId);
    if (budgetDeleteError) {
      return NextResponse.json({ error: budgetDeleteError.message }, { status: 500 });
    }

    const { error: accountsDeleteError } = await adminClient
      .from("accounts")
      .delete()
      .eq("user_id", targetUserId);
    if (accountsDeleteError) {
      return NextResponse.json(
        { error: accountsDeleteError.message },
        { status: 500 }
      );
    }
  }

  const [accountsRes, transactionsRes, budgetRes, payeesRes] = await Promise.all([
    adminClient.from("accounts").select("*").eq("user_id", sourceUserId),
    adminClient.from("transactions").select("*").eq("user_id", sourceUserId),
    adminClient.from("budget_data").select("*").eq("user_id", sourceUserId),
    adminClient
      .from("transaction_payees")
      .select("*")
      .eq("user_id", sourceUserId),
  ]);

  if (accountsRes.error) {
    return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
  }
  if (transactionsRes.error) {
    return NextResponse.json(
      { error: transactionsRes.error.message },
      { status: 500 }
    );
  }
  if (budgetRes.error) {
    return NextResponse.json({ error: budgetRes.error.message }, { status: 500 });
  }
  if (payeesRes.error) {
    return NextResponse.json({ error: payeesRes.error.message }, { status: 500 });
  }

  const sourceAccounts = accountsRes.data || [];
  const sourceTransactions = transactionsRes.data || [];
  const sourceBudgets = budgetRes.data || [];
  const sourcePayees = payeesRes.data || [];

  const accountIdMap = new Map<string, string>();

  for (const account of sourceAccounts) {
    const { id: sourceId, user_id: _userId, ...accountPayload } = account as any;
    const { data: inserted, error: insertError } = await adminClient
      .from("accounts")
      .insert({ ...accountPayload, user_id: targetUserId })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to insert account" },
        { status: 500 }
      );
    }

    accountIdMap.set(String(sourceId), String(inserted.id));
  }

  if (sourceTransactions.length > 0) {
    const txPayload = [] as any[];
    for (const tx of sourceTransactions) {
      const { id: _txId, user_id: _userId, account_id, ...txBody } = tx as any;
      const newAccountId = accountIdMap.get(String(account_id));
      if (!newAccountId) {
        return NextResponse.json(
          { error: `Missing account mapping for account_id ${account_id}` },
          { status: 500 }
        );
      }
      txPayload.push({
        ...txBody,
        user_id: targetUserId,
        account_id: newAccountId,
      });
    }

    for (const chunk of chunkArray(txPayload, 250)) {
      const { error: txInsertError } = await adminClient
        .from("transactions")
        .insert(chunk);
      if (txInsertError) {
        return NextResponse.json(
          { error: txInsertError.message },
          { status: 500 }
        );
      }
    }
  }

  if (sourceBudgets.length > 0) {
    const budgetPayload = sourceBudgets.map((row) => {
      const { id: _id, user_id: _userId, ...rest } = row as any;
      return { ...rest, user_id: targetUserId };
    });

    for (const chunk of chunkArray(budgetPayload, 200)) {
      const { error: budgetInsertError } = await adminClient
        .from("budget_data")
        .upsert(chunk, { onConflict: "user_id,month" });
      if (budgetInsertError) {
        return NextResponse.json(
          { error: budgetInsertError.message },
          { status: 500 }
        );
      }
    }
  }

  if (sourcePayees.length > 0) {
    const payeePayload = sourcePayees.map((row) => {
      const { id: _id, user_id: _userId, ...rest } = row as any;
      return { ...rest, user_id: targetUserId };
    });

    for (const chunk of chunkArray(payeePayload, 200)) {
      const { error: payeeInsertError } = await adminClient
        .from("transaction_payees")
        .upsert(chunk, { onConflict: "user_id,name" });
      if (payeeInsertError) {
        return NextResponse.json(
          { error: payeeInsertError.message },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    copied: {
      accounts: sourceAccounts.length,
      transactions: sourceTransactions.length,
      budgetRows: sourceBudgets.length,
      payees: sourcePayees.length,
    },
    targetUserId,
    replaceExisting,
  });
}
