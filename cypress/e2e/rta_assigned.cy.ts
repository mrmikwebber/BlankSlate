// cypress/e2e/rta_assigned.cy.ts

// Tests for Group 1: Ready To Assign (RTA) & Assigned editing
// NOTE: These tests assume your app has an isolated test dataset or you run them against an environment
// seeded to the scenarios described. If you use Supabase for persistence, consider adding test fixtures
// or reset logic before running these specs.

describe('RTA & Assigned editing', () => {
  beforeEach(() => {
    // Reset test DB, then login with the seeded test account
  cy.task('resetDb');
  cy.login('thedasherx@gmail.com', '123456');
    // wait for budget to load
    cy.get('[data-cy="ready-to-assign"]', { timeout: 10000 }).should('exist');
  });

  it('Scenario 1 – First month, first inflow: add income then assign Rent/Groceries', () => {
    // Preconditions: new budget, Month 1, RTA = 0, categories Rent and Groceries exist
    // TODO: seed initial state if needed

    // Add income inflow of 2000. This example clicks the Add Transaction flow on a sample account.
    // Adjust selectors if your app places income entry elsewhere.
    cy.get('[data-cy="add-transaction-button"]').click();

    // The InlineTransactionRow appears; fill date, payee (select account), amount and submit
    cy.get('[data-cy="transaction-form-row-add"]').within(() => {
      cy.get('[data-cy="tx-date-input"]').clear().type('2025-11-01');
      // Choose a payee/account — adapt value to a valid account name in your fixtures
      // pick the first non-empty option value
      cy.get('[data-cy="tx-payee-select"] option').then(($opts) => {
        const firstVal = $opts.eq(0).val() as string | undefined;
        if (firstVal) cy.get('[data-cy="tx-payee-select"]').select(firstVal);
      });
      cy.get('[data-cy="tx-group-select"]').select('Ready to Assign');
      cy.get('[data-cy="tx-amount-input"]').clear().type('2000');
      // ensure positive (income)
      cy.get('[data-cy="tx-sign-toggle"]').then(($btn) => {
        if ($btn.text().trim() === '−') {
          // currently negative, toggle
          cy.wrap($btn).click();
        }
      });
      cy.get('[data-cy="tx-submit"]').click();
    });

    // After income: RTA = 2000
    cy.get('[data-cy="ready-to-assign"]').invoke('text').should((text) => {
      expect(text.replace(/[^0-9.-]+/g, '')).to.match(/2000/);
    });

    // Assign 500 to Rent
    cy.get('input[data-cy="assigned-input"][data-item="Rent"]').then(($el) => {
      if ($el.length) {
        cy.wrap($el).clear().type('500{enter}');
      } else {
        // click the display to open inline input then type
        cy.get('span[data-cy="assigned-display"][data-item="Rent"]').click();
        cy.get('input[data-cy="assigned-input"][data-item="Rent"]').clear().type('500{enter}');
      }
    });

    // After Rent assignment: RTA = 1500
    cy.get('[data-cy="ready-to-assign"]').invoke('text').should((text) => {
      expect(text.replace(/[^0-9.-]+/g, '')).to.match(/1500/);
    });

    // Check Rent row values
    cy.get('tr[data-cy="category-row"][data-item="Rent"]').within(() => {
      cy.get('span[data-cy="assigned-display"][data-item="Rent"]').should('contain', '500');
      cy.get('[data-cy="item-activity"]').invoke('text').then((text) => {
        // accept either formatted "$0" or raw "0"
        expect(text.replace(/[^0-9.-]+/g, '')).to.match(/0/);
      });
      cy.get('[data-cy="item-available"]').invoke('text').then((text) => {
        expect(text.replace(/[^0-9.-]+/g, '')).to.match(/500/);
      });
    });

    // Assign 300 to Groceries
    cy.get('span[data-cy="assigned-display"][data-item="Groceries"]').click();
    cy.get('input[data-cy="assigned-input"][data-item="Groceries"]').clear().type('300{enter}');

    // After Groceries assignment: RTA = 1200
    cy.get('[data-cy="ready-to-assign"]').invoke('text').should((text) => {
      expect(text.replace(/[^0-9.-]+/g, '')).to.match(/1200/);
    });

    // Check Groceries row
    cy.get('tr[data-cy="category-row"][data-item="Groceries"]').within(() => {
      cy.get('span[data-cy="assigned-display"][data-item="Groceries"]').should('contain', '300');
      cy.get('[data-cy="item-activity"]').invoke('text').then((text) => {
        expect(text.replace(/[^0-9.-]+/g, '')).to.match(/0/);
      });
      cy.get('[data-cy="item-available"]').invoke('text').then((text) => {
        expect(text.replace(/[^0-9.-]+/g, '')).to.match(/300/);
      });
    });
  });

  it('Scenario 2 – Editing Assigned up and down (no negative RTA)', () => {
    // Assumes starting RTA = 1200 and Rent assigned = 500

    // Increase Rent 500 -> 700 (decrease RTA by 200 -> 1000)
    cy.get('span[data-cy="assigned-display"][data-item="Rent"]').click();
    cy.get('input[data-cy="assigned-input"][data-item="Rent"]').clear().type('700{enter}');

    cy.get('[data-cy="ready-to-assign"]').invoke('text').should((text) => {
      expect(text.replace(/[^0-9.-]+/g, '')).to.match(/1000/);
    });

    // Decrease Rent 700 -> 450 (RTA increases by 250 -> 1250)
    cy.get('span[data-cy="assigned-display"][data-item="Rent"]').click();
    cy.get('input[data-cy="assigned-input"][data-item="Rent"]').clear().type('450{enter}');

    cy.get('[data-cy="ready-to-assign"]').invoke('text').should((text) => {
      expect(text.replace(/[^0-9.-]+/g, '')).to.match(/1250/);
    });

    // Assert RTA not negative
    cy.get('[data-cy="ready-to-assign"]').invoke('text').then((t) => {
      const val = parseFloat(t.replace(/[^0-9.-]+/g, ''));
      expect(val).to.be.at.least(0);
    });
  });

  it('Scenario 3 – Math input in Assigned and invalid input fallback', () => {
    // Clear Groceries assigned to 0 first
    cy.get('span[data-cy="assigned-display"][data-item="MathTest"]').then(($el) => {
      // If a test-specific category exists, use it; otherwise target Groceries
      const target = $el.length ? 'MathTest' : 'Groceries';

      cy.get(`span[data-cy="assigned-display"][data-item="${target}"]`).click();
      cy.get(`input[data-cy="assigned-input"][data-item="${target}"]`).clear().type('10+5{enter}');

      // Assigned becomes 15
      cy.get(`span[data-cy="assigned-display"][data-item="${target}"]`).should('contain', '15');

      // Now type 'abc' and blur
      cy.get(`span[data-cy="assigned-display"][data-item="${target}"]`).click();
      cy.get(`input[data-cy="assigned-input"][data-item="${target}"]`).clear().type('abc').blur();

      // Assigned should fall back to 0
      cy.get(`span[data-cy="assigned-display"][data-item="${target}"]`).should('contain', '0');
    });
  });
});
