-- Migration 011: per-category "hide from Insights charts" flag
--
-- Lets the user exclude a category's spending from the Insights donut/pace/
-- trend/category-table computations (e.g. a reimbursed loan from a parent
-- that isn't representative of real discretionary spending) without
-- affecting the budget itself. Mirrors the is_discretionary_pool flag added
-- in migration 007.

ALTER TABLE category_items
  ADD COLUMN hide_from_insights boolean NOT NULL DEFAULT false;
