// lib/budgetMath.ts
import { addMonths, format, isSameMonth, parseISO, subMonths } from "date-fns";
import type {
  AccountMeta,
  AssignmentRecord,
  BudgetState,
  BudgetStateInput,
  CategoryGroupMeta,
  ComputedMonthView,
  MonthItemState,
  MonthState,
  NormalizedTransaction,
} from "../src/types/budget";

const DEBUG_RTA = process.env.NEXT_PUBLIC_DEBUG_RTA === "true";
const rtaLog = (...args: unknown[]) => {
  if (DEBUG_RTA) console.log("[RTA]", ...args);
};

export interface Tx {
  date: string;
  balance: number;
  category: string;
}

export interface Account {
  name: string;
  type: "debit" | "credit";
  transactions: Tx[];
}

export interface BudgetItem {
  target: null;
  activity: number;
  name: string;
  assigned: number;
  available: number;
}

export interface BudgetCategory {
  name: string;
  categoryItems: BudgetItem[];
}

export interface BudgetMonth {
  categories: BudgetCategory[];
  assignable_money?: number;
}

/**
 * Pure RTA calculation that matches your fixed logic:
 * - inflows up to current month
 * - minus total assigned across all months
 * - minus ALL past cash overspending
 */
export function calculateReadyToAssignPure(
  month: string, // "YYYY-MM"
  data: Record<string, BudgetMonth>,
  accounts: Account[]
): number {
  const allMonths = Object.keys(data).sort();
  const currentIndex = allMonths.indexOf(month);
  if (currentIndex === -1) return 0;

  // 1) Inflows up to and including `month`
  const inflowUpTo = allMonths
    .slice(0, currentIndex + 1)
    .reduce((sum, m) => {
      const inflowThisMonth = accounts
        .flatMap((acc) => acc.transactions)
        .filter((tx) => {
          if (!tx.date) return false;
          const txMonth = format(parseISO(tx.date), "yyyy-MM");
          return isSameMonth(txMonth, m) && tx.balance > 0;
        })
        .reduce((s, tx) => s + tx.balance, 0);

      return sum + inflowThisMonth;
    }, 0);

  // 2) Total assigned across ALL months
  const totalAssigned = allMonths.reduce((sum, m) => {
    const assigned = data[m]?.categories?.reduce(
      (catSum, cat) =>
        catSum +
        cat.categoryItems.reduce(
          (itemSum, item) => itemSum + (item.assigned || 0),
          0
        ),
      0
    );
    return sum + (assigned || 0);
  }, 0);

  // 3) Total cash overspending from ALL past months
  let totalCashOverspending = 0;
  const pastMonths = allMonths.slice(0, currentIndex);

  for (const m of pastMonths) {
    const monthCategories = data[m]?.categories || [];

    rtaLog("budgetMath:cash-overspending:month-start", {
      month: m,
      categories: monthCategories.length,
    });

    for (const category of monthCategories) {
      if (category.name === "Credit Card Payments") continue;

      for (const item of category.categoryItems) {
        if (item.available >= 0) continue;

        // Find all tx in this month for this item
        const categoryTransactions = accounts.flatMap((acc) =>
          acc.transactions
            .filter((tx) => {
              if (!tx.date) return false;
              const txMonth = format(parseISO(tx.date), "yyyy-MM");
              return (
                tx.category === item.name && isSameMonth(txMonth, m)
              );
            })
            .map((tx) => ({ ...tx, accountType: acc.type }))
        );

        const debitSpending = categoryTransactions.some(
          (tx) => tx.accountType === "debit" && tx.balance < 0
        );

        const debitTx = categoryTransactions.filter(
          (tx) => tx.accountType === "debit" && tx.balance < 0
        );
        const creditTx = categoryTransactions.filter(
          (tx) => tx.accountType === "credit" && tx.balance < 0
        );
        const debitSpentTotal = debitTx.reduce((sum, tx) => sum + Math.abs(tx.balance), 0);
        const creditSpentTotal = creditTx.reduce((sum, tx) => sum + Math.abs(tx.balance), 0);

        if (debitSpending) {
          totalCashOverspending += Math.abs(item.available);
          rtaLog("budgetMath:cash-overspending:item", {
            month: m,
            categoryGroup: category.name,
            item: item.name,
            itemAvailable: item.available,
            debitSpentTotal,
            creditSpentTotal,
            appliedOverspend: Math.abs(item.available),
            totalCashOverspending,
          });
        } else {
          rtaLog("budgetMath:cash-overspending:skip", {
            month: m,
            categoryGroup: category.name,
            item: item.name,
            itemAvailable: item.available,
            debitSpentTotal,
            creditSpentTotal,
          });
        }
      }
    }
  }

  rtaLog("budgetMath:cash-overspending:summary", {
    month,
    totalCashOverspending,
  });

  return inflowUpTo - totalAssigned - totalCashOverspending;
}

