# Blank Slate — Discretionary Safe-to-Spend Spec

## Purpose

A discretionary-spending view that answers one question at the moment of impulse:
**"How much can I spend today / this week without blowing my target?"**

The number must be correct **passively** — no manual entry, no reconciliation, readable
cold after days of neglect. This is not envelope budgeting. There is no funding ritual and
no month-end reconciliation. The allowance is *derived at read time*, never stored.

---

## Core concepts

- **Discretionary pools** — opt-in categories the user marks as discretionary (e.g. Drinks,
  Groceries, Entertainment). Only these appear in the discretionary view. Bills, rent,
  minimums, and the avalanche payment are **not** pools — they live in scheduled outflows.
- **Target** — each pool has a monthly target (e.g. Entertainment = $1,000). A target is a
  *soft goal you can move*, not a hard-funded allocation. Moving a target is a shuffle (below).
- **Fungibility is user-defined** — pools are fungible only insofar as the user shuffles
  between them. The app does NOT auto-move money and does NOT rank pools by importance.
  If the user puts Groceries in the discretionary view, they've decided it's fungible; the
  app respects that without judgment.

---

## Phase 1 — Core (stateless, ship first)

### The allowance (derived, never stored)

Computed fresh on every screen load, per pool:

```
remaining   = target − spent_this_period − upcoming_scheduled_this_period
days_left   = days remaining in period, inclusive of today
daily       = remaining / days_left
weekly      = daily * min(7, days_left)      # rolling 7-day figure
```

- `period` = calendar month by default. (Pay-cycle is a valid alternative; pick one and be
  consistent. Month is simpler because targets are already monthly.)
- `upcoming_scheduled_this_period` = any known future-dated charges tagged to this pool that
  fall before period end (e.g. a Spotify charge on the 25th). **Pre-deduct these** so the
  daily number never overstates by the amount of a subscription that hasn't hit yet.
- The number changing every day — and even intra-day as you spend — is intended, not a bug.

### Overspend → negative (do NOT clamp)

- If `spent > target`, the pool shows a **negative** allowance. Show it honestly.
- Do **not** auto-bleed a negative pool into the other pools. Pools are independent. The fix
  for a negative pool is a manual shuffle (below) — the user decides, the app doesn't.
- Also display a **total discretionary** figure = sum across pools. This is the honest
  aggregate; individual pool numbers are the per-intent breakdown.

### Zero

- `remaining == 0` → allowance reads **$0**. Meaning: stop, or shuffle. No spending here
  until the user acts.

### Shuffle (move target between pools)

- Moving target dollars from one pool to another. **Free and unjudged** — no directional
  friction, no "are you sure you want to raid groceries." The user's categorization already
  decided these are fungible.
- The ONLY friction is **showing the consequence**: after a shuffle, display the resulting
  daily/weekly for every affected pool. e.g. moving $50 Groceries → Drinks shows
  "Groceries → $6/day for 15 days." Informing, not blocking.

### Velocity alert (SEPARATE from the allowance — do not conflate)

The allowance answers "what's left, spread over what's left." Velocity answers "at my
current pace, where do I land." Keep them distinct or the number will swing weirdly.

```
days_elapsed  = days into period, inclusive of today
velocity      = spent_this_period / days_elapsed
projected_end = velocity * total_days_in_period
```

- If `projected_end > target`, surface a **warning** (not a changed allowance):
  "At this pace you'll hit $X — over by $Y around the 24th."
- Velocity drives an alert badge. It never changes the daily/weekly number.

### Glanceability constraint

The whole point is a number readable while impulsive. Keep the discretionary view to a small
number of coarse pools (target 3–5). If it grows to eight pools each with two numbers, it has
become the thing it replaced. Daily + weekly per pool, plus a total. That's the screen.

---

## Phase 2 — Targeted day-borrow / commitment device (fast-follow)

