// cypress/e2e/global_planning_mode.cy.ts
//
// Global planning mode now makes the shadow/global figure the *primary*
// Available number for a category (previously only a small secondary amber
// annotation), and Move Money — which always writes real money — is
// disabled while in Global mode rather than silently acting on a hypothetical
// plan. This spec is the first end-to-end coverage of the feature.

import { BUDGET_URL } from "../support/testConstants";

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const categoryRow = (groupName: string, itemName: string) =>
  cy
    .getVisibleBudgetTable()
    .find(`tr[data-cy=category-row][data-category="${groupName}"][data-item="${itemName}"]`);

const assignedDisplay = (groupName: string, itemName: string) =>
  cy
    .getVisibleBudgetTable()
    .find(`[data-cy=assigned-display][data-category="${groupName}"][data-item="${itemName}"]`);

const setAssigned = (groupName: string, itemName: string, value: number) => {
  assignedDisplay(groupName, itemName).click();
  cy.getVisibleBudgetTable()
    .find(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
    .clear()
    .type(`${value}{enter}`);
};

const openPlanningModeToggle = () => {
  cy.get("[data-cy=ready-to-assign]").click();
  cy.get("[data-cy=planning-mode-global]").should("be.visible");
};

describe("Global planning mode", () => {
  const groupName = "Global Mode Test Group";
  const itemName = "Global Mode Test Category";

  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.createCategory(groupName, itemName);
  });

  it("shows the global figure as the primary Available number and disables Move Money", () => {
    visitBudget();

    setAssigned(groupName, itemName, 100);
    categoryRow(groupName, itemName).find("[data-cy=item-available]").should("contain.text", "100");

    // Enter Global mode and assign a larger, hypothetical amount — the
    // Available cell should flip to that figure directly, not just grow a
    // secondary annotation underneath the still-real 100.
    openPlanningModeToggle();
    cy.get("[data-cy=planning-mode-global]").click();
    cy.get("[data-cy=global-mode-exit-banner]").should("be.visible");
    cy.get("body").type("{esc}");

    setAssigned(groupName, itemName, 400);
    categoryRow(groupName, itemName)
      .find("[data-cy=item-available]")
      .should("contain.text", "400")
      .find("[data-cy=item-global-available]")
      .should("not.exist");

    // Move Money must not be a live action on a hypothetical plan.
    categoryRow(groupName, itemName)
      .find("[data-cy=move-money-trigger]")
      .should("have.attr", "data-disabled", "true")
      .click({ force: true });
    cy.contains("Move Money From").should("not.exist");

    // Back to Period: the real, untouched 100 reappears and Move Money works again.
    cy.get("[data-cy=global-mode-exit-banner]").contains("Back to Period").click();
    categoryRow(groupName, itemName).find("[data-cy=item-available]").should("contain.text", "100");
    categoryRow(groupName, itemName)
      .find("[data-cy=move-money-trigger]")
      .should("not.have.attr", "data-disabled")
      .click();
    cy.contains("Move Money From").should("be.visible");
  });
});
