# Keyboard Shortcuts Guide

## Overview
BlankSlate now includes comprehensive keyboard shortcuts to speed up your budgeting workflow. Press `?` at any time to view the keyboard shortcuts help dialog.

## Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| `←` (Left Arrow) | Go to previous month |
| `→` (Right Arrow) | Go to next month |

## Action Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+N` | Add new transaction (opens account selector) |
| `Ctrl+M` / `Cmd+M` | Open Move Money modal (Budget page) |
| `Ctrl+F` / `Cmd+F` | Toggle filter cycling (Budget page) |
| `Ctrl+Z` / `Cmd+Z` | Undo last action |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo last action |
| `?` | Show/hide keyboard shortcuts help dialog |

## Quick Assign Shortcuts (Right-Click Menu)

When you right-click on a category to open the context menu, you can use these single-letter shortcuts:

| Shortcut | Action |
|----------|--------|
| `L` | Set category to last month's assigned amount |
| `A` | Set category to 3-month average |
| `Z` | Zero out category |

## Implementation Details

### New Hook: `useGlobalKeyboardShortcuts`
Located in `src/app/hooks/useGlobalKeyboardShortcuts.ts`, this hook provides a reusable way to add global keyboard shortcuts to any component.

**Features:**
- Automatically prevents shortcuts from triggering when typing in input fields
- Respects open dialogs (doesn't trigger shortcuts when a dialog is open)
- Customizable callbacks for each shortcut
- Can be enabled/disabled via `enabled` prop

**Usage:**
```tsx
useGlobalKeyboardShortcuts({
  onAddTransaction: () => { /* handle */ },
  onMoveMoney: () => { /* handle */ },
  onToggleFilter: () => { /* handle */ },
  onNextMonth: () => { /* handle */ },
  onPrevMonth: () => { /* handle */ },
  onShowHelp: () => { /* handle */ },
  enabled: true,
});
```

### Budget Page Keyboard Shortcuts
- Ctrl+N opens an account selector to add a transaction to any account
- Ctrl+F cycles through filters: All → Money Available → Overspent → etc.
- Ctrl+M opens the Move Money modal for the first category with available funds
- Arrow keys navigate between months
- ? opens the keyboard shortcuts help dialog

### Account Details Page Keyboard Shortcuts
- Ctrl+N opens the Add Transaction form (quick access to that specific account)
- Arrow keys navigate between transactions

### Help Modal
A comprehensive help dialog displays all available keyboard shortcuts with visual keyboard icons. Accessible via:
- Clicking the `?` button in the toolbar
- Pressing the `?` key
- Pressing the same key or Escape to close

## Technical Notes

1. **Smart Enabling**: The global shortcuts are disabled when:
   - A context menu is open (category context, group context, or delete confirmation)
   - The Move Money modal is open (to avoid conflicts)
   - Any dialog is open (detected via `[role="dialog"]`)

2. **Dialog Detection**: Uses the HTML role attribute to detect open dialogs, so all UI dialogs must have `role="dialog"` set.

3. **Input Safety**: Shortcuts are disabled when the user is typing in:
   - Input fields (`<input>`)
   - Text areas (`<textarea>`)
   - Contenteditable elements

4. **Mac/Windows Compatibility**:
   - Uses both `ctrlKey` and `metaKey` for cross-platform compatibility
   - Ctrl+Y and Cmd+Shift+Z both work for redo

## Future Enhancements

Possible additions:
- Ctrl+Shift+D for duplicate transaction
- Ctrl+E for edit selected transaction
- Ctrl+K for command palette (fuzzy search)
- Number keys (1-6) for quick filter selection
- Alt+N for next month, Alt+P for previous month
- Customizable shortcuts per user preference
