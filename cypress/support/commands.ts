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
      /**
       * Get the visible budget table element.
       */
      getVisibleBudgetTable(): Chainable<JQuery<HTMLElement>>
      /**
       * Find a selector scoped to the visible budget table.
       */
      budgetFind(selector: string): Chainable<JQuery<HTMLElement>>
      /**
       * Get a category row from the visible budget table.
       */
      budgetRow(groupName: string, itemName: string): Chainable<JQuery<HTMLElement>>
      /**
       * Add a new category group from the header controls.
       */
      createCategoryGroup(groupName: string): Chainable<any>
      /**
       * Add a new category item inside a group.
       */
      createCategoryItem(groupName: string, itemName: string): Chainable<any>
      /**
       * Create a group + item in the budget.
       */
      createCategory(groupName: string, itemName: string): Chainable<any>
      /**
       * Set assigned value for a category item.
       */
      setAssignedValue(groupName: string, itemName: string, value: number | string): Chainable<any>
      /**
       * Get Ready to Assign as a numeric value.
       */
      getReadyToAssignValue(): Chainable<number>
      /**
       * Right-click the first visible element matching selector.
       */
      rightClickFirst(selector: string): Chainable<any>
      /**
       * Right-click the first visible element within the budget table.
       */
      budgetRightClick(selector: string): Chainable<any>
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

Cypress.Commands.add('getVisibleBudgetTable', () =>
  cy.get('[data-cy=budget-table]').filter(':visible').first()
);

Cypress.Commands.add('budgetFind', (selector: string) =>
  cy.getVisibleBudgetTable().find(selector)
);

Cypress.Commands.add('rightClickFirst', (selector: string) => {
  cy.get(selector)
    .filter(':visible')
    .first()
    .scrollIntoView()
    .rightclick();
});

Cypress.Commands.add('budgetRightClick', (selector: string) => {
  cy.getVisibleBudgetTable()
    .find(selector)
    .filter(':visible')
    .first()
    .scrollIntoView()
    .rightclick();
});

Cypress.Commands.add('budgetRow', (groupName: string, itemName: string) =>
  cy
    .getVisibleBudgetTable()
    .find(
      `tr[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    )
    .first()
);

Cypress.Commands.add('createCategoryGroup', (groupName: string) => {
  cy.get('[data-cy=add-category-group-button]')
    .filter(':visible')
    .first()
    .scrollIntoView()
    .click();
  cy.get('[data-cy=add-category-group-input]')
    .filter(':visible')
    .first()
    .scrollIntoView()
    .clear()
    .type(groupName);
  cy.get('[data-cy=add-category-group-submit]')
    .filter(':visible')
    .first()
    .scrollIntoView()
    .click();
});

Cypress.Commands.add('createCategoryItem', (groupName: string, itemName: string) => {
  cy.getVisibleBudgetTable()
    .find(`tr[data-cy="category-group-row"][data-category="${groupName}"]`)
    .first()
    .scrollIntoView()
    .trigger('mouseover', { force: true });
  cy.getVisibleBudgetTable()
    .find(
      `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
    )
    .first()
    .scrollIntoView()
    .click({ force: true });

  cy.get('[data-cy=add-item-input]')
    .filter(':visible')
    .first()
    .clear()
    .type(itemName);
  cy.get('[data-cy=add-item-submit]')
    .filter(':visible')
    .first()
    .click();
});

Cypress.Commands.add('createCategory', (groupName: string, itemName: string) => {
  cy.createCategoryGroup(groupName);
  cy.createCategoryItem(groupName, itemName);
  cy.budgetRow(groupName, itemName).should('exist');
});

Cypress.Commands.add(
  'setAssignedValue',
  (groupName: string, itemName: string, value: number | string) => {
    cy.budgetRow(groupName, itemName)
      .scrollIntoView()
      .within(() => {
        cy.get('[data-cy="assigned-display"]')
          .first()
          .scrollIntoView()
          .click({ force: true });
        cy.get('[data-cy="assigned-input"]')
          .clear()
          .type(`${value}{enter}`);
      });
  }
);

const parseCurrency = (text: string) =>
  Number(text.replace(/[^0-9.-]/g, ''));

Cypress.Commands.add('getReadyToAssignValue', () =>
  cy
    .get('[data-cy=ready-to-assign]')
    .filter(':visible')
    .first()
    .should(($el) => {
      const value = parseCurrency($el.text());
      expect(value, 'Ready to Assign should be a number').to.not.be.NaN;
    })
    .invoke('text')
    .then((text) => parseCurrency(text))
);

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

    // Extract item name from category
    const [, itemName] = category.split('::');

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
