-- Migration 013: Per-user settings, starting with the Fresh Start reset
-- boundary.
--
-- budget_reset_month is read by loadBudgetState() and threaded into
-- computeBudgetState() as BudgetStateInput.resetMonth. NULL means Fresh
-- Start has never been run — computeBudgetState's behavior is then
-- identical to before this feature existed.

CREATE TABLE user_settings (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  budget_reset_month text        CHECK (budget_reset_month IS NULL OR budget_reset_month ~ '^\d{4}-\d{2}$'),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
