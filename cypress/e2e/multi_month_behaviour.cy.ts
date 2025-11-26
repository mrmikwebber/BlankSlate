// cypress/e2e/multi_month_behaviour.cy.ts
// Normalized selectors (data-category instead of data-group, updated creation selectors, month-nav data-cy attributes)

const BUDGET_URL = "/budget";

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

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").click();
const getCurrentMonthLabel = () => cy.get("[data-cy=month-label]").invoke("text");

// Helper: create a category group + item in current month via Budget UI
const createCategoryInCurrentMonth = (groupName: string, itemName: string) => {
  cy.get("[data-cy=add-category-group-button]").click();
  cy.get("[data-cy=add-category-group-input]").type(groupName);
  cy.get("[data-cy=add-category-group-submit]").click();

  cy.get(
    `[data-cy="category-group-row"][data-category="${groupName}"] [data-cy=group-add-item-button]`
  ).click();
  cy.get("[data-cy=add-item-input]").type(itemName);
  cy.get("[data-cy=add-item-submit]").click();

  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  ).should("exist");
};

describe("Multi-month behaviour – carryover, overspending, edits", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
    visitBudget();
  });

  // 1) Carry positive available forward
  it("carries positive available forward to the next month", () => {
    const groupName = "Carryover Group";
    const itemName = "Carryover Cat";
    const amount = 100;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Assign money in month N
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"] [data-cy=assigned-display]`
    ).click();
    cy.get(
      `[data-cy=assigned-input][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .clear()
      .type(String(amount))
      .blur();

    // Assert month N state
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(amount));
    });

    // Move to month N+1
    goToNextMonth();
    getCurrentMonthLabel().then((newLabel) => {
      cy.get("@monthN").then((oldLabel: any) => {
        expect(newLabel).not.to.eq(oldLabel);
      });
    });

    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .should("exist")
      .within(() => {
        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => expect(parseCurrency(txt)).to.eq(amount));
      });
  });

  // 2) Overspending does not roll negative available forward
  it("does not carry negative available straight into the next month for cash overspending", () => {
    const groupName = "Overspend Carry Group";
    const itemName = "Overspend Carry Cat";
    const amount = 40;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Make overspending transaction in month N
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=add-transaction-button]").click();
    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Overspend Store");
    cy.get("[data-cy=tx-group-select]").select(groupName);
    cy.get("[data-cy=tx-item-select]").select(itemName);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // Month N category shows negative available
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-amount));
    });

    // Move to N+1
    goToNextMonth();
    getCurrentMonthLabel().then((newLabel) => {
      cy.get("@monthN").then((oldLabel: any) => expect(newLabel).not.to.eq(oldLabel));
    });

    // Negative should not persist as starting available
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.be.at.least(0));
    });
  });

  // 3) Editing past month transaction only affects that month
  it("keeps transactions and category math scoped to their original month", () => {
    const groupName = "Scoped Edit Group";
    const itemName = "Scoped Edit Cat";
    const initialAmount = 20;
    const editedAmount = 60;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Purchase in month N
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=add-transaction-button]").click();
    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Scoped Store");
    cy.get("[data-cy=tx-group-select]").select(groupName);
    cy.get("[data-cy=tx-item-select]").select(itemName);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => { if ($btn.text().trim() !== "−") cy.wrap($btn).click(); });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(initialAmount));
    cy.get("[data-cy=tx-submit]").click();

    // Verify month N activity
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-initialAmount));
    });

    // Move to month N+1: no activity yet
    goToNextMonth();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));
    });

    // Back to month N and edit
    goToPrevMonth();
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=transaction-row]").first().as("txRow");
    cy.get("@txRow").dblclick();
    cy.get("@txRow").find("[data-cy=transaction-amount-input]").clear().type(String(editedAmount));
    cy.get("@txRow").find("[data-cy=transaction-save]").click();

    // Month N reflects edited amount
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-editedAmount));
    });

    // Month N+1 still unaffected
    goToNextMonth();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));
    });
  });
});
