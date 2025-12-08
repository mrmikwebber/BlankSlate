// cypress/e2e/targets.cy.ts
// Simplified, normalized spec focused on basic target lifecycle.

import { BUDGET_URL } from "../support/testConstants";

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
  cy.waitForBudgetCalculation();
};

  const createCategory = (groupName: string, itemName: string) => {
    cy.get("[data-cy=add-category-group-button]").click();
    cy.get("[data-cy=add-category-group-input]").type(groupName);
    cy.get("[data-cy=add-category-group-submit]").click();

    // Hover to reveal the add-item button; prefer first visible match, fallback to forced click
    cy.get(`[data-cy="category-group-row"][data-category="${groupName}"]`).first().trigger("mouseover");
    cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`)
      .filter(":visible")
      .first()
      .then(($btn) => {
        if ($btn.length) {
          cy.wrap($btn).click();
        } else {
          cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`).first().click({ force: true });
        }
      });

    cy.get("[data-cy=add-item-input]").type(itemName);
    cy.get("[data-cy=add-item-submit]").click();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).should("exist");
  };

const openTargetEditor = (groupName: string, itemName: string) => {
  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  ).click();
  cy.get("[data-cy=inline-target-editor]").should("be.visible");
};

const setAssigned = (groupName: string, itemName: string, value: number) => {
  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`
  ).click();
  cy.get(
    `[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`
  )
    .clear()
    .type(String(value))
    .blur();
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

    createCategory(groupName, itemName);
    openTargetEditor(groupName, itemName);
    cy.get("[data-cy=target-amount-input]").clear().type(String(targetAmount));
    cy.get("[data-cy=target-save]").click();

    const rowSel = `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`;

    // 0 assigned → underfunded by 300
    cy.get(rowSel).within(() => {
      cy.get("[data-cy=assigned-display]").should("contain.text", "$0");
      cy.get("[data-cy=target-status]")
        .invoke("text")
        .then((txt) => {
          expect(txt.toLowerCase()).to.contain("underfunded");
          expect(txt).to.match(/300/i);
        });
    });

    // 150 assigned → underfunded by 150
    setAssigned(groupName, itemName, 150);
    cy.get(rowSel).within(() => {
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
    setAssigned(groupName, itemName, 300);
    cy.get(rowSel).within(() => {
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
    setAssigned(groupName, itemName, 400);
    cy.get(rowSel).within(() => {
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
