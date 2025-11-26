// cypress/e2e/transactions_debit_credit.cy.ts

// ⚠️ TODO: set these based on your db-reset seed.
// These are the numeric IDs in /accounts/[id] and the visible names in the UI.


let DEBIT_ACCOUNT_ID: string = '';
let DEBIT_ACCOUNT_NAME: string = '';

let SECOND_DEBIT_ACCOUNT_ID: string = '';
let SECOND_DEBIT_ACCOUNT_NAME: string = '';

let CREDIT_ACCOUNT_ID: string = '';
let CREDIT_ACCOUNT_NAME: string = '';
describe("Debit & credit transactions - UI only", () => {
  // Hydrate IDs and names from the data returned by the resetDb task
  // and stored in Cypress.env by cypress/support/e2e.ts. Do this in beforeEach
  // to ensure it runs after the global resetDb task completes for each test.
  beforeEach(() => {
    // Ensure the app session is authenticated first
    cy.login("thedasherx@gmail.com", "123456");

    // Then hydrate the seeded accounts for this test run
    cy.getSeededAccounts().then((accounts: any) => {
      // Fallbacks keep variables stable if something is missing
      DEBIT_ACCOUNT_ID = accounts?.checking?.id || DEBIT_ACCOUNT_ID;
      DEBIT_ACCOUNT_NAME = accounts?.checking?.name || 'Checking Account';

      SECOND_DEBIT_ACCOUNT_ID = accounts?.savings?.id || SECOND_DEBIT_ACCOUNT_ID;
      SECOND_DEBIT_ACCOUNT_NAME = accounts?.savings?.name || 'Savings Account';

      // Prefer Amex if present, otherwise fall back to Visa
      CREDIT_ACCOUNT_ID = accounts?.amex?.id || accounts?.visa?.id || CREDIT_ACCOUNT_ID;
      CREDIT_ACCOUNT_NAME = accounts?.amex?.name || accounts?.visa?.name || 'Visa Card';
    });
  });

  const visitAccount = (id: string, expectedName: string) => {
    cy.visit(`/accounts/${id}`);
    cy.wait(200); // short pause after navigation

    cy.get("[data-cy=account-name]")
      .should("contain.text", expectedName);
  };

  const parseCurrency = (text: string) =>
    Number(text.replace(/[^0-9.-]/g, ""));

  //
  // 1) Plain debit expense, new payee + new group + new item
  //
  it("creates a simple debit expense with new payee/group/category and updates balance", () => {
    visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
    cy.wait(200);

    // Grab initial balance
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((initialText) => {
        const initialBalance = parseCurrency(initialText);

        // Open add-transaction row
  cy.get("[data-cy=add-transaction-button]").click();
  cy.wait(150);

        // New payee mode
  cy.get("[data-cy=tx-payee-select]").select("__new__");
  cy.wait(150);
        cy.get("[data-cy=tx-new-payee-input]")
          .type("Chipotle");

        // New group mode
  cy.get("[data-cy=tx-group-select]").select("__new__");
  cy.wait(150);
        cy.get("[data-cy=tx-new-group-input]")
          .type("Food & Dining");

        // New category item under that group
  cy.get("[data-cy=tx-item-select]").select("__new__");
  cy.wait(150);
        cy.get("[data-cy=tx-new-item-input]")
          .type("Restaurants");

        // Ensure it's an outflow
        cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
          if ($btn.text().trim() !== "−") {
            cy.wrap($btn).click();
            cy.wait(100);
          }
        });

        // Amount
        cy.get("[data-cy=tx-amount-input]").clear().type("25.00");

        // Submit
  cy.get("[data-cy=tx-submit]").click();
  cy.wait(200);

        // A new transaction row should appear with Chipotle + Restaurants
        cy.get("[data-cy=transaction-row]")
          .first()
          .within(() => {
            cy.get("td").eq(1).should("contain.text", "Chipotle");    // payee
            cy.get("td").eq(2).should("contain.text", "Restaurants"); // category
            cy.get("[data-cy=transaction-amount]")
              .should("have.class", "text-red-600")
              .invoke("text")
              .then((amtText) => {
                const amt = Number(amtText);
                expect(amt).to.eq(-25);
              });
          });

        // Account balance should decrease by 25
        cy.get("[data-cy=account-balance]")
          .invoke("text")
          .then((updatedText) => {
            const updatedBalance = parseCurrency(updatedText);
            expect(updatedBalance).to.eq(initialBalance - 25);
          });
      });
  });

  //
  // 2) Same-type transfer: debit → another debit account
  //    - Creates two mirrored transactions with opposite balances
  //
  it("creates a same-type transfer between two debit accounts with mirrored transactions", () => {
    visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
    cy.wait(200);

    // Capture initial balances of both accounts
    let debitStart = 0;
    let otherDebitStart = 0;

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        debitStart = parseCurrency(txt);
      });

    // Also visit the second debit account to grab its starting balance
  cy.visit(`/accounts/${SECOND_DEBIT_ACCOUNT_ID}`);
  cy.wait(200);
    cy.get("[data-cy=account-name]").should("contain.text", SECOND_DEBIT_ACCOUNT_NAME);

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        otherDebitStart = parseCurrency(txt);
      });

    // Now create a transfer from DEBIT_ACCOUNT → SECOND_DEBIT_ACCOUNT
  visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
  cy.wait(200);

  cy.get("[data-cy=add-transaction-button]").click();
  cy.wait(150);

    // Choose the other debit account as payee from the "Payments & Transfers" optgroup.
    // Label will be "To/From: <name>" when amount is zero. We can match by account name.
    cy.get('[data-cy=tx-payee-select]')
      .select(SECOND_DEBIT_ACCOUNT_NAME);
    cy.wait(150);



    // For same-type transfer, group/item are optional (default Ready to Assign),
    // and selects are disabled for new groups/categories.
  cy.get("[data-cy=tx-group-select]").should("be.disabled");

    // Make it an outflow
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") {
        cy.wrap($btn).click();
        cy.wait(100);
      }
    });

    // Amount 50
  cy.get("[data-cy=tx-amount-input]").clear().type("50");
  cy.wait(100);

    // Submit
  cy.get("[data-cy=tx-submit]").click();

  cy.wait(500); // wait for both sides to process

    // Check DEBIT_ACCOUNT side:
  visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
  cy.wait(200);

    // There should be a recent transaction with "Transfer to SECOND_DEBIT_ACCOUNT_NAME"
    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Transfer to");
        cy.get("td").eq(1).should("contain.text", SECOND_DEBIT_ACCOUNT_NAME);
        cy.get("[data-cy=transaction-amount]")
          .invoke("text")
          .then((txt) => {
            const amt = Number(txt);
            expect(amt).to.eq(-50);
          });
      });

    // Balance should be reduced by 50
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const updated = parseCurrency(txt);
        expect(updated).to.eq(debitStart - 50);
      });

    // Check mirrored side: SECOND_DEBIT_ACCOUNT
  visitAccount(SECOND_DEBIT_ACCOUNT_ID, SECOND_DEBIT_ACCOUNT_NAME);
  cy.wait(200);

    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Transfer from");
        cy.get("td").eq(1).should("contain.text", DEBIT_ACCOUNT_NAME);
        cy.get("[data-cy=transaction-amount]")
          .invoke("text")
          .then((txt) => {
            const amt = Number(txt);
            expect(amt).to.eq(50);
          });
      });

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const updated = parseCurrency(txt);
        expect(updated).to.eq(otherDebitStart + 50);
      });
  });

  //
  // 3) Cross-type transfer: debit → credit card (treated as CC payment)
  //    - Auto-selects Credit Card Payments group + card name
  //    - Creates mirrored Payment from [debit] on the credit account
  //
  it("creates a cross-type transfer debit → credit and auto-targets Credit Card Payments", () => {
    visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
    cy.wait(200);

    let debitStart = 0;
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        debitStart = parseCurrency(txt);
      });

    // Also capture starting balance of the credit account
  cy.visit(`/accounts/${CREDIT_ACCOUNT_ID}`);
  cy.wait(200);
    cy.get("[data-cy=account-name]").should("contain.text", CREDIT_ACCOUNT_NAME);

    let creditStart = 0;
    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        creditStart = parseCurrency(txt);
      });

    // Now create the cross-type transfer
  visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
  cy.wait(200);
    cy.get("[data-cy=add-transaction-button]").click();
  cy.wait(150);

    // Choose the CREDIT_ACCOUNT as target from Payments & Transfers
    cy.get('[data-cy=tx-payee-select]')
      .select(CREDIT_ACCOUNT_NAME);
    cy.wait(150);

    // After selecting cross-type account, useEffect should set:
    //   selectedGroup = "Credit Card Payments"
    //   selectedItem  = CREDIT_ACCOUNT_NAME
    cy.get("[data-cy=tx-group-select]")
      .should("have.value", "Credit Card Payments");

    cy.get("[data-cy=tx-item-select]")
      .should("have.value", CREDIT_ACCOUNT_NAME);

    // Outflow of 100 (payment from DEBIT to CREDIT)
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") {
        cy.wrap($btn).click();
        cy.wait(100);
      }
    });

  cy.get("[data-cy=tx-amount-input]").clear().type("100");
  cy.wait(100);

  cy.get("[data-cy=tx-submit]").click();

  cy.wait(2000);

    // On DEBIT side: should see "Payment to CREDIT_ACCOUNT_NAME" with -100
  visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
  cy.wait(200);

    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Payment to");
        cy.get("td").eq(1).should("contain.text", CREDIT_ACCOUNT_NAME);
        cy.get("td").eq(2).should("contain.text", CREDIT_ACCOUNT_NAME); // category = itemName
        cy.get("[data-cy=transaction-amount]")
          .invoke("text")
          .then((txt) => {
            const amt = Number(txt);
            expect(amt).to.eq(-100);
          });
      });

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const updated = parseCurrency(txt);
        expect(updated).to.eq(debitStart - 100);
      });

    // On CREDIT side: mirrored "Payment from DEBIT_ACCOUNT_NAME" with +100
  visitAccount(CREDIT_ACCOUNT_ID, CREDIT_ACCOUNT_NAME);
  cy.wait(2000);

    cy.get("[data-cy=transaction-row]")
      .first()
      .within(() => {
        cy.get("td").eq(1).should("contain.text", "Transfer from");
        cy.get("td").eq(1).should("contain.text", DEBIT_ACCOUNT_NAME);
        cy.get("[data-cy=transaction-amount]")
          .invoke("text")
          .then((txt) => {
            const amt = Number(txt);
            expect(amt).to.eq(100);
          });
      });

    cy.get("[data-cy=account-balance]")
      .invoke("text")
      .then((txt) => {
        const updated = parseCurrency(txt);
        expect(updated).to.eq(creditStart + 100);
      });
  });

  //
  // 4) Deleting a mirrored transfer via context menu removes both sides
  //
  it("deletes a mirrored transfer via context menu on one side and removes the mirror", () => {
    // First, create a small transfer to ensure we have a known mirrored pair.
    visitAccount(DEBIT_ACCOUNT_ID, DEBIT_ACCOUNT_NAME);
    cy.wait(200);

  cy.get("[data-cy=add-transaction-button]").click();
  cy.wait(150);
    cy.get('[data-cy=tx-payee-select]')
      .select(SECOND_DEBIT_ACCOUNT_NAME);
    cy.wait(150);

    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") {
        cy.wrap($btn).click();
        cy.wait(100);
      }
    });

  cy.get("[data-cy=tx-amount-input]").clear().type("10");
  cy.wait(100);
  cy.get("[data-cy=tx-submit]").click();
  cy.wait(200);

    // Grab txid of the new top row (DEBIT side)
    cy.get("[data-cy=transaction-row]")
      .first()
      .invoke("attr", "data-txid")
      .then((txId) => {
        const createdTxId = Number(txId);

        // Right-click to open context menu and delete it
        cy.get("[data-cy=transaction-row]")
          .first()
          .rightclick();
        cy.wait(150);

        cy.get("[data-cy=tx-context-menu]")
          .should("be.visible")
          .within(() => {
            cy.get("[data-cy=context-delete-transaction]").click();

          });
        // Row with that txid should be gone
        cy.get(`[data-cy=transaction-row][data-txid="${createdTxId}"]`)
          .should("not.exist");
            cy.wait(2000); // wait for deletion to process

        // Mirror should also be gone on the second debit account
  visitAccount(SECOND_DEBIT_ACCOUNT_ID, SECOND_DEBIT_ACCOUNT_NAME);
  cy.wait(2000);

        cy.get("[data-cy=transaction-row]").should("not.exist")
      });
  });
});
