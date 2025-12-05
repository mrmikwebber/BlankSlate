// cypress/e2e/past_month_edit.cy.ts

import { BUDGET_URL } from "../support/testConstants";

const readySelector = "[data-cy=ready-to-assign]";

const parseCurrency = (text: string): number =>
  Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").click();

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

describe("Editing past-month budgets propagates correctly", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456"); // adjust if needed
    visitBudget();
  });

  it("editing assigned in a past month updates that month, the future month, and global RTA", () => {
    const groupName = "Past Month Edit Group";
    const itemName = "Past Month Edit Category";

    // 1️⃣ Setup: create a category in the starting month (Month A) and assign 100
    addGroupAndItem(groupName, itemName);

    const rowA = categoryRowSelector(groupName, itemName);

    // Assign 100 in Month A
    cy.get(rowA).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type("100{enter}");
    });

    // Snapshot Month A available and global RTA
    cy.get(rowA)
      .find('[data-cy="item-available"]')
      .invoke("text")
      .then((text) => {
        const availA_before = parseCurrency(text);
        cy.wrap(availA_before).as("availA_before");
      });

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rta_before = parseCurrency(text);
        cy.wrap(rta_before).as("rta_before");
      });

    // 2️⃣ Go to next month (Month B) and snapshot that month's available
    goToNextMonth();

    const rowB = categoryRowSelector(groupName, itemName);

    cy.get(rowB)
      .find('[data-cy="item-available"]')
      .invoke("text")
      .then((text) => {
        const availB_before = parseCurrency(text);
        cy.wrap(availB_before).as("availB_before");
      });

    // 3️⃣ Go back to Month A and EDIT assigned from 100 → 80 (unassign 20)
    cy.get("[data-cy=month-prev]").click();

    cy.get(rowA).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]')
        .clear()
        .type("80{enter}");
    });

    // Snapshot Month A available and global RTA AFTER the edit
    cy.get(rowA)
      .find('[data-cy="item-available"]')
      .invoke("text")
      .then((text) => {
        const availA_after = parseCurrency(text);
        cy.wrap(availA_after).as("availA_after");
      });

    cy.get(readySelector)
      .invoke("text")
      .then((text) => {
        const rta_after = parseCurrency(text);
        cy.wrap(rta_after).as("rta_after");
      });

    // 4️⃣ Go forward again to Month B and snapshot available AFTER the edit
    goToNextMonth();

    cy.get(rowB)
      .find('[data-cy="item-available"]')
      .invoke("text")
      .then((text) => {
        const availB_after = parseCurrency(text);
        cy.wrap(availB_after).as("availB_after");
      });

    // 5️⃣ Assertions: deltas are consistent and RTA updated correctly
    cy.get<number>("@availA_before").then((availA_before) => {
      cy.get<number>("@availA_after").then((availA_after) => {
        const deltaA = availA_after - availA_before;

        // Editing past month should actually change Month A available
        expect(deltaA, "Month A available should change after edit").to.not.eq(0);

        cy.get<number>("@availB_before").then((availB_before) => {
          cy.get<number>("@availB_after").then((availB_after) => {
            const deltaB = availB_after - availB_before;

            // Carryover: Month B should reflect the same delta
            expect(
              deltaB,
              "Future month available should shift by same amount as past month edit"
            ).to.eq(deltaA);
          });
        });
      });
    });

    cy.get<number>("@rta_before").then((rta_before) => {
      cy.get<number>("@rta_after").then((rta_after) => {
        // We reduced assigned from 100 → 80 (unassigned 20), so RTA should increase by 20
        expect(
          rta_after,
          "Global RTA should increase by the amount unassigned in the past month"
        ).to.eq(rta_before + 20);
      });
    });
  });
});
