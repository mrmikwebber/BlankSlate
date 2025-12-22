# Cypress selector conventions

This project standardizes `data-cy` attributes for stable end-to-end tests.

Use these canonical selectors and interaction patterns:

## Budget table

- Category group row: `tr[data-cy="category-group-row"][data-category="<GroupName>"]`
- Category item row: `tr[data-cy="category-row"][data-category="<GroupName>"][data-item="<ItemName>"]`
- Add new category group (header area):
  - Button: `[data-cy="add-category-group-button"]`
  - Input: `[data-cy="add-category-group-input"]`
  - Submit: `[data-cy="add-category-group-submit"]`
- Add new category item under a group:
  - Button (appears on hover of the group row): `[data-cy="group-add-item-button"]`
  - Input: `[data-cy="add-item-input"]`
  - Submit: `[data-cy="add-item-submit"]`
- Assigned editing:
  - Display span: `span[data-cy="assigned-display"]`
  - Inline input: `input[data-cy="assigned-input"]`
- Category values inside a category row:
  - Activity cell: `[data-cy="item-activity"]`
  - Available cell: `[data-cy="item-available"]`
- Deletion/reassign flow:
  - Delete: `[data-cy="category-delete"]`
  - Reassign select: `[data-cy="reassign-target-select"]`
  - Confirm: `[data-cy="reassign-confirm"]`

## Month navigation

- Previous month button: `[data-cy="month-prev"]`
- Next month button: `[data-cy="month-next"]`
- Visible month label: `[data-cy="month-label"]`

## Accounts page (transactions)

- Add row button: `[data-cy="add-transaction-button"]`
- Payee select: `[data-cy="tx-payee-select]`  (use `__new__` to create new)
- New payee input: `[data-cy="tx-new-payee-input]`
- Group select: `[data-cy="tx-group-select]` (use `__new__` to create new)
- New group input: `[data-cy="tx-new-group-input]`
- Item select: `[data-cy="tx-item-select]` (use `__new__` to create new)
- New item input: `[data-cy="tx-new-item-input]`
- Amount sign toggle: `[data-cy="tx-sign-toggle]` ("Outflow" / "Inflow" label)
- Amount input: `[data-cy="tx-amount-input]`
- Submit: `[data-cy="tx-submit]`
- Transaction row: `tr[data-cy="transaction-row"][data-txid]`
- Transaction amount cell: `[data-cy="transaction-amount]`

Notes:
- For cross-account transfers (checking → credit card), selecting the credit card as the payee auto-sets the group to "Credit Card Payments" and item to the card name.
- Account balance display is a localized currency string; parse with `text.replace(/[^0-9.-]/g, "")` when asserting numerically.

## Hover + visible-first pattern for add-item

The add-item button is only visible on hover. Use this pattern to click it reliably:

```ts
cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`).trigger('mouseover');
cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`)
  .filter(':visible')
  .first()
  .then(($btn) => {
    if ($btn.length) {
      cy.wrap($btn).click();
    } else {
      // Fallback in case hover visibility is flaky
      cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`).first().click({ force: true });
    }
  });
```

## Activity sidebar

- Sidebar container: `[data-cy="activity-sidebar"]`
- Activity list: `[data-cy="recent-activity-list"]`
- Individual activity item: `[data-cy="activity-item"]` (also has `data-activity-type="change"` or `data-activity-type="transaction"`)

## Do/Don't quick list

- Do use `data-category` (group) and `data-item` (row) attributes; don't use legacy `data-group`.
- Do use `add-category-group-*` and `add-item-*`; don't use legacy `new-group-*` or `new-item-*` in budget table tests.
- Do parse currency text for budget balances; account transaction amounts are plain numbers.
- Do use month navigation `month-prev`/`month-next`/`month-label`.
- Do scope interactions with `assigned-display`/`assigned-input` within specific category rows using `.within()`.
