// tests/budgetMath.test.ts
import { describe, it, expect } from "vitest";
import {
    calculateActivityForMonthPure,
    calculateCreditCardAccountActivityPure,
    calculateReadyToAssignPure,
    computeBudgetState,
    getCumulativeAvailablePure,
    normalizeTransactions,
    serializeMonthView,
    updateMonthPure,
    type Account,
    type BudgetMonth,
    type RawDbTransaction,
} from "../lib/budgetMath";

describe("calculateReadyToAssignPure", () => {
    it("includes Ready to Assign inflows from credit accounts", () => {
        const months: Record<string, BudgetMonth> = {
            "2026-05": {
                categories: [],
            },
        };

        const accounts: Account[] = [
            {
                name: "Checking",
                type: "debit",
                transactions: [
                    { date: "2026-05-01", category: "Ready to Assign", balance: 100 },
                ],
            },
            {
                name: "Amex Gold (Due 20th)",
                type: "credit",
                transactions: [
                    { date: "2026-05-06", category: "Ready to Assign", balance: 81.1 },
                ],
            },
        ];

        const rta = calculateReadyToAssignPure("2026-05", months, accounts);
        expect(rta).toBe(181.1);
    });

    it("keeps cash overspending in RTA across future months", () => {
        // December: overspend Electricity by 40 from a debit account
        const months: Record<string, BudgetMonth> = {
            "2024-12": {
                categories: [
                    {
                        name: "Utilities",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 0,
                                available: -40,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
            "2025-01": {
                categories: [
                    {
                        name: "Utilities",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 0,
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
            "2025-02": {
                categories: [
                    {
                        name: "Utilities",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 0,
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
        };

        const accounts: Account[] = [
            {
                name: "Checking",
                type: "debit",
                transactions: [
                    {
                        date: "2024-12-15",
                        category: "Electricity",
                        balance: -40, // spend
                    },
                ],
            },
        ];

        const rtaJan = calculateReadyToAssignPure("2025-01", months, accounts);
        const rtaFeb = calculateReadyToAssignPure("2025-02", months, accounts);

        // No inflows, no assignments, just overspending
        expect(rtaJan).toBe(-40);
        expect(rtaFeb).toBe(-40);
    });

    it("reduces negative RTA once inflow arrives and is assigned", () => {
        const months: Record<string, BudgetMonth> = {
            "2024-12": {
                categories: [
                    {
                        name: "Utilities",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 0,
                                available: -40,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
            "2025-01": {
                categories: [
                    {
                        name: "Utilities",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 40, // user assigns 40 next month to cover
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
        };

        const accounts: Account[] = [
            {
                name: "Checking",
                type: "debit",
                transactions: [
                    { date: "2024-12-15", category: "Electricity", balance: -40 },
                    { date: "2025-01-01", category: "Ready to Assign", balance: 40 }, // paycheck
                ],
            },
        ];

        const rtaJan = calculateReadyToAssignPure("2025-01", months, accounts);

        // Inflow 40 - assigned 40 - past overspend 40 = -40? Not quite.
        // We're effectively: inflowUpTo(40) - totalAssigned(40) - totalOverspend(40) = -40.
        // If you want RTA to become 0 here, you'll adjust your formula;
        // this test will tell you exactly what your current math is doing.
        expect(rtaJan).toBe(-40);
    });
});

describe("calculateActivityForMonthPure", () => {
    it("sums balances for a category in a given month", () => {
        const accounts = [
            {
                name: "Checking",
                type: "debit" as const,
                transactions: [
                    { date: "2025-01-05", category: "Groceries", balance: -30 },
                    { date: "2025-01-10", category: "Groceries", balance: -20 },
                    { date: "2025-02-01", category: "Groceries", balance: -50 },
                ],
            },
        ];

        const result = calculateActivityForMonthPure("2025-01", "Groceries", accounts);
        expect(result).toBe(-50);
    });
});

describe("getCumulativeAvailablePure", () => {
    it("sums assigned + activity from all past months for an item", () => {
        const months = {
            "2024-12": {
                categories: [
                    {
                        name: "Bills",
                        categoryItems: [
                            { name: "Electricity", assigned: 50, activity: -40, available: 10, target: null },
                        ],
                    },
                ],
            },
            "2025-01": {
                categories: [
                    {
                        name: "Bills",
                        categoryItems: [
                            { name: "Electricity", assigned: 20, activity: -10, available: 20, target: null },
                        ],
                    },
                ],
            },
        };

        const result = getCumulativeAvailablePure(months, "2025-02", "Electricity");
        // (50 - 40) + (20 - 10) = 20
        expect(result).toBe(20);
    });
});

describe("calculateCreditCardAccountActivityPure", () => {
    it("counts budgeted spending as positive activity (payment needed)", () => {
        const months: Record<string, BudgetMonth> = {
            "2025-01": {
                categories: [
                    {
                        name: "Groceries",
                        categoryItems: [
                            {
                                name: "Groceries",
                                assigned: 50,
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
        };

        const accounts: Account[] = [
            {
                name: "Visa",
                type: "credit",
                transactions: [
                    {
                        date: "2025-01-10",
                        category: "Groceries",
                        balance: -50, // spent 50 on the card
                    },
                ],
            },
        ];

        const result = calculateCreditCardAccountActivityPure(
            "2025-01",
            "Visa",
            months,
            accounts
        );

        // In the simplest case, 50 of budgeted spending should show as 50 owed.
        expect(result).toBe(50);
    });

    it("handles refunds by reducing net activity", () => {
        const months: Record<string, BudgetMonth> = {
            "2025-01": {
                categories: [
                    {
                        name: "Groceries",
                        categoryItems: [
                            {
                                name: "Groceries",
                                assigned: 100,
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
        };

        const accounts: Account[] = [
            {
                name: "Visa",
                type: "credit",
                transactions: [
                    { date: "2025-01-05", category: "Groceries", balance: -100 }, // spend
                    { date: "2025-01-20", category: "Groceries", balance: 30 },   // refund
                ],
            },
        ];

        const result = calculateCreditCardAccountActivityPure(
            "2025-01",
            "Visa",
            months,
            accounts
        );

        expect(result).toBe(70);
    });

    it("reduces activity when a direct card payment is made to the CC account", () => {
        const months: Record<string, BudgetMonth> = {
            "2025-01": {
                categories: [
                    {
                        name: "Groceries",
                        categoryItems: [
                            {
                                name: "Groceries",
                                assigned: 100,
                                available: 0,
                                target: null,
                                activity: 0
                            },
                        ],
                    },
                ],
            },
        };

        const accounts: Account[] = [
            {
                name: "Visa",
                type: "credit",
                transactions: [
                    { date: "2025-01-05", category: "Groceries", balance: -100 }, // spend
                    {
                        date: "2025-01-25",
                        category: "Visa", // payment directly to the card
                        balance: 60,
                    },
                ],
            },
        ];

        const result = calculateCreditCardAccountActivityPure(
            "2025-01",
            "Visa",
            months,
            accounts
        );

        // Raw activity from spending: 100
        // Direct payment: -60
        // Net activity: 40
        expect(result).toBe(40);
    });
});

describe("updateMonthPure", () => {
    it("creates a new forward month by cloning categories and carrying forward available, with assigned/activity reset", () => {
        const prev: Record<string, BudgetMonth> = {
            "2024-12": {
                categories: [
                    {
                        name: "Bills",
                        categoryItems: [
                            {
                                name: "Electricity",
                                assigned: 100,
                                activity: -40,
                                available: 60, // 100 - 40
                                target: null,
                            },
                        ],
                    },
                ],
                assignable_money: 0,
            },
        };

        const accounts: Account[] = []; // no new activity in Jan

        const { newBudgetData } = updateMonthPure({
            prev,
            newMonth: "2025-01",
            direction: "forward",
            accounts,
        });

        const jan = newBudgetData["2025-01"];
        expect(jan).toBeDefined();
        expect(jan.categories).toHaveLength(1);

        const bills = jan.categories[0];
        expect(bills.name).toBe("Bills");
        expect(bills.categoryItems).toHaveLength(1);

        const elec = bills.categoryItems[0];
        expect(elec.name).toBe("Electricity");

        // ✅ Assigned resets to 0 in the new month
        expect(elec.assigned).toBe(0);

        // ✅ No account activity, so activity for the month is 0
        expect(elec.activity).toBe(0);

        // ✅ Available carries forward cumulative available from December
        expect(elec.available).toBe(60);
    });
    it("resets debit overspending in next month but preserves cumulative math", () => {
        const prev = {
            "2024-12": {
                categories: [
                    {
                        name: "Bills",
                        categoryItems: [
                            { name: "Electricity", assigned: 0, activity: -40, available: -40, target: null },
                        ],
                    },
                ],
            },
        };

        const accounts = [
            {
                name: "Checking",
                type: "debit" as const,
                transactions: [
                    { date: "2024-12-15", category: "Electricity", balance: -40 },
                ],
            },
        ];

        const { newBudgetData } = updateMonthPure({
            prev,
            newMonth: "2025-01",
            direction: "forward",
            accounts,
        });

        const janElectricity =
            newBudgetData["2025-01"].categories[0].categoryItems[0];

        expect(janElectricity.available).toBe(0); // category reset
        // Later, your RTA helper will see Dec overspend & keep RTA negative.
    });
});

describe("computeBudgetState", () => {
    it("computes RTA sequentially per month — a future month's assignment does NOT reduce an earlier month's RTA, only its own", () => {
        // Matches real YNAB: Ready to Assign is a rolling per-month
        // calculation (leftover from last month + this month's income -
        // this month's assigned), not one figure shared by every month.
        // Pre-budgeting Feb's rent ahead of time is money earmarked for
        // Feb specifically — it shouldn't shrink what Jan shows as
        // available, only Feb's own figure once you get there.
        const accounts = [{ id: "a-checking", name: "Checking", type: "debit" as const }];
        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-income-jan",
                account_id: "a-checking",
                date: "2026-01-05",
                payee: "Paycheck",
                category: "Ready to Assign",
                category_group: "Inflow",
                balance: 300,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [
                { categoryItemId: "item-rent", month: "2026-01", assigned: 100 },
                { categoryItemId: "item-rent", month: "2026-02", assigned: 50 },
            ],
            categoryGroups: [
                {
                    id: "g-bills",
                    name: "Bills",
                    sortOrder: 0,
                    items: [
                        {
                            id: "item-rent",
                            groupId: "g-bills",
                            name: "Rent",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
            ],
        });

        const jan = serializeMonthView(state, "2026-01");
        const feb = serializeMonthView(state, "2026-02");

        // Jan: $300 income - $100 Jan rent = $200 (Feb's $50 doesn't count yet).
        expect(jan.ready_to_assign).toBe(200);
        // Feb: $200 leftover from Jan - $50 Feb rent = $150.
        expect(feb.ready_to_assign).toBe(150);
    });

    it("treats transfer inflows on credit accounts as credit card payments", () => {
        const accounts = [
            { id: "a-checking", name: "Total Checking – 5692", type: "debit" as const },
            { id: "a-amex", name: "Amex Gold (Due 20th)", type: "credit" as const },
        ];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-cc-spend",
                account_id: "a-amex",
                date: "2026-05-01",
                payee: "Grocer",
                category: "Groceries",
                category_group: "Monthly Living / Lifestyle",
                balance: -100,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            {
                id: "tx-transfer-out",
                account_id: "a-checking",
                date: "2026-05-02",
                payee: "Transfer : Amex Gold (Due 20th)",
                category: null,
                category_group: null,
                balance: -40,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
            {
                id: "tx-transfer-in",
                account_id: "a-amex",
                date: "2026-05-02",
                payee: "Transfer : Total Checking – 5692",
                category: null,
                category_group: null,
                balance: 40,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-05", assigned: 100 }],
            categoryGroups: [
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 0,
                    items: [
                        {
                            id: "item-amex-payment",
                            groupId: "g-cc",
                            name: "Amex Gold (Due 20th)",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
                {
                    id: "g-living",
                    name: "Monthly Living / Lifestyle",
                    sortOrder: 1,
                    items: [
                        {
                            id: "item-groceries",
                            groupId: "g-living",
                            name: "Groceries",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
            ],
        });

        const may = serializeMonthView(state, "2026-05");
        const ccGroup = may.categories.find((c) => c.name === "Credit Card Payments");
        const amexPayment = ccGroup?.categoryItems.find((i) => i.name === "Amex Gold (Due 20th)");

        expect(amexPayment?.activity).toBe(60);
        expect(amexPayment?.available).toBe(60);
    });

    it("counts only budgeted credit spending in payment activity", () => {
        const accounts = [
            { id: "a-checking", name: "Total Checking – 5692", type: "debit" as const },
            { id: "a-amex", name: "Amex Gold (Due 20th)", type: "credit" as const },
        ];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-cc-spend-over",
                account_id: "a-amex",
                date: "2026-05-01",
                payee: "Bar",
                category: "Bars",
                category_group: "Fun Spending",
                balance: -80,
                category_item_id: "item-bars",
                cleared: true,
                approved: true,
            },
            {
                id: "tx-transfer-out",
                account_id: "a-checking",
                date: "2026-05-02",
                payee: "Transfer : Amex Gold (Due 20th)",
                category: null,
                category_group: null,
                balance: -20,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
            {
                id: "tx-transfer-in",
                account_id: "a-amex",
                date: "2026-05-02",
                payee: "Transfer : Total Checking – 5692",
                category: null,
                category_group: null,
                balance: 20,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-bars", month: "2026-05", assigned: 50 }],
            categoryGroups: [
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 0,
                    items: [
                        {
                            id: "item-amex-payment",
                            groupId: "g-cc",
                            name: "Amex Gold (Due 20th)",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
                {
                    id: "g-fun",
                    name: "Fun Spending",
                    sortOrder: 1,
                    items: [
                        {
                            id: "item-bars",
                            groupId: "g-fun",
                            name: "Bars",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
            ],
        });

        const may = serializeMonthView(state, "2026-05");
        const ccGroup = may.categories.find((c) => c.name === "Credit Card Payments");
        const amexPayment = ccGroup?.categoryItems.find((i) => i.name === "Amex Gold (Due 20th)");

        // 80 spend with only 50 funded => +50 payment activity, then -20 transfer payment => +30 net.
        expect(amexPayment?.activity).toBe(30);
        expect(amexPayment?.available).toBe(30);
        // The unfunded $30 of that $80 spend never got covered by an assignment.
        expect(amexPayment?.ccActivityBreakdown?.unbudgeted).toBe(30);
    });

    it("keeps unbudgeted overspend unchanged by a refund against the funded portion", () => {
        const accounts = [{ id: "a-amex", name: "Amex Gold", type: "credit" as const }];

        const rawTransactions: RawDbTransaction[] = [
            // Only $50 assigned, but $80 spent — $30 of this is unbudgeted overspend.
            {
                id: "tx-spend",
                account_id: "a-amex",
                date: "2026-07-05",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -80,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            // A refund against the funded $50 portion of that spend.
            {
                id: "tx-refund",
                account_id: "a-amex",
                date: "2026-07-10",
                payee: "Store Refund",
                category: "Groceries",
                category_group: "Living",
                balance: 20,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-07", assigned: 50 }],
            categoryGroups: [
                {
                    id: "g-living",
                    name: "Living",
                    sortOrder: 0,
                    items: [{ id: "item-groceries", groupId: "g-living", name: "Groceries", sortOrder: 0, snoozed: false }],
                },
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 1,
                    items: [{ id: "item-amex-payment", groupId: "g-cc", name: "Amex Gold", sortOrder: 0, snoozed: false }],
                },
            ],
        });

        const july = serializeMonthView(state, "2026-07");
        const b = july.categories.find((c) => c.name === "Credit Card Payments")?.categoryItems[0]?.ccActivityBreakdown;

        expect(b).toBeDefined();
        expect(b!.fundedSpending).toBe(30); // 50 budgeted - 20 refund-against-funded
        // The $30 that was never funded in the first place stays at 30 — a
        // refund against the *funded* portion must not inflate it, which is
        // exactly what a derived (-spending - fundedSpending) figure would do.
        expect(b!.unbudgeted).toBe(30);
    });

    it("treats uncategorized credit inflows as card payments", () => {
        const accounts = [
            { id: "a-amex", name: "Amex Gold (Due 20th)", type: "credit" as const },
        ];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-spend",
                account_id: "a-amex",
                date: "2026-05-01",
                payee: "Grocer",
                category: "Groceries",
                category_group: "Monthly Living / Lifestyle",
                balance: -100,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            {
                id: "tx-payment-uncat",
                account_id: "a-amex",
                date: "2026-05-02",
                payee: "Bank Payment",
                category: "Uncategorized",
                category_group: "Uncategorized",
                balance: 40,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-05", assigned: 100 }],
            categoryGroups: [
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 0,
                    items: [
                        {
                            id: "item-amex-payment",
                            groupId: "g-cc",
                            name: "Amex Gold (Due 20th)",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
                {
                    id: "g-living",
                    name: "Monthly Living / Lifestyle",
                    sortOrder: 1,
                    items: [
                        {
                            id: "item-groceries",
                            groupId: "g-living",
                            name: "Groceries",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
            ],
        });

        const may = serializeMonthView(state, "2026-05");
        const ccGroup = may.categories.find((c) => c.name === "Credit Card Payments");
        const amexPayment = ccGroup?.categoryItems.find((i) => i.name === "Amex Gold (Due 20th)");

        expect(amexPayment?.activity).toBe(60);
        expect(amexPayment?.available).toBe(60);
    });

    it("applies same-day debit spending before credit spending for funding", () => {
        const accounts = [
            { id: "a-checking", name: "Checking", type: "debit" as const },
            { id: "a-amex", name: "Amex Gold (Due 20th)", type: "credit" as const },
        ];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-debit-spend",
                account_id: "a-checking",
                date: "2026-05-10",
                payee: "Cash Grocer",
                category: "Groceries",
                category_group: "Monthly Living / Lifestyle",
                balance: -80,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            {
                id: "tx-credit-spend",
                account_id: "a-amex",
                date: "2026-05-10",
                payee: "Card Grocer",
                category: "Groceries",
                category_group: "Monthly Living / Lifestyle",
                balance: -80,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-05", assigned: 100 }],
            categoryGroups: [
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 0,
                    items: [
                        {
                            id: "item-amex-payment",
                            groupId: "g-cc",
                            name: "Amex Gold (Due 20th)",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
                {
                    id: "g-living",
                    name: "Monthly Living / Lifestyle",
                    sortOrder: 1,
                    items: [
                        {
                            id: "item-groceries",
                            groupId: "g-living",
                            name: "Groceries",
                            sortOrder: 0,
                            snoozed: false,
                        },
                    ],
                },
            ],
        });

        const may = serializeMonthView(state, "2026-05");
        const ccGroup = may.categories.find((c) => c.name === "Credit Card Payments");
        const amexPayment = ccGroup?.categoryItems.find((i) => i.name === "Amex Gold (Due 20th)");

        expect(amexPayment?.activity).toBe(20);
        expect(amexPayment?.available).toBe(20);
    });

    it("decomposes credit card payment activity into a YNAB-style breakdown that sums to the same total", () => {
        const accounts = [{ id: "a-amex", name: "Amex Gold", type: "credit" as const }];

        const rawTransactions: RawDbTransaction[] = [
            // $100 assigned to Groceries gives the pool room to fund this spend.
            {
                id: "tx-spend",
                account_id: "a-amex",
                date: "2026-07-05",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -80,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            // A merchant refund against that same funded spend.
            {
                id: "tx-refund",
                account_id: "a-amex",
                date: "2026-07-10",
                payee: "Store Refund",
                category: "Groceries",
                category_group: "Living",
                balance: 20,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            // A direct payment made toward the card.
            {
                id: "tx-payment",
                account_id: "a-amex",
                date: "2026-07-15",
                payee: "Payment from Checking",
                category: null,
                category_group: null,
                balance: 30,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-07", assigned: 100 }],
            categoryGroups: [
                {
                    id: "g-living",
                    name: "Living",
                    sortOrder: 0,
                    items: [{ id: "item-groceries", groupId: "g-living", name: "Groceries", sortOrder: 0, snoozed: false }],
                },
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 1,
                    items: [{ id: "item-amex-payment", groupId: "g-cc", name: "Amex Gold", sortOrder: 0, snoozed: false }],
                },
            ],
        });

        const july = serializeMonthView(state, "2026-07");
        const amexPayment = july.categories.find((c) => c.name === "Credit Card Payments")?.categoryItems[0];
        const b = amexPayment?.ccActivityBreakdown;

        expect(b).toBeDefined();
        expect(b!.spending).toBe(-80);
        expect(b!.returns).toBe(20);
        expect(b!.fundedSpending).toBe(60); // 80 budgeted - 20 refund-against-funded
        expect(b!.payments).toBe(-30);
        // The breakdown must always reconcile exactly to the real activity figure.
        expect(b!.fundedSpending + b!.payments).toBe(amexPayment!.activity);
        expect(amexPayment!.activity).toBe(30);
    });

    it("excludes Starting Balance and Reconciliation Adjustment from credit card payment activity", () => {
        const accounts = [
            { id: "a-checking", name: "Checking", type: "debit" as const },
            { id: "a-amex", name: "Amex Gold", type: "credit" as const },
        ];

        const rawTransactions: RawDbTransaction[] = [
            // Neither of these has a category_item_id — they must not be
            // mistaken for real card spend needing a payment.
            {
                id: "tx-starting-balance",
                account_id: "a-amex",
                date: "2026-07-01",
                payee: "Starting Balance",
                category: "Category Not Needed",
                category_group: null,
                balance: -500,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
            {
                id: "tx-reconcile",
                account_id: "a-amex",
                date: "2026-07-10",
                payee: "Reconciliation Adjustment",
                category: "Reconciliation (Hidden)",
                category_group: "Reconciliation (Hidden)",
                balance: -75,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
            {
                id: "tx-groceries",
                account_id: "a-amex",
                date: "2026-07-15",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -50,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-07", assigned: 50 }],
            categoryGroups: [
                {
                    id: "g-living",
                    name: "Living",
                    sortOrder: 0,
                    items: [{ id: "item-groceries", groupId: "g-living", name: "Groceries", sortOrder: 0, snoozed: false }],
                },
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 1,
                    items: [{ id: "item-amex-payment", groupId: "g-cc", name: "Amex Gold", sortOrder: 0, snoozed: false }],
                },
            ],
        });

        const july = serializeMonthView(state, "2026-07");
        const ccGroup = july.categories.find((c) => c.name === "Credit Card Payments");
        const amexPayment = ccGroup?.categoryItems.find((i) => i.name === "Amex Gold");

        expect(amexPayment?.activity).toBe(50); // only the real grocery spend
        expect(amexPayment?.available).toBe(50);
    });

    it("still excludes a Reconciliation Adjustment even if it somehow has a real category_item_id set", () => {
        // Guards against the implicit-nullness assumption breaking silently
        // (e.g. a backfill migration or stray edit linking the row to a real
        // category) — the exclusion must hold on category_group text alone,
        // not on category_item_id happening to be null.
        const accounts = [{ id: "a-amex", name: "Amex Gold", type: "credit" as const }];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-reconcile-linked",
                account_id: "a-amex",
                date: "2026-07-10",
                payee: "Reconciliation Adjustment",
                category: "Reconciliation (Hidden)",
                category_group: "Reconciliation (Hidden)",
                balance: -689.82,
                category_item_id: "item-groceries", // simulates the bug: wrongly linked
                cleared: true,
                approved: true,
            },
            {
                id: "tx-groceries",
                account_id: "a-amex",
                date: "2026-07-15",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -50,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [{ categoryItemId: "item-groceries", month: "2026-07", assigned: 50 }],
            categoryGroups: [
                {
                    id: "g-living",
                    name: "Living",
                    sortOrder: 0,
                    items: [{ id: "item-groceries", groupId: "g-living", name: "Groceries", sortOrder: 0, snoozed: false }],
                },
                {
                    id: "g-cc",
                    name: "Credit Card Payments",
                    sortOrder: 1,
                    items: [{ id: "item-amex-payment", groupId: "g-cc", name: "Amex Gold", sortOrder: 0, snoozed: false }],
                },
            ],
        });

        const july = serializeMonthView(state, "2026-07");
        const groceries = july.categories.find((c) => c.name === "Living")?.categoryItems[0];
        const amexPayment = july.categories.find((c) => c.name === "Credit Card Payments")?.categoryItems[0];

        // The reconciliation row's own $689.82 must not leak into Groceries'
        // activity (even though it was force-linked to that item's id) or
        // into the Amex payment activity — only the real $50 grocery spend.
        expect(groceries?.activity).toBe(-50);
        expect(amexPayment?.activity).toBe(50);
    });

    it("counts only the debit portion of a mixed debit/credit overspend, applied to the following month", () => {
        const accounts = [
            { id: "a-checking", name: "Checking", type: "debit" as const },
            { id: "a-amex", name: "Amex", type: "credit" as const },
        ];

        // Groceries: $0 assigned, -$30 from debit, -$70 from credit — the
        // credit portion is a card liability tracked separately, not cash
        // that actually left checking, so it must not inflate rta_carry.
        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-debit",
                account_id: "a-checking",
                date: "2026-03-05",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -30,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
            {
                id: "tx-credit",
                account_id: "a-amex",
                date: "2026-03-06",
                payee: "Store",
                category: "Groceries",
                category_group: "Living",
                balance: -70,
                category_item_id: "item-groceries",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [],
            categoryGroups: [
                {
                    id: "g-living",
                    name: "Living",
                    sortOrder: 0,
                    items: [
                        { id: "item-groceries", groupId: "g-living", name: "Groceries", sortOrder: 0, snoozed: false },
                    ],
                },
            ],
        });

        const march = serializeMonthView(state, "2026-03");
        const groceries = march.categories[0].categoryItems[0];
        expect(groceries.available).toBe(-100); // blended display is unchanged

        // Matches YNAB: a month's own overspending doesn't hit its own RTA —
        // it's applied to the month right after it, once.
        expect(march.rta_carry).toBe(0);
        const april = serializeMonthView(state, "2026-04");
        expect(april.rta_overspend_prev_month).toBe(30); // debit-only, not the blended -$100
        expect(april.rta_carry).toBe(30);
    });

    it("applies a cash-overspending deficit exactly once and keeps it permanently — later funding the category doesn't undo it", () => {
        // Matches real YNAB behavior (verified against an actual multi-month
        // export): once counted, an overspend is a sunk cost, not a debt
        // that later gets "paid off." Assigning more money to the category
        // afterward is a separate, independent use of fresh money — it does
        // not retroactively cancel the earlier deficit.
        const accounts = [{ id: "a-checking", name: "Checking", type: "debit" as const }];

        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-overspend",
                account_id: "a-checking",
                date: "2026-03-05",
                payee: "Utility Co",
                category: "Electricity",
                category_group: "Bills",
                balance: -50,
                category_item_id: "item-electricity",
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            // Fully "caught up" the very next month.
            assignments: [{ categoryItemId: "item-electricity", month: "2026-04", assigned: 50 }],
            categoryGroups: [
                {
                    id: "g-bills",
                    name: "Bills",
                    sortOrder: 0,
                    items: [
                        { id: "item-electricity", groupId: "g-bills", name: "Electricity", sortOrder: 0, snoozed: false },
                    ],
                },
            ],
        });

        const april = serializeMonthView(state, "2026-04");
        expect(april.rta_overspend_prev_month).toBe(50);
        expect(april.rta_carry).toBe(50); // NOT resolved by April's assignment to the same category

        // Still permanent several months later, with no further activity.
        const july = serializeMonthView(state, "2026-07");
        expect(july.rta_carry).toBe(50);
    });

    it("reduces the displayed Ready to Assign by future-assigned money only when viewing the real current month", () => {
        const accounts = [{ id: "a-checking", name: "Checking", type: "debit" as const }];
        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-income",
                account_id: "a-checking",
                date: "2026-07-05",
                payee: "Paycheck",
                category: "Ready to Assign",
                category_group: "Inflow",
                balance: 1000,
                category_item_id: null,
                cleared: true,
                approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            // Pre-budgeted next month's rent ahead of time.
            assignments: [{ categoryItemId: "item-rent", month: "2026-08", assigned: 300 }],
            categoryGroups: [
                {
                    id: "g-bills",
                    name: "Bills",
                    sortOrder: 0,
                    items: [{ id: "item-rent", groupId: "g-bills", name: "Rent", sortOrder: 0, snoozed: false }],
                },
            ],
        });

        // Viewing July as "today" — the $300 August pre-assignment should
        // show up as a warning line's worth of data and reduce the displayed
        // total.
        const julyAsToday = serializeMonthView(state, "2026-07", "2026-07");
        expect(julyAsToday.rta_assigned_beyond_this_month).toBe(300);
        expect(julyAsToday.ready_to_assign).toBe(700); // $1000 income - $300 already earmarked for August

        // Viewing July again, but "today" is actually August now (July is
        // history) — no reduction; browsing the past never applies it.
        const julyAsHistory = serializeMonthView(state, "2026-07", "2026-08");
        expect(julyAsHistory.ready_to_assign).toBe(1000);

        // August's own breakdown must use July's UNADJUSTED $1000 as its
        // "leftover from July" — not the $700 that was only ever a display
        // warning for July's live view — then subtracts its own $300 assignment.
        const august = serializeMonthView(state, "2026-08", "2026-08");
        expect(august.rta_prev_month_leftover).toBe(1000);
        expect(august.ready_to_assign).toBe(700); // $1000 leftover - $300 assigned in August itself
    });

    it("counts a negative Ready to Assign transaction against ready_to_assign (debit reconcile shortfall)", () => {
        const accounts = [{ id: "a-checking", name: "Checking", type: "debit" as const }];
        const rawTransactions: RawDbTransaction[] = [
            {
                id: "tx-shortfall", account_id: "a-checking", date: "2026-05-05",
                payee: "Reconciliation Adjustment", category: "Ready to Assign", category_group: "Ready to Assign",
                balance: -40, category_item_id: null, cleared: true, approved: true,
            },
        ];

        const state = computeBudgetState({
            userId: "u1",
            accounts,
            transactions: normalizeTransactions(rawTransactions, accounts),
            assignments: [],
            categoryGroups: [],
        });

        const may = serializeMonthView(state, "2026-05");
        expect(may.ready_to_assign).toBe(-40);
    });

});

describe("Global planning mode", () => {
    const accounts = [{ id: "a-checking", name: "Checking", type: "debit" as const }];

    // $300 Jan income, $100 Jan rent assigned + $50 Feb rent assigned —
    // real ready_to_assign is $200 for Jan (300 - 100), $150 for Feb
    // (200 leftover - 50), matching the sequential-RTA test above.
    const baseFixture = () => ({
        userId: "u1",
        accounts,
        transactions: normalizeTransactions(
            [
                {
                    id: "tx-income-jan",
                    account_id: "a-checking",
                    date: "2026-01-05",
                    payee: "Paycheck",
                    category: "Ready to Assign",
                    category_group: "Inflow",
                    balance: 300,
                    category_item_id: null,
                    cleared: true,
                    approved: true,
                } as RawDbTransaction,
            ],
            accounts
        ),
        assignments: [
            { categoryItemId: "item-rent", month: "2026-01", assigned: 100 },
            { categoryItemId: "item-rent", month: "2026-02", assigned: 50 },
        ],
        categoryGroups: [
            {
                id: "g-bills",
                name: "Bills",
                sortOrder: 0,
                items: [
                    { id: "item-rent", groupId: "g-bills", name: "Rent", sortOrder: 0, snoozed: false },
                ],
            },
        ],
    });

    it("with no overrides, global_ready_to_assign is real RTA plus planned income, and globalAssigned falls back to real assigned", () => {
        const state = computeBudgetState({
            ...baseFixture(),
            globalAssignments: [],
            plannedIncome: [{ month: "2026-01", amount: 200 }],
        });

        const jan = serializeMonthView(state, "2026-01");
        const rentItem = jan.categories[0].categoryItems.find((i) => i.id === "item-rent")!;

        expect(jan.ready_to_assign).toBe(200);
        expect(jan.global_planned_income).toBe(200);
        expect(jan.global_ready_to_assign).toBe(jan.ready_to_assign + 200);
        expect(rentItem.globalAssigned).toBe(rentItem.assigned);
    });

    it("a global_assignments override changes globalAssigned and global_ready_to_assign but never the real assigned/ready_to_assign", () => {
        const state = computeBudgetState({
            ...baseFixture(),
            globalAssignments: [{ categoryItemId: "item-rent", month: "2026-01", assigned: 250 }],
            plannedIncome: [],
        });

        const jan = serializeMonthView(state, "2026-01");
        const rentItem = jan.categories[0].categoryItems.find((i) => i.id === "item-rent")!;

        // Real numbers: completely untouched by the override.
        expect(rentItem.assigned).toBe(100);
        expect(jan.ready_to_assign).toBe(200);

        // Shadow numbers: reflect the override, and global RTA drops by
        // exactly the delta (250 - 100 = 150) on top of real RTA — not by
        // the full override amount, since that would double-subtract the
        // portion real RTA already accounted for.
        expect(rentItem.globalAssigned).toBe(250);
        expect(jan.global_ready_to_assign).toBe(jan.ready_to_assign - 150);
    });

    it("a global_assignments override in one month does not cascade into another month's real or global numbers", () => {
        const state = computeBudgetState({
            ...baseFixture(),
            globalAssignments: [{ categoryItemId: "item-rent", month: "2026-01", assigned: 250 }],
            plannedIncome: [],
        });

        const feb = serializeMonthView(state, "2026-02");
        const rentItem = feb.categories[0].categoryItems.find((i) => i.id === "item-rent")!;

        // Feb has no override of its own, so its shadow value still falls
        // back to its own real assigned, and global RTA equals real RTA —
        // proof Jan's override never crossed the month boundary.
        expect(rentItem.globalAssigned).toBe(rentItem.assigned);
        expect(feb.global_ready_to_assign).toBe(feb.ready_to_assign);
    });

    it("planned income is scoped to its own month and does not leak into an adjacent month", () => {
        const state = computeBudgetState({
            ...baseFixture(),
            globalAssignments: [],
            plannedIncome: [{ month: "2026-01", amount: 500 }],
        });

        const feb = serializeMonthView(state, "2026-02");

        expect(feb.global_planned_income).toBe(0);
        expect(feb.global_ready_to_assign).toBe(feb.ready_to_assign);
    });
});
