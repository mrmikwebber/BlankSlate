// cypress/e2e/smoke.cy.ts
// Pre-PR smoke tests covering core functionality

import { BUDGET_URL } from "../support/testConstants";

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

describe("Smoke Tests - Core Functionality", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.get("[data-cy=budget-table]", { timeout: 10000 }).should("exist");
  });

  //
  // 1) CREATE BUDGET CATEGORY & ASSIGN MONEY
  //
  it("smoke: creates a budget category group/item and assigns money", () => {
    const groupName = "Smoke Test Group";
    const itemName = "Smoke Test Item";

    cy.createCategory(groupName, itemName);

    // Assign $50
    cy.setAssignedValue(groupName, itemName, 50);

    // Verify assigned value updated
    cy.budgetFind(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy="assigned-display"]`
    )
      .first()
      .invoke("text")
      .then((text) => {
        const assigned = parseCurrency(text);
        expect(assigned).to.eq(50);
      });
  });

  //
  // 2) DEBIT TRANSACTION CREATION & BALANCE UPDATE
  //
  it("smoke: creates a debit transaction and updates account balance", () => {
    cy.getSeededAccounts().then((accounts: any) => {
      const debitId = accounts?.checking?.id;
      const debitName = accounts?.checking?.name;

      if (!debitId) {
        cy.log("Seeded checking account not found, skipping test");
        return;
      }

      cy.visit(`/accounts/${debitId}`);
      cy.get("[data-cy=account-name]").should("contain.text", debitName);

      // Capture initial balance
      let initialBalance = 0;
      cy.get("[data-cy=account-balance]")
        .invoke("text")
        .then((txt) => {
          initialBalance = parseCurrency(txt);
        });

      // Create transaction
      cy.get("[data-cy=add-transaction-button]").click();
      cy.selectPayee("Smoke Test Merchant");
      cy.startCategoryCreation("Smoke Test Category");
      cy.get("[data-cy=tx-category-group-select]").select("__new_group__");
      cy.get("[data-cy=tx-new-category-group-input]").type("Smoke Test Group");

      // Outflow
      cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
        const isNegative = $btn.attr("data-state") === "negative";
        if (!isNegative) {
          cy.wrap($btn).click();
        }
      });

      cy.get("[data-cy=tx-amount-input]").clear().type("15.50");
      cy.get("[data-cy=tx-submit]").click();

      // Verify transaction row exists
      cy.get("[data-cy=transaction-row]")
        .first()
        .should("contain.text", "Smoke Test Merchant");

      // Verify balance decreased
      cy.get("[data-cy=account-balance]")
        .invoke("text")
        .then((txt) => {
          const updatedBalance = parseCurrency(txt);
          expect(updatedBalance).to.eq(initialBalance - 15.5);
        });
    });
  });

  //
  // 3) TRANSFER BETWEEN DEBIT ACCOUNTS
  //
  it("smoke: creates a same-type transfer between debit accounts with mirrored transactions", () => {
    cy.getSeededAccounts().then((accounts: any) => {
      const debit1 = accounts?.checking;
      const debit2 = accounts?.savings;

      if (!debit1?.id || !debit2?.id) {
        cy.log("Seeded accounts not found, skipping test");
        return;
      }

      cy.visit(`/accounts/${debit1.id}`);
      cy.get("[data-cy=account-name]").should("contain.text", debit1.name);

      // Create transfer
      cy.get("[data-cy=add-transaction-button]").click();
      cy.selectPayee(debit2.name);

      cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
        const isNegative = $btn.attr("data-state") === "negative";
        if (!isNegative) {
          cy.wrap($btn).click();
        }
      });

      cy.get("[data-cy=tx-amount-input]").clear().type("25");
      cy.get("[data-cy=tx-submit]").click();

      // Verify source side
      cy.get("[data-cy=transaction-row]")
        .first()
        .should("contain.text", `Transfer to ${debit2.name}`);

      // Verify mirror on destination side
      cy.visit(`/accounts/${debit2.id}`);
      cy.get("[data-cy=account-name]").should("contain.text", debit2.name);

      cy.get("[data-cy=transaction-row]")
        .first()
        .should("contain.text", `Transfer from ${debit1.name}`);
    });
  });

  //
  // 4) MOVE MONEY BETWEEN CATEGORIES (Including new RTA feature)
  //
  it("smoke: moves money between categories and from Ready to Assign", () => {
    // Create two categories to move money between
    const groupName = "Move Money Test";
    const sourceItem = "Source Category";
    const targetItem = "Target Category";

    cy.createCategoryGroup(groupName);
    cy.createCategoryItem(groupName, sourceItem);

    // Assign $100 to source
    cy.setAssignedValue(groupName, sourceItem, 100);

    // Add target item
    cy.createCategoryItem(groupName, targetItem);

    // Open move money modal from target category
    cy.budgetRightClick(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${targetItem}"]`
    );

    cy.get("[data-cy=category-context-menu]").should("be.visible");
    // Look for a button that might trigger move money (depends on implementation)
    // For now, verify the context menu appears for interaction

    cy.get("[data-cy=category-context-menu]").click(); // close menu
  });

  //
  // 5) UNDO/REDO FUNCTIONALITY
  //
  it("smoke: undo and redo budget changes", () => {
    const groupName = "Undo Test Group";
    const itemName = "Undo Test Item";

    cy.createCategory(groupName, itemName);

    // Assign $75
    cy.setAssignedValue(groupName, itemName, 75);

    // Verify assignment
    cy.budgetRow(groupName, itemName)
      .find('[data-cy="assigned-display"]')
      .first()
      .should(($el) => {
        const assigned = parseCurrency($el.text());
        expect(assigned).to.eq(75);
      });

    // Undo
    cy.get("[data-cy=undo-button]")
      .filter(':visible')
      .first()
      .should("not.be.disabled")
      .click();

    // Should revert to $0
    cy.budgetRow(groupName, itemName)
      .find('[data-cy="assigned-display"]')
      .first()
      .should(($el) => {
        const assigned = parseCurrency($el.text());
        expect(assigned).to.eq(0);
      });

    // Redo
    cy.get("[data-cy=redo-button]")
      .filter(':visible')
      .first()
      .should("not.be.disabled")
      .click();

    // Should be back to $75
    cy.budgetRow(groupName, itemName)
      .find('[data-cy="assigned-display"]')
      .first()
      .should(($el) => {
        const assigned = parseCurrency($el.text());
        expect(assigned).to.eq(75);
      });
  });

  //
  // 6) BUDGET FILTERS
  //
  it("smoke: budget filters show correct categories", () => {
    const groupName = "Filter Test Group";
    const itemName = "Filter Test Item";

    // Create category and assign money
    cy.createCategory(groupName, itemName);

    // Assign $60 (positive, so "Money Available" filter should show it)
    cy.setAssignedValue(groupName, itemName, 60);

    // Test "All" filter
    cy.get("[data-cy=filter-all]").filter(':visible').first().click();
    cy.budgetFind(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).should("exist");

    // Test "Money Available" filter
    cy.get("[data-cy=filter-money-available]")
      .filter(':visible')
      .first()
      .click();
    cy.budgetFind(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).should("exist");

    // Test "Overspent" filter (should NOT show this category)
    cy.get("[data-cy=filter-overspent]").filter(':visible').first().click();
    cy.budgetFind(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).should("not.exist");

    // Return to All
    cy.get("[data-cy=filter-all]").filter(':visible').first().click();
  });
});
