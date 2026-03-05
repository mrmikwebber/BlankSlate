// cypress/e2e/rta_stability.cy.ts

import { BUDGET_URL } from "../support/testConstants";

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").filter(':visible').first().click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").filter(':visible').first().click();
const getCurrentMonthLabel = () => cy.get("[data-cy=month-label]").invoke("text");

const createCategoryInCurrentMonth = (groupName: string, itemName: string) => {
  cy.createCategory(groupName, itemName);
};

const categoryRowSelector = (groupName: string, itemName: string) =>
  `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

describe("Ready To Assign – historical stability", () => {
  beforeEach(() => {
    // Same login pattern as your other specs
    cy.login("thedasherx@gmail.com", "123456");
    visitBudget();
  });

  //
  // Property:
  //  - Assigning money in future months must NOT change RTA in earlier months.
  //
  it("does not let future assignments change RTA in earlier months", () => {
    const groupName = "RTA Stability Group";
    const itemName = "RTA Stability Category";
    //
    // Month 0: create category and assign some money
    //
    createCategoryInCurrentMonth(groupName, itemName);

    const rowM0 = categoryRowSelector(groupName, itemName);

    // Assign 100 in Month 0
    cy.setAssignedValue(groupName, itemName, 100);

    // Snapshot RTA for Month 0 after assignment
    cy.getReadyToAssignValue().then((rta) => {
      cy.wrap(rta).as("rtaM0");
    });

    //
    // Month 1: go forward, assign some money, snapshot RTA
    //
    goToNextMonth();

    const rowM1 = categoryRowSelector(groupName, itemName);
    cy.setAssignedValue(groupName, itemName, 50);

    cy.getReadyToAssignValue().then((rta) => {
      cy.wrap(rta).as("rtaM1");
    });

    //
    // Month 2: go forward again, assign some money, snapshot RTA
    //
    goToNextMonth();

    const rowM2 = categoryRowSelector(groupName, itemName);
    cy.setAssignedValue(groupName, itemName, 25);

    cy.getReadyToAssignValue().then((rta) => {
      cy.wrap(rta).as("rtaM2");
    });

    //
    // Go back to Month 1 and ensure its RTA hasn't been affected by Month 2 changes
    //
    goToPrevMonth();

    cy.getReadyToAssignValue().then((rtaAfterFuture) => {
      cy.get<number>("@rtaM1").then((rtaOriginal) => {
        expect(rtaAfterFuture, "Month 1 RTA should be unchanged after Month 2 edits")
          .to.eq(-175);
      });
    });

    //
    // Go back to Month 0 and ensure its RTA hasn't been affected by Month 1/2 changes
    //
    goToPrevMonth();

    cy.getReadyToAssignValue().then((rtaAfterFuture) => {
      cy.get<number>("@rtaM0").then((rtaOriginal) => {
        expect(rtaAfterFuture, "Month 0 RTA should be unchanged after Month 1+2 edits")
          .to.eq(-175);
      });
    });
  });
});
