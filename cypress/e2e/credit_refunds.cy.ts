// cypress/e2e/credit_refunds.cy.ts

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

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

const visitBudget = () => {
  cy.waitForBudgetCalculation();
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

describe("Credit card refunds", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
  });

  //
  // CREDIT CARD REFUND
  //
  // Expectation:
  // - Purchase on credit card:
  //   - Category ACTIVITY = -amount
  //   - Category AVAILABLE = -amount
  //   - Ready to Assign unchanged
  //   - CC Payment category unchanged
  // - Refund on same credit card & same category:
  //   - Category ACTIVITY returns to 0 (net)
  //   - Category AVAILABLE returns to 0 (if nothing was assigned)
  //   - Ready to Assign still unchanged
  //   - CC Payment category still unchanged (only payments affect it)
  //
  it("reverses a credit card purchase with a refund without touching RTA or CC payment bucket", () => {
    const amount = 50;
    const groupName = "CC Refund Group";
    const itemName = "CC Refund Category";
    const ccPaymentItemName = accounts.amex.name;

    // 1. Snapshot RTA + CC payment category before anything
    visitBudget();

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((initialRTAText) => {
        const initialRTA = parseCurrency(initialRTAText);

        cy.get(
          `[data-cy="category-row"][data-category="Credit Card Payments"][data-item="${ccPaymentItemName}"]`
        )
          .as("ccPaymentRow");

        cy.get("@ccPaymentRow")
          .find("[data-cy=item-available]")
          .invoke("text")
          .then((initialCCAvailText) => {
            const initialCCAvail = parseCurrency(initialCCAvailText);

            // 2. Make a purchase on the credit card on a brand new category
            visitAccount(accounts.amex.id, accounts.amex.name);

            cy.get("[data-cy=add-transaction-button]").click();

            // New payee
            cy.get("[data-cy=tx-payee-select]").select("__new__");
            cy.get("[data-cy=tx-new-payee-input]").type("CC Refund Test Store");

            // New group & item
            cy.get("[data-cy=tx-item-select]").select("__new_category__");
            cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
            cy.get("[data-cy=tx-new-category-group-input]").type(groupName);
            cy.get("[data-cy=tx-new-category-input]").type(itemName);

            // Outflow (negative) on CREDIT account
            cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
              if ($btn.text().trim() !== "−") {
                cy.wrap($btn).click();
              }
            });

            cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
            cy.get("[data-cy=tx-submit]").click();

            // 3. Check budget after purchase: overspent category + RTA unchanged
            visitBudget();

            cy.get(
              `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
            )
              .as("refundCategoryRow")
              .within(() => {
                cy.get("[data-cy=item-activity]")
                  .invoke("text")
                  .then((txt) => {
                    const activity = parseCurrency(txt);
                    expect(activity).to.eq(-amount);
                  });

                cy.get("[data-cy=item-available]")
                  .invoke("text")
                  .then((txt) => {
                    const available = parseCurrency(txt);
                    expect(available).to.eq(-amount);
                  });
              });

            cy.get("[data-cy=ready-to-assign]")
              .invoke("text")
              .then((afterPurchaseRtaText) => {
                const rtaAfterPurchase = parseCurrency(afterPurchaseRtaText);
                // purchases from credit should not touch RTA
                expect(rtaAfterPurchase).to.eq(initialRTA);
              });

            cy.get("@ccPaymentRow")
              .find("[data-cy=item-available]")
              .invoke("text")
              .then((afterPurchaseCCAvailText) => {
                const ccAvailAfterPurchase = parseCurrency(
                  afterPurchaseCCAvailText
                );
                // purchases should not touch CC payment bucket either
                expect(ccAvailAfterPurchase).to.eq(initialCCAvail);
              });

            // 4. Create a REFUND on the same credit card + same category
            visitAccount(accounts.amex.id, accounts.amex.name);

            cy.get("[data-cy=add-transaction-button]").click();

            // Payee can be anything; category is what matters
            cy.get("[data-cy=tx-payee-select]").select("__new__");
            cy.get("[data-cy=tx-new-payee-input]").type("CC Refund");

            // Select existing group & item
            cy.get("[data-cy=tx-item-select]").select(`${groupName}::${itemName}`);

            // Refund is an INFLOW (positive) on the credit card
            cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
              if ($btn.text().trim() !== "+") {
                cy.wrap($btn).click();
              }
            });

            cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
            cy.get("[data-cy=tx-submit]").click();

            // 5. Back to budget: category should be neutral again; RTA & CC payment untouched
            visitBudget();

            cy.get("@refundCategoryRow").within(() => {
              cy.get("[data-cy=item-activity]")
                .invoke("text")
                .then((txt) => {
                  const activity = parseCurrency(txt);
                  expect(activity).to.eq(0);
                });

              cy.get("[data-cy=item-available]")
                .invoke("text")
                .then((txt) => {
                  const available = parseCurrency(txt);
                  expect(available).to.eq(0);
                });
            });

            cy.get("[data-cy=ready-to-assign]")
              .invoke("text")
              .then((finalRtaText) => {
                const finalRTA = parseCurrency(finalRtaText);
                expect(finalRTA).to.eq(initialRTA);
              });

            cy.get("@ccPaymentRow")
              .find("[data-cy=item-available]")
              .invoke("text")
              .then((finalCCAvailText) => {
                const finalCCAvail = parseCurrency(finalCCAvailText);
                expect(finalCCAvail).to.eq(initialCCAvail);
              });
          });
      });
  });
});