export function calculateActivityForMonthPure(
  month: string,        // "YYYY-MM"
  categoryName: string,
  accounts: Account[]
): number {
  const filtered = accounts
    .flatMap((account) => account.transactions)
    .filter((tx) => {
      if (!tx.date) return false;
      const txMonth = format(parseISO(tx.date), "yyyy-MM");
      const convertedMonth = format(parseISO(month), "yyyy-MM");
      return isSameMonth(txMonth, convertedMonth) && tx.category === categoryName;
    });

  return filtered.reduce((sum, tx) => sum + tx.balance, 0);
}

export function getCumulativeAvailablePure(
  allMonths: Record<string, BudgetMonth>,
  currentMonth: string, // "YYYY-MM"
  itemName: string
): number {
  const currentDate = parseISO(`${currentMonth}-01`);

  const pastMonths = Object.keys(allMonths)
    .filter((month) => parseISO(`${month}-01`) < currentDate)
    .sort();

  return pastMonths.reduce((sum, month) => {
    const categories = allMonths[month]?.categories ?? [];

    const matchingItem = categories
      .flatMap((cat) => cat.categoryItems)
      .find((item) => item.name === itemName);

    if (!matchingItem) return sum;

    const assigned = matchingItem.assigned || 0;
    const activity = matchingItem.activity || 0;

    return sum + assigned + activity;
  }, 0);
}

export function calculateCreditCardAccountActivityPure(
  month: string,               // "YYYY-MM"
  accountName: string,         // name of the credit card account
  data: Record<string, BudgetMonth>,
  accounts: Account[]
): number {
 const monthStr = format(parseISO(`${month}-01`), "yyyy-MM");
  const account = accounts.find((a) => a.name === accountName);
  if (!account) return 0;

  // 1) Build map of how much was assigned to each category this month
  const assignedMap = new Map<string, number>();
  for (const category of data[month]?.categories || []) {
    for (const item of category.categoryItems) {
      if (item.assigned > 0) {
        assignedMap.set(
          item.name,
          (assignedMap.get(item.name) || 0) + item.assigned
        );
      }
    }
  }

  // 2) First pass: collect spending/refunds per category (no netActivity yet)
  type Activity = {
    spending: number;    // sum of |negative| transactions
    refunds: number;     // sum of positive transactions
    netActivity: number; // to fill in later
  };

  const categoryActivity = new Map<string, Activity>();

  for (const tx of account.transactions) {
    const txMonth = format(parseISO(tx.date), "yyyy-MM");
    if (txMonth !== monthStr) continue;

    const { category, balance } = tx;

    // Ignore direct payments + RTA here — we handle those separately
    if (category === "Ready to Assign" || category === accountName) continue;

    if (!categoryActivity.has(category)) {
      categoryActivity.set(category, {
        spending: 0,
        refunds: 0,
        netActivity: 0,
      });
    }

    const activity = categoryActivity.get(category)!;

    if (balance < 0) {
      // spending
      activity.spending += Math.abs(balance);
    } else if (balance > 0) {
      // refund
      activity.refunds += balance;
    }

    categoryActivity.set(category, activity);
  }

  // 3) Second pass: compute netActivity using budget + netSpending
  for (const [category, activity] of categoryActivity.entries()) {
    const netSpending = activity.spending - activity.refunds;

    if (assignedMap.has(category)) {
      const available = assignedMap.get(category) ?? 0;

      if (netSpending > 0) {
        // Normal case: more spending than refunds this month
        const used = Math.min(netSpending, available);
        activity.netActivity = used;
        assignedMap.set(category, Math.max(0, available - used));
      } else if (netSpending < 0) {
        // More refunds than spending:
        // treat this as reducing how much we need to pay the card
        activity.netActivity = netSpending; // negative number
      } else {
        activity.netActivity = 0;
      }
    } else {
      // No current-month budget:
      // - Positive netSpending: unbudgeted spending → we can decide to ignore or treat as 0
      // - Negative netSpending: refunds > spending → still reduces payment
      if (netSpending < 0) {
        activity.netActivity = netSpending;
      } else {
        activity.netActivity = 0;
      }
    }

    categoryActivity.set(category, activity);
  }

  // 4) Sum up total activity from all categories
  let totalActivity = 0;
  for (const activity of categoryActivity.values()) {
    totalActivity += activity.netActivity;
  }

  // 5) Handle direct payments to the credit card account itself
  for (const tx of account.transactions) {
    const txMonth = format(parseISO(tx.date), "yyyy-MM");
    if (txMonth !== monthStr) continue;

    if (tx.category === accountName && tx.balance > 0) {
      // A positive transaction with category = card name is a payment
      totalActivity -= tx.balance;
    }
  }

  return totalActivity;
}