> **Why this is phase 2, not phase 1:** the core stores nothing — allowance is pure
> derivation. The default recompute already *spreads* an overspend across all remaining days
> automatically. This feature instead *concentrates* the cost on chosen days (zero out one
> named day, keep the others whole), which requires persisting the choice. It is the first
> stored state in an otherwise stateless system. Ship and live in the core for one cycle
> first — spreading may already be enough.

### Behavior

- User pre-commits a big spend by pulling a future day's allowance onto today.
- Example: Drinks daily = $50 for Jul 15–18. User plans to spend $100 clubbing on the 15th
  and borrows $50 from the 16th. Result: Jul 15 shows $100, Jul 16 shows **$0**, Jul 17 and
  18 stay at $50. Period total unchanged.
- Distinct from the core's automatic spread, which would instead drop 16/17/18 to ~$33 each.
  This version makes the sacrifice a visible, pre-committed plan.

### Data model

```
day_adjustments(
  id,
  pool_id,
  date,
  delta          # signed dollars; borrows sum to zero across the transfer
)
```

- A borrow of $X from `source_day` to `target_day` writes:
  `delta(target_day) += X`, `delta(source_day) −= X`. Sum = 0, so the period total is preserved.
- To zero a day outright: `delta(day) = −base_allowance(day)`.

### Render

```
allowance(day) = base_recompute(day) + net_delta(day)
```

where `net_delta(day)` = sum of that day's adjustment rows. Everything else in Phase 1 is
unchanged; adjustments are a layer applied on top of the derived base.

---

## Phase 1.5 — Mid-month Fresh Start / re-baseline

### The invariant this must respect

**`spent` is ground truth derived from the bank. No budgeting action may reset it.**
A fresh start touches the *plan* (targets, period boundary). It never touches the *facts*
(transactions). A view that says "$0 spent, spend the full $1k" when $700 already left the
account is lying about reality — and passive truth is the app's entire reason to exist. If
`spent` becomes resettable, the number is no longer trustworthy cold, and the app is YNAB again.

### Mechanic

A fresh start is not "forget what I spent." It is **close the current period early, open a new
one.**

- Already-spent transactions stay sealed in the closed sub-period (e.g. Jul 1–15), fully visible.
- The new period (e.g. Jul 16–31) legitimately has `spent = 0` — not because anything was
  wiped, but because no spending has occurred *since* the reset. Time only moves forward.
- This reuses the existing period concept; no special "reset" state or mutation of transactions.

### New target — two cases

- **Carry-forward**: new target = `old_target − spent_so_far`. This is just the normal
  recompute — no feature needed. A fresh start that carries forward is a no-op.
- **Deliberate re-grant**: the new period is consciously given a fresh target (e.g. full
  $1,000 for the back half), accepting a higher monthly total. Legitimate (no paternalism),
  but it **must show the consequence**, exactly like a shuffle:
  > "Fresh start: this half-month gets $1,000. Combined with $700 already spent, July total
  > will be ~$1,700."

### The failure mode this prevents

A fresh start that hides spent-to-date is a **laundering machine**: overspend → reset → clean
slate → repeat. It is the most dangerous possible feature because it directly attacks passive
truth. Neutralized by one rule: **re-plan, never re-fact** — spent-to-date stays on screen
through the transition, and any re-grant displays the combined period total.

---

## Phase 1.5b — Onboarding & the opening-balance primitive

### The unification

New-user onboarding, mid-month fresh start, and creating a category partway through a period
are **the same operation**: *begin a period with a non-zero opening position.* Build one
primitive, not three features. `spent` for a period is:

```
spent_this_period = opening_spent + sum(transactions since tracking began this period)
```

- Existing user doing a fresh start → `opening_spent` derived from the sealed prior period.
- New user → `opening_spent` from bank backfill (preferred) or a manual seed (fallback).
- New category created mid-period → same seed mechanism.

### Does opening_spent violate "spent is never manually entered"?

