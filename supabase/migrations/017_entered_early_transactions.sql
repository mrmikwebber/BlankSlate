-- Migration 017: support entering a pending transaction early
--
-- A pending (bank-unposted) transaction can now be "reviewed" from the UI
-- before it actually posts: the user categorizes/finalizes it immediately
-- (pending flips to false) instead of waiting for SimpleFin to sync the
-- posted version. `entered_early` marks a transaction that was finalized
-- this way, so the SimpleFin sync can match the eventual posted transaction
-- against it (by account + close date + amount) instead of inserting a
-- duplicate. `original_balance` records the amount at entry time, only
-- populated if the real posted amount later turns out to differ (e.g. a
-- restaurant charge where a tip was added after the pending amount showed) —
-- used purely to show an "amount changed on posting" flag in the UI.

ALTER TABLE transactions
  ADD COLUMN entered_early boolean NOT NULL DEFAULT false;

ALTER TABLE transactions
  ADD COLUMN original_balance numeric NULL;