export interface UpdateMonthInput {
  prev: Record<string, BudgetMonth>;
  newMonth: string;                  // "YYYY-MM"
  direction: "forward" | "backward";
  accounts: Account[];
}

export interface UpdateMonthResult {
  newBudgetData: Record<string, BudgetMonth>;
  dirty: boolean;
}

  const createEmptyCategories = (prevCategories) => {
    return prevCategories.map((category) => ({
      ...category,
      categoryItems: category.categoryItems.map((item) => ({
        ...item,
        assigned: 0,
        activity: 0,
        available: 0,
        target: null,
      })),
    }));
  };

    const getLatestMonth = (budgetData) => {
    return Object.keys(budgetData).sort().pop();
  };

  const getPreviousMonth = (month: string) => {
    return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
  };

    const isBeforeMonth = (monthA: string, monthB: string): boolean => {
    return new Date(monthA) < new Date(monthB);
  };

    const areCategoriesEqual = (a, b) => {
    if (a.length !== b.length) return false;

    const aNames = a.map((cat) => cat.name).sort();
    const bNames = b.map((cat) => cat.name).sort();

    return aNames.every((name, idx) => name === bNames[idx]);
  };

export function updateMonthPure(
  input: UpdateMonthInput
): UpdateMonthResult {
  const { prev, newMonth, direction, accounts } = input;

  const previousMonth = getPreviousMonth(newMonth);
  const pastMonths = Object.keys(prev).filter((month) =>
    isBeforeMonth(month, newMonth)
  );

  const cumulativeAssigned = new Map<string, number>();
  pastMonths.forEach((month) => {
    prev[month]?.categories.forEach((category) => {
      category.categoryItems.forEach((item) => {
        if (!cumulativeAssigned.has(item.name)) {
          cumulativeAssigned.set(item.name, 0);
        }
        cumulativeAssigned.set(
          item.name,
          (cumulativeAssigned.get(item.name) || 0) + (item.assigned || 0)
        );
      });
    });
  });

  const cumulativeActivity = new Map<string, number>();
  pastMonths.forEach((month) => {
    prev[month]?.categories.forEach((category) => {
      category.categoryItems.forEach((item) => {
        if (!cumulativeActivity.has(item.name)) {
          cumulativeActivity.set(item.name, 0);
        }
        cumulativeActivity.set(
          item.name,
          (cumulativeActivity.get(item.name) || 0) + (item.activity || 0)
        );
      });
    });
  });

  let dirty = false;

  // 🔹 Branch 1: month already exists → patch groups/items & recompute
  if (prev[newMonth]) {
    const allGroupNames = new Set(
      Object.values(prev).flatMap(
        (month) => month?.categories?.map((cat) => cat.name) || []
      )
    );

    const existingGroupNames = new Set(
      prev[newMonth].categories.map((cat) => cat.name)
    );

    const missingGroups = [...allGroupNames].filter(
      (name) => !existingGroupNames.has(name)
    );

    const patchedCategories = [
      ...prev[newMonth].categories,
      ...missingGroups.map((name) => ({
        name,
        categoryItems: [],
      })),
    ];

    // this used to call setIsDirty(true) in-context
    if (!areCategoriesEqual(patchedCategories, prev[newMonth].categories)) {
      dirty = true;
    }

    const updatedCategories = patchedCategories.map((category) => {
      const existingItemsMap = Object.fromEntries(
        category.categoryItems.map((item) => [item.name, item])
      );

      const missingItems =
        prev[previousMonth]?.categories
          .find((c) => c.name === category.name)
          ?.categoryItems
          .filter((item) => !existingItemsMap[item.name])
          .map((item) => ({
            ...item,
            assigned: 0,
            activity: 0,
            available: 0,
            target: item.target ?? null,
          })) || [];

      const patchedCategoryItems = [
        ...category.categoryItems,
        ...missingItems,
      ];

      return {
        ...category,
        categoryItems: patchedCategoryItems.map((item) => {
          const pastAssigned = cumulativeAssigned.get(item.name) || 0;
          const pastActivity = cumulativeActivity.get(item.name) || 0;
          const isCreditCardPayment =
            category.name === "Credit Card Payments";

          if (cumulativeActivity.size === 0) return item;

          const pastAvailable = isCreditCardPayment
            ? prev[previousMonth]?.categories
                .find((c) => c.name === "Credit Card Payments")
                ?.categoryItems.find((i) => i.name === item.name)
                ?.available || 0
            : Math.max(pastAssigned + pastActivity, 0);

          // ⬇️ copy your existing target logic, unchanged
          const newTarget = item.target;
          const previousItem = prev[previousMonth]?.categories
            ?.find((cat) => cat.name === category.name)
            ?.categoryItems.find((i) => i.name === item.name);

          // monthly / Custom / Full Payoff target handling...
          // (this is literally the block you already have)

          let itemActivity: number;

          if (category.name === "Credit Card Payments") {
            itemActivity = calculateCreditCardAccountActivityPure(
              newMonth,
              item.name,
              prev,
              accounts
            );

            const prevAvailable =
              prev[previousMonth]?.categories
                ?.find((c) => c.name === "Credit Card Payments")
                ?.categoryItems.find((i) => i.name === item.name)
                ?.available ?? 0;

            return {
              ...item,
              assigned: 0,
              activity: itemActivity,
              target: newTarget,
              available: prevAvailable + itemActivity,
            };
          } else {
            itemActivity = calculateActivityForMonthPure(
              newMonth,
              item.name,
              accounts
            );

            const wasDebitOverspent =
              (previousItem?.available ?? 0) < 0 &&
              accounts.some(
                (acc) =>
                  acc.type === "debit" &&
                  acc.transactions.some(
                    (tx) =>
                      tx.category === item.name &&
                      isSameMonth(
                        format(parseISO(tx.date), "yyyy-MM"),
                        previousMonth
                      ) &&
                      tx.balance < 0
                  )
              );

            if (wasDebitOverspent) {
              return {
                ...item,
                assigned: 0,
                activity: itemActivity,
                target: newTarget,
                available: 0,
              };
            }

            return {
              ...item,
              assigned: 0,
              activity: itemActivity,
              target: newTarget,
              available: pastAvailable + itemActivity,
            };
          }
        }),
      };
    });

    const totalInflow = accounts
      .flatMap((acc) => acc.transactions)
      .filter(
        (tx) =>
          tx.date &&
          isSameMonth(
            format(parseISO(tx.date), "yyyy-MM"),
            parseISO(newMonth)
          ) &&
          tx.balance > 0
      )
      .filter((tx) => tx.category === "Ready to Assign")
      .reduce((sum, tx) => sum + tx.balance, 0);

    const newBudgetData: Record<string, BudgetMonth> = {
      ...prev,
      [newMonth]: {
        ...prev[newMonth],
        categories: updatedCategories,
        assignable_money: totalInflow || 0,
      },
    };

    // in the old code, this branch ended inside setBudgetData
    return { newBudgetData, dirty };
  }

  // 🔹 Branch 2: month does NOT exist yet → clone/seed from previous
  const prevCategories =
    prev[previousMonth]?.categories && direction === "forward"
      ? prev[previousMonth].categories
      : [];

  const updatedCategories = prevCategories.length
    ? prevCategories.map((category) => ({
        ...category,
        categoryItems: category.categoryItems.map((item) => {
          const pastAssigned = cumulativeAssigned.get(item.name) || 0;
          const pastActivity = cumulativeActivity.get(item.name) || 0;
          const isCreditCardPayment =
            category.name === "Credit Card Payments";

          const baseAvailable = isCreditCardPayment
            ? prev[previousMonth]?.categories
                .find((c) => c.name === "Credit Card Payments")
                ?.categoryItems.find((i) => i.name === item.name)
                ?.available || 0
            : Math.max(pastAssigned + pastActivity, 0);

          const newTarget = item.target;
          const previousItem = prev[previousMonth]?.categories
            ?.find((cat) => cat.name === category.name)
            ?.categoryItems.find((i) => i.name === item.name);

          // same target logic as above (monthly/custom/full-payoff)
          // using previousItem, monthsUntilTarget, etc.

          let itemActivity: number;
          if (category.name === "Credit Card Payments") {
            itemActivity = calculateCreditCardAccountActivityPure(
              newMonth,
              item.name,
              prev,
              accounts
            );

            return {
              ...item,
              assigned: 0,
              activity: itemActivity,
              target: newTarget,
              available: baseAvailable + itemActivity,
            };
          } else {
            itemActivity = calculateActivityForMonthPure(
              newMonth,
              item.name,
              accounts
            );

            const wasDebitOverspent =
              (previousItem?.available ?? 0) < 0 &&
              accounts.some(
                (acc) =>
                  acc.type === "debit" &&
                  acc.transactions.some(
                    (tx) =>
                      tx.category === item.name &&
                      isSameMonth(
                        format(parseISO(tx.date), "yyyy-MM"),
                        previousMonth
                      ) &&
                      tx.balance < 0
                  )
              );

            return {
              ...item,
              assigned: 0,
              activity: itemActivity,
              target: newTarget,
              available: wasDebitOverspent
                ? 0
                : baseAvailable + itemActivity,
            };
          }
        }),
      }))
    : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

  const totalInflow = accounts
    .flatMap((acc) => acc.transactions)
    .filter(
      (tx) =>
        tx.date &&
        isSameMonth(
          format(parseISO(tx.date), "yyyy-MM"),
          parseISO(newMonth)
        ) &&
        tx.balance > 0
    )
    .filter((tx) => tx.category === "Ready to Assign")
    .reduce((sum, tx) => sum + tx.balance, 0);

  const newBudgetData: Record<string, BudgetMonth> = {
    ...prev,
    [newMonth]: {
      categories: updatedCategories,
      assignable_money: totalInflow || 0,
    },
  };

  // in your original code you call setIsDirty(true) for this path
  dirty = true;

  return { newBudgetData, dirty };
}

