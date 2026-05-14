-- Migration 002: Link transactions to category_items via stable UUID FK
--
-- transactions.category and transactions.category_group (text) remain as
-- display fallbacks; category_item_id is the canonical reference.
-- Nullable because Teller-synced transactions arrive uncategorized.

ALTER TABLE transactions
  ADD COLUMN category_item_id uuid
  REFERENCES category_items(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_category_item_id
  ON transactions(category_item_id);
