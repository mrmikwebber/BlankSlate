import { getDaysInMonth, getDate } from "date-fns";

export interface PoolAllowance {
  spent: number;
  remaining: number;
  daysLeft: number;
  daily: number;
  weekly: number;
  daysElapsed: number;
  velocity: number;
  projectedEnd: number;
  isOverPace: boolean;
  // assigned / days-in-month, and that scaled to a week — a stable
  // reference rate from what you budgeted this period, independent of how
  // much you've already spent (unlike `daily`/`weekly` above, which are
  // remaining-based and shrink as the pot gets spent down).
  assignedDailyRate: number;
  assignedWeeklyRate: number;
}

/**
 * Derives a discretionary pool's safe-to-spend allowance from the category's
 * real `available` balance — the same number the main budget table uses —
 * rather than a separate manually-set ceiling. `today` is injectable for
 * testability; defaults to the real current date.
 */
export function computePoolAllowance(
  available: number,
  activity: number,
  assigned: number,
  today: Date = new Date()
): PoolAllowance {
  const daysInPeriod = getDaysInMonth(today);
  const dayOfMonth = getDate(today);
  const daysLeft = daysInPeriod - dayOfMonth + 1;
  const daysElapsed = dayOfMonth;

  // activity is signed net-spend (negative = money out); refunds can
  // legitimately push spent negative, which is fine — it just increases
  // the remaining balance rather than being clamped away.
  const spent = -activity;
  const remaining = available;
  const daily = remaining / daysLeft;
  const weekly = daily * Math.min(7, daysLeft);

  const assignedDailyRate = assigned / daysInPeriod;
  const assignedWeeklyRate = assignedDailyRate * 7;

  const velocity = spent / daysElapsed;
  const projectedEnd = velocity * daysInPeriod;
  // What this period's total pot actually was (spent so far + what's left) —
  // the real-money equivalent of the old manually-set target.
  const totalPot = spent + remaining;
  const isOverPace = projectedEnd > totalPot;

  return {
    spent,
    remaining,
    daysLeft,
    daily,
    weekly,
    daysElapsed,
    velocity,
    projectedEnd,
    isOverPace,
    assignedDailyRate,
    assignedWeeklyRate,
  };
}

export interface TargetComparison {
  // What would be left this month if this category were funded/spent exactly
  // at its target's monthly-needed amount.
  remaining: number;
  // amountNeeded / days in the month — the average $/day the target allows.
  dailyRate: number;
  // dailyRate scaled to a week, for the same at-a-glance comparison the
  // assigned-based allowance shows.
  weeklyRate: number;
  // dailyRate minus actual spend velocity. Positive means spending is
  // slower than the target's rate — for discretionary money that's the good
  // outcome (more left over), so it's framed as "behind pace" on purpose.
  paceDelta: number;
  isBehindPace: boolean;
}

/**
 * Compares actual spend velocity against the rate implied by a category's
 * target, rather than comparing dollar totals directly — assigned vs. target
 * dollars alone can't say anything about pace, since both figures move by
 * the same `activity` and the difference is really just a funding gap.
 * `today` is injectable for testability; defaults to the real current date.
 */
export function computeTargetComparison(
  amountNeeded: number,
  activity: number,
  velocity: number,
  today: Date = new Date()
): TargetComparison {
  const daysInPeriod = getDaysInMonth(today);
  const remaining = amountNeeded + activity;
  const dailyRate = amountNeeded / daysInPeriod;
  const weeklyRate = dailyRate * 7;
  const paceDelta = dailyRate - velocity;

  return { remaining, dailyRate, weeklyRate, paceDelta, isBehindPace: paceDelta >= 0 };
}
