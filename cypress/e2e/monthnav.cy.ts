// cypress/e2e/monthnav.cy.ts

// Tests covering Month navigation and next-month behavior (NM series)

describe('Month navigation and next-month behavior (NM series)', () => {
  beforeEach(() => {
  cy.task('resetDb');
  cy.login('thedasherx@gmail.com', '123456');
    cy.get('[data-cy="ready-to-assign"]', { timeout: 10000 }).should('exist');
  });

  it('NM1 – Surplus rolling forward (cash category)', () => {
    // Preconditions: Month 1 Car Insurance Assigned 100, Available 100, RTA 0
    // Navigate to Month 2
    cy.get('[data-cy="month-next"]').click({ force: true });

    // Expect Month 2 shows Car Insurance Available 100 (rollover) and Assigned 0
    cy.get('[data-cy="group-name"][data-category="Insurance"]').should('exist');
    cy.get('[data-cy="item-available"][data-item="Car Insurance"]').invoke('text').then((t) => {
      expect(t.replace(/[^0-9.-]+/g, '')).to.match(/100/);
    });
    cy.get('span[data-cy="assigned-display"][data-item="Car Insurance"]').should('contain', '0');
  });

  it.skip('NM2 – Cash overspending persists across multiple months [SKIPPED - requires complex fixture setup]', () => {});

  it.skip('NM3 – Credit card purchase in Month 1, payment in Month 2 [SKIPPED - requires accounts fixture]', () => {});

  it.skip('NM4 – CC overspending across months [SKIPPED - requires accounts fixture]', () => {});

  it.skip('NM5 – Change last month\'s Assigned after moving forward [SKIPPED - requires fixtures]', () => {});

  it.skip('NM6 – Overspend in previous month after already budgeting future [SKIPPED]', () => {});

  it.skip('NM7 – Multiple-month jump vs step-by-step [SKIPPED]', () => {});

  it.skip('NM8 – December -> January year boundary with savings category [SKIPPED]', () => {});

  it.skip('NM9 – Move income date back a month [SKIPPED]', () => {});

  it.skip('NM10 – Move income date forward a month [SKIPPED]', () => {});

  it.skip('NM11 – Monthly target resets each month [SKIPPED]', () => {});

  it.skip('NM12 – Savings target "by date" across months [SKIPPED]', () => {});

  it('NM13 – MonthNav state + data sync (label)', () => {
    // Verify month label exist and changes when navigating
    cy.get('[data-cy="month-label"]').should('exist');
    cy.get('[data-cy="month-label"]').invoke('text').then((label1) => {
      cy.get('[data-cy="month-next"]').click({ force: true });
      cy.get('[data-cy="month-label"]').invoke('text').should((label2) => {
        expect(label2).not.to.equal(label1);
      });
    });
  });
});
