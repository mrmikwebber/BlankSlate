// cypress/e2e/credit_card_payments.cy.ts

// NOTE: adjust this to whatever route shows <BudgetTable />

const CREDIT_CARD_GROUP_NAME = "Credit Card Payments";

describe("Credit Card Payments behaviour", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");

    // Wait for budget table to load
    cy.get("[data-cy=budget-table]", { timeout: 10000 }).should("exist");

    // Wait until credit card group is present with at least one item
    cy.get(
      `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`,
      { timeout: 10000 }
    ).should("exist");

    // Wait for at least one credit card payment item to be in the DOM
    cy.get(
      `[data-cy="category-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`,
      { timeout: 10000 }
    ).should("have.length.at.least", 1);
  });

  it("shows Credit Card Payments as the first group and with Payment label", () => {
    // 1. Group is pinned first
    cy.get('[data-cy="category-group-row"]')
      .first()
      .should("have.attr", "data-category", CREDIT_CARD_GROUP_NAME);

    // 2. Group row has the 'Payment - $X' label in the last column
    cy.get(
      `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
    ).within(() => {
      // Second column (data-cy="available-display") is raw sum of item.available
      cy.get('[data-cy="available-display"]')
        .invoke("text")
        .then((availableText) => {
          const availableNumeric = Number(
            availableText.replace(/[^\d.-]/g, "")
          );

          // Last column (4th cell) should start with "Payment - "
          cy.get("td")
            .eq(3)
            .invoke("text")
            .then((paymentText) => {
              expect(paymentText.trim()).to.match(/^Payment\s*-/);

              const paymentNumeric = Number(
                paymentText.replace(/Payment\s*-\s*/i, "").replace(/[^\d.-]/g, "")
              );

              // Numeric values should match
              expect(paymentNumeric).to.eq(availableNumeric);
            });
        });
    });
  });

  it("lists at least one credit card payment item row under the Credit Card Payments group", () => {
    // Expand the group if it's collapsed
    cy.get(
      `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"] [data-cy="group-toggle"]`
    ).then(($btn) => {
      const isCollapsed = $btn.text().includes("▶");
      if (isCollapsed) {
        cy.wrap($btn).click();
      }
    });

    // There should be at least one item row for a credit card
    cy.get(
      `[data-cy="category-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
    ).should("have.length.at.least", 1);
  });

  it("does not allow deleting credit card payment categories via the context menu", () => {
    // Expand group just in case
    cy.get(
      `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"] [data-cy="group-toggle"]`
    ).then(($btn) => {
      if ($btn.text().includes("▶")) cy.wrap($btn).click();
    });

    // Pick the first CC item row
    cy.get(
      `[data-cy="category-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
    )
      .first()
      .then(($row) => {
        const itemName = $row.attr("data-item");
        expect(itemName).to.exist;

        // Right-click to open category context menu
        cy.wrap($row).rightclick();

        // Context menu should appear and show the "Cannot delete" message instead of a Delete button
        cy.get('[data-cy="category-context-menu"]')
          .should("exist")
          .and("contain.text", "Cannot delete (Credit Credit Category)");

        // There should NOT be a delete button for CC categories
        cy.get('[data-cy="category-delete"]').should("not.exist");
      });
  });

  it("updates credit card available when assigned value for a credit card payment item is changed", () => {
    // Expand group
    cy.get(
      `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"] [data-cy="group-toggle"]`
    ).then(($btn) => {
      if ($btn.text().includes("▶")) cy.wrap($btn).click();
    });

    // Work with the first CC item row
    cy.get(
      `[data-cy="category-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
    )
      .first()
      .then(($row) => {
        const itemName = $row.attr("data-item");
        expect(itemName).to.exist;

        // Grab initial available for this item
        cy.wrap($row)
          .find(`[data-cy="item-available"][data-item="${itemName}"]`)
          .invoke("text")
          .then((initialAvailableText) => {
            const initialAvailable = Number(
              initialAvailableText.replace(/[^\d.-]/g, "")
            );

            // Click assigned display to enter edit mode
            cy.wrap($row)
              .find(
                `[data-cy="assigned-display"][data-item="${itemName}"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
              )
              .click();

            // Type a new assigned value (e.g. 100)
            cy.get(
              `[data-cy="assigned-input"][data-category="${CREDIT_CARD_GROUP_NAME}"][data-item="${itemName}"]`
            )
              .clear()
              .type("100")
              .blur();

            // After save, the activity & available should be recomputed by handleInputChange
            cy.wrap($row)
              .find(`[data-cy="item-available"][data-item="${itemName}"]`)
              .invoke("text")
              .should((updatedAvailableText) => {
                const updatedAvailable = Number(
                  updatedAvailableText.replace(/[^\d.-]/g, "")
                );

                // We don't assume exact math (depends on transactions),
                // just that the available value has changed based on assigned + activity + cumulative.
                expect(updatedAvailable).to.not.eq(initialAvailable);
              });
          });
      });
  });

  it("keeps Ready to Assign consistent when changing a credit card payment assigned amount", () => {
    // Snapshot Ready to Assign
    cy.get('[data-cy="ready-to-assign"]')
      .invoke("text")
      .then((initialRtaText) => {
        const initialRta = Number(initialRtaText.replace(/[^\d.-]/g, ""));

        // Expand CC group
        cy.get(
          `[data-cy="category-group-row"][data-category="${CREDIT_CARD_GROUP_NAME}"] [data-cy="group-toggle"]`
        ).then(($btn) => {
          if ($btn.text().includes("▶")) cy.wrap($btn).click();
        });

        // Choose first credit card payment item and change its assigned amount
        cy.get(
          `[data-cy="category-row"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
        )
          .first()
          .then(($row) => {
            const itemName = $row.attr("data-item");
            expect(itemName).to.exist;

            cy.wrap($row)
              .find(
                `[data-cy="assigned-display"][data-item="${itemName}"][data-category="${CREDIT_CARD_GROUP_NAME}"]`
              )
              .click();

            cy.get(
              `[data-cy="assigned-input"][data-category="${CREDIT_CARD_GROUP_NAME}"][data-item="${itemName}"]`
            )
              .clear()
              .type("50")
              .blur();
          });

        // Ready to Assign should update according to your calculateReadyToAssign logic,
        // but never become NaN or disappear.
        cy.get('[data-cy="ready-to-assign"]')
          .invoke("text")
          .should((updatedRtaText) => {
            const updatedRta = Number(
              updatedRtaText.replace(/[^\d.-]/g, "")
            );

            // At minimum, it should be a finite number
            expect(updatedRta).to.satisfy((n: number) => Number.isFinite(n));

            // If you want, you can assert it decreased by 50, depending on your desired behavior:
            expect(updatedRta).to.eq(initialRta - 50);
            // For now we just ensure it changed or stayed logically valid.
          });
      });
  });
});
