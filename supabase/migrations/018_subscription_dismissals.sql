-- Migration 018: subscription-detection dismissals
--
-- "Possible Subscriptions" is detected client-side from transaction history
-- (see src/lib/detectSubscriptions.ts) — nothing here drives detection
-- itself. This table only remembers which detected payees the user marked
-- "not a subscription" so they stay hidden.
--
-- Scoped by user_id only (not budget_id), unlike transactions: a dismissal
-- is a judgment about a real-world payee, not about a specific budget, so it
-- should survive a Fresh Start rather than requiring the user to re-dismiss
-- the same false positive after every reset.

CREATE TABLE subscription_dismissals (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payee_key    text        NOT NULL,
  payee_label  text        NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, payee_key)I 
);

ALTER TABLE subscription_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscription dismissals"
  ON subscription_dismissals FOR ALL
  USING (auth.uid() = user_id);
