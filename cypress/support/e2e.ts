
import './commands'

beforeEach(() => {
  cy.task('resetDb').then((res: any) => {
    if (res?.accounts) {
      Cypress.env('SEEDED_ACCOUNTS', res.accounts);
    }
  });
});