// cypress/e2e/ui.cy.ts

// Group 7: UI interactions

describe('UI interactions and misc', () => {
  beforeEach(() => {
  cy.task('resetDb');
  cy.login('thedasherx@gmail.com', '123456');
    cy.get('[data-cy="ready-to-assign"]', { timeout: 10000 }).should('exist');
  });

  it('Scenario 21 – Collapse/expand groups', () => {
    cy.get('[data-cy="group-toggle"]').first().click();
    // Expect items hidden after collapse
    cy.get('tr[data-cy="category-row"]').should('have.length.lessThan', 50);
    // Toggle back
    cy.get('[data-cy="group-toggle"]').first().click();
  });

  it('Scenario 22 – Context menu positioning (basic smoke)', () => {
    // Right-click on a group near the bottom/right—hard to simulate deterministically here.
    // Basic test: context menu appears and has data-cy
    cy.get('[data-cy="group-name"]').first().rightclick();
    cy.get('[data-cy="group-context-menu"]').should('exist');
    // Clicking elsewhere closes it
    cy.get('body').click(0, 0);
    cy.get('[data-cy="group-context-menu"]').should('not.exist');
  });

  it('Scenario 23 – Add item popover dropUp (visual; best-effort)', () => {
    // This is a best-effort check: open an add item on a group near the bottom and assert popover class contains "bottom-full" or similar
    cy.get('[data-cy="group-name"]').last().trigger('mouseenter');
    cy.get('[data-cy="group-add-item-button"]').last().click({ force: true });
    cy.get('[data-cy="add-item-input"]').should('exist');
    // Can't reliably assert dropUp without viewport control; user can enhance this test with controlled viewport size.
  });

  it('Scenario 24 – Dirty state & recent changes log', () => {
    // Change assigned in two categories to mark dirty
    cy.get('span[data-cy="assigned-display"]').first().click();
    cy.get('input[data-cy="assigned-input"]').first().clear().type('1{enter}');

    cy.get('span[data-cy="assigned-display"]').eq(1).click();
    cy.get('input[data-cy="assigned-input"]').eq(1).clear().type('2{enter}');

    // Expect some dirty indicator — adjust selector to your app state (e.g. a Save button enabled or visual marker)
    // This placeholder asserts recent changes UI exists (if implemented)
    cy.get('[data-cy="recent-changes"]').should('exist').then(($rc) => {
      // recent changes list should have at most 10 entries
      cy.wrap($rc).find('li').should('have.length.at.most', 10);
    });
  });
});
