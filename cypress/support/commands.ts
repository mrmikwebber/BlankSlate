/// <reference types="cypress" />

import cypress from "cypress";

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<any>
      /**
       * Returns the accounts object set by the resetDb task in beforeEach.
       * Shape:
       * {
       *   checking: { id: string; name: string; type: 'debit' },
       *   visa: { id: string; name: string; type: 'credit' },
       *   savings: { id: string; name: string; type: 'debit' },
       *   amex: { id: string; name: string; type: 'credit' }
       * }
       */
      getSeededAccounts(): Chainable<any>
      /**
       * Add a transaction with an existing category.
       * @param options - Transaction options
       *   category: "Group::Item" format
       *   amount: number
       *   payee?: string (defaults to new payee)
       *   isExpense?: boolean (defaults to true for negative amounts)
       */
      addTransaction(options: {
        category: string;
        amount: number;
        payee?: string;
        isExpense?: boolean;
      }): Chainable<any>
      /**
       * Add a transaction with a new category.
       * @param options - Transaction options
       *   category: "Group::Item" format (or use __new_group__ / __new_item__)
       *   group: group name (can be __new_group__)
       *   amount: number
       *   payee?: string (defaults to new payee)
       *   isExpense?: boolean (defaults to true for negative amounts)
       */
      addTransactionWithNewCategory(options: {
        category: string;
        group?: string;
        amount: number;
        payee?: string;
        isExpense?: boolean;
      }): Chainable<any>
      /**
       * Waits for the budget table to finish recalculating after account changes.
       * Uses the data-calculation-version attribute to detect when calculations complete.
       */
      waitForBudgetCalculation(): Chainable<any>
    }
  }
}

export {};

Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/auth');
  cy.get('input[type="email"]').type(email);
  cy.get('input[type="password"]').type(password);
  cy.get('button[type="submit"]').click();
  // Wait for navigation to complete
  cy.url().should('include', '/dashboard');
});

Cypress.Commands.add('getSeededAccounts', () => {
  const accounts = Cypress.env('SEEDED_ACCOUNTS');
  return cy.wrap(accounts);
});

/**
 * Add a transaction with an existing category.
 * Expects "Group::Item" format for the category parameter.
 */
Cypress.Commands.add(
  'addTransaction',
  (options: {
    category: string;
    amount: number;
    payee?: string;
    isExpense?: boolean;
  }) => {
    const { category, amount, payee = 'Test Payee', isExpense = true } = options;
    const [groupName, itemName] = category.split('::');

    cy.get('[data-cy=add-transaction-button]').click();

    // Set payee
    if (payee === 'Test Payee') {
      cy.get('[data-cy=tx-payee-select]').select('__new__');
      cy.get('[data-cy=tx-new-payee-input]').type(payee);
    } else {
      cy.get('[data-cy=tx-payee-select]').select(payee);
    }

    // Set category using the new unified selector
    cy.get('[data-cy=tx-item-select]').select(`${groupName}::${itemName}`);

    // Set sign (expense vs income)
    cy.get('[data-cy=tx-sign-toggle]').then(($btn) => {
      const isNegative = isExpense;
      const currentSign = $btn.text().trim();
      const shouldBeNegative = currentSign === '−';

      if (isNegative !== shouldBeNegative) {
        cy.wrap($btn).click();
      }
    });

    // Set amount
    cy.get('[data-cy=tx-amount-input]').clear().type(String(Math.abs(amount)));

    cy.get('[data-cy=tx-submit]').click();
  }
);

/**
 * Add a transaction with a new category.
 * Category should be "Group::Item" or use special values like "__new_group__", "__new_item__".
 */
Cypress.Commands.add(
  'addTransactionWithNewCategory',
  (options: {
    category: string;
    group?: string;
    amount: number;
    payee?: string;
    isExpense?: boolean;
  }) => {
    const {
      category,
      group: groupInput,
      amount,
      payee = 'Test Payee',
      isExpense = true,
    } = options;

    cy.get('[data-cy=add-transaction-button]').click();

    // Set payee
    if (payee === 'Test Payee') {
      cy.get('[data-cy=tx-payee-select]').select('__new__');
      cy.get('[data-cy=tx-new-payee-input]').type(payee);
    } else {
      cy.get('[data-cy=tx-payee-select]').select(payee);
    }

    // Select new category
    cy.get('[data-cy=tx-item-select]').select('__new_category__');

    // If groupInput is provided or is "__new_group__", handle group creation
    if (groupInput) {
      cy.get('[data-cy=tx-category-group-select]').select(
        groupInput === '__new_group__' ? '__new_group__' : groupInput
      );

      if (groupInput === '__new_group__') {
        const [, groupName] = category.split('::');
        cy.get('[data-cy=tx-new-category-group-input]').type(groupName);
      }
    }

    // Type the category name
    const [, itemName] = category.split('::');
    cy.get('[data-cy=tx-new-category-input]').type(itemName);

    // Set sign
    cy.get('[data-cy=tx-sign-toggle]').then(($btn) => {
      const isNegative = isExpense;
      const currentSign = $btn.text().trim();
      const shouldBeNegative = currentSign === '−';

      if (isNegative !== shouldBeNegative) {
        cy.wrap($btn).click();
      }
    });

    // Set amount
    cy.get('[data-cy=tx-amount-input]').clear().type(String(Math.abs(amount)));

    cy.get('[data-cy=tx-submit]').click();
  }
);

  Cypress.Commands.add('waitForBudgetCalculation', () => {
    cy.wait(1000);
  });


const COMMAND_DELAY = 500;

// only slow down certain commands
const commandsToSlow = ['click', 'type', 'select', 'visit', 'trigger'];


  for (const command of commandsToSlow) {
    Cypress.Commands.overwrite(
      command as any,
      (originalFn, ...args) => {
        const result = originalFn(...args);

        return new Cypress.Promise((resolve) => {
          setTimeout(() => resolve(result), COMMAND_DELAY);
        });
      }
    );
  }


