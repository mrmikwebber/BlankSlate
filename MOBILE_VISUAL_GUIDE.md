# Mobile Dashboard Implementation - Visual Guide

## Screen Layouts

### Mobile View (< 768px)
```
┌──────────────────────────────────────────┐
│         Mobile Dashboard Shell           │
├──────────────────────────────────────────┤
│ ◄─  Account Carousel (Scrollable)  ──►  │
│  ┌──────────────┐ ┌──────────────┐      │
│  │ Checking     │ │ Credit Card  │      │
│  │ $5,234.50    │ │ $1,200.00    │      │
│  └──────────────┘ └──────────────┘      │
├──────────────────────────────────────────┤
│                                          │
│   TAB CONTENT (Overview Selected)        │
│   ┌────────────┬────────────────┐       │
│   │Ready to    │ Total Spending │       │
│   │Assign      │                │       │
│   │$3,500.20   │   $1,234.56    │       │
│   └────────────┴────────────────┘       │
│                                          │
│   ┌─────────────────────────────┐       │
│   │ Spending Distribution       │       │
│   │    [Pie Chart]              │       │
│   └─────────────────────────────┘       │
│                                          │
│   ┌─────────────────────────────┐       │
│   │ Top Categories              │       │
│   │ • Groceries      $324.50    │       │
│   │ • Rent           $1,200.00  │       │
│   │ • Utilities      $89.23     │       │
│   └─────────────────────────────┘       │
│                   [... scrollable ...]   │
│                                          │
├──────────────────────────────────────────┤
│  📊 Overview  📈 Budget  📌 Activity  📋  │
│  (Active)    Transactions                │
└──────────────────────────────────────────┘
```

### Desktop View (≥ 768px) - Unchanged
```
┌──────────────────────────────────────────────────────────┐
│ Recent Activity Sidebar │  Dashboard Content             │
├────────────────────────┼───────────────────────────────┤
│                        │ Accounts:  [Cards]            │
│ • Budget updated       │ ┌──────────────────────────┐  │
│ • Transaction posted   │ │    Budget Table (Full)   │  │
│ • Category added       │ │ Groups, Categories,      │  │
│                        │ │ Amounts, Targets         │  │
│                        │ └──────────────────────────┘  │
│                        │                               │
└────────────────────────┴───────────────────────────────┘
```

## Tab Views Breakdown

### Overview Tab
Shows key metrics and spending patterns:
```
Ready to Assign: $3,500.20      Total Spending: $1,234.56
Account Balances: $8,945.62     Accounts: 4

[Pie Chart - Spending Distribution]

Top Categories:
1. Rent                 $1,200.00
2. Groceries             $324.50
3. Utilities              $89.23
4. Entertainment          $65.99
5. Transportation         $45.00
```

### Budget Tab
Expandable categories with allocation breakdown:
```
Ready to Assign: $3,500.20

▼ Bills (Total Assigned: $1,500.00)
  ├ Rent              $1,200.00 ✓ Available
  │  Assigned: $1,200  Activity: -$1,200  
  │  [████████████░] 100%
  │
  ├ Electricity          $150.00 ✓ Available  
  │  Assigned: $150     Activity: -$89.45
  │  [██████░░░░░░░░░░] 60%
  │
  └ [+ Add to Bills]

▶ Subscriptions (Total Assigned: $450.00)
```

### Activity Tab
Feed of recent changes and transactions:
```
💸 Whole Foods Market        -$52.34
   Groceries • 2 hours ago

📝 Updated grocery budget    
   Budget change • 4 hours ago

💸 Starbucks                 -$5.67
   Groceries • 5 hours ago

📝 Added Entertainment category
   Budget change • 1 day ago
```

### Transactions Tab
Complete transaction history:
```
Whole Foods Market           -$52.34
Groceries | Checking         Dec 15

Paycheck Deposit             +$3,200.00
Ready to Assign | Chase Checking  Dec 15

Amazon                       -$89.99
Shopping | Credit Card       Dec 14

Rent                         -$1,200.00
Bills | Transfer             Dec 1
```

## File Structure & Dependencies

