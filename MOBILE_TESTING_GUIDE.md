# Testing the Mobile Dashboard Layout

## Quick Start Testing

### Method 1: Browser DevTools (Easiest)
1. Open the dashboard in your browser
2. Press `F12` to open DevTools
3. Click the **responsive design mode** toggle (or `Ctrl+Shift+M`)
4. Set width to something < 768px (e.g., 375px for iPhone SE, 414px for iPhone 12)
5. You should see the mobile layout with:
   - Account carousel at top
   - Tabbed content in middle
   - 4 tabs at bottom

### Method 2: Physical Device
1. Deploy the app or access localhost on your phone
2. Open the dashboard
3. You should automatically see the mobile layout
4. Test on various phones (iPhone, Android)

### Method 3: Viewport Sizes to Test
```
iPhone SE:        375x667  ← Smallest common
iPhone 12:        390x844  ← Standard modern
iPhone 14 Pro:    430x932  ← Larger
iPad Mini:        768x1024 ← Breakpoint edge
iPad Air:         820x1180 ← Desktop breakpoint
Desktop:          1440x900 ← Full desktop
```

## Feature Testing Checklist

### ✅ Layout & Navigation
- [ ] Mobile layout appears below 768px width
- [ ] Desktop layout appears at 768px and above
- [ ] Tab bar is visible at bottom of screen
- [ ] Account carousel is visible at top
- [ ] No horizontal scroll (except carousel)
- [ ] No content hidden behind tab bar

### ✅ Tab Navigation
- [ ] All 4 tabs are clickable: Overview, Budget, Activity, Transactions
- [ ] Clicking a tab switches the view instantly
- [ ] Active tab shows a teal border/background at top
- [ ] Non-active tabs appear grayed out
- [ ] Tab icons and labels are visible
- [ ] Tabs are touch-friendly (large enough to tap)

### ✅ Overview Tab
- [ ] 4 metric cards display (Ready to Assign, Total Spending, Balances, Accounts)
- [ ] Amounts are formatted as currency (e.g., $3,500.20)
- [ ] Pie chart displays if spending data exists
- [ ] Pie chart is readable on mobile (not too large)
- [ ] Top 5 categories list displays with amounts
- [ ] Colors are distinct (teal for positive, red for spending)

### ✅ Budget Tab
- [ ] Month navigation shows current month
- [ ] Can navigate to previous/next months
- [ ] Ready to Assign amount displays prominently
- [ ] Category groups are expandable (click to expand/collapse)
- [ ] Expanded groups show category items
- [ ] Each category shows: Name, Available amount, Assigned, Activity, Progress bar
- [ ] Color-coded status badges display (if category has target)
- [ ] Add category buttons work within each group
- [ ] Progress bars fill based on spending percentage

### ✅ Activity Tab
- [ ] Recent budget changes display
- [ ] Recent transactions display
- [ ] Combined list is sorted by date (newest first)
- [ ] Each item shows: Icon, description/payee, time since (e.g., "2 hours ago")
- [ ] Transactions show amount with color (red for spending, green for income)
- [ ] List scrolls if content overflows

### ✅ Transactions Tab
- [ ] All transactions from all accounts display
- [ ] Sorted by date (newest first)
- [ ] Each transaction shows: Payee, Category badge, Account badge, Amount, Date
- [ ] Amounts are color-coded (red for negative, green for positive)
- [ ] Account badges show which account (e.g., "Checking", "Credit Card")
- [ ] Category badges show transaction category (e.g., "Groceries")
- [ ] Scrolls smoothly for many transactions

### ✅ Account Carousel
- [ ] All accounts display horizontally
- [ ] Can scroll left/right (swipe or buttons)
- [ ] Previous/Next buttons appear when needed
- [ ] Cards are properly sized
- [ ] Account names and balances display
- [ ] Cards are clickable (if implemented for account detail view)

### ✅ Data Accuracy
- [ ] Account balances match context data
- [ ] Budget amounts are correct
- [ ] Spending totals are accurate
- [ ] Categories display correct items
- [ ] Ready to Assign amount is calculated correctly
- [ ] No data duplication or missing items

### ✅ Responsive Behavior
- [ ] Rotating phone landscape → portrait switches layouts correctly
- [ ] Resizing window smoothly transitions between mobile/desktop
- [ ] No content overlap or alignment issues
- [ ] Spacing adjusts appropriately for screen size
- [ ] Scrolling is smooth (no jank)

### ✅ Touch Interactions
- [ ] Buttons have adequate touch targets (44px minimum)
- [ ] Tapping a tab feels responsive
- [ ] Scrolling feels natural
- [ ] No "flashing" or visual lag during interactions
- [ ] Pull-to-refresh works (if implemented)

