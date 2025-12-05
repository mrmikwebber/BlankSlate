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
