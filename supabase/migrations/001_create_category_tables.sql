-- Migration 001: Create normalized category and assignment tables
-- Replaces the budget_data.data JSONB blob with proper relational tables
-- that have stable UUIDs for all mutations.

-- Reusable trigger function for updated_at maintenance
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------
-- category_groups: envelope groups (e.g. "Bills", "Subscriptions")
-- -----------------------------------------------------------------------
CREATE TABLE category_groups (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE category_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own category groups"
  ON category_groups FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_category_groups_user_id
  ON category_groups(user_id);

CREATE UNIQUE INDEX idx_category_groups_user_name
  ON category_groups(user_id, name);

CREATE TRIGGER trg_category_groups_updated_at
  BEFORE UPDATE ON category_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------
-- category_items: individual envelopes (e.g. "Rent", "Netflix")
-- -----------------------------------------------------------------------
CREATE TABLE category_items (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id       uuid        NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  snoozed        boolean     NOT NULL DEFAULT false,
  target         jsonb,
  notes          text,
  notes_history  jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own category items"
  ON category_items FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_category_items_user_id
  ON category_items(user_id);

CREATE INDEX idx_category_items_group_id
  ON category_items(group_id);

CREATE UNIQUE INDEX idx_category_items_group_name
  ON category_items(group_id, name);

CREATE TRIGGER trg_category_items_updated_at
  BEFORE UPDATE ON category_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------
-- budget_assignments: the ONLY persisted budget input — assigned amount
-- per (user, category_item, month). Never store activity or available here.
-- -----------------------------------------------------------------------
CREATE TABLE budget_assignments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_item_id  uuid        NOT NULL REFERENCES category_items(id) ON DELETE CASCADE,
  month             text        NOT NULL,  -- format: YYYY-MM
  assigned          numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  UNIQUE (user_id, category_item_id, month)
);

ALTER TABLE budget_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budget assignments"
  ON budget_assignments FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_budget_assignments_user_month
  ON budget_assignments(user_id, month);

CREATE INDEX idx_budget_assignments_item
  ON budget_assignments(category_item_id);

CREATE TRIGGER trg_budget_assignments_updated_at
  BEFORE UPDATE ON budget_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