// ============================================================================
// New server-side computation engine (UUID-based, timeline-aware)
// All functions below operate on NormalizedTransaction and stable IDs.
// The legacy functions above remain for backward compatibility during migration.
// ============================================================================

// Raw DB transaction shape (what Supabase returns before normalization)
export interface RawDbTransaction {
  id: string;
  account_id: string;
  date: string;                  // "YYYY-MM-DD"
  payee: string | null;
  category: string | null;       // text name — legacy; use category_item_id going forward
  category_group: string | null; // text name — legacy
  balance: number;               // signed: positive = inflow, negative = outflow
  category_item_id: string | null;
  cleared: boolean;
  approved: boolean;
}

function txMonth(date: string): string {
  return date.substring(0, 7); // "YYYY-MM-DD" → "YYYY-MM"
}

function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseISO(`${month}-01`), delta), "yyyy-MM");
}

// Convert raw DB transactions into the canonical NormalizedTransaction format.
export function normalizeTransactions(
  rawTransactions: RawDbTransaction[],
  accounts: AccountMeta[]
): NormalizedTransaction[] {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return rawTransactions.map((tx) => {
    const account = accountMap.get(tx.account_id);
    const isTransferPayee = typeof tx.payee === "string" && tx.payee.trim().startsWith("Transfer :");
    const isUncategorized = !tx.category_item_id && tx.category !== "Ready to Assign";
    // Income: positive transaction in "Ready to Assign" (any account type)
    const isIncome = tx.category === "Ready to Assign" && tx.balance > 0;
    // Direct card payment: positive inflow on a credit account that is either
    // explicitly categorized to the card name or represented as a transfer payee.
    const isCCPayment =
      account?.type === "credit" &&
      tx.balance > 0 &&
      (tx.category === account.name || isTransferPayee || isUncategorized);
    const isTransfer = !isCCPayment && isTransferPayee;

    return {
      id: tx.id,
      accountId: tx.account_id,
      date: tx.date,
      amount: tx.balance,
      categoryItemId: tx.category_item_id ?? undefined,
      affectsBudget: isIncome || isCCPayment || tx.category_item_id != null,
      isCreditCardPayment: isCCPayment,
      cashFlowType: isIncome
        ? "income"
        : isCCPayment
          ? "credit_payment"
          : isTransfer
            ? "transfer"
            : "expense",
    };
  });
}

