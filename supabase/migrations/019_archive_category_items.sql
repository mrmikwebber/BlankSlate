-- Lets a category item be archived instead of deleted: it drops out of the
-- active budget table and category pickers, but its transactions keep their
-- real category_item_id and its assigned/available money still flows into
-- Ready to Assign and Total Available exactly as before — archiving is a
-- pure visibility flag, not a data or math change. NULL = active.
ALTER TABLE category_items ADD COLUMN archived_at timestamptz NULL;
