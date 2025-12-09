// cypress/e2e/overspending.cy.ts

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

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

describe("Overspending & filters", () => {
  beforeEach(() => {
    // however you reset:
    // cy.dbReset();
    cy.login("thedasherx@gmail.com", "123456");

    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
  });

  //
  // 1) CASH OVERSPENDING
  //
  // Debit purchase against a category with 0 assigned:
  // - Activity = -amount
  // - Available = -amount
  // - Ready To Assign does NOT change
  //
  it("handles cash overspending without changing Ready To Assign", () => {
    const amount = 25;
    const groupName = "Overspend Cash Group";
    const itemName = "Overspend Cash Category";

    // Snapshot Ready To Assign before the purchase
    visitBudget();
    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((initialRTAText) => {
        const initialRTA = parseCurrency(initialRTAText);

        // Make a purchase from CHECKING on a brand new category
        visitAccount(accounts.checking.id, accounts.checking.name);

        cy.get("[data-cy=add-transaction-button]").click();

        // New payee
        cy.get("[data-cy=tx-payee-select]").select("__new__");
        cy.get("[data-cy=tx-new-payee-input]").type("Cash Overspend Store");

        // New group & item
        cy.get("[data-cy=tx-item-select]").select("__new_category__");
        cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
        cy.get("[data-cy=tx-new-category-group-input]").type(groupName);
        cy.get("[data-cy=tx-new-category-input]").type(itemName);

        // Outflow (negative) on debit account
        cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
          if ($btn.text().trim() !== "−") {
            cy.wrap($btn).click();
          }
        });

        cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
        cy.get("[data-cy=tx-submit]").click();

        // Check budget
        visitBudget();

        cy.get(
          `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
        )
          .as("overspentRow")
          .within(() => {
            cy.get("[data-cy=assigned-display]")
              .invoke("text")
              .then((assignedText) => {
                const assigned = parseCurrency(assignedText);
                expect(assigned).to.eq(0);
              });

            cy.get("[data-cy=item-activity]")
              .invoke("text")
              .then((activityText) => {
                const activity = parseCurrency(activityText);
                expect(activity).to.eq(-amount);
              });

            cy.get("[data-cy=item-available]")
              .invoke("text")
              .then((availableText) => {
                const available = parseCurrency(availableText);
                expect(available).to.eq(-amount);
              });
          });

        // RTA unchanged by spending
        cy.get("[data-cy=ready-to-assign]")
          .invoke("text")
          .then((finalRTAText) => {
            const finalRTA = parseCurrency(finalRTAText);
            expect(finalRTA).to.eq(initialRTA);
          });
      });
  });

  //
  // 2) CREDIT OVERSPENDING
  //
  // Credit-card purchase on a category with 0 assigned:
  // - Activity = -amount
  // - Available = -amount
  // - Ready To Assign does NOT change
  // - Credit Card Payment category does NOT change (only payments do)
  //
  it("handles credit overspending without changing Ready To Assign or CC payment bucket", () => {
    const amount = 30;
    const groupName = "Overspend Credit Group";
    const itemName = "Overspend Credit Category";
    const ccPaymentItemName = accounts.amex.name; // e.g. "Amex Gold"

    // Snapshot RTA + CC payment category available
    visitBudget();

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((initialRTAText) => {
        const initialRTA = parseCurrency(initialRTAText);

        // Read initial CC Payment available without scoping navigation inside .within
        cy.get(
          `[data-cy="category-row"][data-category="Credit Card Payments"][data-item="${ccPaymentItemName}"]`
        ).as("ccPaymentRow");

        cy.get("@ccPaymentRow")
          .find("[data-cy=item-available]")
          .invoke("text")
          .then((initialCCAvailText) => {
            const initialCCAvail = parseCurrency(initialCCAvailText);

            // Make a purchase ON THE CREDIT CARD
            visitAccount(accounts.amex.id, accounts.amex.name);

            cy.get("[data-cy=add-transaction-button]").click();

            // New payee
            cy.get("[data-cy=tx-payee-select]").select("__new__");
            cy.get("[data-cy=tx-new-payee-input]").type(
              "Credit Overspend Store"
            );

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

            cy.get("[data-cy=tx-amount-input]")
              .clear()
              .type(String(amount));
            cy.get("[data-cy=tx-submit]").click();

            // Budget checks
            visitBudget();

            // New category should show overspending
            cy.get(
              `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
            )
              .as("creditOverspentRow");

            cy.get("@creditOverspentRow").find("[data-cy=assigned-display]")
              .invoke("text")
              .then((txt) => {
                const assigned = parseCurrency(txt);
                expect(assigned).to.eq(0);
              });

            cy.get("@creditOverspentRow").find("[data-cy=item-activity]")
              .invoke("text")
              .then((txt) => {
                const activity = parseCurrency(txt);
                expect(activity).to.eq(-amount);
              });

            cy.get("@creditOverspentRow").find("[data-cy=item-available]")
              .invoke("text")
              .then((txt) => {
                const available = parseCurrency(txt);
                expect(available).to.eq(-amount);
              });

            // RTA unchanged by spending
            cy.get("[data-cy=ready-to-assign]")
              .invoke("text")
              .then((finalRTAText) => {
                const finalRTA = parseCurrency(finalRTAText);
                expect(finalRTA).to.eq(initialRTA);
              });

            // CC Payment bucket should not change from purchases
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

  //
  // 3) OVERFUNDED / UNDERFUNDED FILTERS
  //
  // Use a target on a category, then:
  // - Underfunded: assigned < target
  // - Overfunded:  assigned > target
  // Ensure filters show/hide correctly.
  //
  it("marks categories as underfunded / overfunded and shows them in filters", () => {
    const groupName = "Target Group";
    const itemName = "Target Category";
    const targetAmount = 100;

    visitBudget();

    // Create a new group + category via budget UI
    cy.get("[data-cy=add-category-group-button]").click();
    cy.get("[data-cy=add-category-group-input]").type(groupName);
    cy.get("[data-cy=add-category-group-submit]").click();

    // Reveal add-item via hover; click first visible, fallback to forced click
    cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`).first().trigger("mouseover");
    cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`)
      .filter(":visible")
      .first()
      .then(($btn) => {
        if ($btn.length) {
          cy.wrap($btn).click();
        } else {
          cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`).first().click({ force: true });
        }
      });

    cy.get("[data-cy=add-item-input]").type(itemName);
    cy.get("[data-cy=add-item-submit]").click();

    const categorySelector = `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

    // Open InlineTargetEditor by clicking the category row (per your CollapsibleTable)
    cy.get(categorySelector).click();

    // Inside inline target editor: set a simple "amount needed" target.
    // Adjust these selectors to match your InlineTargetEditor.
    cy.get("[data-cy=target-amount-input]").clear().type(String(targetAmount));
    cy.get("[data-cy=target-save]").click();

    // 3a) UNDERFUNDED: assigned = 40 < 100
    cy.get(`${categorySelector} [data-cy=assigned-display]`).click();
    cy.get(
      `[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .clear()
      .type("40")
      .blur();

    // Underfunded filter should show this category
    cy.contains("button", "Underfunded").click();

    cy.get(categorySelector).should("exist");

    // Overfunded filter should NOT show it yet
    cy.contains("button", "Overfunded").click();
    cy.get(categorySelector).should("not.exist");

    // 3b) EXACTLY funded: assigned = 100 => not under or over
    cy.contains("button", "All").click();
    cy.get(`${categorySelector} [data-cy=assigned-display]`).click();
    cy.get(
      `[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .clear()
      .type("100")
      .blur();

    cy.contains("button", "Underfunded").click();
    cy.get(categorySelector).should("not.exist");

    cy.contains("button", "Overfunded").click();
    cy.get(categorySelector).should("not.exist");

    // 3c) OVERFUNDED: assigned = 150 > 100
    cy.contains("button", "All").click();
    cy.get(`${categorySelector} [data-cy=assigned-display]`).click();
    cy.get(
      `[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .clear()
      .type("150")
      .blur();

    cy.contains("button", "Overfunded").click();
    cy.get(categorySelector).should("exist");

    cy.contains("button", "Underfunded").click();
    cy.get(categorySelector).should("not.exist");
  });
});
