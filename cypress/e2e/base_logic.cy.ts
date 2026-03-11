import { BUDGET_URL } from "../support/testConstants";

interface SeededAccount {
  id: string;
  name: string;
  type: "debit" | "credit";
}

interface SeededAccounts {
  checking: SeededAccount;
  savings: SeededAccount;
  visa: SeededAccount;
  amex: SeededAccount;
}

let accounts: SeededAccounts;

const parseCurrency = (text: string) =>
  Number(text.replace(/[^0-9.-]/g, ""));

const getVisibleCurrency = (selector: string) =>
  cy
    .budgetFind(selector)
    .first()
    .should(($el) => {
      const value = parseCurrency($el.text());
      expect(value, `Expected numeric value for ${selector}`).to.not.be.NaN;
    })
    .invoke("text")
    .then((text) => parseCurrency(text));

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};


describe("purchases, payments, transfers", () => {
  beforeEach(() => {
    // 🔁 Make sure DB is clean each test.
    // Hook this up to your db-reset task or command:
    // cy.task("db:reset").then((seed) => Cypress.env("SEEDED_ACCOUNTS", seed));
    // or if you already wired it:
    // cy.dbReset();
    //
    // For now we just rely on whatever you have that sets SEEDED_ACCOUNTS.

    cy.login("thedasherx@gmail.com", "123456");

    // Grab seeded accounts from env via your custom command
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
  });

  //
  // 1) CREDIT CARD PURCHASE on the card itself
  //
  // Expectation:
  // - Done on the CREDIT account
  // - Requires a spending category
  // - Category ACTIVITY = -amount
  // - Category AVAILABLE decreases by amount
  // - Ready to Assign does NOT change
  //
  it("treats a credit card purchase as category spending that reduces category available", () => {
    // 1. Make a purchase on AMEX (or whatever your credit card is)
    const amount = 42;

    visitAccount(accounts.amex.id, accounts.amex.name);

    // Open add-transaction row
    cy.get("[data-cy=add-transaction-button]").click();

    // Use a brand new payee + brand new group/item to avoid seed coupling
    cy.selectPayee("Trader Joe's");

    cy.startCategoryCreation("Restaurants");
    cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
    cy.get("[data-cy=tx-new-category-group-input]").type("Food & Dining");
    // Name is prefilled from combobox entry

    // Credit card purchase is an outflow (negative)
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      const isNegative = $btn.attr("data-state") === "negative";
      if (!isNegative) {
        cy.wrap($btn).click();
      }
    });

    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // 2. Check that the transaction appears on the card with negative amount
    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        // Columns: [0]=checkbox, [1]=approved, [2]=cleared, [3]=date, [4]=payee, [5]=category, [6]=amount
        cy.get("td").eq(4).should("contain.text", "Trader Joe");
        cy.get("td").eq(5).should("contain.text", "Food & Dining: Restaurants");
        cy.get("[data-cy=transaction-amount]")
          .invoke("text")
          .then((txt) => {
            const val = parseCurrency(txt);
            expect(val).to.eq(amount);
          });
      });

    // 3. Go to budget and validate category + RTA behaviour
    visitBudget();

    // Capture Ready to Assign before/after by reloading once:
    cy.getReadyToAssignValue().then((initialRTA) => {

        // Find Food & Dining / Restaurants row
        cy.get(
          '[data-cy="category-group-row"][data-category="Food & Dining"]'
        ).should("exist");

        cy.get(
          '[data-cy="category-row"][data-category="Food & Dining"][data-item="Restaurants"]'
        )
          .first()
          .as("restaurantsRow")
          .within(() => {
            // Activity should be -amount
            cy.get("[data-cy=item-activity]")
              .invoke("text")
              .then((activityText) => {
                const activity = parseCurrency(activityText);
                expect(activity).to.eq(-amount);
              });

            // Available should also be -amount (overspent, since nothing was assigned)
            cy.get("[data-cy=item-available]")
              .invoke("text")
              .then((availableText) => {
                const available = parseCurrency(availableText);
                expect(available).to.eq(-amount);
              });
          });

        // Ready-to-Assign should be unchanged by spending (only budget assignments affect RTA)
        cy.getReadyToAssignValue().then((finalRTA) => {
          expect(finalRTA).to.eq(initialRTA);
        });
      });
  });

  //
  // 2) CREDIT CARD PAYMENT from checking → credit card
  //
  // Expectation:
  // - This is a transfer with no category change.
  // - Budget-wise, it shifts money from "cash" to credit card but
  //   does NOT change spending categories or Ready to Assign.
  // - It should, however, move the "Credit Card Payment: [Card]" category AVAILABLE toward zero.
  //
  it("treats a checking → credit transfer as a credit card payment that moves the CC payment category toward zero without changing RTA", () => {
    const amount = 100;

    // 1. Snapshot budget: RTA and the CC payment category
    visitBudget();

    cy.getReadyToAssignValue().then((initialRTA) => {

        // Narrow to the CC payment row and read initial available
        cy.budgetFind(
          `[data-cy="category-row"][data-category="Credit Card Payments"][data-item="${accounts.amex.name}"]`
        )
          .first()
          .as("ccPaymentRow");

        getVisibleCurrency(
          `[data-cy="category-row"][data-category="Credit Card Payments"][data-item="${accounts.amex.name}"] [data-cy=item-available]`
        ).then((initialAvail) => {

            // 2. Make the payment from checking → credit account
            visitAccount(accounts.checking.id, accounts.checking.name);
            cy.get("[data-cy=add-transaction-button]").click();
            cy.selectPayee(accounts.amex.name);

            // Outflow 100 (payment)
            cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
              const isNegative = $btn.attr("data-state") === "negative";
              if (!isNegative) {
                cy.wrap($btn).click();
              }
            });

            cy.get("[data-cy=tx-amount-input]")
              .clear()
              .type(String(amount));

            cy.get("[data-cy=tx-submit]").click();

            cy.wait(1000); // wait for transaction to process
            // 3. Back to budget to verify behaviour
            visitBudget();

            // Ready to Assign should remain unchanged
            cy.getReadyToAssignValue().then((finalRTA) => {
              expect(finalRTA).to.eq(initialRTA);
            });

            // CC Payment category available should move +amount toward zero (less negative)
            getVisibleCurrency(
              `[data-cy="category-row"][data-category="Credit Card Payments"][data-item="${accounts.amex.name}"] [data-cy=item-available]`
            ).then((finalAvail) => {

                // If initialAvail was negative, finalAvail should be closer to zero (higher)
                // If it was zero, it should now be +amount (extra payment)
                expect(finalAvail).to.be.equal(initialAvail - amount);
              });
          });
      });
  });

  //
  // 3) SAME-TYPE TRANSFER (checking → savings) with NO category impact
  //
  // Expectation:
  // - This is just money moving between two on-budget accounts.
  // - No categories should change (no ACTIVITY or AVAILABLE changes).
  // - Ready to Assign should be unchanged.
  //
  it("treats a checking → savings transfer as pure account movement with no category or RTA impact", () => {
    const amount = 60;

    // 1. Snapshot budget state: RTA + all categories
    visitBudget();

    cy.getReadyToAssignValue().then((initialRTA) => {

        // Take a snapshot of all (group, item, activity, available)
        const beforeCategories: Record<
          string,
          { activity: number; available: number }
        > = {};

        cy.get("[data-cy=category-row]").each(($row) => {
          const group = $row.attr("data-category")!; // normalized: was data-group
          const item = $row.attr("data-item")!;
          const key = `${group}::${item}`;

          const activityText = $row
            .find("[data-cy=item-activity]")
            .text();
          const availableText = $row
            .find("[data-cy=item-available]")
            .text();

          beforeCategories[key] = {
            activity: parseCurrency(activityText),
            available: parseCurrency(availableText),
          };
        });

        // 2. Make a transfer Checking → Savings
        visitAccount(accounts.checking.id, accounts.checking.name);

        cy.get("[data-cy=add-transaction-button]").click();
        cy.selectPayee(accounts.savings.name);

        // Outflow from checking
        cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
          const isNegative = $btn.attr("data-state") === "negative";
          if (!isNegative) {
            cy.wrap($btn).click();
          }
        });

        cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
        cy.get("[data-cy=tx-submit]").click();

        // 3. Back to budget, verify NO category changes & same RTA
        visitBudget();

        cy.getReadyToAssignValue().then((finalRTA) => {
          expect(finalRTA).to.eq(initialRTA);
        });

        const afterCategories: Record<
          string,
          { activity: number; available: number }
        > = {};

        cy.get("[data-cy=category-row]").each(($row) => {
          const group = $row.attr("data-category")!; // normalized: was data-group
          const item = $row.attr("data-item")!;
          const key = `${group}::${item}`;

          const activityText = $row
            .find("[data-cy=item-activity]")
            .text();
          const availableText = $row
            .find("[data-cy=item-available]")
            .text();

          afterCategories[key] = {
            activity: parseCurrency(activityText),
            available: parseCurrency(availableText),
          };
        });

        cy.wrap(null).then(() => {
          Object.keys(beforeCategories).forEach((key) => {
            const before = beforeCategories[key];
            const after = afterCategories[key];

            // All categories must be unchanged
            expect(after.activity, `${key} activity`).to.eq(before.activity);
            expect(after.available, `${key} available`).to.eq(before.available);
          });
        });
      });
  });
});
