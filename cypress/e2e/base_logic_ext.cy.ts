// cypress/e2e/budget_base_logic.cy.ts (normalized selectors)

import { BUDGET_URL } from "../support/testConstants";

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
    cy.waitForBudgetCalculation();
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

describe("Budget base logic", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    visitBudget();
  });

  // Helper: create a fresh category with zero activity/assigned for clean math
  const createFreshCategory = (groupName: string, itemName: string) => {
    cy.get("[data-cy=add-category-group-button]").click();
    cy.get("[data-cy=add-category-group-input]").type(groupName);
    cy.get("[data-cy=add-category-group-submit]").click();

    // Reveal the add-item button with hover; prefer the first visible button, fallback to forced click
    cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`).first().trigger("mouseover");
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

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`)
      .should("exist")
      .within(() => {
        cy.get("[data-cy=assigned-display]").should("contain.text", "$0");
        cy.get("[data-cy=item-activity]").should("contain.text", "$0");
        cy.get("[data-cy=item-available]").should("contain.text", "$0");
      });
  };

  it("updates assigned, available and Ready To Assign consistently when funding a fresh category", () => {
    const groupName = "Test Group A";
    const itemName = "Test Category A";
    const amount = 50;

    createFreshCategory(groupName, itemName);

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((rtaText) => {
        const initialRTA = parseCurrency(rtaText);

        cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`).click();
        cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
          .clear()
          .type(String(amount) + "{enter}");

        cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`).within(() => {
          cy.get("[data-cy=assigned-display]")
            .invoke("text")
            .then((txt) => {
              const assigned = parseCurrency(txt);
              expect(assigned).to.eq(amount);
            });
          cy.get("[data-cy=item-available]")
            .invoke("text")
            .then((txt) => {
              const available = parseCurrency(txt);
              expect(available).to.eq(amount);
            });
        });

        cy.get("[data-cy=ready-to-assign]")
          .invoke("text")
          .then((finalRtaText) => {
            const finalRTA = parseCurrency(finalRtaText);
            expect(finalRTA).to.eq(initialRTA - amount);
          });
      });
  });

  it("un-funds a category correctly, returning money to Ready To Assign", () => {
    const groupName = "Test Group B";
    const itemName = "Test Category B";
    const initialAssign = 100;
    const reduceTo = 40;

    createFreshCategory(groupName, itemName);

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
      .clear()
      .type(String(initialAssign) + "{enter}");

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((midRtaText) => {
        const midRTA = parseCurrency(midRtaText);

        cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`).click();
        cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
          .clear()
          .type(String(reduceTo) + "{enter}");

        cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`).within(() => {
          cy.get("[data-cy=assigned-display]")
            .invoke("text")
            .then((txt) => {
              const assigned = parseCurrency(txt);
              expect(assigned).to.eq(reduceTo);
            });
          cy.get("[data-cy=item-available]")
            .invoke("text")
            .then((txt) => {
              const available = parseCurrency(txt);
              expect(available).to.eq(reduceTo);
            });
        });

        const delta = initialAssign - reduceTo;
        cy.get("[data-cy=ready-to-assign]")
          .invoke("text")
          .then((finalRtaText) => {
            const finalRTA = parseCurrency(finalRtaText);
            expect(finalRTA).to.eq(midRTA + delta);
          });
      });
  });

  it("evaluates math expressions in assigned cells and handles invalid input safely", () => {
    const groupName = "Test Group C";
    const itemName = "Test Category C";
    createFreshCategory(groupName, itemName);

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
      .clear()
      .type("10+5-3{enter}");
    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`)
      .invoke("text")
      .then((txt) => {
        const assigned = parseCurrency(txt);
        expect(assigned).to.eq(12);
      });

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`)
      .clear()
      .type("not a number{enter}");
    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`)
      .invoke("text")
      .then((txt) => {
        const assigned = parseCurrency(txt);
        expect(assigned).to.eq(0);
      });
  });

  it("keeps Ready To Assign constant when moving money between categories", () => {
    const groupA = "Group Move A";
    const catA = "A";
    const groupB = "Group Move B";
    const catB = "B";
    createFreshCategory(groupA, catA);
    createFreshCategory(groupB, catB);

    cy.get(`[data-cy="category-row"][data-category="${groupA}"][data-item="${catA}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupA}"][data-item="${catA}"]`)
      .clear()
      .type("100{enter}");
    cy.get(`[data-cy="category-row"][data-category="${groupB}"][data-item="${catB}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupB}"][data-item="${catB}"]`)
      .clear()
      .type("50{enter}");

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((rtaText) => {
        const initialRTA = parseCurrency(rtaText);
        let sumAssigned = 0;
        cy.get("[data-cy=category-row]").each(($row) => {
          const assignedText = $row.find("[data-cy=assigned-display]").text();
          sumAssigned += parseCurrency(assignedText);
        });
        const totalInitial = initialRTA + sumAssigned;

        cy.get(`[data-cy="category-row"][data-category="${groupA}"][data-item="${catA}"] [data-cy=assigned-display]`).click();
        cy.get(`[data-cy=assigned-input][data-category="${groupA}"][data-item="${catA}"]`)
          .clear()
          .type("70{enter}");
        
          cy.wait(500);

        cy.get(`[data-cy="category-row"][data-category="${groupB}"][data-item="${catB}"] [data-cy=assigned-display]`).click();
        cy.get(`[data-cy=assigned-input][data-category="${groupB}"][data-item="${catB}"]`)
          .clear()
          .type("80{enter}");

cy.wait(500);

        cy.get("[data-cy=ready-to-assign]")
          .invoke("text")
          .then((finalRtaText) => {
            const finalRTA = parseCurrency(finalRtaText);
            let finalSumAssigned = 0;
            cy.get("[data-cy=category-row]").each(($row) => {
              const assignedText = $row.find("[data-cy=assigned-display]").text();
              finalSumAssigned += parseCurrency(assignedText);
            });
            const totalFinal = finalRTA + finalSumAssigned;
            expect(totalFinal).to.eq(totalInitial);
          });
      });
  });

  it("preserves RTA and moves funds correctly when deleting a funded category with reassignment", () => {
    const groupName = "Reassign Group";
    const catSource = "Source Cat";
    const catTarget = "Target Cat";
    createFreshCategory(groupName, catSource);
    createFreshCategory(groupName, catTarget);

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catSource}"] [data-cy=assigned-display]`).click();
    cy.get(`[data-cy=assigned-input][data-category="${groupName}"][data-item="${catSource}"]`)
      .clear()
      .type("75{enter}");

    cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catTarget}"] [data-cy=assigned-display]`)
      .invoke("text")
      .then((targetAssignedTxt) => {
        const targetAssignedBefore = parseCurrency(targetAssignedTxt);
        cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catTarget}"] [data-cy=item-available]`)
          .invoke("text")
          .then((targetAvailTxt) => {
            const targetAvailBefore = parseCurrency(targetAvailTxt);
            cy.get("[data-cy=ready-to-assign]")
              .invoke("text")
              .then((rtaText) => {
                const initialRTA = parseCurrency(rtaText);
                console.log("Initial RTA:", initialRTA);
                cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catSource}"]`).rightclick();
                cy.get("[data-cy=category-context-menu]")
                  .should("be.visible")
                  .within(() => {
                    cy.get("[data-cy=category-delete]").click();
                  });
                cy.get("[data-cy=reassign-target-select]").select(catTarget);
                cy.get("[data-cy=reassign-confirm]").click();
                cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catSource}"]`).should("not.exist");
                cy.get("[data-cy=ready-to-assign]")
                  .invoke("text")
                  .then((finalRtaText) => {
                    const finalRTA = parseCurrency(finalRtaText);
                    expect(finalRTA).to.eq(initialRTA);
                  });
                cy.get(`[data-cy="category-row"][data-category="${groupName}"][data-item="${catTarget}"]`).within(() => {
                  cy.get("[data-cy=assigned-display]")
                    .invoke("text")
                    .then((txt) => {
                      const assigned = parseCurrency(txt);
                      expect(assigned).to.eq(targetAssignedBefore + 75);
                    });
                  cy.get("[data-cy=item-available]")
                    .invoke("text")
                    .then((txt) => {
                      const available = parseCurrency(txt);
                      expect(available).to.eq(targetAvailBefore + 75);
                    });
                });
              });
          });
      });
  });
});
