-- One-time data fix: recreate "Move in July" as an archived category and
-- re-link the 9 transactions that were left orphaned when the category was
-- deleted (see conversation — this closes the $795.23 that had silently
-- dropped out of RTA/Total Available). Run this AFTER 019_archive_category_items.sql.
DO $$
DECLARE
  v_user_id uuid := 'f29da50b-5974-4cc2-9f6f-93bd4e8da86a';
  v_budget_id uuid := 'a6438e10-cd8c-4ef8-9ad9-3b95a7de47eb';
  v_group_id uuid;
  v_item_id uuid;
BEGIN
  -- Change 'Irregular Expenses' to whichever group you'd rather it live under
  -- (it's archived immediately, so this only matters if you ever unarchive it).
  SELECT id INTO v_group_id FROM category_groups
    WHERE user_id = v_user_id AND budget_id = v_budget_id AND name = 'Irregular Expenses';

  INSERT INTO category_items (user_id, budget_id, group_id, name, sort_order, archived_at)
  VALUES (v_user_id, v_budget_id, v_group_id, 'Move in July', 9999, now())
  RETURNING id INTO v_item_id;

  UPDATE transactions
  SET category_item_id = v_item_id
  WHERE budget_id = v_budget_id
    AND category = 'Move in July'
    AND category_item_id IS NULL;
END $$;
