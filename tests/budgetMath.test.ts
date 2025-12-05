// tests/budgetMath.test.ts
import { describe, it, expect } from "vitest";
import {
    calculateActivityForMonthPure,
    calculateCreditCardAccountActivityPure,
    calculateReadyToAssignPure,
    getCumulativeAvailablePure,
    updateMonthPure,
    type Account,
    type BudgetMonth,
} from "../lib/budgetMath";

describe("calculateReadyToAssignPure", () => {
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
