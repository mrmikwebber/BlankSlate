-- Migration 014: Multi-budget support ("Fresh Start" archive-and-restart).
--
-- Adds a `budgets` table (one user can have many named budgets, exactly one
-- non-archived "current" one at a time) and scopes `category_groups`,
-- `category_items`, `budget_assignments`, and `transactions` to a budget.
-- `accounts`, `simplefin_connections`, and `simplefin_account_links` stay
-- budget-agnostic on purpose — a bank connection/account persists across
-- budgets, only which budget its transactions currently post into changes.

CREATE TABLE budgets (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  archived_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budgets"
  ON budgets FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Exactly one non-archived ("current") budget per user, enforced at the DB
-- level. Also enables a race-safe INSERT ... ON CONFLICT (user_id) WHERE
-- archived_at IS NULL DO NOTHING for lazy first-access budget creation.
CREATE UNIQUE INDEX idx_budgets_user_current
  ON budgets(user_id) WHERE archived_at IS NULL;

-- -----------------------------------------------------------------------
-- Backfill: one budget per existing user with any data, then point their
-- existing rows at it.
-- -----------------------------------------------------------------------
INSERT INTO budgets (user_id, name, archived_at)
SELECT DISTINCT user_id, 'My Budget'::text, NULL::timestamptz
FROM accounts;

ALTER TABLE category_groups    ADD COLUMN budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE;
ALTER TABLE category_items     ADD COLUMN budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE;
ALTER TABLE budget_assignments ADD COLUMN budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE;
ALTER TABLE transactions       ADD COLUMN budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE;

UPDATE category_groups cg
  SET budget_id = b.id
  FROM budgets b
  WHERE b.user_id = cg.user_id AND b.archived_at IS NULL;

UPDATE category_items ci
  SET budget_id = b.id
  FROM budgets b
  WHERE b.user_id = ci.user_id AND b.archived_at IS NULL;

UPDATE budget_assignments ba
  SET budget_id = b.id
  FROM budgets b
  WHERE b.user_id = ba.user_id AND b.archived_at IS NULL;

UPDATE transactions t
  SET budget_id = b.id
  FROM budgets b
  WHERE b.user_id = t.user_id AND b.archived_at IS NULL;

ALTER TABLE category_groups    ALTER COLUMN budget_id SET NOT NULL;
ALTER TABLE category_items     ALTER COLUMN budget_id SET NOT NULL;
ALTER TABLE budget_assignments ALTER COLUMN budget_id SET NOT NULL;
ALTER TABLE transactions       ALTER COLUMN budget_id SET NOT NULL;

CREATE INDEX idx_category_groups_budget_id    ON category_groups(budget_id);
CREATE INDEX idx_category_items_budget_id     ON category_items(budget_id);
CREATE INDEX idx_budget_assignments_budget_id ON budget_assignments(budget_id);
CREATE INDEX idx_transactions_budget_id       ON transactions(budget_id);

-- A group name only needs to be unique within its own budget now (two
-- budgets can each have their own "Bills" group). category_items'
-- UNIQUE(group_id, name) and budget_assignments'
-- UNIQUE(user_id, category_item_id, month) are already transitively
-- budget-scoped via group_id/category_item_id and don't need to change.
DROP INDEX IF EXISTS idx_category_groups_user_name;
CREATE UNIQUE INDEX idx_category_groups_budget_name
  ON category_groups(budget_id, name);
