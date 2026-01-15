"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Target, ChevronLeft } from "lucide-react";

type RoadmapStatus = "completed" | "in-progress" | "planned";

interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapStatus;
  description: string;
  details: string[];
}

const roadmapItems: RoadmapItem[] = [
  {
    id: "multi-currency",
    title: "Multi-Currency Support",
    status: "planned",
    description: "Support for multiple currencies with automatic conversion rates",
    details: [
      "Add multiple currencies to accounts",
      "Real-time exchange rate updates",
      "Budget in your preferred currency",
      "Historical rate tracking for accuracy",
    ],
  },
  {
    id: "mobile-app",
    title: "Native Mobile Apps",
    status: "planned",
    description: "iOS and Android apps for on-the-go budgeting",
    details: [
      "Full feature parity with web app",
      "Offline mode support",
      "Biometric authentication",
      "Push notifications for budget alerts",
    ],
  },
  {
    id: "bank-sync",
    title: "Bank Account Sync",
    status: "planned",
    description: "Automatically import transactions from your bank",
    details: [
      "Connect via Plaid/Teller",
      "Auto-categorization with ML",
      "Daily balance sync",
      "Support for 10,000+ institutions",
    ],
  },
  {
    id: "goals",
    title: "Savings Goals",
    status: "in-progress",
    description: "Set and track progress toward financial goals",
    details: [
      "Create multiple savings goals",
      "Visual progress tracking",
      "Auto-contribute from Ready to Assign",
      "Goal milestones and celebrations",
    ],
  },
  {
    id: "reports",
    title: "Advanced Reports",
    status: "in-progress",
    description: "Detailed spending analysis and trends",
    details: [
      "Monthly/yearly spending reports",
      "Category breakdowns with charts",
      "Net worth tracking over time",
      "Export to PDF/CSV",
    ],
  },
  {
    id: "ynab-import",
    title: "YNAB CSV Import",
    status: "completed",
    description: "Import your existing YNAB budget data",
    details: [
      "Import Register and Plan CSV files",
      "Automatic category mapping",
      "Transaction history preserved",
      "Undo/confirm import workflow",
    ],
  },
  {
    id: "dark-mode",
    title: "Dark Mode",
    status: "completed",
    description: "System-aware dark mode theme",
    details: [
      "Toggle between light/dark themes",
      "Respects system preferences",
      "All pages fully themed",
      "Persistent user preference",
    ],
  },
  {
    id: "undo-redo",
    title: "Undo/Redo System",
    status: "completed",
    description: "Full undo/redo for budget operations",
    details: [
      "Unlimited undo history",
      "Keyboard shortcuts (Ctrl+Z, Ctrl+Y)",
      "Action descriptions in UI",
      "Transaction-level granularity",
    ],
  },
  {
    id: "credit-cards",
    title: "Credit Card Payments",
    status: "completed",
    description: "Smart credit card payment tracking",
    details: [
      "Auto-calculated payment amounts",
      "Transfer detection from checking",
      "Activity-based balance updates",
      "Payment scheduling support",
    ],
  },
  {
    id: "recurring",
    title: "Recurring Transactions",
    status: "planned",
    description: "Automate your regular expenses and income",
    details: [
      "Set up recurring templates",
      "Flexible frequency options",
      "Auto-create or prompt before adding",
      "Edit future occurrences",
    ],
  },
  {
    id: "shared-budgets",
    title: "Shared Budgets",
    status: "planned",
    description: "Share and collaborate on budgets with family",
    details: [
      "Invite users via email",
      "Role-based permissions",
      "Real-time sync across devices",
      "Activity feed for changes",
    ],
  },
  {
    id: "spending-alerts",
    title: "Smart Spending Alerts",
    status: "planned",
    description: "Get notified before you overspend",
    details: [
      "Category budget threshold alerts",
      "Unusual spending pattern detection",
      "Weekly/monthly summaries via email",
      "Customizable notification preferences",
    ],
  },
  {
    id: "receipts",
    title: "Receipt Scanning & Attachments",
    status: "planned",
    description: "Attach receipts and documents to transactions",
    details: [
      "Photo upload from mobile/desktop",
      "OCR for automatic amount detection",
      "Secure cloud storage",
      "Search by attachment content",
    ],
  },
  {
    id: "debt-payoff",
    title: "Debt Payoff Planner",
    status: "planned",
    description: "Plan and track your debt elimination strategy",
    details: [
      "Snowball vs avalanche method comparison",
      "Payoff timeline visualization",
      "Interest savings calculator",
      "Progress tracking and milestones",
    ],
  },
  {
    id: "split-transactions",
    title: "Split Transactions",
    status: "planned",
    description: "Divide a single transaction across multiple categories",
    details: [
      "Split by percentage or fixed amount",
      "Visual split breakdown in UI",
      "Accurate category reporting",
      "Edit splits after creation",
    ],
  },
  {
    id: "budget-templates",
    title: "Budget Templates",
    status: "planned",
    description: "Start with pre-built budget structures",
    details: [
      "Common budget category setups",
      "Income-based recommendations",
      "50/30/20 rule templates",
      "Import from community templates",
    ],
  },
  {
    id: "investment-tracking",
    title: "Investment Account Tracking",
    status: "planned",
    description: "Track your investment accounts and net worth",
    details: [
      "Manual investment account entry",
      "Net worth dashboard",
      "Historical performance charts",
      "Asset allocation breakdown",
    ],
  },
  {
    id: "tags",
    title: "Transaction Tags",
    status: "planned",
    description: "Add custom tags for flexible organization",
    details: [
      "Create unlimited custom tags",
      "Multi-tag per transaction",
      "Filter and search by tags",
      "Tag-based reports and insights",
    ],
  },
  {
    id: "bill-reminders",
    title: "Bill Reminders",
    status: "planned",
    description: "Never miss a payment with smart reminders",
    details: [
      "Set due dates for bills",
      "Email/push notifications",
      "Mark as paid from reminder",
      "Track payment history",
    ],
  },
  {
    id: "reconciliation",
    title: "Account Reconciliation",
    status: "planned",
    description: "Match your budget with bank statements",
    details: [
      "Side-by-side statement comparison",
      "Mark transactions as cleared",
      "Identify discrepancies easily",
      "Monthly reconciliation reports",
    ],
  },
  {
    id: "custom-reports",
    title: "Custom Report Builder",
    status: "planned",
    description: "Create personalized financial reports",
    details: [
      "Drag-and-drop report designer",
      "Filter by date, category, tags",
      "Save and share custom reports",
      "Schedule automated report emails",
    ],
  },
  {
    id: "rollover",
    title: "Budget Rollover Options",
    status: "planned",
    description: "Control how unused budget funds carry forward",
    details: [
      "Per-category rollover rules",
      "Cap rollover amounts",
      "Auto-rollover vs manual",
      "Visual rollover indicators",
    ],
  },
  {
    id: "export-backup",
    title: "Advanced Export & Backup",
    status: "planned",
    description: "Export your data in multiple formats",
    details: [
      "Export to Excel, CSV, JSON",
      "Scheduled automatic backups",
      "Restore from backup files",
      "Selective data export options",
    ],
  },
];

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950",
    border: "border-emerald-200 dark:border-emerald-800",
    label: "Completed",
  },
  "in-progress": {
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950",
    border: "border-amber-200 dark:border-amber-800",
    label: "In Progress",
  },
  planned: {
    icon: Target,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900",
    border: "border-slate-200 dark:border-slate-700",
    label: "Planned",
  },
};

