// Test constants for seeded accounts created by `cypress/support/db-reset.ts`.
//
// This file provides canonical names (and optional ids) for accounts that
// the DB reset seeds. The reset script creates the following accounts:
// - Checking Account
// - Visa Card
// - Savings Account
// - Amex Card
//
// The `id` fields are left empty here because they are generated at insert
// time by the DB. If you need the numeric/uuid ids in tests, have a Node-side
// task (cy.task) query the DB and then call `setAccountIds` to populate them
// at runtime.

export type AccountConst = {
  name: string;
  id: string; // empty string until populated at runtime
};

export const CHECKING_ACCOUNT: AccountConst = {
  name: 'Checking Account',
  id: '',
};

export const VISA_CARD: AccountConst = {
  name: 'Visa Card',
  id: '',
};

export const SAVINGS_ACCOUNT: AccountConst = {
  name: 'Savings Account',
  id: '',
};

export const AMEX_CARD: AccountConst = {
  name: 'Amex Card',
  id: '',
};

// Convenience collection
export const SEEDED_ACCOUNTS = {
  CHECKING: CHECKING_ACCOUNT,
  VISA: VISA_CARD,
  SAVINGS: SAVINGS_ACCOUNT,
  AMEX: AMEX_CARD,
};

export const BUDGET_URL = '/dashboard';

// Setter to populate ids at runtime (e.g. from a cy.task that queries the DB).
export function setAccountIds(ids: Partial<Record<keyof typeof SEEDED_ACCOUNTS, string>>) {
  if (ids.CHECKING) SEEDED_ACCOUNTS.CHECKING.id = ids.CHECKING;
  if (ids.VISA) SEEDED_ACCOUNTS.VISA.id = ids.VISA;
  if (ids.SAVINGS) SEEDED_ACCOUNTS.SAVINGS.id = ids.SAVINGS;
  if (ids.AMEX) SEEDED_ACCOUNTS.AMEX.id = ids.AMEX;
}

// Example usage in a test (Node):
// const ids = await cy.task('getSeededAccountIds');
// import { setAccountIds } from './support/testConstants';
// setAccountIds(ids);

export default SEEDED_ACCOUNTS;