// Compute payment-category activity by credit account for a month.
// Uses transaction order + per-category funding pool so unbudgeted credit
// overspending does not increase card payment activity.
function computeCreditCardActivityByAccount(
  monthTransactions: NormalizedTransaction[],
  accountMap: Map<string, AccountMeta>,
  monthStartAvailableByItem: Map<string, number>,
  prevOutstanding: Map<string, number>
): { paymentActivity: Map<string, number>; updatedOutstanding: Map<string, number> } {
  const paymentActivityByCard = new Map<string, number>();
  const poolByItem = new Map<string, number>();
  const budgetedOutstandingByItemCard = new Map(prevOutstanding);

  for (const [itemId, amount] of monthStartAvailableByItem.entries()) {
    poolByItem.set(itemId, amount);
  }

  const orderRank = (tx: NormalizedTransaction): number => {
    const account = accountMap.get(tx.accountId);
    if (!account) return 99;

    if (account.type === "debit") {
      if (tx.amount < 0) return 0;
      if (tx.amount > 0) return 1;
      return 2;
    }

    if (tx.isCreditCardPayment) return 5;
    if (tx.amount < 0) return 3;
    if (tx.amount > 0) return 4;
    return 6;
  };

  const txOrdered = [...monthTransactions].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;

    const byRank = orderRank(a) - orderRank(b);
    if (byRank !== 0) return byRank;

    return 0;
  });

  for (const tx of txOrdered) {
    const account = accountMap.get(tx.accountId);
    if (!account) continue;

    if (tx.isCreditCardPayment && account.type === "credit" && tx.amount > 0) {
      paymentActivityByCard.set(
        tx.accountId,
        (paymentActivityByCard.get(tx.accountId) ?? 0) - tx.amount
      );
      continue;
    }

    if (!tx.categoryItemId) continue;

    const itemId = tx.categoryItemId;
    const currentPool = poolByItem.get(itemId) ?? 0;

    if (account.type === "debit") {
      poolByItem.set(itemId, currentPool + tx.amount);
      continue;
    }

    if (account.type !== "credit") continue;

    if (tx.amount < 0) {
      const spend = Math.abs(tx.amount);
      const budgeted = Math.min(Math.max(currentPool, 0), spend);
      const unbudgeted = spend - budgeted;

      if (budgeted > 0) {
        paymentActivityByCard.set(
          tx.accountId,
          (paymentActivityByCard.get(tx.accountId) ?? 0) + budgeted
        );
        const outstandingKey = `${itemId}:${tx.accountId}`;
        budgetedOutstandingByItemCard.set(
          outstandingKey,
          (budgetedOutstandingByItemCard.get(outstandingKey) ?? 0) + budgeted
        );
      }

      poolByItem.set(itemId, currentPool - budgeted - unbudgeted);
      continue;
    }

    if (tx.amount > 0) {
      const refund = tx.amount;
      const outstandingKey = `${itemId}:${tx.accountId}`;
      const outstanding = budgetedOutstandingByItemCard.get(outstandingKey) ?? 0;
      const reduction = Math.min(outstanding, refund);

      if (reduction > 0) {
        paymentActivityByCard.set(
          tx.accountId,
          (paymentActivityByCard.get(tx.accountId) ?? 0) - reduction
        );
        budgetedOutstandingByItemCard.set(outstandingKey, outstanding - reduction);
      }

      poolByItem.set(itemId, currentPool + refund);
    }
  }

  return { paymentActivity: paymentActivityByCard, updatedOutstanding: budgetedOutstandingByItemCard };
}

