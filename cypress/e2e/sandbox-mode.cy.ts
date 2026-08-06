// cypress/e2e/sandbox-mode.cy.ts
//
// Regression test for the Sandbox-mode fix: the banner claims "Preview
// mode — not saved / All budget edits stay local until you exit," but
// before the fix, assign edits made while sandboxMode was true were
// written for real via the normal /api/budget/assign path, and "Exit &
// discard changes" never reverted them (it just refetched the same real
// data that had just been overwritten).

import { BUDGET_URL } from "../support/testConstants";

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const assignedDisplay = (categoryName: string, itemName: string) =>
  cy
    .getVisibleBudgetTable()
    .find(`[data-cy=assigned-display][data-category="${categoryName}"][data-item="${itemName}"]`);

const setAssigned = (categoryName: string, itemName: string, value: number) => {
  assignedDisplay(categoryName, itemName).click();
  cy.getVisibleBudgetTable()
    .find(`[data-cy=assigned-input][data-category="${categoryName}"][data-item="${itemName}"]`)
    .clear()
    .type(`${value}{enter}`);
};

describe("Sandbox mode", () => {
  const groupName = "Sandbox Test Group";
  const itemName = "Sandbox Test Category";

  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.createCategory(groupName, itemName);
  });

  it("does not persist assign edits made while in sandbox, and discards them on exit", () => {
    visitBudget();

    // Real, non-sandbox assign — regression check that normal editing still
    // writes through to the server.
    setAssigned(groupName, itemName, 100);
    assignedDisplay(groupName, itemName).should("contain.text", "100");
    cy.reload();
    cy.get("[data-cy=budget-table]").should("exist");
    assignedDisplay(groupName, itemName).should("contain.text", "100");

    // Enter sandbox, change the assigned amount, confirm the UI reflects it
    // instantly (optimistic patch).
    cy.get("[data-cy=sandbox-toggle]").click();
    cy.contains("Preview mode").should("be.visible");
    setAssigned(groupName, itemName, 500);
    assignedDisplay(groupName, itemName).should("contain.text", "500");

    // Confirm the sandbox edit never reached the server: reload in place
    // (still "in sandbox" only in React state, so this simulates checking
    // real server state) before exiting.
    cy.reload();
    cy.get("[data-cy=budget-table]").should("exist");
    assignedDisplay(groupName, itemName).should("contain.text", "100");

    // Redo the sandbox edit and this time exit via the banner's discard
    // button — the display must revert to the real value, not stay at 500.
    cy.get("[data-cy=sandbox-toggle]").click();
    setAssigned(groupName, itemName, 500);
    assignedDisplay(groupName, itemName).should("contain.text", "500");
    cy.get("[data-cy=sandbox-exit-banner]").click();
    assignedDisplay(groupName, itemName).should("contain.text", "100");

    // And the server-side value is genuinely untouched, not just the
    // client cache.
    cy.reload();
    cy.get("[data-cy=budget-table]").should("exist");
    assignedDisplay(groupName, itemName).should("contain.text", "100");
  });
});
