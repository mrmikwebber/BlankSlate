# Mobile Dashboard Layout Implementation

## Overview

A complete mobile-first responsive dashboard layout has been added to BlankSlate. The implementation provides a **dedicated mobile experience** for screens below the `md` breakpoint (768px), while preserving the existing desktop layout for larger screens.

## Architecture

### Two Layout System
- **Mobile Layout** (`md:hidden`): Active on screens < 768px
- **Desktop Layout** (`hidden md:block`): Active on screens ≥ 768px

Both layouts share the same data and business logic through existing context providers (`BudgetContext`, `AccountContext`), eliminating code duplication.

### New Components

#### 1. **MobileDashboardShell** (`MobileDashboardShell.tsx`)
Main container component that orchestrates the mobile layout structure:
- **Top Section**: Account carousel with scroll navigation
- **Middle Section**: Scrollable tabbed content area
- **Bottom Section**: Fixed tab navigation bar

#### 2. **AccountCarousel** (`AccountCarousel.tsx`)
Horizontal scrollable carousel for account cards:
- Displays all accounts in a horizontally scrollable container
- Auto-hide scrollbar for clean appearance
- Previous/next navigation buttons
- Snap-scroll for smooth touch interaction
- Reuses existing `AccountCardCompact` component

#### 3. **MobileTabBar** (`MobileTabBar.tsx`)
Bottom navigation bar with 4 tabs:
- **Overview**: Dashboard summary with metrics and charts
- **Budget**: Collapsible budget categories
- **Activity**: Recent changes and transactions
- **Transactions**: Full transaction list
- Touch-friendly button sizes (44px+ minimum)
- Visual feedback on active tab

#### 4. **Tab Content Components** (`tabs/` folder)

##### **MobileOverviewTab.tsx**
Summary view with:
- Key metrics cards (Ready to Assign, Total Spending, Balances, Account Count)
- Spending distribution pie chart
- Top 5 spending categories list

##### **MobileBudgetTab.tsx**
Budget view with:
- Month navigation (`MonthNav`)
- Ready to Assign amount in prominent gradient card
- Expandable category groups
- Per-category breakdown with available/activity/assigned details
- Color-coded progress bars
- Add category functionality

##### **MobileActivityTab.tsx**
Activity stream with:
- Combined recent budget changes and transactions
- Time-since formatting
- Transaction type icons and visual differentiation

##### **MobileTransactionsTab.tsx**
Transaction list with:
- All transactions from all accounts, sorted by date
- Category and account badges
- Amount color-coding (red for spending, green for income)
- Full date display

## Responsive Breakpoints

```tsx
// Mobile layout (default)
<div className="md:hidden">
  <MobileDashboardShell />
</div>

// Desktop layout
<div className="hidden md:block">
  {/* Existing desktop components */}
</div>
```

## Data & State Management

All components reuse existing data providers:

```tsx
// Budget data
const { currentMonth, budgetData, getCumulativeAvailable } = useBudgetContext();

// Account data
const { accounts, recentTransactions } = useAccountContext();

// Recent activity
const { recentChanges } = useBudgetContext();
```

**No new data fetching logic was added** — everything flows through existing context.

## Styling Approach

### Tailwind Classes Used
- **Spacing**: `pb-24` (bottom padding for tab bar) on scrollable content
- **Responsive**: `md:hidden` / `hidden md:block` for layout gating
- **Touch UX**: Larger buttons, increased tap targets
- **Mobile-first**: Card-based design with rounded corners
- **Overflow**: `overflow-y-auto` for scrollable sections, `overflow-x-auto` for carousel

### Key Mobile-Specific Details
1. **Safe Area**: Accounts for notches and home indicators (via `safe-area-inset-bottom`)
2. **Tab Bar Height**: Optimized for mobile interaction (56px = 7rem equivalent)
3. **Rounded Corners**: `rounded-t-3xl` for modern iOS-style sheet appearance
4. **Gradients**: Gradient cards for visual hierarchy (Overview tab metrics, Budget "Ready to Assign")
5. **Bottom Padding**: `pb-24` on content ensures items don't get hidden behind fixed tab bar

## Reused Components & Logic

The mobile layout doesn't duplicate code. Instead, it wraps existing components:

| Mobile Component | Reused Existing Components |
|---|---|
| MobileOverviewTab | None (custom calculations from context) |
| MobileBudgetTab | `MonthNav`, `AddCategoryButton` |
| MobileActivityTab | None (uses context data directly) |
| MobileTransactionsTab | None (uses context data directly) |
| AccountCarousel | `AccountCardCompact` |

All business logic stays in:
- `BudgetContext.tsx` — Budget calculations, category management
- `AccountContext.tsx` — Account and transaction management
- `getTargetStatus.js` — Target status determination

## Usage

### For Users
1. View the dashboard on a phone or in responsive mode < 768px width
2. Tap tabs at the bottom to switch between views
3. Scroll horizontally through account cards at the top
4. Expand/collapse budget categories for details

### For Developers
1. Add new tab: Create new component in `tabs/` folder and add to `MobileDashboardShell` switch statement
2. Add new metric: Update relevant tab component (e.g., `MobileOverviewTab`)
3. Change mobile-specific styling: Edit Tailwind classes in component files
4. Update business logic: Modify context providers (no mobile-specific logic needed)

## Performance

- **Code Splitting**: Mobile components are bundled with the app but only rendered via `md:hidden`
- **No Waterfall**: All data from existing providers (no additional API calls)
- **Scroll Performance**: Native CSS overflow with no custom scroll handlers
- **Re-renders**: Minimal — only active tab content re-renders on tab change

## Browser Support

- iOS Safari 14+
- Android Chrome 90+
- All modern mobile browsers

## Testing Checklist

- [ ] Verify mobile layout shows at < 768px width
- [ ] Verify desktop layout shows at ≥ 768px width
- [ ] Tab switching works smoothly
- [ ] Account carousel scrolls horizontally
- [ ] Budget categories expand/collapse
- [ ] Bottom tab bar doesn't cover content
- [ ] All data displays correctly (no missing amounts or categories)
- [ ] Charts (pie chart) render on mobile
- [ ] Touch interactions feel responsive

## Future Enhancements

1. **Swipe Navigation**: Add gesture-based tab switching
2. **Pull-to-Refresh**: Implement data refresh on overview tab
3. **Quick Actions**: Add floating action button for common operations
4. **Search**: Add search/filter for transactions
5. **Customizable Tabs**: Allow users to reorder or hide tabs
6. **Dark Mode**: Add dark theme support for mobile

## File Structure

```
src/app/mainpage/
├── MobileDashboardShell.tsx          # Main mobile container
├── AccountCarousel.tsx               # Account carousel
├── MobileTabBar.tsx                  # Bottom tab navigation
├── tabs/
│   ├── MobileOverviewTab.tsx         # Summary/metrics view
│   ├── MobileBudgetTab.tsx           # Budget categories view
│   ├── MobileActivityTab.tsx         # Recent activity view
│   └── MobileTransactionsTab.tsx     # Transaction list view
└── [existing components unchanged]

src/app/dashboard/
└── page.tsx                          # Updated with breakpoint gating
```

## Migration Notes

**No breaking changes.** The mobile layout is added alongside the existing desktop layout using CSS breakpoints:
- No changes to existing component APIs
- No changes to context structure
- No changes to data flow
- Existing desktop users unaffected
