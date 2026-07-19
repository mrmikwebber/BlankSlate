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
  };
}