export default function RoadmapPage() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 mb-4 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            Product Roadmap
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
            See what we're building next. Hover over any feature to learn more about the details.
          </p>
        </div>
      </div>

      {/* Roadmap Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Status Legend */}
        <div className="flex flex-wrap gap-4 mb-8 justify-center">
          {Object.entries(statusConfig).map(([status, config]) => {
            const Icon = config.icon;
            return (
              <div
                key={status}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <Icon className={`h-4 w-4 ${config.color}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roadmapItems.map((item) => {
            const config = statusConfig[item.status];
            const Icon = config.icon;
            const isHovered = hoveredItem === item.id;

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`
                  relative rounded-xl border-2 p-6 transition-all duration-300 cursor-pointer
                  ${config.bg} ${config.border}
                  ${isHovered ? "shadow-xl scale-105 z-10" : "shadow-md"}
                  bg-white dark:bg-slate-800
                `}
              >
                {/* Status Badge */}
                <div className="mb-4">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.border} border`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    <span className={`text-xs font-semibold ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {item.description}
                </p>

                {/* Details (shown on hover) */}
                <div
                  className={`
                    transition-all duration-300 overflow-hidden
                    ${isHovered ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
                  `}
                >
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                      Key Features
                    </h4>
                    <ul className="space-y-2">
                      {item.details.map((detail, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                        >
                          <span className="text-teal-600 dark:text-teal-400 mt-0.5">•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Roadmap is subject to change based on user feedback and priorities.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Have a feature request?{" "}
            <Link
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                // Navigate to dashboard and trigger the suggestion modal via URL or event
                window.location.href = "/dashboard";
              }}
              className="text-teal-600 dark:text-teal-400 hover:underline"
            >
              Use the "Suggest Feature" button in the navbar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
