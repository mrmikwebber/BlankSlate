// src/lib/paceDrivers.ts
export type CategorySpending = {
  categoryId: string;
  categoryName: string;
  actualThisMonth: number;
  historicalMonthlyAmounts: number[]; // last N complete months
  isOutflow?: boolean;
};

export type PaceDriver = {
  categoryId: string;
  categoryName: string;
  expectedByNow: number;
  actualThisMonth: number;
  difference: number;
  avgMonthly: number;
  pctOfTotalDelta?: number;
};

export function computePaceDrivers(
  categories: CategorySpending[],
  asOfDate = new Date(),
  options?: {
    monthsToUse?: number;
    minPositiveDisplay?: number;
    minPctOfDelta?: number;
    maxResults?: number;
  }
): PaceDriver[] {
  const { monthsToUse = 3, minPositiveDisplay = 25, minPctOfDelta = 0.05, maxResults = 3 } =
    options || {};

  const year = asOfDate.getFullYear();
  const month = asOfDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = asOfDate.getDate();

  const drivers = categories
    .filter((c) => c.isOutflow !== false)
    .map((c) => {
      const history = c.historicalMonthlyAmounts || [];
      const avgMonthly = history.length ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      const expectedByNow = avgMonthly * (currentDay / daysInMonth);
      const difference = c.actualThisMonth - expectedByNow;
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        expectedByNow,
        actualThisMonth: c.actualThisMonth,
        difference,
        avgMonthly,
      } as PaceDriver;
    });

  const positive = drivers.filter((d) => d.difference > Math.max(minPositiveDisplay, 0));

  const totalPositiveDelta = positive.reduce((s, d) => s + d.difference, 0) || 0.000001;

  positive.forEach((d) => {
    d.pctOfTotalDelta = d.difference / totalPositiveDelta;
  });

  const filtered = positive.filter((d) => d.pctOfTotalDelta! >= minPctOfDelta);

  const sorted = filtered.sort((a, b) => b.difference - a.difference).slice(0, maxResults);

  return sorted;
}
// src/lib/paceDrivers.ts
export type CategorySpending = {
  categoryId: string;
  categoryName: string;
  actualThisMonth: number;
  historicalMonthlyAmounts: number[]; // last N complete months
  isOutflow?: boolean;
};

export type PaceDriver = {
  categoryId: string;
  categoryName: string;
  expectedByNow: number;
  actualThisMonth: number;
  difference: number;
  avgMonthly: number;
  pctOfTotalDelta?: number;
};

export function computePaceDrivers(
  categories: CategorySpending[],
  asOfDate = new Date(),
  options?: {
    monthsToUse?: number;
    minPositiveDisplay?: number;
    minPctOfDelta?: number;
    maxResults?: number;
  }
): PaceDriver[] {
  const { monthsToUse = 3, minPositiveDisplay = 25, minPctOfDelta = 0.05, maxResults = 3 } =
    options || {};

  const year = asOfDate.getFullYear();
  const month = asOfDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = asOfDate.getDate();

  const drivers = categories
    .filter((c) => c.isOutflow !== false)
    .map((c) => {
      const history = c.historicalMonthlyAmounts || [];
      const avgMonthly = history.length ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      const expectedByNow = avgMonthly * (currentDay / daysInMonth);
      const difference = c.actualThisMonth - expectedByNow;
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        expectedByNow,
        actualThisMonth: c.actualThisMonth,
        difference,
        avgMonthly,
      } as PaceDriver;
    });

  const positive = drivers.filter((d) => d.difference > Math.max(minPositiveDisplay, 0));

  const totalPositiveDelta = positive.reduce((s, d) => s + d.difference, 0) || 0.000001;

  positive.forEach((d) => {
    d.pctOfTotalDelta = d.difference / totalPositiveDelta;
  });

  const filtered = positive.filter((d) => d.pctOfTotalDelta! >= minPctOfDelta);

  const sorted = filtered.sort((a, b) => b.difference - a.difference).slice(0, maxResults);

  return sorted;
}
