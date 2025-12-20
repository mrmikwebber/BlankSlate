/// <reference types="cypress" />

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
       * Select a payee from the combobox dropdown.
       * Use '__new__' to create a new payee.
       */
      selectPayee(payeeName: string): Chainable<any>
      /**
       * Select a category from the combobox dropdown.
       * Accepts "Group::Item" or a raw label like "Ready to Assign".
       */
      selectCategory(categoryLabel: string): Chainable<any>
      /**
       * Start the new-category flow by typing the name and clicking "Create".
       */
      startCategoryCreation(categoryName: string): Chainable<any>
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

Cypress.Commands.add('selectPayee', (payeeName: string) => {
  const input = cy.get('[data-cy=tx-payee-select]');
  
  // Clear and type the payee name
  input.clear().type(payeeName);
  
  // Wait for dropdown to appear
  cy.get('[data-cy=payee-dropdown]').should('be.visible');
  
  // Check if the payee already exists in the dropdown
  cy.get('[data-cy=payee-dropdown]').then(($dropdown) => {
    if ($dropdown.text().includes(payeeName)) {
      // Payee exists, click on it
      cy.get('[data-cy=payee-dropdown]').contains(payeeName).click();
    } else if ($dropdown.text().includes('Create')) {
      // Payee doesn't exist, click Create option
      cy.get('[data-cy=payee-dropdown]').contains('Create').click();
    }
  });
});

Cypress.Commands.add(
  'selectCategory',
  { prevSubject: 'optional' },
  (subject: JQuery<HTMLElement> | undefined, categoryLabel: string) => {
    // Extract just the item name (part after ::)
    const itemName = categoryLabel.includes('::')
      ? categoryLabel.split('::')[1]
      : categoryLabel;

    const input = subject ? cy.wrap(subject) : cy.get('[data-cy=tx-item-select]');
    input.clear().type(itemName);

    cy.get('[data-cy=category-dropdown]').should('be.visible');
    
    // Check if the category already exists in the dropdown
    cy.get('[data-cy=category-dropdown]').then(($dropdown) => {
      if ($dropdown.text().includes(itemName)) {
        // Category exists, click on it
        cy.get('[data-cy=category-dropdown]').contains(itemName).click();
      } else if ($dropdown.text().includes('Create')) {
        // Category doesn't exist, click Create option
        cy.get('[data-cy=category-dropdown]').contains('Create').click();
      }
    });
  }
);

Cypress.Commands.add(
  'startCategoryCreation',
  { prevSubject: 'optional' },
  (subject: JQuery<HTMLElement> | undefined, categoryName: string) => {
    const input = subject ? cy.wrap(subject) : cy.get('[data-cy=tx-item-select]');
    input.clear().type(categoryName);

    cy.get('[data-cy=category-dropdown]').should('be.visible');
    cy.get('[data-cy=category-dropdown]').contains('Create New Category').click();
  }
);

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
    cy.selectPayee(payee);

    // Set category using the combobox
    cy.selectCategory(`${groupName}::${itemName}`);

    // Set sign (expense vs income)
    cy.get('[data-cy=tx-sign-toggle]').then(($btn) => {
      const isNegative = isExpense;
      const shouldBeNegative = $btn.attr('data-state') === 'negative';

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
    cy.selectPayee(payee);

    // Begin new category creation
    cy.startCategoryCreation(itemName);

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
      const shouldBeNegative = $btn.attr('data-state') === 'negative';

      if (isNegative !== shouldBeNegative) {
        cy.wrap($btn).click();
      }
    });

    // Set amount
    cy.get('[data-cy=tx-amount-input]').clear().type(String(Math.abs(amount)));

    cy.get('[data-cy=tx-submit]').click();
  }
);


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