No. The invariant is that `spent` is not an editable *ongoing* field. An **opening balance is
a one-time boundary seed** — standard ledger accounting. You assert the starting position
once; after that, only real transactions move it. It is set at period start and is not a
running dial the user can spin.

### Onboarding paths

> **Data-provider note:** Teller (the previous ingestion provider) has shut down its API.
> The provider is currently TBD (Plaid / MX / Finicity / manual-CSV under evaluation). Until
> ingestion is re-plumbed, the **manual seed is the primary onboarding path**, not the
> fallback. Keep the backfill path described below provider-agnostic.

- **Aggregator backfill (truest, when a provider is connected).** On account connection, pull
  the current period's transactions (most aggregators return enough history to cover the
  month). Already-spent is *pulled, not typed*. `opening_spent = 0`; it's all real
  transactions. Onboarding work = a one-time categorization pass over this period's
  transactions; payee rules carry it forward after.
- **Manual seed (currently primary).** When no provider is connected, history is too short,
  or a category was created late. User asserts `opening_spent` once. Self-reported and less
  pure, but honest as a starting position — it converges toward truth as real transactions
  accumulate on top, so it stops being load-bearing within a cycle.

### Opening balance resolution (do NOT trigger on emptiness)

**The bug this avoids:** keying the prompt to "category is empty" is a leaky proxy. A user
who spent $600 this period but only manually enters one $10 transaction makes the category
non-empty — the prompt suppresses itself, and the true $600 is silently missing. The number
is then wrong by $600 and the user trusts it. This is the worst failure in the app.

**Also do NOT default `opening_spent` to $0.** For a mid-period manual adoption, $0 asserts
"nothing was spent before tracking," which is usually false. Defaulting to $0 is the app
confidently claiming a number it has no grounds for — the same sin as a fresh-start that
hides spend.

**Correct model:**

- For any category that begins tracking **mid-period without a complete data source**,
  `opening_spent` defaults to **`UNKNOWN`**, not $0.
- While `opening_spent` is `UNKNOWN`, that category's safe-to-spend number is **provisional
  (or withheld)** — *regardless of how many transactions have been entered.* Trigger is
  **"opening balance unresolved," NOT "category empty."** Adding a $10 transaction does not
  resolve it; `spent = UNKNOWN + $10` is still unknown-shaped.
- Resolving is one cheap step: user enters the already-spent figure, or affirms $0 if
  genuinely nothing. Resolution flips the number from provisional to authoritative.
- `opening_spent` stays **editable** after resolution — for the user who reflexively accepts
  a default during onboarding and remembers the real figure later.

**Why this isn't endless nagging:**

- Fires only on **mid-period adoption**. A category that starts tracking on the period
  boundary has `opening_spent = 0` legitimately (period just began; nothing can predate it).
- **Self-extinguishes.** At each period rollover, `opening_spent` resets to 0 for all
  categories — a data source is now running forward, so there is no pre-tracking gap. One-time
  adoption cost, not a recurring prompt.

Example copy (shown while unresolved):

> **Drinks** — we can't tell this number is complete yet. What had you already spent on Drinks
> since [period start]? Enter it, or tap "nothing yet." Until then this figure is provisional.

---

## Explicit non-goals

- No paternalism / no need-vs-want lockouts. The app never blocks a shuffle or a spend on
  moral grounds. Its job is to make the true number visible, not to override the user.
- No funding ritual, no month-end reconciliation, no per-day stored allowances in Phase 1.
- No auto-bleeding negatives between pools. Independent pools + manual shuffle.

## Open decisions to confirm before building

1. **Period**: calendar month (recommended) vs pay cycle. Pick one.
2. **Scheduled discretionary charges**: confirm every recurring debit tagged to a pool is
   modeled and correctly dated — this is the one input that must be right, or the daily
   number lies. (Everything else self-corrects.)
3. **Total-discretionary display**: sum only, or sum + per-pool. Recommended: both.
