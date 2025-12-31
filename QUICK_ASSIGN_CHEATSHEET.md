# Quick Assign Feature - Quick Reference Card

## What's New?
**Quick-assign budget categories with 1 right-click + keyboard shortcut**

## Three New Operations

### Set to Last Month (L)
```
Right-click category → "Set to last month"
Or after right-click: Press L

Menu shows: Set to last month    $200.00  ← See the amount first!

Before: Groceries $150
After:  Groceries $200 (from last month)
```

### Set to 3-Month Average (A)
```
Right-click category → "Set to 3-month avg"
Or after right-click: Press A

Menu shows: Set to 3-month avg    $190.00  ← See the amount first!

Calculation:
  Month 1: $180
  Month 2: $190
  Month 3: $200
  Average: $190

Before: Groceries $150
After:  Groceries $190
```

### Zero Out (Z)
```
Right-click category → "Zero out"
Or after right-click: Press Z

Menu shows: Zero out    $0.00  ← Always zero

Before: Groceries $100
After:  Groceries $0
```

## Usage Flowchart

```
         Start
          |
          ▼
   Right-click category
          |
          ▼
  Context menu appears
          |
    ┌─────┼─────┬────────┐
    |     |     |        |
   [L]   [A]   [Z]  Menu Options
    |     |     |        |
    ▼     ▼     ▼        ▼
  Last  Avg  Zero    Rename/Delete
  Month (3mo) Out
    |     |     |
    └─────┴─────┴────────┐
             |            |
             ▼            ▼
        Menu closes   or click menu item
             |
             ▼
      Category updates
      (with undo/redo)
```

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| **L** | Set to last month | When menu is open |
| **A** | Set to 3-month avg | When menu is open |
| **Z** | Zero out | When menu is open |
| **Ctrl+Z** | Undo last action | Anytime |
| **Ctrl+Y** | Redo last action | Anytime |

## Time Savings

### Old Way
```
Time per category: ~11 seconds
20 categories = 3.67 minutes
```

### New Way
```
Time per category: ~1.5 seconds  
20 categories = 30 seconds (plus adjustments)
Total: 2-3 minutes
Savings: 50-90% faster!
```

## Real-World Example: Monthly Budget Review

### Scenario: Repeating Bills (Same Every Month)
```
Rent: $1,500
├─ Right-click
├─ Press L (Last Month)
└─ Done! Now $1,500

Insurance: $150
├─ Right-click
├─ Press L
└─ Done! Now $150
```

### Scenario: Variable Spending (Use Average)
```
Groceries: $200
├─ Right-click
├─ Press A (Average 3mo)
└─ Done! Now $185 (based on history)

Dining: $100
├─ Right-click
├─ Press A
└─ Done! Now $75
```

### Scenario: Discretionary (Reset to Zero)
```
Entertainment: $50
├─ Right-click
├─ Press Z (Zero)
└─ Done! Now $0
```

## Color Legend

When right-clicking a category:

| Color | Operation | Use Case |
|-------|-----------|----------|
| 🟦 Teal | Set to last month | Fixed expenses |
| 🟦 Blue | Set to 3-month avg | Variable expenses |
| 🟦 Orange | Zero out | Start fresh |
| ⬜ Gray | Rename | Edit category name |
| 🟥 Red | Delete | Remove category |

## Smart Features Built In

✅ **Undo/Redo** - Change your mind? Ctrl+Z to undo
✅ **Auto-calculate** - Activity and Available balance update instantly
✅ **Dark mode** - Colors work in both light and dark themes
✅ **Smart averaging** - Uses available months (handles new budgets)
✅ **No conflicts** - Won't interfere with Ctrl+A, Ctrl+Z, etc.

## Troubleshooting

**Q: "Set to last month" shows $0?**
- You're on month 1. Manually set this month, then next month use "Set to last month"

**Q: Keyboard shortcut didn't work?**
- Right-click first to open menu, then press the key
- Don't click elsewhere before pressing the shortcut

**Q: Want to undo the quick-assign?**
- Press Ctrl+Z immediately

**Q: Does 3-month average include this month?**
- No, it looks back 3 months from today

## Integration with Existing Features

### Works With Undo/Redo
```
Action: Assign categories
  ↓
Can Undo: Ctrl+Z
Can Redo: Ctrl+Y
```

### Works With Auto-Save
```
Quick-assign updates
  ↓
Marks budget as dirty
  ↓
Syncs to Supabase automatically
```

### Works With Activity
```
After quick-assign:
  ├─ Assigned: Updated
  ├─ Activity: Auto-calculated
  ├─ Available: Auto-calculated
  └─ Ready to Assign: Auto-updated
```

## Keyboard Shortcuts Modal

View all shortcuts on Budget page:
```
[Shortcuts] button → Keyboard Shortcuts dialog
├─ Ctrl+Z - Undo last action
├─ Ctrl+Y - Redo last action
├─ L - Set category to last month's assigned (right-click menu)
├─ A - Set category to 3-month average (right-click menu)
└─ Z - Zero out category (right-click menu)
```

## Workflow Examples

### Weekly Budgeting (First Week of Month)
```
1. Copy last month (L for each category) - 1 min
2. Adjust for upcoming expenses - 1 min
3. Review monthly cash flow - 1 min
Total: 3 minutes
```

### Variable Spending Month
```
1. Set to average for stable categories (A) - 30 sec
2. Manually adjust variable ones - 2 min
3. Review Ready to Assign - 1 min
Total: 3.5 minutes
```

### Fresh Start / Catchup Month
```
1. Zero out most categories (Z) - 30 sec
2. Gradually add as you review spending - varies
3. Use average for known amounts (A) - 1 min
Total: Depends on adjustments needed
```

## Desktop vs Mobile

| Device | Method | Notes |
|--------|--------|-------|
| Desktop | Right-click | Works perfectly |
| Laptop | Right-click or trackpad | Full support |
| Tablet | Long-press | Should work (browser dependent) |
| Phone | Long-press | May need custom support |

## FAQ (Quick Answers)

**Q: Why only last month and not last 2 months?**
A: 3-month average is better for variable expenses

**Q: Can I apply this to multiple categories at once?**
A: Not in v1.0, but planned for Phase 2

**Q: Does it save automatically?**
A: Yes, syncs to Supabase automatically

**Q: Is there a global shortcut version?**
A: Not yet - need menu open for now (by design)

**Q: Can I customize the shortcuts?**
A: Not yet - fixed at L, A, Z (future feature)

## Pro Tips

💡 **Tip 1:** Set recurring bills with "L" for quick consistency

💡 **Tip 2:** Use "A" for expenses you track (groceries, gas)

💡 **Tip 3:** Use "Z" then manually increase for categories you'll monitor

💡 **Tip 4:** Do base amounts first (L/A), then adjust with manual input

💡 **Tip 5:** Keep Ctrl+Z ready for quick corrections

## What Didn't Change?

✅ Everything else works exactly the same
✅ Manual assignment still available
✅ Move Money feature still there
✅ Undo/Redo system same as before
✅ Auto-save still works
✅ All calculations unchanged
✅ Database unchanged
✅ Categories/items unchanged

## Getting Started

1. **Try it:** Right-click any category in budget table
2. **Learn:** Explore the context menu options
3. **Speed up:** Press L instead of clicking
4. **Discover:** Check Shortcuts modal for reminder
5. **Master:** Do monthly budgets in 2-3 minutes!

---

**Version 1.0.0** - Initial Release  
Ready to deploy and use immediately!
