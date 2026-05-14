-- Migration 003: Remove persisted derived state from budget_data
--
-- assignable_money and ready_to_assign are computed on demand by the
-- server-side computation engine and never stored. Dropping them enforces
-- the "never persist derived state" architectural rule.

ALTER TABLE budget_data DROP COLUMN IF EXISTS assignable_money;
ALTER TABLE budget_data DROP COLUMN IF EXISTS ready_to_assign;
