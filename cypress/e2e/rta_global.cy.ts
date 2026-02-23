// cypress/e2e/rta_global.cy.ts

import { BUDGET_URL } from "../support/testConstants";

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").filter(':visible').first().click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").filter(':visible').first().click();

const addGroupAndItem = (groupName: string, itemName: string) => {
  cy.createCategory(groupName, itemName);
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
    cy.getReadyToAssignValue().then((rtaStart) => {
      cy.wrap(rtaStart).as("rtaStart");
    });

    // Go to next month: RTA should be identical (no changes made)
    goToNextMonth();

    cy.getReadyToAssignValue().then((rtaNext) => {
      cy.get<number>("@rtaStart").then((rtaStart) => {
        expect(
          rtaNext,
          "RTA should be the same when just switching months"
        ).to.eq(rtaStart);
      });
    });

    // Go back to previous month: still identical
    goToPrevMonth();

    cy.getReadyToAssignValue().then((rtaBack) => {
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
    cy.getReadyToAssignValue().then((rtaStart) => {
      cy.wrap(rtaStart).as("rtaStart");
    });

    // Move to next month and create a fresh category there
    goToNextMonth();
    addGroupAndItem(groupName, itemName);

    const rowSel = categoryRowSelector(groupName, itemName);

    // Assign some money in this month
    cy.setAssignedValue(groupName, itemName, assignAmount);

    // RTA on this month should have decreased by exactly assignAmount
    cy.getReadyToAssignValue().then((rtaAfter) => {
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

    cy.getReadyToAssignValue().then((rtaSeenOnPrevMonth) => {
      cy.get<number>("@rtaAfter").then((rtaAfter) => {
        expect(
          rtaSeenOnPrevMonth,
          "RTA is a single global value and should match across months"
        ).to.eq(rtaAfter);
      });
    });
  });
});
