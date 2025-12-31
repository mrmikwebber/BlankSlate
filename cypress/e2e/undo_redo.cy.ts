import { resetDatabase } from "../support/db-reset";

let DEBIT_ACCOUNT_ID: string = '';
let DEBIT_ACCOUNT_NAME: string = '';

describe("Undo/Redo Functionality", () => {
    beforeEach(() => {
        // Note: cy.task('resetDb') is called in global beforeEach (support/e2e.ts)
        cy.login('thedasherx@gmail.com', '123456');
        cy.wait(500);

        // Hydrate account IDs for transaction tests
        cy.getSeededAccounts().then((accounts: any) => {
            DEBIT_ACCOUNT_ID = accounts?.checking?.id || DEBIT_ACCOUNT_ID;
            DEBIT_ACCOUNT_NAME = accounts?.checking?.name || 'Checking Account';
        });
    });

    describe("Budget Assignment Undo/Redo", () => {
        it("should undo and redo budget assignment", () => {
            // Verify initial state
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Assign budget to Rent
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();

            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("1000{enter}");

            // Verify assignment
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$1,000.00");

            // Undo the assignment
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify undo worked
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Redo the assignment
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify redo worked
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$1,000.00");
        });

        it("should undo multiple budget assignments in sequence", () => {
            // Assign to Rent
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("1000{enter}");

            // Assign to Electricity
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Electricity"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Electricity"]')
                .clear()
                .type("200{enter}");

            // Assign to Water
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Water"]')
                .clear()
                .type("100{enter}");

            // Undo Water assignment
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Undo Electricity assignment
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Electricity"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Undo Rent assignment
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");
        });
    });

    describe("Category Group Undo/Redo", () => {
        it("should undo and redo adding a category group", () => {
            // Add new category group
            cy.get('[data-cy="add-category-group-button"]').click();
            cy.get('[data-cy="add-category-group-input"]').type("Entertainment");
            cy.get('[data-cy="add-category-group-submit"]').click();

            // Verify group was added
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("exist");

            // Undo adding the group
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify group was removed
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("not.exist");

            // Redo adding the group
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify group was added back
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("exist");
        });

        it("should undo and redo deleting a category group", () => {
            // First add a category group so we have something to delete
            cy.get('[data-cy="add-category-group-button"]').click();
            cy.get('[data-cy="add-category-group-input"]').type("Entertainment");
            cy.get('[data-cy="add-category-group-submit"]').click();
            cy.wait(300);

            // Right-click to open context menu
            cy.get('[data-cy="group-name"][data-category="Entertainment"]')
                .rightclick();

            // Delete the group
            cy.get('[data-cy="group-delete"]').first().click();

            // Verify group was deleted
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("not.exist");

            // Undo deletion
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify group was restored
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("exist");

            // Redo deletion
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify group was deleted again
            cy.get('tr[data-cy="category-group-row"][data-category="Entertainment"]').should("not.exist");
        });
    });

    describe("Category Item Undo/Redo", () => {
        it("should undo and redo adding a category item", () => {
            const groupName = "Bills";
            const itemName = "Internet";

            // Hover over group and click add item
            cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`).trigger("mouseover");
            cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`)
                .filter(":visible")
                .first()
                .click();

            // Add the new item
            cy.get('[data-cy="add-item-input"]').type(itemName);
            cy.get('[data-cy="add-item-submit"]').click();
            cy.wait(300);

            // Verify item was added
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`).should("exist");

            // Undo adding the item
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify item was removed
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`).should("not.exist");

            // Redo adding the item
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify item was added back
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`).should("exist");
        });

        it("should undo and redo deleting a category item", () => {
            // Right-click on a category item to open context menu
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]')
                .rightclick();

            // Delete the category
            cy.get('[data-cy="category-delete"][data-category="Bills"][data-item="Water"]').click();

            // Confirm deletion (no funds to reassign)
            cy.get('[data-cy="delete-confirm"]').click();

            // Verify item was deleted
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]').should("not.exist");

            // Undo deletion
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify item was restored
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]').should("exist");

            // Redo deletion
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify item was deleted again
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Water"]').should("not.exist");
        });
    });

    describe("Category Target Undo/Redo", () => {
        it("should undo and redo setting a category target", () => {
            const groupName = "Bills";
            const itemName = "Rent";

            // Click on the category name to open target editor (not the assigned field)
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] td:first-child`)
                .click();

            // Wait for inline editor to appear
            cy.get('[data-cy="inline-target-editor"]').should("be.visible");

            // Set target type to Monthly
            cy.get('[data-cy="target-type-select"]').select("monthly");
            cy.get('[data-cy="target-amount-input"]').clear().type("1200");
            cy.get('[data-cy="target-save"]').click();
            cy.wait(300);

            // Verify target appears (check for amount needed indicator)
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`)
                .should("contain", "$1,200");

            // Undo setting the target
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Verify target is removed (amount needed should not show)
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`)
                .should("not.contain", "$1,200");

            // Redo setting the target
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Verify target is back
            cy.get(`tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`)
                .should("contain", "$1,200");
        });
    });

    describe("Transaction Undo/Redo", () => {
        beforeEach(() => {
            // Navigate to an account
            cy.visit(`/accounts/${DEBIT_ACCOUNT_ID}`);
            cy.wait(500);
            cy.get('[data-cy="account-name"]').should('contain.text', DEBIT_ACCOUNT_NAME);
        });

        it("should undo and redo adding a transaction", () => {
            // Count initial transactions (allow zero rows without failing the test)
            cy.get('body').then(($body) => {
                const initialCount = $body.find('tr[data-cy="transaction-row"]').length;

                // Add a new transaction
                cy.get('[data-cy="add-transaction-button"]').click();

                // Fill in transaction details
                cy.selectPayee("Test Payee");
                cy.selectCategory("Bills::Rent");
                cy.get('[data-cy="tx-sign-toggle"]').click(); // Make it outflow
                cy.get('[data-cy="tx-amount-input"]').type("500");
                cy.get('[data-cy="tx-submit"]').click();
                cy.wait(500);

                // Verify transaction was added
                cy.get('tr[data-cy="transaction-row"]').should("have.length", initialCount + 1);

                // Undo adding the transaction
                cy.get("body").type("{ctrl}z");
                cy.wait(500);

                // Verify transaction was removed
                cy.get('tr[data-cy="transaction-row"]').should("have.length", initialCount);

                // Redo adding the transaction
                cy.get("body").type("{ctrl}y");
                cy.wait(500);

                // Verify transaction was added back
                cy.get('tr[data-cy="transaction-row"]').should("have.length", initialCount + 1);
            });
        });

        it("should undo and redo deleting a transaction", () => {
            // Add a transaction first
            cy.get('[data-cy="add-transaction-button"]').click();
            cy.selectPayee("Delete Me");
            cy.selectCategory("Bills::Rent");
            cy.get('[data-cy="tx-sign-toggle"]').click();
            cy.get('[data-cy="tx-amount-input"]').type("250");
            cy.get('[data-cy="tx-submit"]').click();
            cy.wait(500);

            // Get the transaction row
            cy.get('tr[data-cy="transaction-row"]').last().then(($row) => {
                const txId = $row.attr("data-txid");

                // Right-click to delete
                cy.get(`tr[data-cy="transaction-row"][data-txid="${txId}"]`).rightclick();
                cy.get("button").contains("Delete").click();
                cy.wait(300);

                // Verify transaction was deleted
                cy.get(`tr[data-cy="transaction-row"][data-txid="${txId}"]`).should("not.exist");

                // Undo deletion
                cy.get("body").type("{ctrl}z");
                cy.wait(500);

                // Verify transaction was restored
                cy.get('tr[data-cy="transaction-row"]').should("contain", "Delete Me");

                // Redo deletion
                cy.get("body").type("{ctrl}y");
                cy.wait(300);

                // Verify transaction was deleted again
                cy.get('tr[data-cy="transaction-row"]').should("not.exist");
            });
        });

        it("should undo and redo bulk transaction deletion", () => {
            // Add multiple transactions first
            cy.get('[data-cy="add-transaction-button"]').click();
            for (let i = 1; i <= 3; i++) {
                // Form should be open from first click or previous submit
                cy.selectPayee(`Bulk Test ${i}`);
                cy.selectCategory("Bills::Rent");
                cy.get('[data-cy="tx-sign-toggle"]').click();
                cy.get('[data-cy="tx-amount-input"]').type(`${100 * i}`);
                cy.get('[data-cy="tx-submit"]').click();
                cy.wait(300);
                
                // Form stays open after submit, so we don't need to click add button again
            }

            cy.wait(500);

            // Count transactions before bulk delete
            cy.get('tr[data-cy="transaction-row"]').then(($rows) => {
                const initialCount = $rows.length;

                // Select multiple transactions (checkbox in first cell)
                cy.get('tr[data-cy="transaction-row"]').eq(-3).find('input[type="checkbox"]').check();
                cy.get('tr[data-cy="transaction-row"]').eq(-2).find('input[type="checkbox"]').check();
                cy.get('tr[data-cy="transaction-row"]').eq(-1).find('input[type="checkbox"]').check();

                // Right-click to open bulk context menu
                cy.get('tr[data-cy="transaction-row"]').eq(-1).rightclick();
                cy.get("button").contains("Delete").click();
                cy.wait(300);

                // Verify transactions were deleted
                cy.get('tr[data-cy="transaction-row"]').should("have.length", initialCount - 3);

                // Undo bulk deletion
                cy.get("body").type("{ctrl}z");
                cy.wait(500);

                // Verify transactions were restored
                cy.get('tr[data-cy="transaction-row"]').should("have.length.at.least", initialCount - 1);

                // Redo bulk deletion
                cy.get("body").type("{ctrl}y");
                cy.wait(300);

                // Verify transactions were deleted again
                cy.get('tr[data-cy="transaction-row"]').should("have.length", initialCount - 3);
            });
        });
    });

    describe("Activity Sidebar Undo/Redo Buttons", () => {
        it("should show undo button when action is available", () => {
            // Make a change
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("500{enter}");
            cy.wait(300);

            // Check that undo button exists and is enabled
            cy.get('[data-cy="undo-button"]').should("exist").and("not.be.disabled");
            cy.get('[data-cy="redo-button"]').should("be.disabled");
        });

        it("should disable undo button when nothing to undo", () => {
            // Initially, undo should be disabled
            cy.get('[data-cy="undo-button"]').should("be.disabled");
        });

        it("should show redo button after undo", () => {
            // Make a change
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("500{enter}");
            cy.wait(300);

            // Undo
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Check that redo button is now enabled
            cy.get('[data-cy="redo-button"]').should("exist").and("not.be.disabled");
        });

        it("should allow clicking undo/redo buttons directly", () => {
            // Make a change
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("750{enter}");
            cy.wait(300);

            // Click undo button
            cy.get('[data-cy="undo-button"]').click();
            cy.wait(300);

            // Verify undo worked
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Click redo button
            cy.get('[data-cy="redo-button"]').click();
            cy.wait(300);

            // Verify redo worked
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$750.00");
        });
    });

    describe("Complex Undo/Redo Scenarios", () => {
        it("should maintain undo stack integrity across different operation types", () => {
            // 1. Assign budget
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("1000{enter}");
            cy.wait(300);

            // 2. Add category group
            cy.get('[data-cy="add-category-group-button"]').click();
            cy.get('[data-cy="add-category-group-input"]').type("Fun");
            cy.get('[data-cy="add-category-group-submit"]').click();
            cy.wait(300);

            // 3. Add category item
            cy.get('tr[data-cy="category-group-row"][data-category="Fun"]').trigger("mouseover");
            cy.get('[data-category="Fun"] [data-cy="group-add-item-button"]')
                .filter(":visible")
                .first()
                .click();
            cy.get('[data-cy="add-item-input"]').type("Movies");
            cy.get('[data-cy="add-item-submit"]').click();
            cy.wait(300);

            // Now undo in reverse order
            // Undo add category item
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Fun"][data-item="Movies"]').should("not.exist");

            // Undo add category group
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-group-row"][data-category="Fun"]').should("not.exist");

            // Undo assign budget
            cy.get("body").type("{ctrl}z");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");

            // Now redo all three
            cy.get("body").type("{ctrl}y");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$1,000.00");

            cy.get("body").type("{ctrl}y");
            cy.wait(300);
            cy.get('tr[data-cy="category-group-row"][data-category="Fun"]').should("exist");

            cy.get("body").type("{ctrl}y");
            cy.wait(300);
            cy.get('tr[data-cy="category-row"][data-category="Fun"][data-item="Movies"]').should("exist");
        });

        it("should clear redo stack when new action is performed after undo", () => {
            // Make first change
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Rent"]')
                .clear()
                .type("1000{enter}");
            cy.wait(300);

            // Undo it
            cy.get("body").type("{ctrl}z");
            cy.wait(300);

            // Make a different change
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Electricity"]')
                .find('[data-cy="assigned-display"]')
                .click();
            cy.get('input[data-cy="assigned-input"][data-category="Bills"][data-item="Electricity"]')
                .clear()
                .type("200{enter}");
            cy.wait(300);

            // Try to redo - should not restore Rent assignment
            cy.get("body").type("{ctrl}y");
            cy.wait(300);

            // Rent should still be $0
            cy.get('tr[data-cy="category-row"][data-category="Bills"][data-item="Rent"]')
                .find('[data-cy="assigned-display"]')
                .should("contain", "$0.00");
        });
    });
});
