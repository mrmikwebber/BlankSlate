// cypress/e2e/rta_global.cy.ts

import { BUDGET_URL } from "../support/testConstants";

const readySelector = "[data-cy=ready-to-assign]";

const parseCurrency = (text: string): number =>
  Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.waitForBudgetCalculation();
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").click();

const addGroupAndItem = (groupName: string, itemName: string) => {
  // Add group
  cy.get("[data-cy=add-category-group-button]").click();
  cy.get("[data-cy=add-category-group-input]").clear().type(groupName);
  cy.get("[data-cy=add-category-group-submit]").click();

  // Hover to reveal "add item" button for that group
  cy.get(
    `tr[data-cy="category-group-row"][data-category="${groupName}"]`
  )
    .first()
    .trigger("mouseover");

  cy.get(
    `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
  )
    .filter(":visible")
    .first()
    .click({ force: true });

  // Add item
  cy.get("[data-cy=add-item-input]").clear().type(itemName);
  cy.get("[data-cy=add-item-submit]").click();

  // Ensure the row exists
  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  ).should("exist");
};

const categoryRowSelector = (groupName: string, itemName: string) =>
  `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

describe("Global Ready To Assign behavior", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456"); // adjust if needed
    visitBudget();
  });

  it("shows the same RTA value across months when nothing changes", () => {
    // Grab RTA on starting month
    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rtaStart = parseCurrency(text);
        cy.wrap(rtaStart).as("rtaStart");
      });

    // Go to next month: RTA should be identical (no changes made)
    goToNextMonth();

    cy.get(readySelector)
      .invoke("text")
      .then((textNext) => {
        const rtaNext = parseCurrency(textNext);
        cy.get<number>("@rtaStart").then((rtaStart) => {
          expect(
            rtaNext,
            "RTA should be the same when just switching months"
          ).to.eq(rtaStart);
        });
      });

    // Go back to previous month: still identical
    goToPrevMonth();

    cy.get(readySelector)
      .invoke("text")
      .then((textBack) => {
        const rtaBack = parseCurrency(textBack);
        cy.get<number>("@rtaStart").then((rtaStart) => {
          expect(
            rtaBack,
            "RTA should still be the same when returning to the original month"
          ).to.eq(rtaStart);
        });
      });
  });

  it("updates RTA globally when assigning money in any month", () => {
    const groupName = "RTA Global Group";
    const itemName = "RTA Global Category";
    const assignAmount = 25;

    // Capture initial global RTA on the starting month
    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rtaStart = parseCurrency(text);
        cy.wrap(rtaStart).as("rtaStart");
      });

    // Move to next month and create a fresh category there
    goToNextMonth();
    addGroupAndItem(groupName, itemName);

    const rowSel = categoryRowSelector(groupName, itemName);

    // Assign some money in this month
    cy.get(rowSel).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type(`${assignAmount}{enter}`);
    });

    // RTA on this month should have decreased by exactly assignAmount
    cy.get(readySelector)
      .invoke("text")
      .then((textAfter) => {
        const rtaAfter = parseCurrency(textAfter);
        cy.wrap(rtaAfter).as("rtaAfter");

        cy.get<number>("@rtaStart").then((rtaStart) => {
          expect(
            rtaAfter,
            "RTA should decrease globally by the assigned amount"
          ).to.eq(rtaStart - assignAmount);
        });
      });

    // Go back to previous month: it should show the SAME new RTA (global)
    goToPrevMonth();

    cy.get(readySelector)
      .invoke("text")
      .then((textBack) => {
        const rtaSeenOnPrevMonth = parseCurrency(textBack);
        cy.get<number>("@rtaAfter").then((rtaAfter) => {
          expect(
            rtaSeenOnPrevMonth,
            "RTA is a single global value and should match across months"
          ).to.eq(rtaAfter);
        });
      });
  });
});
