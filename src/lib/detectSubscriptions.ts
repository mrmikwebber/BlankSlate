import {
  parseISO,
  differenceInCalendarDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
} from "date-fns";

export interface TransactionLike {
  date: string;
  payee: string;
  category: string | null;
  category_group: string | null;
  balance: number;
  pending?: boolean;
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface SubscriptionCandidate {
  key: string;
  label: string;
  cadence: Cadence;
  typicalAmount: number;
  occurrenceCount: number;
  firstDate: string;
  lastDate: string;
  nextEstimatedDate: string;
  monthlyEquivalentCost: number;
}

export const MIN_OCCURRENCES = 3;

// [minDays, maxDays] gap ranges a cadence's consecutive occurrences must fall
// within. Ranges absorb weekend/holiday drift while staying disjoint from
// their neighbors.
const CADENCE_BUCKETS: { cadence: Cadence; min: number; max: number }[] = [
  { cadence: "weekly", min: 6, max: 8 },
  { cadence: "biweekly", min: 12, max: 16 },
  { cadence: "monthly", min: 27, max: 34 },
  { cadence: "quarterly", min: 80, max: 100 },
  { cadence: "yearly", min: 350, max: 380 },
];

const CADENCE_MONTHLY_MULTIPLIER: Record<Cadence, number> = {
  weekly: 4.345,
  biweekly: 2.1725,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const AMOUNT_TOLERANCE_PCT = 0.1;
const AMOUNT_TOLERANCE_PCT_YEARLY = 0.2;
const AMOUNT_TOLERANCE_FLOOR = 1.5;

// Normalizes a raw (often bank-provided, messy) payee string into a grouping
// key: strips card-network suffixes ("NETFLIX.COM*A1B2" -> "netflix.com"),
// store numbers, embedded dates, and long reference-number digit runs, so
// occurrences of the same recurring charge collapse to one key even when the
// bank varies the trailing text sync to sync.
export function normalizePayee(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.split("*")[0];
  s = s.replace(/#\d+/g, "");
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "");
  s = s.replace(/\b\d{4,}\b/g, "");
  s = s.replace(/[^a-z0-9 ]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function isExcludedFromDetection(
  tx: TransactionLike,
  hiddenCategoryNames?: Set<string>
): boolean {
  const isTransfer =
    (!tx.category && !tx.category_group) ||
    tx.payee?.toLowerCase().includes("transfer");
  const isStartingBalance =
    tx.category === "Category Not Needed" ||
    tx.category_group === "Starting Balance";
  const isCardPayment = tx.category_group === "Credit Card Payments";
  const isReconciliation = tx.category_group === "Reconciliation (Hidden)";
  const isHidden = tx.category ? hiddenCategoryNames?.has(tx.category) : false;
  return Boolean(
    isTransfer || isStartingBalance || isCardPayment || isReconciliation || isHidden
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function classifyCadence(sortedDates: string[]): Cadence | null {
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push(differenceInCalendarDays(parseISO(sortedDates[i]), parseISO(sortedDates[i - 1])));
  }
  if (gaps.length === 0) return null;

  const bucketForGap = (gap: number) =>
    CADENCE_BUCKETS.find((b) => gap >= b.min && gap <= b.max)?.cadence ?? null;

  // gaps.length is always >= 2 here since callers only pass in groups with
  // MIN_OCCURRENCES (3) or more sorted dates.
  if (gaps.length === 2) {
    // Exactly 3 points: require both gaps to land in the same bucket.
    const a = bucketForGap(gaps[0]);
    const b = bucketForGap(gaps[1]);
    return a && a === b ? a : null;
  }

  // 3+ gaps: pick the majority bucket, requiring a real majority.
  const counts = new Map<Cadence, number>();
  for (const gap of gaps) {
    const bucket = bucketForGap(gap);
    if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let best: Cadence | null = null;
  let bestCount = 0;
  for (const [cadence, count] of counts) {
    if (count > bestCount) {
      best = cadence;
      bestCount = count;
    }
  }
  if (!best) return null;
  if (bestCount < 2 || bestCount / gaps.length < 0.6) return null;
  return best;
}

function nextDateForCadence(lastDate: string, cadence: Cadence): string {
  const last = parseISO(lastDate);
  const next =
    cadence === "weekly"
      ? addWeeks(last, 1)
      : cadence === "biweekly"
      ? addWeeks(last, 2)
      : cadence === "monthly"
      ? addMonths(last, 1)
      : cadence === "quarterly"
      ? addQuarters(last, 1)
      : addYears(last, 1);
  return next.toISOString().slice(0, 10);
}

export function detectSubscriptions(
  transactions: TransactionLike[],
  dismissedKeys: Set<string>,
  hiddenCategoryNames?: Set<string>
): SubscriptionCandidate[] {
  const groups = new Map<string, TransactionLike[]>();

  for (const tx of transactions) {
    if (tx.balance >= 0) continue;
    if (tx.pending) continue;
    if (!tx.date || !tx.payee) continue;
    if (isExcludedFromDetection(tx, hiddenCategoryNames)) continue;

    const key = normalizePayee(tx.payee);
    if (!key || dismissedKeys.has(key)) continue;

    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const cadence = classifyCadence(sorted.map((tx) => tx.date));
    if (!cadence) continue;

    const amounts = sorted.map((tx) => Math.abs(tx.balance));
    const medianAmount = median(amounts);
    const pct = cadence === "yearly" ? AMOUNT_TOLERANCE_PCT_YEARLY : AMOUNT_TOLERANCE_PCT;
    const tolerance = Math.max(medianAmount * pct, AMOUNT_TOLERANCE_FLOOR);

    const consistent = sorted.filter(
      (tx) => Math.abs(Math.abs(tx.balance) - medianAmount) <= tolerance
    );
    if (consistent.length < MIN_OCCURRENCES) continue;

    const consistentAmounts = consistent.map((tx) => Math.abs(tx.balance));
    const typicalAmount = median(consistentAmounts);
    const lastDate = consistent[consistent.length - 1].date;
    const firstDate = consistent[0].date;
    const label = consistent[consistent.length - 1].payee;

    candidates.push({
      key,
      label,
      cadence,
      typicalAmount,
      occurrenceCount: consistent.length,
      firstDate,
      lastDate,
      nextEstimatedDate: nextDateForCadence(lastDate, cadence),
      monthlyEquivalentCost: typicalAmount * CADENCE_MONTHLY_MULTIPLIER[cadence],
    });
  }

  return candidates.sort((a, b) => b.monthlyEquivalentCost - a.monthlyEquivalentCost);
}
