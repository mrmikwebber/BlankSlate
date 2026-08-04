-- Migration 015: track bank-pending (not yet posted) transactions
--
-- SimpleFin sync now requests pending transactions in addition to posted
-- ones. `pending` is kept separate from the existing `cleared` flag, which
-- is a user-driven reconciliation toggle — reusing it for "still pending at
-- the bank" would make it impossible to tell "posted but not reconciled by
-- me yet" apart from "may still change amount/payee before it posts".

ALTER TABLE transactions
  ADD COLUMN pending boolean NOT NULL DEFAULT false;
