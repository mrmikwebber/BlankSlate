-- Migration 010: Backfill transactions.category_item_id from legacy text fields
--
-- The transaction add/edit UI never wrote category_item_id (only the legacy
-- category/category_group text columns) — only the calc engine's activity
-- filter reads category_item_id, so any transaction added or edited through
-- the UI since the 2026-07-13 schema normalization silently didn't count
-- toward its category's activity/available. The UI-side fix is separate
-- (InlineTransactionRow.tsx / MobileTransactionsTab.tsx / AccountContext.tsx);
-- this repairs existing rows by resolving category_item_id from an exact
-- (category, category_group) text match against category_items, scoped per
-- user. Idempotent — only touches rows where category_item_id IS NULL, safe
-- to re-run.

-- Optional: preview how many rows this will touch before running the UPDATE.
-- SELECT count(*) FROM transactions t
-- JOIN category_items ci ON ci.name = t.category
-- JOIN category_groups cg ON cg.id = ci.group_id AND cg.name = t.category_group
-- WHERE t.category_item_id IS NULL
--   AND t.category_group IS NOT NULL
--   AND t.category IS NOT NULL
--   AND t.category NOT IN ('Ready to Assign', 'Category Not Needed', 'Reconciliation (Hidden)')
--   AND ci.user_id = t.user_id
--   AND cg.user_id = t.user_id;

UPDATE transactions t
SET category_item_id = ci.id
FROM category_items ci
JOIN category_groups cg ON cg.id = ci.group_id
WHERE t.category_item_id IS NULL
  AND t.category_group IS NOT NULL
  AND t.category IS NOT NULL
  AND t.category NOT IN ('Ready to Assign', 'Category Not Needed', 'Reconciliation (Hidden)')
  AND ci.user_id = t.user_id
  AND cg.user_id = t.user_id
  AND ci.name = t.category
  AND cg.name = t.category_group;
