# Blankslate – Final Steps Before “Real Users”

This is the checklist to get Blankslate into a place where you’d feel okay letting strangers sign up and store their budgets.

Use it as a living doc – check things off, add notes, adjust as you go.

---

## 0. Ground Rules

- [ ] **Prod ≠ Dev**  
  - Separate Supabase projects (dev vs prod).
  - Separate env files (`.env.local` vs `.env.production`).
- [ ] **No secrets in git**  
  - `.env*` in `.gitignore`.
  - Search repo for `key`, `secret`, `supabase`, `token` and ensure nothing sensitive is committed.

---

## 1. Testing & Quality

### 1.1 Unit & Integration (Vitest)

- [ ] `npm run test` passes locally.
- [ ] `npm run test:coverage` shows:
  - [ ] Core budget math (RTA, category balances, month rollovers) ≥ **80%** coverage.
  - [ ] Credit card logic (payments, refunds, overspend) has explicit tests.
  - [ ] Transaction add/edit/delete across months has tests.

### 1.2 E2E (Cypress)

- [ ] Cypress “happy path” smoke tests:
  - [ ] Sign up / login flow.
  - [ ] Create a budget.
  - [ ] Add categories.
  - [ ] Add/edit/delete transactions.
  - [ ] Switch months and verify RTA & category balances.
- [ ] Core regression tests for bugs you’ve already hit:
  - [ ] Assigned values not carrying over incorrectly.
  - [ ] Category deletion with reassignment.
  - [ ] Credit card refund + payment scenarios.

### 1.3 CI

- [ ] GitHub Actions (or similar) pipeline:
  - [ ] Runs `npm run lint` + `npm run test` on PRs.
  - [ ] Optionally runs Cypress on main (or before deploy).

---

## 2. Security & Data Isolation

### 2.1 Auth & Multi-tenancy

- [ ] All main entities have a `user_id` (or equivalent):
  - [ ] budgets
  - [ ] accounts
  - [ ] categories / category groups
  - [ ] transactions
- [ ] **RLS policies** enabled on every user-data table:
  - [ ] `SELECT/INSERT/UPDATE/DELETE` restricted to `auth.uid() = user_id`.
- [ ] No queries in code that rely only on arbitrary IDs without scoping to user:
  - [ ] Always query like `WHERE id = $id AND user_id = $currentUserId`.

### 2.2 Input Validation (Zod Everywhere)

- [ ] Zod schemas defined for:
  - [ ] Transactions (add/edit)
  - [ ] Categories
  - [ ] Accounts
  - [ ] Budget month-level actions
- [ ] All API routes / server actions:
  - [ ] Parse input through a Zod schema (`schema.parse(...)` or `safeParse`).
  - [ ] On validation failure, return a clean 4xx response (no raw stack trace).
- [ ] Form-level validation:
  - [ ] Show field-level errors or at least a “Something’s off, please check your inputs” message.

### 2.3 Secrets & Tokens

- [ ] All Supabase keys and future bank-sync keys are:
  - [ ] Only in env vars, never committed.
  - [ ] Not logged anywhere.
- [ ] Client uses **anon/public key**, server uses service role key where absolutely needed (and never in browser bundle).

---

## 3. App Hardening & Infra

### 3.1 Security Headers & Cookies

- [ ] Basic headers set (via Next config / middleware / hosting platform):
  - [ ] `X-Frame-Options: DENY`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `Referrer-Policy: strict-origin-when-cross-origin`
  - [ ] Simple `Content-Security-Policy` (no wild `*` for scripts if possible).
- [ ] Any auth/session cookies:
  - [ ] `Secure`
  - [ ] `HttpOnly`
  - [ ] `SameSite=Lax` or `Strict`

### 3.2 Error Handling & Logging

- [ ] Global error boundary / error page for the app.
- [ ] API routes:
  - [ ] Never send stack traces to the client in production.
  - [ ] Log errors server-side with:
    - route name
    - user id (if available)
    - error message
- [ ] Optional: Sentry (or similar) wired up for:
  - [ ] Frontend errors
  - [ ] Backend errors

### 3.3 Database Safety

- [ ] Dev DB and Prod DB are separate.
- [ ] Schema changes go through migrations (not manual console edits).
- [ ] Backups:
  - [ ] Automatic backups enabled in prod (Supabase config).
  - [ ] You know how to restore from a backup.

