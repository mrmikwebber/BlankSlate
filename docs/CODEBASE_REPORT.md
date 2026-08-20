# BlankSlate — Codebase Report

_Generated 2026-08-09. This is a snapshot, not living documentation — code moves faster than this file will. Verify against source before relying on specifics._

BlankSlate is a personal zero-based budgeting (ZBB) app: Next.js 15 (App Router) + Supabase (Postgres, Auth, RLS), built and maintained by one person, using YNAB as a design reference point rather than a spec. It's a hands-on side project — features get added opportunistically when a gap in the owner's own workflow shows up, not against a roadmap.

---

## 1. Stack & shape

- **Framework**: Next.js 15.1.9, App Router, React 19, TypeScript, Tailwind (custom "Ledger" OKLCH design system — warm amber-gold accent, `stone` neutrals, no default shadcn teal/slate left).
- **Backend**: Supabase — Postgres with RLS, Supabase Auth, no separate backend service. All server logic lives in Next.js Route Handlers under `src/app/api/`.
- **State**: A handful of React Context providers (see §3), no Redux/Zustand/Query library. Caching is hand-rolled (module-level `Map` in `useBudgetMonth.ts`).
- **AI**: Anthropic SDK, one feature (spending-assistant chat), account-gated (not open to every signed-in user — costs money per call).
- **Bank sync**: SimpleFin Bridge (pull-based, no webhooks). Teller.io was the original integration; fully removed 2026-07-15 after Teller shut down its API — some inert DB columns/tables remain (`teller_enrollments`, `deleted_teller_transactions`, `transactions.teller_transaction_id`), deliberately left rather than dropped.
- **Testing**: Vitest (unit, `tests/`) + Cypress (e2e, `cypress/e2e/`, 17 spec files). No CI pipeline runs either — `.github/workflows/` has exactly one workflow, and it's for release tagging, not tests.
- **Deploy**: Vercel. One cron (`vercel.json`) hits `/api/cron/simplefin-sync` twice daily.

Rough size: ~130 TS/TSX files under `src/`, the four largest being `BudgetTable.tsx` (2,440 lines), `lib/budgetMath.ts` (1,265), `BudgetContext.tsx` (1,186), `AccountDetails.tsx` (1,107), `AccountContext.tsx` (1,044).

---

## 2. Data model

Normalized Postgres schema (migrated off a single JSONB blob in migration 001; the blob table is long gone). Core tables:

| Table | Purpose |
|---|---|
| `budgets` | One row per "budget" a user owns — supports multiple (see §6, Fresh Start). Has `archived_at`. |
| `category_groups` | `id, name, sort_order, notes, budget_id, user_id` |
| `category_items` | `id, group_id, name, sort_order, snoozed, target (jsonb), notes, notes_history, is_discretionary_pool, hide_from_insights` |
| `budget_assignments` | `category_item_id, month, assigned` — the only source of truth for "assigned" money |
| `global_assignments` | Shadow assigned amounts for Global planning mode (never touches `budget_assignments`) |
| `planned_income` | Per-month planned income figure, used by Global mode's projection |
| `accounts` | `id, name, type ("credit"\|"debit"), issuer` |
| `transactions` | `id, account_id, date, payee, category, category_group, category_item_id, balance, cleared, approved, pending, entered_early, original_balance, simplefin_transaction_id` |
| `simplefin_connections` / `simplefin_account_links` | One connection per user; per-account link table mapping SimpleFin accounts to `accounts` rows |
| `deleted_simplefin_transactions` | Tombstone table so a user-deleted transaction doesn't get silently re-imported on next sync |
| `transaction_payees` | Saved payee autocomplete list, `last_used_at`-ranked |

Migrations live in `supabase/migrations/`, numbered 001–017 (no 005 — gap, not a bug). Notable ones:
- `010_backfill_category_item_id.sql` — one-time repair for a period where the UI wrote the legacy `category`/`category_group` text but not the real `category_item_id` FK.
- `015_pending_transactions.sql`, `017_entered_early_transactions.sql` — the bank-pending / "review early" flow (see §5).
- `016_global_planning.sql` — Global planning mode.

