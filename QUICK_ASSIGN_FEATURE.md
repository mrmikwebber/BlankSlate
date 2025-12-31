# Quick Assign Feature - Implementation Summary

## Overview
Implemented YNAB-inspired quick assignment operations to reduce clicks for common budget category operations. Users can now set category assignments to last month's amount, 3-month average, or zero out with a right-click context menu or keyboard shortcuts.

## Features Implemented

### 1. Context Menu Quick Actions
Right-click on any budget category item to see three new quick-assign options with **inline amount preview**:
- **Set to last month** - Shows what last month's amount was
- **Set to 3-month avg** - Shows the calculated 3-month average
- **Zero out** - Shows $0.00

**UI Details:**
- Teal highlight for "Set to last month" 
- Blue highlight for "Set to 3-month avg"
- Orange highlight for "Zero out"
- **Each option displays the resulting amount** (calculated in real-time)
- Separator divider between quick actions and other menu items (Rename, Delete)
- Dark mode support with appropriate color adjustments
- Wider menu to accommodate amounts without text wrapping

### 2. Keyboard Shortcuts
When a category context menu is open, use single-letter shortcuts:
- **L** - Set to last month's assigned
- **A** - Set to 3-month average
- **Z** - Zero out

**Behavior:**
- Shortcuts only work when context menu is open (categoryContext is active)
- Prevent triggers when typing in input/textarea fields
- Do not interfere with Ctrl+Z (Undo) or other OS shortcuts
- Context menu closes automatically after action

### 3. Undo/Redo Support
All quick-assign operations are fully integrated with the undo/redo system:
- Each operation registers with descriptive messages: "Set 'Groceries' to last month's assigned ($150.00)"
- Full state restoration on undo
- Works with Ctrl+Z and Ctrl+Y (or Cmd equivalents)

### 4. Keyboard Shortcuts Modal
Updated the Budget page keyboard shortcuts modal to document the new quick-assign shortcuts:
- "L" → Set category to last month's assigned (right-click menu)
- "A" → Set category to 3-month average (right-click menu)  
- "Z" → Zero out category (right-click menu)

## Implementation Details

### Helper Functions (BudgetTable.tsx)

#### `getLastMonthAssigned(groupName, itemName)`
- Calculates previous month key using date-fns `subMonths`
- Returns the assigned amount from last month's data
- Fallback to 0 if month doesn't exist

#### `getThreeMonthAverageAssigned(groupName, itemName)`
- Loops back 3 months from current month
- Accumulates assigned amounts for each month available
- Returns rounded average (2 decimal places)
- Handles missing months gracefully

#### `handleQuickAssign(groupName, itemName, mode)`
- Applies the assignment change immediately
- Registers undo/redo action with proper state restoration
- Recalculates:
  - Activity for the category (via `calculateActivityForMonth`)
  - Cumulative available (via `getCumulativeAvailable`)
  - New available balance
  - Credit card payment activities
- Updates "Ready to Assign" total
- Marks budget as dirty for auto-save
- Adds entry to recent changes timeline

### State Management
- Leverages existing BudgetContext for budget data
- Uses existing undo/redo system (UndoRedoContext)
- Maintains same calculation patterns as manual assignments
- Dirty flag triggers auto-save to Supabase

### Context Menu Structure
```
┌──────────────────────────────────┐
│ Set to last month      $200.00   │ ← Teal, with amount preview
│ Set to 3-month avg     $190.00   │ ← Blue, with amount preview
│ Zero out                $0.00    │ ← Orange, with amount preview
├──────────────────────────────────┤
│ Rename category                  │ ← Gray
├──────────────────────────────────┤
│ Delete category                  │ ← Red (or unavailable)
└──────────────────────────────────┘
```

**Amount Display:**
- Calculated in real-time when menu opens
- Shows currency format ($0.00)
- Monospace font for alignment
- Muted color (slate-500) for secondary information
- Uses existing helper functions for calculations

## Technical Stack
- **Date calculations:** date-fns (subMonths, format, parse)
- **State updates:** React useCallback, useState
- **Undo/Redo:** Custom UndoRedoContext with async actions
- **Styling:** Tailwind CSS with dark mode support
- **Event handling:** Keyboard event listeners with proper cleanup

## Edge Cases Handled
1. **Missing previous months:** Returns 0 instead of error
2. **Fewer than 3 months of history:** Averages only available months
3. **Credit Card Payments category:** Recalculates activities after assignment
4. **Real-time calculations:** Live updates for activity and available amounts
5. **Multiple months affected:** Refreshes RTA for all months
6. **Typing in inputs:** Shortcuts ignored to allow normal text input

## User Benefits
✅ **Speed:** 1-3 clicks vs 5+ for manual assignment
✅ **Less cognitive load:** No need to remember previous amounts
✅ **Predictable budgeting:** Easy to maintain consistent patterns
✅ **Safe:** Full undo/redo support
✅ **Discoverable:** Keyboard shortcuts listed in help modal
✅ **Accessible:** Works without mouse (keyboard shortcuts)

## Testing Checklist
- [ ] Right-click context menu appears on category items
- [ ] "Set to last month" calculates correct value from previous month
- [ ] "Set to 3-month avg" averages last 3 months correctly
- [ ] "Zero out" sets assigned to 0
- [ ] Keyboard shortcuts (L, A, Z) work when menu is open
- [ ] Shortcuts close menu after execution
- [ ] Undo/Redo work for all three operations
- [ ] Activity and available balances recalculate correctly
- [ ] RTA updates after quick-assign
- [ ] Works across month boundaries
- [ ] Dark mode colors display correctly
- [ ] Mobile/touch-friendly for long-press context menus
- [ ] No interference with Ctrl+Z, Ctrl+A, etc.

## File Changes

### e:\\Github\\BlankSlate\\src\\app\\mainpage\\BudgetTable.tsx
**Imports Added:**
```tsx
import { subMonths, format, parse } from "date-fns";
```

**New Functions:**
- `getLastMonthAssigned()` - Helper to fetch previous month's assigned
- `getThreeMonthAverageAssigned()` - Helper to calculate 3-month average
- `handleQuickAssign()` - Main function to apply assignment changes

**Context Menu Enhanced:**
- Added three quick-assign buttons (Set Last Month, Set Avg, Zero Out)
- Updated styling with colors and separators
- Dark mode support

**Keyboard Handler Added:**
- useEffect hook for L, A, Z shortcuts
- Only active when categoryContext is open
- Prevents interference with input fields

**Shortcuts Modal Updated:**
- Added three new keyboard shortcuts to the modal display

### No Breaking Changes
- All existing functionality preserved
- No database schema changes
- No new context providers needed
- Backward compatible with existing undo/redo system

## Future Enhancement Ideas
1. **Move money shortcuts:** "Shift+M" to open move money modal directly
2. **Bulk operations:** Select multiple categories and apply operations
3. **Smart defaults:** "Set to 3mo avg" as default on new budget month
4. **Quick notes:** Press "N" to add note to category
5. **Target shortcuts:** "T" to set amount to target
6. **Copy to all:** Replicate a category's assignment across months
