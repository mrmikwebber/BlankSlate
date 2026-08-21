import { describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import {
  detectSubscriptions,
  normalizePayee,
  type TransactionLike,
} from "../src/lib/detectSubscriptions";

function d(base: string, days: number): string {
  return format(addDays(new Date(`${base}T00:00:00`), days), "yyyy-MM-dd");
}

function tx(date: string, payee: string, amount: number, overrides: Partial<TransactionLike> = {}): TransactionLike {
  return {
    date,
    payee,
    balance: -Math.abs(amount),
    category: "Subscriptions",
    category_group: "Bills",
    ...overrides,
  };
}

describe("normalizePayee", () => {
  it("strips card-network suffixes after * and collapses punctuation", () => {
    expect(normalizePayee("NETFLIX.COM*A1B2C3")).toBe("netflix com");
  });

  it("strips store numbers, embedded dates, and long digit runs", () => {
    expect(normalizePayee("Target #4521 01/15 ref 1234567")).toBe("target ref");
  });

  it("lowercases and collapses whitespace/punctuation", () => {
    expect(normalizePayee("  Spotify -- USA  ")).toBe("spotify usa");
  });
});

describe("detectSubscriptions", () => {
  it("detects a monthly subscription from exactly 3 evenly-spaced occurrences", () => {
    const base = "2026-01-05";
    const txs = [
      tx(d(base, 0), "Netflix", 15.49),
      tx(d(base, 30), "Netflix", 15.49),
      tx(d(base, 61), "Netflix", 15.49),
    ];
    const result = detectSubscriptions(txs, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ cadence: "monthly", occurrenceCount: 3, typicalAmount: 15.49 });
  });

  it("rejects exactly-3-point series when the two gaps land in different cadence buckets", () => {
    const base = "2026-01-05";
    const txs = [
      tx(d(base, 0), "Random Store", 20),
      tx(d(base, 7), "Random Store", 20), // weekly gap
      tx(d(base, 37), "Random Store", 20), // monthly gap
    ];
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0);
  });

  it("still matches a monthly cadence when one occurrence lands a couple days late", () => {
    const base = "2026-01-05";
    const txs = [
      tx(d(base, 0), "Gym", 40),
      tx(d(base, 30), "Gym", 40),
      tx(d(base, 62), "Gym", 40), // 32-day gap, still within monthly bucket
      tx(d(base, 91), "Gym", 40),
    ];
    const result = detectSubscriptions(txs, new Set());
    expect(result).toHaveLength(1);
    expect(result[0].cadence).toBe("monthly");
    expect(result[0].occurrenceCount).toBe(4);
  });

  it("tolerates a 15% price bump on a yearly cadence, but drops the stale occurrence for the same bump on a monthly cadence", () => {
    const base = "2025-01-05";
    const yearly = [
      tx(d(base, 0), "Domain Renewal", 100),
      tx(d(base, 365), "Domain Renewal", 115),
      tx(d(base, 730), "Domain Renewal", 115),
    ];
    const yearlyResult = detectSubscriptions(yearly, new Set());
    expect(yearlyResult).toHaveLength(1);
    expect(yearlyResult[0].cadence).toBe("yearly");
    // All 3 stay in tolerance (20% yearly band), including the pre-bump one.
    expect(yearlyResult[0].occurrenceCount).toBe(3);

    const monthlyBase = "2026-01-05";
    const monthly = [
      tx(d(monthlyBase, 0), "Streaming Co", 50),
      tx(d(monthlyBase, 30), "Streaming Co", 57.5),
      tx(d(monthlyBase, 60), "Streaming Co", 57.5),
      tx(d(monthlyBase, 90), "Streaming Co", 57.5),
    ];
    const monthlyResult = detectSubscriptions(monthly, new Set());
    expect(monthlyResult).toHaveLength(1);
    // The pre-bump $50 occurrence falls outside the tighter 10% monthly
    // band and is dropped, but the 3 post-bump occurrences still meet
    // MIN_OCCURRENCES so the candidate still surfaces on the new price.
    expect(monthlyResult[0].occurrenceCount).toBe(3);
    expect(monthlyResult[0].typicalAmount).toBe(57.5);
  });

  it("never surfaces a payee with fewer than 3 occurrences", () => {
    const base = "2026-01-05";
    const txs = [tx(d(base, 0), "New Service", 9.99), tx(d(base, 30), "New Service", 9.99)];
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0);
  });

  it("excludes transfer-shaped transactions even when the cadence would otherwise qualify", () => {
    const base = "2026-01-05";
    const txs = [
      tx(d(base, 0), "Transfer to Savings", 200, { category: null, category_group: null }),
      tx(d(base, 30), "Transfer to Savings", 200, { category: null, category_group: null }),
      tx(d(base, 61), "Transfer to Savings", 200, { category: null, category_group: null }),
    ];
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0);
  });

  it("excludes a payee whose normalized key has been dismissed", () => {
    const base = "2026-01-05";
    const txs = [
      tx(d(base, 0), "Amazon Prime", 14.99),
      tx(d(base, 30), "Amazon Prime", 14.99),
      tx(d(base, 61), "Amazon Prime", 14.99),
    ];
    expect(detectSubscriptions(txs, new Set([normalizePayee("Amazon Prime")]))).toHaveLength(0);
  });
});
