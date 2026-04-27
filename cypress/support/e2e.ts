
import './commands'

Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('Hydration failed') || err.message.includes('hydration')) {
    return false;
  }
});

beforeEach(() => {
  cy.task('resetDb').then((res: any) => {
    if (res?.accounts) {
      Cypress.env('SEEDED_ACCOUNTS', res.accounts);
    }
  });
});