-- Migration 004: Drop unused legacy objects
--
-- category_activity is a view and user_transactions is a table.
-- Both stored derived/aggregate state that is now computed on demand.

DROP VIEW IF EXISTS category_activity CASCADE;
DROP VIEW IF EXISTS user_transactions CASCADE;
