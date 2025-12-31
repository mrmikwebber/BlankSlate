# Quick Assign Feature - User Guide

## How to Use

### Method 1: Right-Click Context Menu

1. **Right-click** on any budget category item
2. A context menu appears with three quick-assign options at the top
3. **Each option displays the amount it would set**, so you can preview before clicking
4. Click on the option you want:
   - **Set to last month** - Uses last month's assigned amount
   - **Set to 3-month avg** - Calculates average from past 3 months
   - **Zero out** - Sets to $0

### Method 2: Keyboard Shortcuts (Faster!)

1. **Right-click** on a budget category to open the context menu
2. You'll see the amounts for each option displayed next to the label
3. Without clicking away, press a single key:
   - **L** - Set to last month
   - **A** - Set to 3-month average
   - **Z** - Zero out
4. The menu closes and the assignment is applied instantly

## Visual Examples

### What The Context Menu Looks Like

When you right-click a budget category, you see:

```
┌─────────────────────────────────────┐
│ Set to last month         $200.00   │  ← Shows calculated amount
│ Set to 3-month avg        $190.00   │  ← Shows calculated amount
│ Zero out                   $0.00    │  ← Always $0
├─────────────────────────────────────┤
│ Rename category                      │
│ Delete category                      │
└─────────────────────────────────────┘
```

This way you know exactly what amount will be set **before** you click!

### Example 1: Set to Last Month
```
Category: Groceries
Current Assigned: $150
Last Month Assigned: $200
→ Click "Set to last month"
→ New Assigned: $200
```

### Example 2: Set to 3-Month Average
```
Category: Entertainment
3 Months of assignments:
  • Month 1: $50
  • Month 2: $75
  • Month 3: $60
Average: $61.67
→ Click "Set to 3-month avg"
→ New Assigned: $61.67 (or $62 rounded)
```

### Example 3: Quick Zero
```
Category: Dining Out
Current Assigned: $100
→ Click "Zero out"
→ New Assigned: $0
```

## Real-World Workflow

### Scenario: Monthly Budget Review (Before Quick Assign)
1. Click on category assignment field
2. Look back at last month (mental math or switching months)
3. Type the number
4. Repeat for 10-20 categories
5. **Time: 10-15 minutes**

### Scenario: Monthly Budget Review (With Quick Assign)
1. Right-click category → Press L
2. Right-click next category → Press A
3. Right-click next category → Press Z
4. Repeat for 10-20 categories
5. **Time: 2-3 minutes** ✨

## Understanding What Each Option Does

### Set to Last Month (L)
- **Best for:** Recurring expenses that stay the same month-to-month
- **Examples:** Rent, insurance, utilities, phone bill
- **Data source:** Previous month's assigned amount
- **What if last month is missing:** Returns $0

### Set to 3-Month Average (A)
- **Best for:** Variable expenses with seasonal patterns
- **Examples:** Groceries, gas, dining, entertainment
- **Data source:** Average of assigned amounts from past 3 months
- **What if fewer than 3 months exist:** Averages available months only
- **Rounds to:** 2 decimal places (standard currency)

### Zero Out (Z)
- **Best for:** Starting fresh or pausing a category
- **Examples:** Discretionary categories, seasonal expenses
- **Data source:** Sets to exactly $0
- **Safe:** Full undo with Ctrl+Z if you change your mind

## Important Notes

### ✅ Undo/Redo Works!
- Changed your mind? Press **Ctrl+Z** to undo
- Or **Ctrl+Y** to redo the action
- Each quick-assign logs a full undo entry
- Example: "Set 'Groceries' to last month's assigned ($200.00)"

### ✅ Real-Time Updates
- Activity amounts recalculate instantly
- Available balance updates immediately
- "Ready to Assign" total refreshes
- No manual refresh needed

### ✅ Cross-Month Safe
- Works correctly even at month boundaries
- Handles missing months gracefully
- Safe to use on first-time budgets

### ⚠️ Shortcuts Only Work When Menu is Open
- Right-click first to open context menu
- Then press L, A, or Z
- Shortcuts are **case-insensitive** (l = L)
- If you're typing in an input field, shortcuts won't activate

## Keyboard Shortcuts Reference

From the Budget page, click **Shortcuts** button to see:
```
L         Set category to last month's assigned (right-click menu)
A         Set category to 3-month average (right-click menu)
Z         Zero out category (right-click menu)
```

## Tips & Tricks

### 💡 Tip 1: Use for Consistency
Set all similar categories to their averages to create a stable baseline each month.

### 💡 Tip 2: Combine with Other Tools
1. Set base amount with "Set to average"
2. Manually tweak if needed
3. Use "Move Money" for final adjustments

### 💡 Tip 3: Start of Month Routine
1. Copy last month's assignments to current month (use L on each)
2. Adjust as needed based on plans/changes
3. Done in minutes instead of hours

### 💡 Tip 4: Recovery from Overspending
1. Use "Zero out" on overspent categories
2. Rebuild them with "Set to average"
3. Prevents same overspend pattern repeating

### 💡 Tip 5: Seasonal Adjustments
1. Use "Set to average" (3-month average is seasonal-aware!)
2. Manually increase/decrease for upcoming season
3. Next quarter, use "average" again for balance

## Troubleshooting

### Problem: "Set to last month" shows $0
**Cause:** You're on your first budget month (no previous month data)
**Solution:** Manually set the amount, then next month use "Set to last month"

### Problem: Keyboard shortcut didn't work
**Cause:** Context menu wasn't open or you were typing in a field
**Solution:** Right-click category first, then press the key. Don't click anything else.

### Problem: Changed my mind about the assignment
**Cause:** Already did the quick-assign and want the old value back
**Solution:** Press **Ctrl+Z** to undo instantly

### Problem: 3-month average seems wrong
**Cause:** Some months may not have data yet
**Solution:** The average uses only available months. As you build history, it becomes more accurate.

## Comparison to YNAB

| Feature | YNAB | BlankSlate |
|---------|------|-----------|
| Set to last month | ✓ Click | ✓ Right-click + L |
| Average (2mo) | ✓ Yes | ✓ 3-month average |
| Zero out | ✓ Click | ✓ Right-click + Z |
| Undo/Redo | ✓ Yes | ✓ Yes with Ctrl+Z |
| Keyboard shortcuts | Limited | ✓ L, A, Z |
| Time to budget | 15-20 min | 2-3 min |

## Keyboard Shortcuts Cheat Sheet

```
Right-Click Context Menu:
├─ L → Set to last month
├─ A → Set to 3-month average  
├─ Z → Zero out
│
Other useful shortcuts on Budget page:
├─ Ctrl+Z → Undo last action
├─ Ctrl+Y → Redo last action
```

## Next Steps

1. **Try it now:** Open your budget and right-click a category
2. **Learn the keys:** Press L, A, or Z to get familiar
3. **Speed up:** Use for your next monthly budget review
4. **Share feedback:** Let us know what would help further!
