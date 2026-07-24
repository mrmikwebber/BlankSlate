import { describe, expect, it } from "vitest";
import { findLastCategoryForPayee } from "../src/app/utils/lastCategoryForPayee";

describe("findLastCategoryForPayee", () => {
  it("returns null when no transaction matches the payee", () => {
    const accounts = [
      { transactions: [{ date: "2026-07-01", payee: "Costco", category: "Groceries", category_group: "Food" }] },
    ];
    expect(findLastCategoryForPayee(accounts, "Target")).toBeNull();
  });

  it("returns the most recent match across multiple accounts", () => {
    const accounts = [
      {
        transactions: [
          { date: "2026-06-01", payee: "Amazon", category: "Household", category_group: "Home" },
        ],
      },
      {
        transactions: [
          { date: "2026-07-10", payee: "Amazon", category: "Electronics", category_group: "Fun" },
          { date: "2026-05-01", payee: "Amazon", category: "Books", category_group: "Fun" },
        ],
      },
    ];
    expect(findLastCategoryForPayee(accounts, "Amazon")).toEqual({
      category: "Electronics",
      categoryGroup: "Fun",
    });
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const accounts = [
      { transactions: [{ date: "2026-07-01", payee: "  Costco  ", category: "Groceries", category_group: "Food" }] },
    ];
    expect(findLastCategoryForPayee(accounts, "costco")).toEqual({
      category: "Groceries",
      categoryGroup: "Food",
    });
  });

  it("skips transactions with no category (e.g. uncategorized imports)", () => {
    const accounts = [
      {
        transactions: [
          { date: "2026-07-10", payee: "Amazon", category: null, category_group: null },
          { date: "2026-06-01", payee: "Amazon", category: "Household", category_group: "Home" },
        ],
      },
    ];
    expect(findLastCategoryForPayee(accounts, "Amazon")).toEqual({
      category: "Household",
      categoryGroup: "Home",
    });
  });

  it("returns null for an empty payee name", () => {
    const accounts = [
      { transactions: [{ date: "2026-07-01", payee: "Costco", category: "Groceries", category_group: "Food" }] },
    ];
    expect(findLastCategoryForPayee(accounts, "   ")).toBeNull();
  });
});
