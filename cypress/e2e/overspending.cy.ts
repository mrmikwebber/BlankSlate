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

const addGroupAndItem = (groupName: string, itemName: string) => {
  cy.createCategory(groupName, itemName);
};

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

const selectFilter = (filterName: string) => {
  cy.get(`[data-cy=filter-${filterName}]`)
    .filter(":visible")
    .first()
    .click({ force: true })
    .should("have.class", "bg-primary");
};

const expectNotVisibleInBudget = (selector: string) => {
  cy.getVisibleBudgetTable().then(($table) => {
    const visibleCount = $table.find(selector).filter(":visible").length;
    expect(visibleCount, `Expected ${selector} to be not visible`).to.eq(0);
  });
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
    cy.getReadyToAssignValue().then((initialRTA) => {

        // Make a purchase from CHECKING on a brand new category
        visitAccount(accounts.checking.id, accounts.checking.name);

        cy.get("[data-cy=add-transaction-button]").click();

        // New payee
        cy.selectPayee("Cash Overspend Store");

        // New group & item
        cy.startCategoryCreation(itemName);
        cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
        cy.get("[data-cy=tx-new-category-group-input]").type(groupName);
        // Item name prefilled from combobox entry

        // Outflow (negative) on debit account
        cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
          const isNegative = $btn.attr("data-state") === "negative";
          if (!isNegative) {
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
          .first()
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
        cy.getReadyToAssignValue().then((finalRTA) => {
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

    cy.getReadyToAssignValue().then((initialRTA) => {

        // Read initial CC Payment available without scoping navigation inside .within
        cy.budgetRow("Credit Card Payments", ccPaymentItemName)
          .find("[data-cy=item-available]")
          .first()
          .should(($el) => {
            const value = parseCurrency($el.text());
            expect(value, "CC payment available should be numeric").to.not.be.NaN;
          })
          .invoke("text")
          .then((initialCCAvailText) => {
            const initialCCAvail = parseCurrency(initialCCAvailText);

            // Make a purchase ON THE CREDIT CARD
            visitAccount(accounts.amex.id, accounts.amex.name);

            cy.get("[data-cy=add-transaction-button]").click();

            // New payee
            cy.selectPayee("Credit Overspend Store");

            // New group & item
            cy.startCategoryCreation(itemName);
            cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
            cy.get("[data-cy=tx-new-category-group-input]").type(groupName);
            // Item name prefilled from combobox entry

            // Outflow (negative) on CREDIT account
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

            // Budget checks
            visitBudget();

            // New category should show overspending
            cy.budgetRow(groupName, itemName)
              .find("[data-cy=assigned-display]")
              .first()
              .should(($el) => {
                const assigned = parseCurrency($el.text());
                expect(assigned).to.eq(0);
              });

            cy.budgetRow(groupName, itemName)
              .find("[data-cy=item-activity]")
              .first()
              .should(($el) => {
                const activity = parseCurrency($el.text());
                expect(activity).to.eq(-amount);
              });

            cy.budgetRow(groupName, itemName)
              .find("[data-cy=item-available]")
              .first()
              .should(($el) => {
                const available = parseCurrency($el.text());
                expect(available).to.eq(-amount);
              });

            // RTA unchanged by spending
            cy.getReadyToAssignValue().then((finalRTA) => {
              expect(finalRTA).to.eq(initialRTA);
            });

            // CC Payment bucket should not change from purchases
            cy.budgetRow("Credit Card Payments", ccPaymentItemName)
              .find("[data-cy=item-available]")
              .first()
              .should(($el) => {
                const finalCCAvail = parseCurrency($el.text());
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
    cy.createCategory(groupName, itemName);

    const categorySelector = `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

    // Open InlineTargetEditor by clicking the category name (avoid NotesPopover)
    cy.budgetFind(categorySelector)
      .find('[data-cy="category-item-name"] span')
      .first()
      .scrollIntoView()
      .click();

    // Inside inline target editor: set a simple "amount needed" target.
    // Adjust these selectors to match your InlineTargetEditor.
    cy.get("[data-cy=target-amount-input]").clear().type(String(targetAmount));
    cy.get("[data-cy=target-save]").click();

    // 3a) UNDERFUNDED: assigned = 40 < 100
    cy.setAssignedValue(groupName, itemName, 40);

    // Underfunded filter should show this category
    selectFilter("underfunded");

    cy.budgetFind(categorySelector).should("exist");

    // Overfunded filter should NOT show it yet
    selectFilter("overfunded");
    expectNotVisibleInBudget(categorySelector);

    // 3b) EXACTLY funded: assigned = 100 => not under or over
    selectFilter("all");
    cy.setAssignedValue(groupName, itemName, 100);

    selectFilter("underfunded");
    expectNotVisibleInBudget(categorySelector);

    selectFilter("overfunded");
    expectNotVisibleInBudget(categorySelector);

    // 3c) OVERFUNDED: assigned = 150 > 100
    selectFilter("all");
    cy.setAssignedValue(groupName, itemName, 150);

    selectFilter("overfunded");
    cy.budgetFind(categorySelector).should("exist");

    selectFilter("underfunded");
    expectNotVisibleInBudget(categorySelector);
  });

  it("does not treat negative assigned as cash overspending", () => {
    const groupName = "Negative Assign Group";
    const itemName = "Negative Assign Item";
    const assignAmount = -50;

    visitBudget();

    cy.getReadyToAssignValue().then((initialRta) => {

        cy.get("[data-cy=month-prev]").filter(':visible').first().click();

        addGroupAndItem(groupName, itemName);

        cy.setAssignedValue(groupName, itemName, assignAmount);

        cy.get("[data-cy=month-next]").filter(':visible').first().click();

        cy.getReadyToAssignValue().then((finalRta) => {
          expect(
            finalRta,
            "RTA should increase by the negative assignment amount"
          ).to.eq(initialRta - assignAmount);
        });
      });
  });
});
