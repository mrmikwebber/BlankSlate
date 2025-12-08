// cypress/e2e/rta_stability.cy.ts

import { BUDGET_URL } from "../support/testConstants";

// Helpers (copied from existing specs like multi_month_behaviour)
const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").click();
const getCurrentMonthLabel = () => cy.get("[data-cy=month-label]").invoke("text");

const createCategoryInCurrentMonth = (groupName: string, itemName: string) => {
  cy.get("[data-cy=add-category-group-button]").click();
  cy.get("[data-cy=add-category-group-input]").type(groupName);
  cy.get("[data-cy=add-category-group-submit]").click();

  cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`)
    .first()
    .trigger("mouseover");

  cy.get(
    `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
  )
    .filter(":visible")
    .first()
    .then(($btn) => {
      if ($btn.length) {
        cy.wrap($btn).click();
      } else {
        cy.get(
          `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
        )
          .first()
          .click({ force: true });
      }
    });

  cy.get("[data-cy=add-item-input]").type(itemName);
  cy.get("[data-cy=add-item-submit]").click();

  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  ).should("exist");
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
    const readySelector = "[data-cy=ready-to-assign]";

    //
    // Month 0: create category and assign some money
    //
    createCategoryInCurrentMonth(groupName, itemName);

    const rowM0 = categoryRowSelector(groupName, itemName);

    // Assign 100 in Month 0
    cy.get(rowM0).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type("100{enter}");
    });

    // Snapshot RTA for Month 0 after assignment
    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rta = parseCurrency(text);
        cy.wrap(rta).as("rtaM0");
      });

    //
    // Month 1: go forward, assign some money, snapshot RTA
    //
    goToNextMonth();

    const rowM1 = categoryRowSelector(groupName, itemName);
    cy.get(rowM1).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type("50{enter}");
    });

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rta = parseCurrency(text);
        cy.wrap(rta).as("rtaM1");
      });

    //
    // Month 2: go forward again, assign some money, snapshot RTA
    //
    goToNextMonth();

    const rowM2 = categoryRowSelector(groupName, itemName);
    cy.get(rowM2).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type("25{enter}");
    });

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rta = parseCurrency(text);
        cy.wrap(rta).as("rtaM2");
      });

    //
    // Go back to Month 1 and ensure its RTA hasn't been affected by Month 2 changes
    //
    goToPrevMonth();

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rtaAfterFuture = parseCurrency(text);
        cy.get<number>("@rtaM1").then((rtaOriginal) => {
          expect(rtaAfterFuture, "Month 1 RTA should be unchanged after Month 2 edits")
            .to.eq(-175);
        });
      });

    //
    // Go back to Month 0 and ensure its RTA hasn't been affected by Month 1/2 changes
    //
    goToPrevMonth();

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rtaAfterFuture = parseCurrency(text);
        cy.get<number>("@rtaM0").then((rtaOriginal) => {
          expect(rtaAfterFuture, "Month 0 RTA should be unchanged after Month 1+2 edits")
            .to.eq(-175);
        });
      });
  });
});
