-- Migration 016: Global planning mode — a single-month, non-cascading
-- "what if my next paycheck already landed" preview, kept fully separate
-- from budget_assignments so toggling back to Period mode never touches
-- real assigned amounts or Ready to Assign. See computeBudgetState /
-- serializeMonthView (lib/budgetMath.ts) for how these feed
-- global_ready_to_assign and ComputedCategoryItem.globalAssigned.

-- -----------------------------------------------------------------------
-- global_assignments: shadow "assigned" per (category_item, month) — the
-- Global-mode analog of budget_assignments. A missing row means "no
-- override yet"; the calc layer (not the UI) falls back to the real
-- budget_assignments value for that item/month.
-- -----------------------------------------------------------------------
CREATE TABLE global_assignments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id         uuid        NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_item_id  uuid        NOT NULL REFERENCES category_items(id) ON DELETE CASCADE,
  month             text        NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  assigned          numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  UNIQUE (user_id, category_item_id, month)
);

ALTER TABLE global_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own global assignments"
  ON global_assignments FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_global_assignments_user_month ON global_assignments(user_id, month);
CREATE INDEX idx_global_assignments_item       ON global_assignments(category_item_id);
CREATE INDEX idx_global_assignments_budget_id  ON global_assignments(budget_id);

CREATE TRIGGER trg_global_assignments_updated_at
  BEFORE UPDATE ON global_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------
-- planned_income: user-entered "not yet received" income per (budget,
-- month) — a flat planning number, not a transaction.
-- -----------------------------------------------------------------------
CREATE TABLE planned_income (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id   uuid        NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  month       text        NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  amount      numeric     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  UNIQUE (user_id, budget_id, month)
);

ALTER TABLE planned_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own planned income"
  ON planned_income FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_planned_income_user_month ON planned_income(user_id, month);

CREATE TRIGGER trg_planned_income_updated_at
  BEFORE UPDATE ON planned_income
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
