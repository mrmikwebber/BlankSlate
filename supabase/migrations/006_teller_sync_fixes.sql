-- Migration 006: Teller sync fixes
--
-- 1. Tombstone table + trigger so a locally-deleted Teller transaction can
--    never be silently re-imported by a later sync/webhook call.
-- 2. Unique constraint on transactions.teller_transaction_id — required for
--    the existing upsert(..., { onConflict: "teller_transaction_id" }) dedupe
--    in webhook/route.ts and sync/route.ts to actually do anything. Not
--    present in any prior tracked migration, so it may not exist yet.

-- -----------------------------------------------------------------------
-- deleted_teller_transactions: tombstone of Teller transaction IDs the
-- user has deleted locally, so sync never re-imports them.
-- -----------------------------------------------------------------------
CREATE TABLE deleted_teller_transactions (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teller_transaction_id text       NOT NULL,
  deleted_at           timestamptz DEFAULT now(),

  UNIQUE (user_id, teller_transaction_id)
);

ALTER TABLE deleted_teller_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deleted teller transactions"
  ON deleted_teller_transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_deleted_teller_transactions_user_id
  ON deleted_teller_transactions(user_id);

-- -----------------------------------------------------------------------
-- Trigger: whenever a Teller-sourced transaction row is deleted, tombstone
-- it automatically — covers every delete path (single delete, bulk delete,
-- any future one) without relying on frontend code to remember to do it.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tombstone_deleted_teller_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.teller_transaction_id IS NOT NULL THEN
    INSERT INTO deleted_teller_transactions (user_id, teller_transaction_id)
    VALUES (OLD.user_id, OLD.teller_transaction_id)
    ON CONFLICT (user_id, teller_transaction_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tombstone_deleted_teller_transaction
  AFTER DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION tombstone_deleted_teller_transaction();

-- -----------------------------------------------------------------------
-- Unique constraint required by the existing sync/webhook dedupe upsert.
-- Guarded because it isn't present in any prior tracked migration.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_teller_transaction_id_key'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_teller_transaction_id_key UNIQUE (teller_transaction_id);
  END IF;
END $$;
