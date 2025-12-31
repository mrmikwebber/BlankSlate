# Notes Feature Implementation

## Overview
Added a **Category Notes** feature with append-only history to budget categories and items. This addresses the YNAB pain point of hidden, clunky notes by making them discoverable and easy to update.

## Changes Made

### 1. **Schema Updates** (`src/app/context/BudgetContext.tsx`)
- Added `NoteEntry` interface for tracking notes history
- Extended `BudgetData` type to include optional `notes` and `notes_history` fields on both:
  - Category groups (`name`, `notes`, `notes_history`)
  - Category items (`name`, `notes`, `notes_history`)

### 2. **Context Helpers** (`src/app/context/BudgetContext.tsx`)
- `updateCategoryGroupNote(categoryName, noteText)` - Updates or appends a note to a category group with timestamp
- `updateCategoryItemNote(categoryName, itemName, noteText)` - Updates or appends a note to a category item with timestamp
- Both helpers maintain append-only history and mark data as dirty for auto-save

### 3. **Notes UI Component** (`src/components/ui/NotesPopover.tsx`)
- `NotesPopover` component - Reusable note editor with:
  - **Hover icon** (desktop): Message circle icon, colored when note exists
  - **Tap-to-expand** (mobile): Same popover opens on tap
  - **Inline editor**: Quick note editing with Save/Cancel
  - **History view**: Optional append-only history of all note changes with timestamps
  - **Responsive sizing**: Adjustable trigger button size

### 4. **BudgetTable Integration** (`src/app/mainpage/BudgetTable.tsx`)
- Added import for `NotesPopover`
- Exposed `updateCategoryGroupNote` and `updateCategoryItemNote` from context
- Integrated notes popover into:
  - **Category group rows**: Notes button next to group name
  - **Category item rows**: Notes button next to item name

## Feature Behavior

### Adding/Editing Notes
1. Click the **message icon** next to a category name or item
2. Type or edit your note
3. Click **Save** to persist with timestamp
4. Note icon changes color when a note exists

### Viewing History
1. Open notes popover
2. Click **History** button (if notes exist)
3. View all past notes with their update timestamps
4. Click **Back** to return to editor

### Data Persistence
- Notes are stored in the existing `budget_data` JSONB column (no migration needed)
- Auto-saved when dirty flag is set
- History entries are append-only (immutable)

## Usage Example

```tsx
// In any component with budget context
const { updateCategoryGroupNote, updateCategoryItemNote } = useBudgetContext();

// Save a group note
updateCategoryGroupNote("Bills", "Monthly utility expenses for 2025");

// Save an item note
updateCategoryItemNote("Bills", "Rent", "Landlord: John Doe, account #12345");
```

## UI/UX Notes

- **Desktop**: Notes are discoverable via hover tooltip
- **Mobile**: No hover, so icon is always visible (tap-to-expand)
- **Visual feedback**: Icon color changes (teal) when note exists
- **History preservation**: All edits are tracked automatically
- **Non-intrusive**: Notes don't clutter the budget table
