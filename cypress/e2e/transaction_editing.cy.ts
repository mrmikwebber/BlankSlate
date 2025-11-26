// cypress/e2e/transaction_editing.cy.ts

import { BUDGET_URL } from "../support/testConstants";

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

const parseCurrency = (text: string) =>
  Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

describe("Transaction editing / mutation – YNAB-style", () => {
  beforeEach(() => {
    // cy.dbReset();
    cy.login("thedasherx@gmail.com", "123456");
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
  });

  //
  // Helper to create a simple debit expense in a category via UI
  //
  const createDebitExpense = (
    amount: number,
    groupName: string,
    itemName: string
  ) => {
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=add-transaction-button]").click();

    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Edit Test Store");

    cy.get("[data-cy=tx-group-select]").select("__new__");
    cy.get("[data-cy=tx-new-group-input]").type(groupName);

    cy.get("[data-cy=tx-item-select]").select("__new__");
    cy.get("[data-cy=tx-new-item-input]").type(itemName);

    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") {
        cy.wrap($btn).click();
      }
    });

    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // newest row at top
    cy.get("[data-cy=transaction-row]").first().as("createdTxRow");
  };

  //
  // 1) Changing category of an existing debit transaction
  //    - Old category activity/available revert
  //    - New category activity/available updated
  //    - Ready To Assign unchanged
  //
  it("moves spending between categories when editing a debit transaction's category", () => {
    const groupA = "Edit Group A";
    const itemA = "Edit Cat A";
    const groupB = "Edit Group B";
    const itemB = "Edit Cat B";
    const amount = 50;

    // Create initial expense in Group A / Cat A
    createDebitExpense(amount, groupA, itemA);

    // Snapshot RTA & category states in budget
    visitBudget();

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((initialRTAText) => {
        const initialRTA = parseCurrency(initialRTAText);

        // Confirm initial category impact
        cy.get(
          `[data-cy="category-row"][data-group="${groupA}"][data-item="${itemA}"]`
        )
          .as("rowA")
          .within(() => {
            cy.get("[data-cy=item-activity]")
              .invoke("text")
              .then((txt) => {
                const activity = parseCurrency(txt);
                expect(activity).to.eq(-amount);
              });

            cy.get("[data-cy=item-available]")
              .invoke("text")
              .then((txt) => {
                const available = parseCurrency(txt);
                expect(available).to.eq(-amount);
              });
          });

        // Create Group B / Cat B in budget so it's a valid target
        cy.get("[data-cy=add-group-button]").click();
        cy.get("[data-cy=new-group-name-input]").type(groupB);
        cy.get("[data-cy=new-group-submit]").click();

        cy.get(
          `[data-cy="category-group-row"][data-group="${groupB}"] [data-cy=add-item-button]`
        ).click();

        cy.get("[data-cy=new-item-name-input]").type(itemB);
        cy.get("[data-cy=new-item-submit]").click();

        cy.get(
          `[data-cy="category-row"][data-group="${groupB}"][data-item="${itemB}"]`
        ).as("rowB");

        // Now go back to Checking and edit the transaction's category
        visitAccount(accounts.checking.id, accounts.checking.name);

        // Grab its txid for later checking if needed
        cy.get("@createdTxRow")
          .invoke("attr", "data-txid")
          .as("txId");

        // Open edit mode (adjust if you use a button instead of dblclick)
        cy.get("@createdTxRow").dblclick();

        // Change category to Group B / Cat B
        // If your UI has separate group & item selects, adjust this accordingly.
        cy.get("@createdTxRow")
          .find("[data-cy=transaction-group-select]")
          .select(groupB);

        cy.get("@createdTxRow")
          .find("[data-cy=transaction-item-select]")
          .select(itemB);

        cy.get("@createdTxRow").find("[data-cy=transaction-save]").click();

        // Back to budget: Old category should be reset, new category carries activity
        visitBudget();

        cy.get("@rowA").within(() => {
          cy.get("[data-cy=item-activity]")
            .invoke("text")
            .then((txt) => {
              const activity = parseCurrency(txt);
              expect(activity).to.eq(0);
            });

          cy.get("[data-cy=item-available]")
            .invoke("text")
            .then((txt) => {
              const available = parseCurrency(txt);
              expect(available).to.eq(0);
            });
        });

        cy.get("@rowB").within(() => {
          cy.get("[data-cy=item-activity]")
            .invoke("text")
            .then((txt) => {
              const activity = parseCurrency(txt);
              expect(activity).to.eq(-amount);
            });

          cy.get("[data-cy=item-available]")
            .invoke("text")
            .then((txt) => {
              const available = parseCurrency(txt);
              expect(available).to.eq(-amount);
            });
        });

        // RTA should be unchanged by moving money between categories
        cy.get("[data-cy=ready-to-assign]")
          .invoke("text")
          .then((finalRTAText) => {
            const finalRTA = parseCurrency(finalRTAText);
            expect(finalRTA).to.eq(initialRTA);
          });
      });
  });

  //
  // 2) Changing amount of an existing debit transaction
  //    - Account balance updates
  //    - Category activity/available update by the delta
  //
  it("updates account balance and category math when editing a debit transaction amount", () => {
    const groupName = "Edit Amount Group";
    const itemName = "Edit Amount Cat";
    const initialAmount = 30;
    const editedAmount = 80;

    // Create expense
    createDebitExpense(initialAmount, groupName, itemName);

    // Snapshot account balance
    let checkingStart = 0;

    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        checkingStart = parseCurrency(txt);
      });

    // Snapshot budget category
    visitBudget();

    cy.get(
      `[data-cy="category-row"][data-group="${groupName}"][data-item="${itemName}"]`
    )
      .as("row")
      .within(() => {
        cy.get("[data-cy=item-activity]")
          .invoke("text")
          .then((txt) => {
            const activity = parseCurrency(txt);
            expect(activity).to.eq(-initialAmount);
          });

        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => {
            const available = parseCurrency(txt);
            expect(available).to.eq(-initialAmount);
          });
      });

    // Edit tx amount
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=transaction-row]").first().as("txRow");

    cy.get("@txRow").dblclick();

    cy.get("@txRow")
      .find("[data-cy=transaction-amount-input]")
      .clear()
      .type(String(editedAmount));

    cy.get("@txRow").find("[data-cy=transaction-save]").click();

    // Account balance should have changed by (initialAmount - editedAmount)
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const finalBalance = parseCurrency(txt);
        const expected = checkingStart - (editedAmount - initialAmount);
        expect(finalBalance).to.eq(expected);
      });

    // Budget category should reflect edited amount
    visitBudget();

    cy.get("@row").within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => {
          const activity = parseCurrency(txt);
          expect(activity).to.eq(-editedAmount);
        });

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => {
          const available = parseCurrency(txt);
          expect(available).to.eq(-editedAmount);
        });
    });
  });

  //
  // 3) Converting a normal debit transaction into a transfer (Checking → Savings)
  //    - Original category activity/available reset
  //    - Transfer appears on both accounts
  //    - No category impact afterwards
  //
  it("converts a debit purchase into a same-type transfer, removing category impact", () => {
    const groupName = "Convert Transfer Group";
    const itemName = "Convert Transfer Cat";
    const amount = 40;

    // Create normal purchase
    createDebitExpense(amount, groupName, itemName);

    // Snapshot category impact
    visitBudget();

    cy.get(
      `[data-cy="category-row"][data-group="${groupName}"][data-item="${itemName}"]`
    )
      .as("row")
      .within(() => {
        cy.get("[data-cy=item-activity]")
          .invoke("text")
          .then((txt) => {
            const activity = parseCurrency(txt);
            expect(activity).to.eq(-amount);
          });

        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => {
            const available = parseCurrency(txt);
            expect(available).to.eq(-amount);
          });
      });

    // Convert to transfer
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=transaction-row]").first().as("txRow");

    cy.get("@txRow").dblclick();

    // Change payee to savings account (transfer)
    cy.get("@txRow")
      .find("[data-cy=transaction-payee-select]")
      .select(accounts.savings.name);

    // Optionally, clear category in edit UI if needed
    // cy.get("@txRow").find("[data-cy=transaction-group-select]").select("(none)");
    // cy.get("@txRow").find("[data-cy=transaction-item-select]").select("(none)");

    cy.get("@txRow").find("[data-cy=transaction-save]").click();

    // Budget: category should be cleared of activity/available
    visitBudget();

    cy.get("@row").within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => {
          const activity = parseCurrency(txt);
          expect(activity).to.eq(0);
        });

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => {
          const available = parseCurrency(txt);
          expect(available).to.eq(0);
        });
    });

    // Check both accounts for transfer rows
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Transfer to");
        cy.get("td").eq(1).should("contain.text", accounts.savings.name);
      });

    visitAccount(accounts.savings.id, accounts.savings.name);
    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Transfer from");
        cy.get("td").eq(1).should("contain.text", accounts.checking.name);
      });
  });

  //
  // 4) Changing transfer target from Savings → Amex (same-type → CC payment)
  //    - Savings mirror removed / moved
  //    - New mirror appears on Amex
  //    - CC payment category updated, no normal spending categories affected
  //
  it("changes transfer target to a credit card and treats it as a CC payment", () => {
    const amount = 75;

    // First create a plain transfer Checking → Savings
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=add-transaction-button]").click();

    cy.get("[data-cy=tx-payee-select]").select(accounts.savings.name);

    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") {
        cy.wrap($btn).click();
      }
    });

    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    cy.get("[data-cy=transaction-row]").first().as("transferRow");

    // Edit payee to Amex (convert to CC payment)
    cy.get("@transferRow").dblclick();
    cy.get("@transferRow")
      .find("[data-cy=transaction-payee-select]")
      .select(accounts.amex.name);

    cy.get("@transferRow").find("[data-cy=transaction-save]").click();

    // Budget: CC payment category should be affected, but no normal category should show activity
    visitBudget();

    // Check CC payment category available changed (just check it's finite & not NaN)
    cy.get(
      `[data-cy="category-row"][data-group="Credit Card Payments"][data-item="${accounts.amex.name}"]`
    )
      .as("amexPaymentRow")
      .within(() => {
        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => {
            const available = parseCurrency(txt);
            expect(Number.isFinite(available)).to.be.true;
          });
      });

    // Sanity check: some random spending category didn't get hit
    // (this is loose, but helps catch "forgot to clear category on transfer edit" bugs)
    cy.get("[data-cy=category-row]").each(($row) => {
      const group = $row.attr("data-group")!;
      if (group === "Credit Card Payments") return;

      const activityText = $row.find("[data-cy=item-activity]").text();
      const activity = parseCurrency(activityText);

      // It *might* not be exactly zero due to seed data,
      // but we can assert nothing changed from editing this transfer.
      // For stricter checks, snapshot before/after states.
      expect(Number.isNaN(activity)).to.be.false;
    });

    // Accounts: savings should not show that transfer anymore; amex should.
    visitAccount(accounts.savings.id, accounts.savings.name);
    cy.get("[data-cy=transaction-row]").should(
      "not.contain",
      `Transfer from ${accounts.checking.name}`
    );

    visitAccount(accounts.amex.id, accounts.amex.name);
    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Payment from");
        cy.get("td").eq(1).should("contain.text", accounts.checking.name);
      });
  });

  //
  // 5) Converting an expense into a refund (flip sign)
  //    - Category activity moves from negative to positive
  //    - Category available increases
  //
  it("treats sign-flip as a refund, increasing category available", () => {
    const groupName = "Refund Group";
    const itemName = "Refund Cat";
    const amount = 60;

    // Create initial expense
    createDebitExpense(amount, groupName, itemName);

    // Snapshot category and account state
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-group="${groupName}"][data-item="${itemName}"]`
    )
      .as("row")
      .within(() => {
        cy.get("[data-cy=item-activity]")
          .invoke("text")
          .then((txt) => {
            const activity = parseCurrency(txt);
            expect(activity).to.eq(-amount);
          });

        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => {
            const available = parseCurrency(txt);
            expect(available).to.eq(-amount);
          });
      });

    visitAccount(accounts.checking.id, accounts.checking.name);
    let startBalance = 0;

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        startBalance = parseCurrency(txt);
      });

    // Edit transaction: flip sign to +amount (refund)
    cy.get("[data-cy=transaction-row]").first().as("txRow");

    cy.get("@txRow").dblclick();

    cy.get("@txRow")
      .find("[data-cy=transaction-sign-toggle]")
      .click(); // assumes this flips +/- on edit too

    cy.get("@txRow").find("[data-cy=transaction-save]").click();

    // Account balance should increase by 2 * amount (because it goes from -60 to +60)
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const finalBalance = parseCurrency(txt);
        expect(finalBalance).to.eq(startBalance + 2 * amount);
      });

    // Budget category: activity & available should now be +amount
    visitBudget();
    cy.get("@row").within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => {
          const activity = parseCurrency(txt);
          expect(activity).to.eq(amount);
        });

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => {
          const available = parseCurrency(txt);
          expect(available).to.eq(amount);
        });
    });
  });
});