**Important architectural fact**: `transactions.category`/`category_group` are a **denormalized, display-only copy**. The budget calc engine only ever reads `category_item_id`. This split has bitten the app twice historically (a whole class of "activity shows $0 even though it's categorized" bugs came from the UI writing the text fields but not the FK) and was the reason renaming/moving a category needed an explicit cascade-update to the transactions table (added this session — see §5) so the text labels don't go stale forever.

---

## 3. Frontend architecture — providers and data flow

Single root layout (`src/app/layout.tsx`) wraps the **entire app** in one persistent provider tree (no per-route layouts), in this order:

```
DarkModeProvider
 └ AuthProvider
    └ BudgetSelectionProvider   (which budget is "current")
       └ UndoRedoProvider
          └ AccountProvider     (accounts + transactions)
             └ BudgetProvider   (category/assignment/RTA math — reads AccountContext)
```

Order matters: `BudgetProvider` calls `useAccountContext()` internally, so `AccountProvider` **must** stay its ancestor — this is why `AccountContext.tsx` can never call `useBudgetContext()` back (would be a context that doesn't exist yet from its position in the tree). Every place `AccountContext` needs to tell the budget layer "something changed," it either (a) relies on the calling **component** (which sits below both providers) to call `invalidateAll()` itself, or (b) — the fallback added this session — calls a plain, context-free module function (`invalidateAllCachedMonths()`) directly.

Because there's only one root layout, all client-side navigation (`router.push`) is a real SPA transition — no provider remounts between `/dashboard`, `/accounts/[id]`, `/spending`, etc. This matters: bugs in this app are almost never "state didn't survive navigation," they're "a mutation forgot to invalidate the *other* context's cache" (see §8, item 1 — this exact bug was fixed today).

### `BudgetContext.tsx` — the calc/mutation layer
- Wraps `useBudgetMonth(currentMonth)` (see below) and layers optimistic-update mutations on top: `patchAssigned`, `moveMoney`, category CRUD, rename, reorder, cross-group move, targets, snooze, notes, Global-mode assignment, planned income.
- **Optimistic pattern** (used by nearly every mutation here as of today): patch `budgetView` locally and instantly via `applyMutationResult()`, fire the real request, reconcile with the authoritative response, roll back on failure. Money-affecting mutations (`patchAssigned`, `moveMoney`) also call `patchRTAForward()` since RTA cascades sequentially into every *later* cached month.
- Also exposes deprecated "shim" fields (`budgetData`, `setBudgetData`, etc.) for components not yet migrated to the real `ComputedMonthView` shape — explicitly marked deprecated in the source, not actually removed.

### `useBudgetMonth.ts` — the fetch/cache layer
- A **module-level** `Map<month, ComputedMonthView>` cache, shared across every hook instance app-wide (not per-component). `invalidateAllCachedMonths()` / `invalidateCachedMonth()` / `setCachedView()` / `getCachedView()` are plain exported functions — callable from anywhere, no React context needed.
- `patchRTAForward(fromMonth, newRTA)` re-walks every *cached* month at or after `fromMonth`, recomputing each from its own already-known income/overspend/assigned components. Idempotent by construction (safe to call once optimistically, again with the server's real value).
- De-dupes in-flight fetches per month (`pendingFetches`), rejects stale responses via a monotonic `version` field on `ComputedMonthView`.

### `AccountContext.tsx` — accounts + transactions
- Owns the `accounts` array (each with embedded `transactions[]`), all direct Supabase CRUD for both, and a full undo/redo action registry (via `UndoRedoContext`) for every mutation — add/edit/delete transaction, add/delete account, bulk delete, transfers (mirrored transaction pairs across two accounts).
- Local `localStorage`-backed manual account ordering (drag-to-reorder), independent of any server-side sort column.
- SimpleFin sync results land here via realtime Postgres subscription (`transactions` INSERT → `refreshSingleAccount`).

### Responsive split
Three real, mostly-independent implementations per breakpoint, not one responsive component:
- **Mobile** (`< 768px`): `MobileDashboardShell.tsx` + `mainpage/tabs/Mobile*.tsx` (Overview, Budget, Accounts, Transactions, Activity). Explicitly the least-polished layer — the owner has flagged mobile UX as a known gap but deliberately deferred deeper work there.
- **Tablet** (`768–1279px`): `TabletRail.tsx` (icon rail) + shared components.
- **Desktop** (`≥ 1280px`): `SidebarPanel.tsx` + main content, both always visible.

Adding a new nav destination means touching all of: `TabletView`/`TabType` unions, `MobileTabBar`, `TabletRail`, `SidebarPanel` `NAV_ITEMS`, and `dashboard/page.tsx`'s view switches — five places, every time, no shared registry. `AccountDetails.tsx` sidesteps this for the new "All Accounts" view (see §5) by piggybacking on the existing `/accounts/[id]` dynamic route with `id === "all"` instead of registering a sixth nav destination.

---

## 4. The budget calc engine (`lib/budgetMath.ts`)

The one file where correctness really matters — pure functions, no I/O, fully unit-testable (and heavily tested: `tests/budgetMath.test.ts` is 1,372 lines, ~26 top-level test cases covering multi-month RTA, credit card activity, overspending carry, target computation, reconciliation exclusion).

Key ideas:
- **`available = assigned + activity + max(cumulative_from_past, 0)`** per category, per month.
- **Ready to Assign is computed sequentially, per month** — not one global number. Each month's RTA = previous month's RTA + this month's own RTA-category income − previous month's own fresh *debit-only* cash overspending (applied exactly once, the month after it happens, permanently) − this month's own assignments. This took two false starts to land correctly (see git history / prior session notes) and was reverse-engineered against real exported YNAB data, not derived from a spec. Practical implication: navigating to a past month shows *that month's own* historical RTA, and future pre-assignment never retroactively changes an earlier month's number.
- **Credit Card Payments** is a special group, computed via a funded-spend/payment-pool model (`computeCreditCardActivityByAccount`), not a naive transaction sum — `activity = fundedSpending + payments` by construction (asserted in tests). Its items are linked to `accounts` **by exact name string match**, not a real foreign key (`ccItemToAccountId`) — a real fragility point, see §8.
- Reconciliation adjustments are excluded from budget math via an explicit `category_group === "Reconciliation (Hidden)"` check on the transaction, not by relying on `category_item_id` being null (a real bug was found and fixed here previously — a reconciliation row could get wrongly linked to a real category item by the migration-010 backfill).
- `computeBudgetState` fills `allMonths` contiguously (earliest data → 24 months past latest), so an untouched future month still correctly projects RTA forward rather than reading as a hard reset to $0.

`serializeMonthView()` is the projection boundary — turns internal `MonthState` into the `ComputedMonthView` shape the frontend actually consumes (`src/types/budget.ts`), including the "Assigned in Future" preview subtraction that only applies when serializing *today's* month.

---

## 5. Feature inventory

**Budget table** (`BudgetTable.tsx`, 2,440 lines) — the main envelope-budgeting grid. Group/item CRUD, drag-and-drop reorder *and* cross-group move (fixed this session — previously silently no-op'd), inline assign editing with quick-assign (last month / 3-month average / zero), targets, notes, snooze, Move Money popover, category deletion with fund-reassignment, Credit Card Payments special-casing throughout.

**Accounts & transactions** (`AccountDetails.tsx`, `InlineTransactionRow.tsx`) — per-account register with inline add/edit, bulk select/delete, search, sort, reconcile-to-real-balance, right-click context menu (edit/duplicate/delete/approve), keyboard shortcuts. Also serves the new **All Accounts view** (`/accounts/all` — reuses this same component as a synthetic "virtual account" that flattens every account's transactions, tagged by their real owning account for every per-row action).

**Pending / entered-early transactions** — SimpleFin-synced pending (bank-unposted) transactions get their own collapsible register section instead of sitting inline. A "Review" action lets the user categorize and finalize one *before* it posts (`entered_early` flag); the sync logic then matches the eventual real post against it (same account, exact amount, within a 5-day window) instead of inserting a duplicate — updating in place and flagging an "Amount changed" badge if the posted amount differs (e.g. a tip added after the fact). Institution-side id churn on posting (a documented SimpleFin quirk) is the reason this exists at all.

**SimpleFin sync** (`src/lib/simplefinSync.ts`, `src/lib/simplefin.ts`) — one-way pull, manual "Sync Now" + twice-daily cron. Dedupes via `simplefin_transaction_id` + a tombstone table for user-deleted transactions. Never overwrites `category`/`category_group`/`category_item_id`/`approved` on a re-synced row — that's the user's own work.

**Discretionary / "Safe to Spend"** (`tabs/DiscretionaryTab.tsx`, `hooks/useDiscretionaryPools.ts`, `utils/discretionaryMath.ts`) — a pace-of-spend view (`remaining / daysLeft`) layered directly on top of a category's real `available`, redesigned once already to remove a parallel "fake ceiling" bookkeeping system (`discretionary_target` et al. — now inert DB columns, code no longer reads them). Maintains its **own** local optimistic-override layer, independent of `BudgetContext`'s — a second `useBudgetMonth` instance under the hood, a pattern to be aware of if it drifts out of sync again.

**Multi-budget / Fresh Start** (`api/budgets/`, `api/budget/fresh-start/`, `/archived/[budgetId]`) — a whole subsystem not covered elsewhere in this report until now: a user can archive their current budget under a name and start a genuinely new one, with category *structure* (not money) copied forward and account opening balances re-seeded (real SimpleFin balance pull for linked accounts, carried-forward derived balance for manual ones). Archived budgets stay fully browsable read-only at `/archived/[budgetId]` via a snapshot route. `getCurrentBudgetId()` (`src/lib/budgets.ts`) lazily creates a user's first budget on first access — there's no separate signup-provisioning step.

**Global planning mode** — a second, shadow "assigned" per item/month (`global_assignments`, never touching real `budget_assignments`), for pre-planning without committing money. Deliberately single-month, non-cascading — shipped with that limitation accepted, not a bug.

**YNAB import** (`src/lib/ynabImport.ts`, `YnabImportDialog.tsx`) — parses real YNAB register/plan CSV exports; also the tool used to reverse-engineer the RTA formula against real historical data.

**Monthly Audit** (`MonthlyAuditModal.tsx`) — end-of-month review modal (nags via a pulsing navbar button in the last 6 days of the month).

**Spending Assistant** (`ChatPanel.tsx`, `api/chat/spending-assistant/`, `src/lib/spendingAssistantContext.ts`) — Claude Haiku, streamed, scoped to current month + last 90 days of transactions, system-prompt-only context (no tool use). Account-gated (see §7) since every message costs real API spend.

**Admin tools** (`/admin/port-user-data`) — lets an allowlisted admin copy one user's full budget/account/transaction data into another account. Gated the same allowlist-env-var way as the AI assistant.

**Insights** (`totalSpendingTile.tsx`, `/spending`) — spending-pace charts (Recharts), category breakdown, with an explicit exclusion list (`isHiddenFromInsights`) so reimbursed/non-real spending doesn't skew it.

---

## 6. This session's changes (for continuity)

In case this report is read before the corresponding commits are: this session (2026-08-09) added, in order —
1. **All Accounts transaction view** (`/accounts/all`) and a **Pending transaction review flow** with SimpleFin-post matching (migration 017).
2. **"Ask AI" account gating** — the spending assistant is no longer shown/usable by every signed-in user; gated by a new `AI_ASSISTANT_EMAILS`/`AI_ASSISTANT_USER_IDS` allowlist (env vars), enforced server-side in the API route, not just hidden client-side.
3. **Cross-group category drag-and-drop fix** — previously a complete no-op; the API didn't even accept a group change. Now works, with a server + client guard against moving into/out of "Credit Card Payments" (see the name-match fragility above), and a cascade so already-categorized transactions' stale text labels update too.
4. **Optimistic updates for category rename/move/reorder/target** — previously these all round-tripped before the UI reflected anything; now instant, matching the pattern `patchAssigned` already used.
5. **A broad `invalidateAll()` audit** — found and fixed ~6 mutation paths (duplicate transaction, delete transaction via menu/keyboard, bulk delete, new-account creation, the entire mobile add/edit/delete transaction flow) that silently never told `BudgetContext` anything had changed, leaving Ready to Assign/activity visibly stale until a hard refresh.

---

## 7. Security/access notes

- RLS-scoped per `user_id` throughout — the schema already supports multiple independent users with no extra engineering (confirmed, not just assumed, per a prior architecture review).
- Two allowlist-gated surfaces (admin tools, AI assistant), same mechanism (`src/lib/admin.ts`'s `isAllowlistedUser`, `ADMIN_EMAILS`/`AI_ASSISTANT_EMAILS` + `_USER_IDS` env var pairs, each duplicated as a server-only var and a `NEXT_PUBLIC_` client var for UI hiding). **Neither pair is currently set in the production environment** (only `.env.local`) — confirmed via direct check this session. If this is deployed as-is, Admin Tools and Ask AI are effectively broken/hidden in production, not just gated.
- CSP is configured (`next.config.ts`) — `script-src 'self' 'unsafe-inline'` (inline scripts allowed, which is a real relaxation but is needed for the dark-mode flash-prevention inline script in `layout.tsx`; worth knowing this exists before assuming CSP is strict).
- Report Bug / Suggest Feature both file real GitHub issues via a PAT stored in `.env.local` in plaintext (`GITHUB_ISSUE_TOKEN`) — standard for a solo project, just noting it's there.

---

## 8. Known gaps & improvement opportunities

Roughly ordered by how concrete/actionable each one is, not by importance.

1. **`next build` currently fails its own lint gate.** `next.config.ts` sets `eslint.ignoreDuringBuilds: false` (intentional), but a real `next build` run this session hit hard errors (not warnings) in `lib/budgetMath.ts`, `src/app/context/BudgetContext.tsx`, `src/app/mainpage/BudgetTable.tsx`, `src/app/api/budget/month/[month]/route.ts`, `ReadyToAssignBreakdown.tsx`, and `tabs/DiscretionaryTab.tsx` — mostly unused-variable/import errors, one unescaped-entity JSX error. None of these are new; they predate this session's changes. Worth a single cleanup pass since a production build cannot currently succeed as configured. (`npx tsc --noEmit` passes cleanly — this is purely an ESLint-vs-build-gate issue, not a type error.)
2. **No CI.** `.github/workflows/` has one workflow and it's for tagging releases — nothing runs lint/typecheck/vitest/cypress automatically on push or PR. Combined with #1, a broken build could land on `main` unnoticed.
3. **Root directory has ~20 stale implementation-phase markdown files** (`QUICK_ASSIGN_*.md`, `MOBILE_*.md`, `AMOUNT_PREVIEW_*.md`, `DELIVERY_CHECKLIST.md`, `FINAL_VERIFICATION.md`, etc.) — almost certainly leftover scratch docs from earlier feature passes, several plausibly describing pre-redesign versions of Discretionary/mobile that no longer match the code (both were rebuilt since). Worth an audit-and-archive pass; I didn't touch or delete any of them.
4. **`README.md` is still the unedited `create-next-app` boilerplate.** A real one (purpose, architecture, setup) has been "planned" for a while per prior notes but never written. This report (`docs/CODEBASE_REPORT.md`) could seed it.
5. **Two Cypress screenshots for failing scenarios exist** — `categories_crud.cy.ts`: "Delete category with funds (reassignment)" and "Delete group (empty vs non-empty)", both marked `(failed)`, dated Apr 23 2026 (~3.5 months old at time of writing). Unconfirmed whether they still fail — I did not run the Cypress suite this session — but worth a `cy:run` pass given they're specifically about category deletion, an area touched again today (rename/move cascade).
6. **Credit Card Payments ↔ account linkage is a string match, not a foreign key** (`ccItemToAccountId` in `lib/budgetMath.ts`). Two auto-sync hooks (renaming either side follows the other) paper over the common case, but any path that bypasses both — direct DB edits, a future bulk-import feature, a typo'd category created independently — silently breaks the link with zero error surfaced anywhere. A real FK column would remove this whole class of bug permanently.
7. **Undo/redo doesn't force a live budget-view re-render**, only fixed to *not serve stale cache* on the next real fetch (this session, `invalidateAllCachedMonths()` added to `AccountContext.tsx`'s registered undo/redo closures — a plain function call, since that file structurally can't reach `useBudgetContext()`). A user pressing Ctrl+Z on an add/delete transaction may still see a stale Ready to Assign until something else triggers a refetch. Fixing this properly needs either a provider-order change or an event-emitter bridge between the two contexts — bigger than a one-line fix, flagged rather than done.
8. **Historical (pre-this-session) transactions still carry stale `category`/`category_group` text** from renames/moves that happened before the cascade-update existed. The cascade only runs going forward from today. A one-time backfill migration (recompute every transaction's text from its current `category_item_id`, same shape as migration 010) would fully close this, if it matters enough to the user to bother — it's cosmetic-only (budget math is unaffected either way).
9. **No bulk-categorize UI.** `AccountDetails.tsx` has multi-select with bulk-*delete* only. Flagged previously as a gap for anyone doing a large historical import; still true.
10. **Mobile UX is explicitly the least-invested layer** — parallel, simpler implementations of add/edit transaction, no "All Accounts" equivalent, was missing the `invalidateAll()` call entirely until this session. Deliberately deferred by the owner, not an oversight, but worth remembering as the reason mobile and desktop occasionally drift (the missing-invalidate bug above being a concrete example of that drift).
11. **`useDiscretionaryPools` maintains a second, independent optimistic-cache layer** parallel to `BudgetContext`'s. Established as an intentional pattern after a prior bug where two separate `useBudgetMonth`-consuming pieces of state didn't sync — but it's still two sources of truth that *could* drift again under a future change; worth keeping in mind rather than assuming `BudgetContext` alone is authoritative everywhere.
12. **Adding a new top-level nav destination touches 5 files with no shared registry** (`TabletView`/`TabType` unions, `MobileTabBar`, `TabletRail`, `SidebarPanel`, `dashboard/page.tsx`). Low-severity but a recurring source of "forgot one breakpoint" bugs historically (Settings once shipped to two breakpoints and not the third). A small `NAV_ITEMS` config consumed by all three shells would remove the duplication.
13. **Inert-but-undropped schema**: `teller_enrollments`, `deleted_teller_transactions`, `transactions.teller_transaction_id`, `discretionary_target`, `discretionary_opening_spent(_month)`, `discretionary_scheduled_charges`. All deliberate ("leave schema, remove code") rather than accidental — just consolidating the list here since it's scattered across several past sessions' context. Fine to leave; a future consolidation migration could drop them in one pass if the schema ever needs tidying for a new-developer's sake.

---

## 9. Where to look next time

- Budget math bug → start in `lib/budgetMath.ts` + `tests/budgetMath.test.ts` (write a failing test against real exported data before touching the implementation — this file's history shows guessing from "it looks like double counting" reasoning alone has been wrong before).
- A number not updating on screen → check whether the mutation path calls `invalidateAll()` (component-level, from `useBudgetContext()`) — this was the single most common bug class fixed this session, across five separate call sites.
- Something works on desktop, not mobile (or vice versa) → check whether the mobile tab component independently re-implements the same mutation instead of sharing the desktop one; they usually do.
