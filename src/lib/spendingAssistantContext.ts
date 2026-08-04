import { formatToUSD } from "../app/utils/formatToUSD";

const TRANSACTION_WINDOW_DAYS = 90;
const MAX_TRANSACTIONS = 400;

interface ContextCategoryItem {
  name: string;
  assigned: number;
  activity: number;
  available: number;
}

interface ContextCategoryGroup {
  name: string;
  categoryItems: ContextCategoryItem[];
}

interface ContextMonthView {
  month: string;
  ready_to_assign: number;
  categories: ContextCategoryGroup[];
}

interface ContextTransaction {
  date: string;
  payee: string | null;
  category: string | null;
  category_group: string | null;
  balance: number;
}

// Renders a compact, deterministic text digest of the user's real budget
// state for injection into the spending assistant's system prompt. Pure and
// data-in/text-out so it's unit-testable without touching Supabase — the
// route layer is responsible for fetching monthView/transactions first.
// Determinism matters here: identical input must produce identical text so
// repeated turns in the same chat session hit Anthropic's prompt cache.
export function buildSpendingContext(input: {
  monthView: ContextMonthView;
  transactions: ContextTransaction[];
}): string {
  const { monthView, transactions } = input;

  const lines: string[] = [];

  lines.push(`Current month: ${monthView.month}`);
  lines.push(`Ready to Assign: ${formatToUSD(monthView.ready_to_assign)}`);
  lines.push("");
  lines.push("Categories this month (Assigned / Activity / Available):");

  for (const group of monthView.categories) {
    for (const item of group.categoryItems) {
      lines.push(
        `- ${group.name} > ${item.name}: ${formatToUSD(item.assigned)} / ${formatToUSD(
          item.activity
        )} / ${formatToUSD(item.available)}`
      );
    }
  }

  const cappedTransactions = transactions.slice(0, MAX_TRANSACTIONS);

  lines.push("");
  lines.push(
    `Transactions from the last ${TRANSACTION_WINDOW_DAYS} days (most recent first, up to ${MAX_TRANSACTIONS}):`
  );
  if (cappedTransactions.length === 0) {
    lines.push("- (none)");
  } else {
    for (const tx of cappedTransactions) {
      const category = tx.category_group
        ? `${tx.category_group} > ${tx.category}`
        : tx.category ?? "Uncategorized";
      lines.push(`- ${tx.date} | ${tx.payee ?? "Unknown"} | ${category} | ${formatToUSD(tx.balance)}`);
    }
  }

  return lines.join("\n");
}
