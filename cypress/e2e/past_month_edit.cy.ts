// cypress/e2e/past_month_edit.cy.ts

import { BUDGET_URL } from "../support/testConstants";

const parseCurrency = (text: string): number =>
  Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").filter(':visible').first().click();

const addGroupAndItem = (groupName: string, itemName: string) => {
  cy.createCategory(groupName, itemName);
};

describe("Editing past-month budgets propagates correctly", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456"); // adjust if needed
    visitBudget();
  });

  const getAvailableValue = (groupName: string, itemName: string) =>
    cy
      .budgetRow(groupName, itemName)
      .find('[data-cy="item-available"]')
      .first()
      .should(($el) => {
        const value = parseCurrency($el.text());
        expect(value, 'Available should be numeric').to.not.be.NaN;
      })
      .invoke('text')
      .then((text) => parseCurrency(text));

  it("editing assigned in a past month updates that month, the future month, and global RTA", () => {
    const groupName = "Past Month Edit Group";
    const itemName = "Past Month Edit Category";

    // 1️⃣ Setup: create a category in the starting month (Month A) and assign 100
    addGroupAndItem(groupName, itemName);

    // Assign 100 in Month A
    cy.setAssignedValue(groupName, itemName, 100);

    // Snapshot Month A available and global RTA
    getAvailableValue(groupName, itemName).then((availA_before) => {
      cy.wrap(availA_before).as('availA_before');
    });

    cy.getReadyToAssignValue().then((rta_before) => {
      cy.wrap(rta_before).as("rta_before");
    });

    // 2️⃣ Go to next month (Month B) and snapshot that month's available
    goToNextMonth();

    getAvailableValue(groupName, itemName).then((availB_before) => {
      cy.wrap(availB_before).as('availB_before');
    });

    // 3️⃣ Go back to Month A and EDIT assigned from 100 → 80 (unassign 20)
    cy.get("[data-cy=month-prev]").filter(':visible').first().click();

    cy.setAssignedValue(groupName, itemName, 80);

    // Snapshot Month A available and global RTA AFTER the edit
    getAvailableValue(groupName, itemName).then((availA_after) => {
      cy.wrap(availA_after).as('availA_after');
    });

    cy.getReadyToAssignValue().then((rta_after) => {
      cy.wrap(rta_after).as("rta_after");
    });

    // 4️⃣ Go forward again to Month B and snapshot available AFTER the edit
    goToNextMonth();

    getAvailableValue(groupName, itemName).then((availB_after) => {
      cy.wrap(availB_after).as('availB_after');
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