### ✅ Visual Polish
- [ ] Rounded corners on cards are visible
- [ ] Gradients on key cards display nicely
- [ ] Text is readable (good contrast)
- [ ] Icons are clear and appropriately sized
- [ ] Colors match the design system (teal, slate, red)
- [ ] No text overflow or truncation (unless intentional)

### ✅ Desktop Layout (Unchanged)
- [ ] Desktop view still shows at 768px and above
- [ ] All existing desktop components work
- [ ] Sidebar, budget table, and activity feed all display
- [ ] No regression in desktop functionality

## Automated Testing Examples

### Cypress Example (if using Cypress)
```typescript
describe('Mobile Dashboard', () => {
  beforeEach(() => {
    cy.viewport('iphone-12');
    cy.visit('/dashboard');
  });

  it('should show mobile shell on small screens', () => {
    cy.get('[data-testid="mobile-dashboard-shell"]').should('be.visible');
  });

  it('should hide desktop layout on small screens', () => {
    cy.get('[data-testid="desktop-dashboard"]').should('not.be.visible');
  });

  it('should display all 4 tabs', () => {
    cy.get('[data-testid="tab-overview"]').should('be.visible');
    cy.get('[data-testid="tab-budget"]').should('be.visible');
    cy.get('[data-testid="tab-activity"]').should('be.visible');
    cy.get('[data-testid="tab-transactions"]').should('be.visible');
  });

  it('should switch tabs when clicked', () => {
    cy.get('[data-testid="tab-budget"]').click();
    cy.get('[data-testid="budget-tab-content"]').should('be.visible');
  });
});
```

### Vitest Example (if using Vitest)
```typescript
import { render, screen } from '@testing-library/react';
import MobileDashboardShell from '@/app/mainpage/MobileDashboardShell';

describe('MobileDashboardShell', () => {
  it('renders all tab buttons', () => {
    render(<MobileDashboardShell />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('displays overview tab by default', () => {
    render(<MobileDashboardShell />);
    expect(screen.getByText('Overview')).toHaveClass('text-teal-600');
  });
});
```

## Performance Testing

### Lighthouse (Chrome DevTools)
1. Open DevTools → Lighthouse tab
2. Select "Mobile" device
3. Run audit
4. Check scores for:
   - **Performance**: Should be > 90
   - **Accessibility**: Should be > 90
   - **Best Practices**: Should be > 90

### Manual Performance Checks
1. **Tab Switching**: Should be instant (no lag)
2. **Scrolling**: Should be smooth (60fps)
3. **Carousel Scrolling**: Should feel fluid
4. **Chart Rendering**: Pie chart should load quickly
5. **Data Updates**: Recent changes should reflect instantly

## Common Issues & Troubleshooting

### Issue: Mobile layout doesn't appear
**Solution**: Check viewport width is < 768px. In DevTools, confirm width < 768.

### Issue: Tab bar covers content
**Solution**: Ensure scrollable content has `pb-24` (bottom padding). Check `MobileDashboardShell.tsx`.

### Issue: Carousel items too small
**Solution**: Carousel uses `w-72` class. Adjust if needed in `AccountCarousel.tsx`.

### Issue: Data not showing
**Solution**: Verify context providers are loaded. Check browser console for errors.

### Issue: Responsive mode shows desktop layout
**Solution**: Refresh page after changing viewport size (sometimes DevTools needs refresh).

## Browser Compatibility Testing

Test on:
- ✅ Chrome/Chromium (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Safari on iOS (latest)
- ✅ Chrome on Android (latest)

## Landscape vs Portrait

Test orientation changes:
1. Open mobile layout in landscape mode
2. Verify it still works (may show more columns)
3. Rotate back to portrait
4. Verify layout returns to normal

## Accessibility Testing

- [ ] Tab through controls using keyboard
- [ ] All buttons are focusable
- [ ] Focus outline is visible
- [ ] Screen reader announces tabs correctly
- [ ] Color contrast is sufficient (WCAG AA minimum)
- [ ] Form labels are associated with inputs

## Screen Reader Testing (e.g., NVDA, JAWS, VoiceOver)

1. Enable screen reader
2. Navigate to dashboard
3. Verify announces "Mobile Dashboard Shell"
4. Tab to tabs and verify announces active tab
5. Navigate through content and verify announces amounts
6. Check all interactive elements are announced

## Final Sign-Off Checklist

Before marking as complete:

- [ ] All feature tests pass
- [ ] No console errors
- [ ] No broken styling
- [ ] Data accuracy verified
- [ ] Touch interactions smooth
- [ ] Accessibility acceptable
- [ ] Performance acceptable (Lighthouse > 90)
- [ ] Works on real phone (at least one device)
- [ ] Desktop layout still works
- [ ] No breaking changes
