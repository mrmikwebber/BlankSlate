-- Migration 012: Unlink any Reconciliation Adjustment rows from a real category_item_id
--
-- Migration 010's backfill excluded 'Ready to Assign' and 'Category Not
-- Needed' from being matched to a real category, but not 'Reconciliation
-- (Hidden)' — an oversight. If a real category group/item happened to also
-- be named "Reconciliation (Hidden)", that backfill would have wrongly
-- linked reconciliation rows to it, causing them to count as real activity
-- (e.g. inflating a credit card's payment activity).
--
-- lib/budgetMath.ts's normalizeTransactions() now explicitly ignores
-- category_item_id on any row where category_group = 'Reconciliation
-- (Hidden)', so this is no longer load-bearing for correctness — this
-- migration is just hygiene, clearing the stale/misleading FK value.

UPDATE transactions
SET category_item_id = NULL
WHERE category_group = 'Reconciliation (Hidden)'
  AND category_item_id IS NOT NULL;
