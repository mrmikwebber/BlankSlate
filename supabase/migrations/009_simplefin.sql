-- Migration 009: SimpleFin Bridge integration
--
-- Adds storage for a per-user SimpleFin Bridge connection, the mapping from
-- SimpleFin-side accounts to BlankSlate accounts, and transaction-level
-- dedupe support (same shape as migration 006's Teller sync fixes: a unique
-- external-id column for upsert-based dedupe, plus a tombstone table +
-- trigger so a locally-deleted synced transaction is never silently
-- re-imported on the next sync).

-- -----------------------------------------------------------------------
-- simplefin_connections: one SimpleFin Bridge access URL per user.
-- access_url embeds Basic Auth credentials (https://user:pass@host/simplefin)
-- and must never be sent to the browser — only read/written by server-side
-- route handlers using the caller's own RLS-scoped session.
-- -----------------------------------------------------------------------
CREATE TABLE simplefin_connections (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_url     text        NOT NULL,
  created_at     timestamptz DEFAULT now(),
  last_synced_at timestamptz
);

ALTER TABLE simplefin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own simplefin connection"
  ON simplefin_connections FOR ALL
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- simplefin_account_links: maps a SimpleFin-side account to a BlankSlate
-- account. blankslate_account_id is nullable until the user completes the
-- mapping step in the connect flow.
-- -----------------------------------------------------------------------
CREATE TABLE simplefin_account_links (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id          uuid        NOT NULL REFERENCES simplefin_connections(id) ON DELETE CASCADE,
  simplefin_account_id   text        NOT NULL,
  simplefin_account_name text,
  org_name               text,
  blankslate_account_id  uuid        REFERENCES accounts(id) ON DELETE SET NULL,
  last_synced_at         timestamptz,

  UNIQUE (user_id, simplefin_account_id)
);

ALTER TABLE simplefin_account_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own simplefin account links"
  ON simplefin_account_links FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_simplefin_account_links_connection_id
  ON simplefin_account_links(connection_id);

-- -----------------------------------------------------------------------
-- transactions.simplefin_transaction_id — dedupe key for sync upserts.
-- -----------------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN simplefin_transaction_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_simplefin_transaction_id_key'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_simplefin_transaction_id_key UNIQUE (simplefin_transaction_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- deleted_simplefin_transactions: tombstone of SimpleFin transaction IDs
-- the user has deleted locally, so sync never re-imports them.
-- -----------------------------------------------------------------------
CREATE TABLE deleted_simplefin_transactions (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  simplefin_transaction_id text      NOT NULL,
  deleted_at             timestamptz DEFAULT now(),

  UNIQUE (user_id, simplefin_transaction_id)
);

ALTER TABLE deleted_simplefin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deleted simplefin transactions"
  ON deleted_simplefin_transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_deleted_simplefin_transactions_user_id
  ON deleted_simplefin_transactions(user_id);

CREATE OR REPLACE FUNCTION tombstone_deleted_simplefin_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.simplefin_transaction_id IS NOT NULL THEN
    INSERT INTO deleted_simplefin_transactions (user_id, simplefin_transaction_id)
    VALUES (OLD.user_id, OLD.simplefin_transaction_id)
    ON CONFLICT (user_id, simplefin_transaction_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_tombstone_deleted_simplefin_transaction
  AFTER DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION tombstone_deleted_simplefin_transaction();
