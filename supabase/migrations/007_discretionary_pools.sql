-- Migration 007: Discretionary Safe-to-Spend pools (Phase 1)
--
-- category_items.target (jsonb) is an unrelated, pre-existing funding/payoff
-- goal concept and is never read by the budget compute engine. The columns
-- below are a distinct, new spending-ceiling concept for the discretionary
-- safe-to-spend view — do not conflate the two.

ALTER TABLE category_items
  ADD COLUMN is_discretionary_pool boolean NOT NULL DEFAULT false,
  ADD COLUMN discretionary_target numeric;

-- -----------------------------------------------------------------------
-- discretionary_scheduled_charges: manually-registered known future charges
-- per pool (e.g. "Spotify, $15, day 25"), pre-deducted from the safe-to-spend
-- formula so it doesn't overstate the allowance before a charge posts.
-- -----------------------------------------------------------------------
CREATE TABLE discretionary_scheduled_charges (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_item_id  uuid        NOT NULL REFERENCES category_items(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  amount            numeric     NOT NULL,
  day_of_month      integer     NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE discretionary_scheduled_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scheduled charges"
  ON discretionary_scheduled_charges FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_discretionary_scheduled_charges_category_item_id
  ON discretionary_scheduled_charges(category_item_id);

CREATE TRIGGER trg_discretionary_scheduled_charges_updated_at
  BEFORE UPDATE ON discretionary_scheduled_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