// Compute deterministic full-timeline budget state from source-of-truth data.
// Call serializeMonthView() to project a single month from this state.
export function computeBudgetState(input: BudgetStateInput): BudgetState {
  const { accounts, transactions, assignments, categoryGroups } = input;

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Lookup: "itemId:YYYY-MM" → assigned
  const assignmentsByItemMonth = new Map<string, number>();
  for (const a of assignments) {
    assignmentsByItemMonth.set(`${a.categoryItemId}:${a.month}`, a.assigned);
  }

  // Collect all months with any data
  const monthSet = new Set<string>();
  for (const tx of transactions) {
    if (tx.date) monthSet.add(txMonth(tx.date));
  }
  for (const a of assignments) monthSet.add(a.month);

  if (monthSet.size > 0) {
    // A month with no transaction or assignment of its own (a gap, or any
    // month past the latest real activity — e.g. one you haven't visited
    // yet) would otherwise be absent from the timeline entirely, causing
    // RTA/available to fall back to zero instead of carrying forward. Fill
    // the range contiguously and extend well past the latest known month so
    // navigating ahead still produces a real "nothing happened" projection
    // via the same per-month loop below, not a special-cased default.
    const dataMonths = [...monthSet].sort();
    const earliest = dataMonths[0];
    const horizon = shiftMonth(dataMonths[dataMonths.length - 1], 24);
    for (let m = earliest; m <= horizon; m = shiftMonth(m, 1)) {
      monthSet.add(m);
    }
  }

  const allMonths = [...monthSet].sort();

  if (allMonths.length === 0) {
    return {
      months: new Map(),
      categoryGroups,
      accounts,
      generatedAt: new Date().toISOString(),
      version: Date.now(),
      totalIncome: 0,
      totalAssigned: 0,
    };
  }

  // Map CC payment items → their credit card account IDs (by name matching across all groups)
  const ccItemToAccountId = new Map<string, string>(); // itemId → accountId
  for (const group of categoryGroups) {
    for (const item of group.items) {
      const match = accounts.find((a) => a.type === "credit" && a.name === item.name);
      if (match) ccItemToAccountId.set(item.id, match.id);
    }
  }

  // Pre-compute: which items had debit spending in which months (for cash overspend detection)
  const debitSpendingByItemMonth = new Set<string>(); // "itemId:YYYY-MM"
  for (const tx of transactions) {
    if (tx.amount < 0 && tx.categoryItemId) {
      const account = accountMap.get(tx.accountId);
      if (account?.type === "debit") {
        debitSpendingByItemMonth.add(`${tx.categoryItemId}:${txMonth(tx.date)}`);
      }
    }
  }

  const months = new Map<string, MonthState>();
  let outstandingByItemCard = new Map<string, number>();

  // Ready to Assign is computed sequentially, month by month, matching real
  // YNAB: each month = (previous month's leftover, which may be negative)
  //   + (this month's own income)
  //   - (previous month's own fresh debit-only cash overspending — applied
  //      exactly once, permanently, the month after it happens; it does NOT
  //      "resolve" later even if you fund the category back up, because that
  //      later assignment is a separate, independent claim on fresh money —
  //      see tests/budgetMath.test.ts for the worked reconciliation)
  //   - (this month's own assignments — NOT future months', so pre-budgeting
  //      next month's rent ahead of time doesn't touch this month's figure)
  // This deliberately reverses an earlier "single global figure, same in
  // every month" design (see git history) — that design broke down under
  // real usage: it let a future month's pre-assignment retroactively cancel
  // a past month's already-real cash overspending, making that assignment a
  // no-op on RTA. Verified against a real multi-month export; see PR/commit
  // discussion for the reconciliation against actual YNAB screenshots.
  let runningInflows = 0;
  let runningAssigned = 0;
  let runningCashOverspending = 0; // permanent, incremented once per month transition
  let prevMonthDebitOverspend = 0; // previous month's own fresh debit-only overspend
  let prevMonthStates: Map<string, MonthItemState> | null = null;
  let prevMonth: string | null = null;
  let prevDebitAvailableByItem = new Map<string, number>();

  for (const month of allMonths) {
    const monthTx = transactions.filter(
      (tx) => tx.date && txMonth(tx.date) === month
    );

    const incomeThisMonth = monthTx
      .filter((tx) => tx.cashFlowType === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
    runningInflows += incomeThisMonth;

    const assignedThisMonth = assignments
      .filter((a) => a.month === month)
      .reduce((sum, a) => sum + (a.assigned || 0), 0);
    runningAssigned += assignedThisMonth;

    // Apply the previous month's own fresh debit-only overspend exactly
    // once, permanently, before computing this month's Ready to Assign.
    runningCashOverspending += prevMonthDebitOverspend;
    const overspendPrevMonth = prevMonthDebitOverspend;

    const itemStates = new Map<string, MonthItemState>();
    const monthStartAvailableByItem = new Map<string, number>();
    const debitAvailableByItem = new Map<string, number>();

    // First pass: non-credit-card-payment categories
    for (const group of categoryGroups) {
      for (const item of group.items) {
        if (ccItemToAccountId.has(item.id)) continue;

        const assigned = assignmentsByItemMonth.get(`${item.id}:${month}`) ?? 0;
        const itemMonthTx = monthTx.filter(
          (tx) => tx.categoryItemId === item.id && !tx.isCreditCardPayment
        );
        const activity = itemMonthTx.reduce((sum, tx) => sum + tx.amount, 0);
        const debitActivity = itemMonthTx
          .filter((tx) => accountMap.get(tx.accountId)?.type === "debit")
          .reduce((sum, tx) => sum + tx.amount, 0);

        const prevState = prevMonthStates?.get(item.id);
        const wasDebitOverspent =
          prevState != null &&
          prevState.available < 0 &&
          debitSpendingByItemMonth.has(`${item.id}:${prevMonth ?? ""}`);

        const prevAvailable = prevState?.available ?? 0;
        const effectivePrevAvailable = wasDebitOverspent ? 0 : Math.max(prevAvailable, 0);
        const available = assigned + activity + effectivePrevAvailable;

        monthStartAvailableByItem.set(item.id, effectivePrevAvailable + assigned);

        itemStates.set(item.id, {
          categoryItemId: item.id,
          assigned,
          activity,
          cumulativeAvailable: 0,
          available,
        });

        // Parallel debit-only lens on the same item, mirroring the blended
        // available's reset-after-overspend behavior above, so each month's
        // fresh cash-overspend figure is computed independent of credit
        // activity (a credit-funded deficit is card debt, tracked via the
        // Credit Card Payments group instead — counting it here too would
        // double-count the same shortfall).
        const prevDebitAvailable = prevDebitAvailableByItem.get(item.id) ?? 0;
        const effectivePrevDebitAvailable =
          prevDebitAvailable < 0 ? 0 : prevDebitAvailable;
        const debitAvailable = assigned + debitActivity + effectivePrevDebitAvailable;
        debitAvailableByItem.set(item.id, debitAvailable);
      }
    }

    let monthDebitOverspend = 0;
    for (const debitAvail of debitAvailableByItem.values()) {
      if (debitAvail < 0) monthDebitOverspend += Math.abs(debitAvail);
    }

    const { paymentActivity: ccActivityByAccountId, updatedOutstanding } =
      computeCreditCardActivityByAccount(monthTx, accountMap, monthStartAvailableByItem, outstandingByItemCard);
    outstandingByItemCard = updatedOutstanding;

    // Second pass: credit card payment categories (all groups)
    for (const group of categoryGroups) {
      for (const item of group.items) {
        if (!ccItemToAccountId.has(item.id)) continue;

        const assigned = assignmentsByItemMonth.get(`${item.id}:${month}`) ?? 0;
        const cardAccountId = ccItemToAccountId.get(item.id);
        const activity = cardAccountId ? ccActivityByAccountId.get(cardAccountId) ?? 0 : 0;
        const prevAvailable = prevMonthStates?.get(item.id)?.available ?? 0;
        const available = prevAvailable + assigned + activity;

        itemStates.set(item.id, {
          categoryItemId: item.id,
          assigned,
          activity,
          cumulativeAvailable: 0,
          available,
        });
      }
    }

    const readyToAssign = runningInflows - runningAssigned - runningCashOverspending;

    months.set(month, {
      month,
      itemStates,
      readyToAssign,
      rtaCarry: runningCashOverspending,
      incomeThisMonth,
      assignedThisMonth,
      overspendPrevMonth,
    });

    prevMonthStates = itemStates;
    prevMonth = month;
    prevMonthDebitOverspend = monthDebitOverspend;
    prevDebitAvailableByItem = debitAvailableByItem;
  }

  return {
    months,
    categoryGroups,
    accounts,
    generatedAt: new Date().toISOString(),
    version: Date.now(),
    totalIncome: runningInflows,
    totalAssigned: runningAssigned,
  };
}

// Project a single month's computed view from a BudgetState.
// `todayMonth` ("YYYY-MM") defaults to the real current month — only tests
// need to override it, to check the "viewing today" behavior deterministically.
export function serializeMonthView(
  state: BudgetState,
  month: string,
  todayMonth: string = format(new Date(), "yyyy-MM")
): ComputedMonthView {
  const monthState = state.months.get(month);

  const categories = state.categoryGroups.map((group) => ({
    id: group.id,
    name: group.name,
    notes: group.notes,
    notes_history: group.notes_history,
    categoryItems: group.items.map((item) => {
      const s = monthState?.itemStates.get(item.id);
      return {
        id: item.id,
        name: item.name,
        assigned: s?.assigned ?? 0,
        activity: s?.activity ?? 0,
        available: Math.round((s?.available ?? 0) * 100) / 100,
        snoozed: item.snoozed,
        target: item.target,
        notes: item.notes,
        notes_history: item.notes_history,
        isDiscretionaryPool: item.isDiscretionaryPool,
        isHiddenFromInsights: item.isHiddenFromInsights,
      };
    }),
  }));

  const prevMonthState = state.months.get(shiftMonth(month, -1));

  // Money already assigned to any month after this one — not part of the
  // core recursive RTA chain stored in state.months (that money only counts
  // against RTA once the walk actually reaches its own month; the "leftover"
  // fed into the *next* month's calculation must stay the pure, unadjusted
  // value — matches real YNAB, verified against actual screenshots). Only
  // when `month` is the real current month does this become a genuine,
  // displayed reduction of the usable Ready to Assign figure — some of what
  // looks available is already earmarked for a month you haven't gotten to
  // yet. Browsing a past month never applies this adjustment.
  let assignedBeyondThisMonth = 0;
  for (const [otherMonth, otherState] of state.months) {
    if (otherMonth > month) assignedBeyondThisMonth += otherState.assignedThisMonth;
  }
  const isRealCurrentMonth = month === todayMonth;
  const displayedReadyToAssign =
    (monthState?.readyToAssign ?? 0) - (isRealCurrentMonth ? assignedBeyondThisMonth : 0);

  return {
    month,
    ready_to_assign: Math.round(displayedReadyToAssign * 100) / 100,
    rta_carry: Math.round((monthState?.rtaCarry ?? 0) * 100) / 100,
    has_deficit_carry: (monthState?.rtaCarry ?? 0) > 0,
    rta_prev_month_leftover: Math.round((prevMonthState?.readyToAssign ?? 0) * 100) / 100,
    rta_income_this_month: Math.round((monthState?.incomeThisMonth ?? 0) * 100) / 100,
    rta_overspend_prev_month: Math.round((monthState?.overspendPrevMonth ?? 0) * 100) / 100,
    rta_assigned_this_month: Math.round((monthState?.assignedThisMonth ?? 0) * 100) / 100,
    rta_assigned_beyond_this_month: Math.round(assignedBeyondThisMonth * 100) / 100,
    version: state.version,
    generatedAt: state.generatedAt,
    categories,
  };
}