### 3.4 Rate Limiting

- [ ] Basic rate limiting on:
  - [ ] Login/signup endpoints.
  - [ ] Any public unauthenticated endpoints.
- [ ] If you expose any public API: per-IP or per-user request caps.

---

## 4. Product & UX Polish (MVP-Level)

- [ ] Onboarding:
  - [ ] New user lands somewhere useful (e.g. “Set up your first budget”).
  - [ ] Clear empty states (no cryptic blank screens).
- [ ] Transaction UX:
  - [ ] Adding a transaction feels reasonably fast (no obvious jank).
  - [ ] Clear errors on failure (“Couldn’t save transaction, please try again.”).
- [ ] Money math:
  - [ ] Values stored in cents/integers in DB (no floating-point drift).
  - [ ] RTA + category totals match expectations on a few hand-checked test budgets.

---

## 5. Privacy, Legal & User Trust

- [ ] **Privacy Policy** page:
  - [ ] What data you store (email, budgets, etc.).
  - [ ] What you do with it (no selling, analytic usage, etc.).
  - [ ] How users can request deletion.
- [ ] **Terms of Service** page:
  - [ ] “Not financial advice, no guarantees.”
  - [ ] Limitation of liability.
- [ ] Data export:
  - [ ] Users can export at least transactions + categories (e.g. CSV).
- [ ] Account deletion:
  - [ ] Either a simple in-app delete flow, or
  - [ ] Clear instructions (“Email X and we’ll delete all your data.”).

---

## 6. Monitoring & Launch Checklist

### 6.1 Monitoring

- [ ] Uptime check on main app URL.
- [ ] Basic logging of:
  - [ ] 4xx / 5xx rates per route.
  - [ ] DB errors.
- [ ] Optional alert:
  - [ ] If 5xx errors spike beyond a threshold, you get notified.

### 6.2 “Before First Stranger Signs Up”

- [ ] [ ] Run full test suite (`test`, `test:coverage`, Cypress).
- [ ] [ ] Test sign up → create budget → add transactions on **prod** with a test account.
- [ ] [ ] Confirm RLS is working by:
  - Creating two users
  - Verifying user A cannot see any of user B’s data at the API/DB level.
- [ ] [ ] Click through the whole app on mobile and desktop to ensure nothing is completely broken.

---

## 7. Notes / Parking Lot

Use this section for things you want *later* but not blocking MVP:

- [ ] Better statement-import / CSV-import tooling.
- [ ] UI polish / animations.
- [ ] More granular audit logging of transaction changes.
- [ ] Bank-sync integration & its own security pass.

---

Once most of this is checked off, you’re not “perfectly secure forever,” but you’re well past the bar that most indie SaaS ever hit before letting people in.

 Auto-focus new category name input

When user selects ➕ Add New Category... in the category dropdown, automatically focus tx-new-category-input.

 Auto-focus new category group name input

When user selects ➕ Add New Category Group... in the group dropdown, automatically focus tx-new-category-group-input.

 Auto-select group dropdown after typing new category name

When user finishes typing a new category name and presses Enter:

If no group is selected, move focus to tx-category-group-select.

If a group is already selected, treat Enter as “confirm new category” (submit if other fields are valid).

 Enter-to-save from new category inputs

From tx-new-category-input and tx-new-category-group-input:

Enter (when all required fields are valid) → triggers the same flow as clicking the ✓ submit button.

Esc → cancels new-category mode and returns to the normal category dropdown.

 Type-to-search inside category dropdown

Allow typing while tx-item-select is focused to jump/filter by:

category item name (Dining, Water, etc.)

optionally group names as well (Bills, Fun).

(Implementation detail: either native <select> type-ahead, or replace with a custom searchable combo-box later.)

 Auto-suggest category names from transaction history

When opening Add New Category:

Pre-fill tx-new-category-input with the most common category used for this payee (if any), OR

Show a small suggestion list below based on recent txs with the same payee.

 Keyboard shortcut to trigger “New Category”

While the transaction row is active:

e.g. Shift + C → toggles newCategoryMode = true and focuses tx-new-category-input.

Consider showing a small hint like New Category (Shift+C) near the dropdown or in a help tooltip.
