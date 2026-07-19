import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// A status tag — colored dot + label, subtle tint background, rounded-md
// (not a full pill). Deliberately distinct from the generic filled-pill
// badge every SaaS dashboard ships; the dot carries the color so text stays
// legible without needing a saturated fill.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        positive:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400",
        negative:
          "border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-400",
        warning:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400",
        brand:
          "border-ledger-200 bg-ledger-50 text-ledger-700 dark:border-ledger-800/60 dark:bg-ledger-950/40 dark:text-ledger-400",
        info:
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-400",
        neutral:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

const dotVariants = cva("h-1.5 w-1.5 rounded-full flex-shrink-0", {
  variants: {
    variant: {
      positive: "bg-emerald-500",
      negative: "bg-red-500",
      warning: "bg-amber-500",
      brand: "bg-ledger-500",
      info: "bg-sky-500",
      neutral: "bg-slate-400 dark:bg-slate-500",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Hide the leading status dot — for badges that already carry an icon. */
  hideDot?: boolean
}

function Badge({ className, variant, hideDot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {!hideDot && <span className={cn(dotVariants({ variant }))} />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
