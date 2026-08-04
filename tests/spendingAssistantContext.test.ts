import { describe, expect, it } from "vitest";
import { buildSpendingContext } from "../src/lib/spendingAssistantContext";

const baseMonthView = {
  month: "2026-07",
  ready_to_assign: 123.45,
  categories: [
    {
      name: "Food",
      categoryItems: [
        { name: "Groceries", assigned: 500, activity: -420.5, available: 79.5 },
      ],
    },
  ],
};

describe("buildSpendingContext", () => {
  it("includes the month, ready to assign, and category lines", () => {
    const text = buildSpendingContext({ monthView: baseMonthView, transactions: [] });
    expect(text).toContain("Current month: 2026-07");
    expect(text).toContain("Ready to Assign: $123.45");
    expect(text).toContain("Food > Groceries: $500.00 / -$420.50 / $79.50");
  });

  it("renders transactions with group > category and formatted amount", () => {
    const text = buildSpendingContext({
      monthView: baseMonthView,
      transactions: [
        { date: "2026-07-20", payee: "Trader Joe's", category: "Groceries", category_group: "Food", balance: -45.23 },
      ],
    });
    expect(text).toContain("2026-07-20 | Trader Joe's | Food > Groceries | -$45.23");
  });

  it("falls back to 'Uncategorized' and 'Unknown' for missing fields", () => {
    const text = buildSpendingContext({
      monthView: baseMonthView,
      transactions: [{ date: "2026-07-01", payee: null, category: null, category_group: null, balance: 10 }],
    });
    expect(text).toContain("2026-07-01 | Unknown | Uncategorized | $10.00");
  });

  it("shows a placeholder line when there are no transactions", () => {
    const text = buildSpendingContext({ monthView: baseMonthView, transactions: [] });
    expect(text).toContain("- (none)");
  });

  it("caps the transaction list at 400 entries", () => {
    const transactions = Array.from({ length: 500 }, (_, i) => ({
      date: "2026-07-01",
      payee: `Payee ${i}`,
      category: "Groceries",
      category_group: "Food",
      balance: -1,
    }));
    const text = buildSpendingContext({ monthView: baseMonthView, transactions });
    const lines = text.split("\n").filter((l) => l.startsWith("- 2026-07-01"));
    expect(lines).toHaveLength(400);
  });

  it("produces identical output for identical input (deterministic for prompt caching)", () => {
    const a = buildSpendingContext({ monthView: baseMonthView, transactions: [] });
    const b = buildSpendingContext({ monthView: baseMonthView, transactions: [] });
    expect(a).toBe(b);
  });
});