```
src/app/
├── dashboard/
│   └── page.tsx ──────────────────┐
│       • Shows MobileDashboardShell │ on md:hidden
│       • Shows Desktop layout on hidden md:block
│
├── mainpage/
│   ├── MobileDashboardShell.tsx ──→ Imports:
│   │   • AccountCarousel
│   │   • MobileTabBar  
│   │   • Tab components
│   │
│   ├── AccountCarousel.tsx ────────→ Imports:
│   │   • AccountCardCompact (existing)
│   │   • useAccountContext
│   │
│   ├── MobileTabBar.tsx
│   │
│   └── tabs/
│       ├── MobileOverviewTab.tsx ──→ Imports:
│       │   • useBudgetContext
│       │   • useAccountContext
│       │   • PieChart from recharts
│       │
│       ├── MobileBudgetTab.tsx ────→ Imports:
│       │   • useBudgetContext
│       │   • MonthNav
│       │   • getTargetStatus
│       │
│       ├── MobileActivityTab.tsx ──→ Imports:
│       │   • useBudgetContext
│       │   • useAccountContext
│       │   • date-fns
│       │
│       └── MobileTransactionsTab.tsx → Imports:
│           • useAccountContext
│           • date-fns
│
├── context/
│   ├── BudgetContext.tsx (unchanged - reused)
│   └── AccountContext.tsx (unchanged - reused)
│
└── utils/
    └── getTargetStatus.js (unchanged - reused)
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────┐
│        Authentication (AuthContext)         │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌──────────────┐
   │ Budget  │  │ Account │  │ Auth Session │
   │ Context │  │ Context │  │              │
   └────┬────┘  └────┬────┘  └──────────────┘
        │            │
        └────────┬───┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌──────────────────┐  ┌──────────────────────┐
│ Desktop Layout   │  │ Mobile Layout        │
│ (hidden md:block)│  │ (md:hidden)          │
│                  │  │                      │
│ • SidebarPanel   │  │ • MobileDashboardShell
│ • BudgetTable    │  │   • AccountCarousel  
│ • ActivityBar    │  │   • MobileTabBar     
│                  │  │   • Tab Content:     
│                  │  │     - Overview       
│                  │  │     - Budget         
│                  │  │     - Activity       
│                  │  │     - Transactions   
└──────────────────┘  └──────────────────────┘
```

## Component Hierarchy

```
MobileDashboardShell (State: activeTab)
├── AccountCarousel
│   └── AccountCardCompact × N (from context)
│
├── MobileTabBar (receives activeTab, onTabChange)
│
└── Tab Content Router
    ├── MobileOverviewTab (when activeTab === "overview")
    │   ├── Metrics Cards
    │   ├── PieChart (from recharts)
    │   └── Category List
    │
    ├── MobileBudgetTab (when activeTab === "budget")
    │   ├── MonthNav
    │   ├── Ready to Assign Card
    │   └── Category Groups (expandable)
    │       └── Category Items with Progress
    │
    ├── MobileActivityTab (when activeTab === "activity")
    │   └── Activity List Items
    │
    └── MobileTransactionsTab (when activeTab === "transactions")
        └── Transaction List Items
```

## Responsive Classes Reference

```css
/* Layout Gating */
.md:hidden {}        /* Mobile only: < 768px */
.hidden.md:block {}  /* Desktop only: ≥ 768px */

/* Spacing */
.pb-24 {}            /* Bottom padding (for fixed tab bar) */
.px-4 {}             /* Horizontal padding */
.gap-3, .gap-4 {}    /* Gaps between items */

/* Flexbox */
.flex-col {}         /* Vertical stack */
.justify-between {}  /* Space between */
.items-center {}     /* Center vertically */

/* Overflow */
.overflow-y-auto {}  /* Vertical scroll (content) */
.overflow-x-auto {}  /* Horizontal scroll (carousel) */

/* Styling */
.rounded-t-3xl {}    /* Top rounded corners (iOS-style) */
.bg-slate-50 {}      /* Light backgrounds */
.bg-white {}         /* Card/content backgrounds */
.text-sm {}          /* Mobile font sizes */

/* Touch Targets */
.py-3 .px-4 {}       /* 44px+ buttons */
```

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total New Files** | 7 |
| **Total Lines of Code** | ~596 lines |
| **Files Modified** | 1 (dashboard/page.tsx) |
| **Components Reused** | 4 (AccountCardCompact, MonthNav, contexts) |
| **Contexts Used** | 2 (BudgetContext, AccountContext) |
| **New API Routes** | 0 |
| **Breaking Changes** | 0 |
| **Mobile Breakpoint** | 768px (md) |
