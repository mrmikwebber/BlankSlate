-- Migration 008: Discretionary pool "opening spent" — manual one-time seed
-- for spending that already happened this period but isn't captured by any
-- transaction (e.g. a pool just toggled on mid-month, or spending with no
-- tracked payment method). Stamped with the month it was entered for so it
-- self-expires at the next period rollover instead of double-counting
-- forever — application code must only apply it when
-- discretionary_opening_spent_month equals the real current month.

ALTER TABLE category_items
  ADD COLUMN discretionary_opening_spent numeric,
  ADD COLUMN discretionary_opening_spent_month text;
