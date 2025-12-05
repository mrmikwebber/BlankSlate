// lib/budgetMath.ts
import { format, isSameMonth, parseISO, subMonths } from "date-fns";

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
        .filter((acc) => acc.type === "debit")
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

        if (debitSpending) {
          totalCashOverspending += Math.abs(item.available);
        }
      }
    }
  }

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
          let newTarget = item.target;
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
      .filter((acc) => acc.type === "debit")
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

          let newTarget = item.target;
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
    .filter((acc) => acc.type === "debit")
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
