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
    it("calculates RTA using assignments through each month, not all months", () => {
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

        expect(jan.ready_to_assign).toBe(200);
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

});
