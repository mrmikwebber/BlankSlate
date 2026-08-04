import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { format, subDays } from "date-fns";
import { loadBudgetState } from "@/lib/budgetLoader";
import { getCurrentBudgetId } from "@/lib/budgets";
import { serializeMonthView } from "../../../../../lib/budgetMath";
import { buildSpendingContext } from "@/lib/spendingAssistantContext";

const MAX_HISTORY_MESSAGES = 20;
const TRANSACTION_WINDOW_DAYS = 90;
const MAX_TRANSACTIONS = 400;

const SYSTEM_INSTRUCTIONS = `You are the spending assistant built into BlankSlate, a personal zero-based budgeting app. Answer questions about the user's budget and recent spending using only the data provided below.

You can only see the current month's category budget (assigned/activity/available) and transactions from the last ${TRANSACTION_WINDOW_DAYS} days. If asked about something outside that range, say so honestly instead of guessing. Be concise, use $ formatting, and reference specific categories or payees from the data when it helps answer the question.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[chat/spending-assistant] ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: "Spending assistant is not configured" }, { status: 500 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  let conversation = incoming
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== ""
    )
    .slice(-MAX_HISTORY_MESSAGES);

  // The API requires the first turn to be from the user — drop a leading
  // assistant message if the history cap happened to split mid-exchange.
  if (conversation[0]?.role === "assistant") {
    conversation = conversation.slice(1);
  }

  if (conversation.length === 0) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  const currentMonth = format(new Date(), "yyyy-MM");
  const windowStart = format(subDays(new Date(), TRANSACTION_WINDOW_DAYS), "yyyy-MM-dd");

  let contextText: string;
  try {
    const budgetId = await getCurrentBudgetId(supabase, user.id);
    const [state, txResult] = await Promise.all([
      loadBudgetState(supabase, user.id, budgetId),
      supabase
        .from("transactions")
        .select("date, payee, category, category_group, balance")
        .eq("user_id", user.id)
        .eq("budget_id", budgetId)
        .gte("date", windowStart)
        .order("date", { ascending: false })
        .limit(MAX_TRANSACTIONS),
    ]);

    if (txResult.error) throw txResult.error;

    const monthView = serializeMonthView(state, currentMonth);
    contextText = buildSpendingContext({
      monthView,
      transactions: txResult.data ?? [],
    });
  } catch (err) {
    console.error("[chat/spending-assistant] context build failed:", err);
    return NextResponse.json({ error: "Failed to load your budget data" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  let anthropicStream;
  try {
    anthropicStream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: `${SYSTEM_INSTRUCTIONS}\n\n${contextText}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: conversation,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited — try again in a moment" }, { status: 429 });
    }
    console.error("[chat/spending-assistant] failed to start stream:", err);
    return NextResponse.json({ error: "Spending assistant is temporarily unavailable" }, { status: 502 });
  }

  // Once we start streaming the response body, the status code is already
  // committed — any error from here on can only be surfaced as text in the
  // stream itself, not as an HTTP error status.
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            emitted = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("[chat/spending-assistant] stream error:", err);
        if (!emitted) {
          controller.enqueue(encoder.encode("Sorry, something went wrong answering that."));
        }
        controller.close();
        return;
      }
      if (!emitted) {
        controller.enqueue(encoder.encode("I wasn't able to answer that — try rephrasing the question."));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
