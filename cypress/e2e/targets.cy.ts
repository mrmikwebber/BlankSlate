// cypress/e2e/targets.cy.ts
// Simplified, normalized spec focused on basic target lifecycle.

import { BUDGET_URL } from "../support/testConstants";

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const openTargetEditor = (groupName: string, itemName: string) => {
  cy.budgetFind(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  )
    .first()
    .scrollIntoView()
    .click();
  cy.get("[data-cy=inline-target-editor]").should("be.visible");
};

describe("Targets / goals – lifecycle", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    visitBudget();
  });

  it("shows underfunded → funded → overfunded states as assigned changes", () => {
    const groupName = "Targets Group";
    const itemName = "Streaming Subs";
    const targetAmount = 300;

    cy.createCategory(groupName, itemName);
    openTargetEditor(groupName, itemName);
    cy.get("[data-cy=target-amount-input]").clear().type(String(targetAmount));
    cy.get("[data-cy=target-save]").click();

    const rowSel = `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

    // 0 assigned → underfunded by 300
    cy.get(rowSel).first().within(() => {
      cy.get("[data-cy=assigned-display]").should("contain.text", "$0");
      cy.get("[data-cy=target-status]")
        .invoke("text")
        .then((txt) => {
          expect(txt.toLowerCase()).to.contain("underfunded");
          expect(txt).to.match(/300/i);
        });
    });

    // 150 assigned → underfunded by 150
    cy.setAssignedValue(groupName, itemName, 150);
    cy.get(rowSel).first().within(() => {
      cy.get("[data-cy=assigned-display]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(150));
      cy.get("[data-cy=target-status]")
        .invoke("text")
        .then((txt) => {
          expect(txt.toLowerCase()).to.contain("underfunded");
          expect(txt).to.match(/150/i);
        });
    });

    // 300 assigned → funded (no under/over text)
    cy.setAssignedValue(groupName, itemName, 300);
    cy.get(rowSel).first().within(() => {
      cy.get("[data-cy=assigned-display]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(300));
      cy.get("[data-cy=target-status]")
        .invoke("text")
        .then((txt) => {
          const lower = txt.toLowerCase();
          expect(lower).to.not.contain("underfunded");
          expect(lower).to.not.contain("overfunded");
        });
    });

    // 400 assigned → overfunded by 100
    cy.setAssignedValue(groupName, itemName, 400);
    cy.get(rowSel).first().within(() => {
      cy.get("[data-cy=assigned-display]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(400));
      cy.get("[data-cy=target-status]")
        .invoke("text")
        .then((txt) => {
          expect(txt.toLowerCase()).to.contain("overfunded");
          expect(txt).to.match(/100/i);
        });
    });
  });

  it.skip("shows progress bar states (instrumentation missing)", () => {});
  it.skip("clears a target (clear action not instrumented)", () => {});
});
