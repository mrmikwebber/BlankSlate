// cypress/e2e/idempotency.cy.ts

import { BUDGET_URL } from "../support/testConstants";

// Helpers
const monthLabel = '[data-cy="month-label"]';
const monthPrev = '[data-cy="month-prev"]';
const monthNext = '[data-cy="month-next"]';

interface SeededAccount {
  id: string;
  name: string;
  type: "debit" | "credit";
}

interface SeededAccounts {
  checking: SeededAccount;
  savings: SeededAccount;
  visa: SeededAccount;
  amex: SeededAccount;
}

let accounts: SeededAccounts;

function categoryRowSelector(group: string, item: string) {
  return `tr[data-cy="category-row"][data-category="${group}"][data-item="${item}"]`;
}

const visitBudget = () => {
    cy.wait(1000);
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

describe("Budget month idempotency", () => {
  const groupName = "Idempotent Test Group";
  const itemName = "Idempotent Test Item";

  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
    visitBudget();
  });

  it("keeps category numbers stable when leaving and returning to the same month", () => {
    // Capture current month label for reference
    cy.get(monthLabel).invoke("text").as("currentMonthLabel");

    // --- Setup: create a dedicated test group + item and assign a value ---

    cy.createCategory(groupName, itemName);

    const rowSel = categoryRowSelector(groupName, itemName);

    // Set assigned value
    cy.setAssignedValue(groupName, itemName, 123.45);

    // Snapshot the numbers for this category
    cy.budgetFind(rowSel).first().within(() => {
      cy.get('span[data-cy="assigned-display"]')
        .invoke("text")
        .as("assignedBefore");
      cy.get('[data-cy="item-activity"]')
        .invoke("text")
        .as("activityBefore");
      cy.get('[data-cy="item-available"]')
        .invoke("text")
        .as("availableBefore");
    });

    // --- Act: navigate away and back a few times ---

    cy.get("@currentMonthLabel").then((label) => {
      // Go to previous and back
      cy.get(monthPrev).filter(':visible').first().click();
      cy.get(monthNext).filter(':visible').first().click();
      cy.get(monthLabel).should("have.text", label);

      // Go to next and back
      cy.get(monthNext).filter(':visible').first().click();
      cy.get(monthPrev).filter(':visible').first().click();
      cy.get(monthLabel).should("have.text", label);

      // One more bounce for good measure
      cy.get(monthPrev).filter(':visible').first().click();
      cy.get(monthNext).filter(':visible').first().click();
      cy.get(monthLabel).should("have.text", label);
    });

    // --- Assert: the numbers for that category are unchanged ---

    cy.budgetFind(rowSel).first().within(() => {
      cy.get('span[data-cy="assigned-display"]')
        .invoke("text")
        .then((assignedAfter) => {
          cy.get<string>("@assignedBefore").then((assignedBefore) => {
            expect(assignedAfter.trim()).to.eq(assignedBefore.trim());
          });
        });

      cy.get('[data-cy="item-activity"]')
        .invoke("text")
        .then((activityAfter) => {
          cy.get<string>("@activityBefore").then((activityBefore) => {
            expect(activityAfter.trim()).to.eq(activityBefore.trim());
          });
        });

      cy.get('[data-cy="item-available"]')
        .invoke("text")
        .then((availableAfter) => {
          cy.get<string>("@availableBefore").then((availableBefore) => {
            expect(availableAfter.trim()).to.eq(availableBefore.trim());
          });
        });
    });
  });

it("keeps newly-created next month stable when revisited multiple times", () => {
  const groupName = "Idempotent Next-Month Group";
  const itemName = "Idempotent Next-Month Item";

  // 1️⃣ Create a group + item in whatever month we start on
  cy.createCategory(groupName, itemName);

  const rowInitial = categoryRowSelector(groupName, itemName);

  // Assign something in the starting month to create potential carryover
  cy.setAssignedValue(groupName, itemName, 50);

  // 2️⃣ Go to the NEXT month (this is where your month-creation logic runs)
  cy.get(monthNext).filter(':visible').first().click();

  const rowNext = categoryRowSelector(groupName, itemName);

  // Snapshot the label and numbers in the next month
  cy.get(monthLabel).invoke("text").as("nextMonthLabelBefore");

  cy.budgetFind(rowNext).first().within(() => {
    cy.get('span[data-cy="assigned-display"]')
      .invoke("text")
      .as("assignedNextBefore");
    cy.get('[data-cy="item-activity"]')
      .invoke("text")
      .as("activityNextBefore");
    cy.get('[data-cy="item-available"]')
      .invoke("text")
      .as("availableNextBefore");
  });

  // 3️⃣ Bounce away and back a few times (prev/next cycles)
  cy.get(monthPrev).filter(':visible').first().click();
  cy.get(monthNext).filter(':visible').first().click();

  cy.get(monthPrev).filter(':visible').first().click();
  cy.get(monthNext).filter(':visible').first().click();

  // 4️⃣ Assert: we're still on the same next-month label
  cy.get(monthLabel)
    .invoke("text")
    .then((labelAfter) => {
      cy.get<string>("@nextMonthLabelBefore").then((labelBefore) => {
        expect(labelAfter.trim()).to.eq(labelBefore.trim());
      });
    });

  // 5️⃣ Assert: numbers in that next month did not change
  cy.budgetFind(rowNext).first().within(() => {
    cy.get('span[data-cy="assigned-display"]')
      .invoke("text")
      .then((assignedAfter) => {
        cy.get<string>("@assignedNextBefore").then((assignedBefore) => {
          expect(assignedAfter.trim()).to.eq(assignedBefore.trim());
        });
      });

    cy.get('[data-cy="item-activity"]')
      .invoke("text")
      .then((activityAfter) => {
        cy.get<string>("@activityNextBefore").then((activityBefore) => {
          expect(activityAfter.trim()).to.eq(activityBefore.trim());
        });
      });

    cy.get('[data-cy="item-available"]')
      .invoke("text")
      .then((availableAfter) => {
        cy.get<string>("@availableNextBefore").then((availableBefore) => {
          expect(availableAfter.trim()).to.eq(availableBefore.trim());
        });
      });
  });
});


});
