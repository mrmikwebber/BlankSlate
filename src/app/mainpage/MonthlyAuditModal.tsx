"use client";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAccountContext } from "../context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import {
  isSameMonth,
  parseISO,
  format,
  subMonths,
} from "date-fns";
import {
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import dynamic from "next/dynamic";

const PieChart = dynamic(() => import("recharts").then((r) => r.PieChart), { ssr: false });

// ── Colors ────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  "#00c9a7",
  "#4f91ff",
  "#a78bfa",
  "#f59e0b",
  "#ff5c6e",
  "#34d399",
  "#fb923c",
  "#e879f9",
];

// ── Slide gradient themes ──────────────────────────────────────────────────────
const SLIDE_THEMES = [
  "from-teal-950 via-slate-900 to-slate-950",        // 0 - title
  "from-blue-950 via-slate-900 to-slate-950",         // 1 - total spending
  "from-violet-950 via-slate-900 to-slate-950",       // 2 - top categories
  "from-orange-950 via-slate-900 to-slate-950",       // 3 - biggest splurge
  "from-emerald-950 via-slate-900 to-slate-950",      // 4 - budget health
  "from-cyan-950 via-slate-900 to-slate-950",         // 5 - savings
  "from-teal-950 via-slate-900 to-slate-950",         // 6 - final summary
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSpendingForMonth(
  accounts: ReturnType<typeof useAccountContext>["accounts"],
  monthDate: Date
): number {
  return accounts
    .flatMap((a) => a.transactions)
    .filter((tx) => {
      const isTransfer =
        (!tx.category && !tx.category_group) ||
        tx.payee?.toLowerCase().includes("transfer");
      const isStartingBalance =
        tx.category === "Category Not Needed" ||
        tx.category_group === "Starting Balance";
      const isCardPayment = tx.category_group === "Credit Card Payments";
      return (
        tx.balance < 0 &&
        tx.date &&
        isSameMonth(parseISO(tx.date), monthDate) &&
        !isTransfer &&
        !isStartingBalance &&
        !isCardPayment
      );
    })
    .reduce((sum, tx) => sum + Math.abs(tx.balance), 0);
}

function getIncomeForMonth(
  accounts: ReturnType<typeof useAccountContext>["accounts"],
  monthDate: Date
): number {
  return accounts
    .flatMap((a) => a.transactions)
    .filter((tx) => {
      const isTransfer =
        (!tx.category && !tx.category_group) ||
        tx.payee?.toLowerCase().includes("transfer");
      const isStartingBalance =
        tx.category === "Category Not Needed" ||
        tx.category_group === "Starting Balance";
      return (
        tx.balance > 0 &&
        tx.date &&
        isSameMonth(parseISO(tx.date), monthDate) &&
        !isTransfer &&
        !isStartingBalance
      );
    })
    .reduce((sum, tx) => sum + tx.balance, 0);
}

function getCategorySpendingForMonth(
  accounts: ReturnType<typeof useAccountContext>["accounts"],
  monthDate: Date
): Record<string, number> {
  const totals: Record<string, number> = {};
  accounts.flatMap((a) => a.transactions).forEach((tx) => {
    const isTransfer =
      (!tx.category && !tx.category_group) ||
      tx.payee?.toLowerCase().includes("transfer");
    const isStartingBalance =
      tx.category === "Category Not Needed" ||
      tx.category_group === "Starting Balance";
    const isCardPayment = tx.category_group === "Credit Card Payments";
    if (
      tx.balance < 0 &&
      tx.date &&
      tx.category &&
      tx.category !== "Ready to Assign" &&
      tx.category !== "Ready To Assign" &&
      isSameMonth(parseISO(tx.date), monthDate) &&
      !isTransfer &&
      !isStartingBalance &&
      !isCardPayment
    ) {
      totals[tx.category] = (totals[tx.category] ?? 0) + Math.abs(tx.balance);
    }
  });
  return totals;
}

function getBudgetGrade(onBudget: number, overBudget: number, total: number): { grade: string; color: string; message: string } {
  if (total === 0) return { grade: "N/A", color: "text-slate-400", message: "No budget data for this month." };
  const score = total > 0 ? onBudget / total : 0;
  if (score >= 0.9) return { grade: "A", color: "text-emerald-400", message: "Exceptional discipline. Your future self thanks you." };
  if (score >= 0.75) return { grade: "B", color: "text-teal-400", message: "Solid month. A few areas to tighten up." };
  if (score >= 0.6) return { grade: "C", color: "text-yellow-400", message: "Decent effort, but room for improvement." };
  if (score >= 0.4) return { grade: "D", color: "text-orange-400", message: "Several categories went over. Let's reset next month." };
  return { grade: "F", color: "text-red-400", message: "Rough month. But awareness is the first step." };
}

// ── Slide components ──────────────────────────────────────────────────────────

function TitleSlide({ monthLabel }: { monthLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="text-6xl mb-2">📊</div>
      <p className="text-teal-400 text-sm uppercase tracking-[0.3em] font-semibold">Monthly Audit</p>
      <h1 className="text-5xl md:text-6xl font-black text-white leading-tight">
        {monthLabel}
      </h1>
      <p className="text-slate-400 text-lg mt-2">Let&apos;s see how you did.</p>
      <div className="mt-8 flex items-center gap-2 text-slate-500 text-sm animate-bounce">
        <span>tap or press</span>
        <span className="text-teal-400 font-semibold">→</span>
        <span>to begin</span>
      </div>
    </div>
  );
}

function TotalSpendingSlide({
  spent,
  lastSpent,
}: {
  spent: number;
  lastSpent: number;
}) {
  const diff = spent - lastSpent;
  const pct = lastSpent > 0 ? Math.abs((diff / lastSpent) * 100) : null;
  const increased = diff > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
      <p className="text-blue-400 text-sm uppercase tracking-[0.3em] font-semibold">Total Spending</p>
      <p className="text-slate-400 text-xl">This month, you spent</p>
      <div className="text-6xl md:text-7xl font-black text-white tabular-nums">
        {formatToUSD(spent)}
      </div>
      {lastSpent > 0 && pct !== null && (
        <div className={`flex items-center gap-2 text-lg font-semibold mt-2 ${increased ? "text-red-400" : "text-emerald-400"}`}>
          <span>{increased ? "▲" : "▼"}</span>
          <span>{pct.toFixed(1)}% vs last month</span>
        </div>
      )}
      {lastSpent > 0 && (
        <p className="text-slate-500 text-sm">
          Last month: {formatToUSD(lastSpent)}
        </p>
      )}
    </div>
  );
}

function TopCategoriesSlide({
  categorySpending,
}: {
  categorySpending: Record<string, number>;
}) {
  const topCategories = Object.entries(categorySpending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, amount]) => ({ name, amount }));

  if (topCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <p className="text-violet-400 text-sm uppercase tracking-[0.3em] font-semibold">Where Your Money Went</p>
        <p className="text-slate-400 text-lg">No categorized spending this month.</p>
      </div>
    );
  }

  const maxVal = topCategories[0].amount;

  return (
    <div className="flex flex-col h-full gap-4 px-6 py-8 overflow-hidden">
      <div className="text-center">
        <p className="text-violet-400 text-sm uppercase tracking-[0.3em] font-semibold">Where Your Money Went</p>
        <p className="text-slate-400 text-sm mt-1">Top spending categories this month</p>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
        {topCategories.map((cat, i) => (
          <div key={cat.name} className="flex items-center gap-3">
            <span className="text-slate-500 text-xs w-4 shrink-0 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-white text-sm font-medium truncate">{cat.name}</span>
                <span className="text-slate-300 text-sm font-mono ml-2 shrink-0">{formatToUSD(cat.amount)}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(cat.amount / maxVal) * 100}%`,
                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BiggestSplurgeSlide({
  categorySpending,
  totalSpent,
}: {
  categorySpending: Record<string, number>;
  totalSpent: number;
}) {
  const sorted = Object.entries(categorySpending).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  if (!top) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <p className="text-orange-400 text-sm uppercase tracking-[0.3em] font-semibold">Biggest Splurge</p>
        <p className="text-slate-400 text-lg">No spending data available.</p>
      </div>
    );
  }

  const pct = totalSpent > 0 ? (top[1] / totalSpent) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
      <p className="text-orange-400 text-sm uppercase tracking-[0.3em] font-semibold">Biggest Splurge</p>
      <p className="text-slate-400 text-xl">You spent the most on</p>
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-8 py-6 mt-2">
        <div className="text-4xl md:text-5xl font-black text-white mb-2">{top[0]}</div>
        <div className="text-3xl font-bold text-orange-400">{formatToUSD(top[1])}</div>
      </div>
      <p className="text-slate-400 text-base mt-2">
        That&apos;s <span className="text-orange-400 font-bold">{pct.toFixed(1)}%</span> of your total spending
      </p>
      {sorted.length > 1 && (
        <p className="text-slate-500 text-sm">
          Runner-up: <span className="text-slate-300">{sorted[1][0]}</span> at {formatToUSD(sorted[1][1])}
        </p>
      )}
    </div>
  );
}

function BudgetHealthSlide({
  budgetData,
  currentMonth,
}: {
  budgetData: Record<string, { categories: { name: string; categoryItems: { name: string; assigned: number; activity: number; available: number; snoozed?: boolean }[] }[] }>;
  currentMonth: string;
}) {
  const stats = useMemo(() => {
    const monthData = budgetData?.[currentMonth];
    if (!monthData?.categories) return { onTarget: 0, overBudget: 0, underBudget: 0, total: 0, overItems: [] as string[] };

    let onTarget = 0;
    let overBudget = 0;
    let underBudget = 0;
    const overItems: string[] = [];

    for (const group of monthData.categories) {
      if (group.name === "Credit Card Payments") continue;
      for (const item of group.categoryItems) {
        if (item.snoozed || item.assigned === 0) continue;
        if (item.available < 0) {
          overBudget++;
          overItems.push(item.name);
        } else if (item.available >= 0 && item.activity < 0) {
          onTarget++;
        } else {
          underBudget++;
        }
      }
    }

    return { onTarget, overBudget, underBudget, total: onTarget + overBudget + underBudget, overItems };
  }, [budgetData, currentMonth]);

  const pieData = [
    { name: "On Target", value: stats.onTarget, color: "#00c9a7" },
    { name: "Over Budget", value: stats.overBudget, color: "#ff5c6e" },
    { name: "Under Used", value: stats.underBudget, color: "#4f91ff" },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex flex-col h-full gap-4 px-6 py-8 overflow-hidden">
      <div className="text-center">
        <p className="text-emerald-400 text-sm uppercase tracking-[0.3em] font-semibold">Budget Health</p>
        <p className="text-slate-400 text-sm mt-1">Category breakdown for {format(parseISO(`${currentMonth}-01`), "MMMM")}</p>
      </div>

      {stats.total === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400">No budget targets set this month.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0">
          <div className="flex gap-6 justify-center w-full">
            {[
              { label: "On Target", value: stats.onTarget, color: "text-emerald-400" },
              { label: "Over Budget", value: stats.overBudget, color: "text-red-400" },
              { label: "Under Used", value: stats.underBudget, color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-4xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-slate-400 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {pieData.length > 0 && (
            <div className="w-full h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.overItems.length > 0 && (
            <div className="text-center">
              <p className="text-red-400 text-xs font-semibold mb-1">Over budget in:</p>
              <p className="text-slate-400 text-xs">{stats.overItems.slice(0, 5).join(" · ")}{stats.overItems.length > 5 ? ` +${stats.overItems.length - 5} more` : ""}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SavingsSlide({
  income,
  spent,
  lastIncome,
  lastSpent,
  currentMonth,
}: {
  income: number;
  spent: number;
  lastIncome: number;
  lastSpent: number;
  currentMonth: string;
}) {
  const net = income - spent;
  const lastNet = lastIncome - lastSpent;
  const netDiff = net - lastNet;
  const savedMore = net > lastNet;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
      <p className="text-cyan-400 text-sm uppercase tracking-[0.3em] font-semibold">Savings Check</p>
      <p className="text-slate-400 text-base">
        {format(parseISO(`${currentMonth}-01`), "MMMM")} net
      </p>

      <div className={`text-6xl font-black tabular-nums ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {net >= 0 ? "+" : ""}{formatToUSD(net)}
      </div>

      {income > 0 && (
        <p className="text-slate-400 text-sm">
          Savings rate: <span className={`font-bold ${savingsRate >= 20 ? "text-emerald-400" : savingsRate >= 10 ? "text-yellow-400" : "text-red-400"}`}>{savingsRate.toFixed(1)}%</span>
        </p>
      )}

      <div className="flex gap-6 mt-2">
        <div className="text-center">
          <div className="text-sm text-slate-500">Income</div>
          <div className="text-lg font-bold text-slate-200">{formatToUSD(income)}</div>
        </div>
        <div className="text-slate-700 self-center">vs</div>
        <div className="text-center">
          <div className="text-sm text-slate-500">Spending</div>
          <div className="text-lg font-bold text-slate-200">{formatToUSD(spent)}</div>
        </div>
      </div>

      {lastNet !== 0 && (
        <div className={`flex items-center gap-2 text-sm font-semibold mt-1 ${savedMore ? "text-emerald-400" : "text-red-400"}`}>
          <span>{savedMore ? "▲" : "▼"}</span>
          <span>
            {savedMore ? "Saved " : "Saved "}
            {formatToUSD(Math.abs(netDiff))} {savedMore ? "more" : "less"} than last month
          </span>
        </div>
      )}
    </div>
  );
}

function SummarySlide({
  budgetData,
  currentMonth,
  spent,
  lastSpent,
  net,
}: {
  budgetData: Record<string, { categories: { name: string; categoryItems: { name: string; assigned: number; activity: number; available: number; snoozed?: boolean }[] }[] }>;
  currentMonth: string;
  spent: number;
  lastSpent: number;
  net: number;
}) {
  const { onTarget, overBudget, total } = useMemo(() => {
    const monthData = budgetData?.[currentMonth];
    if (!monthData?.categories) return { onTarget: 0, overBudget: 0, total: 0 };
    let onTarget = 0;
    let overBudget = 0;
    for (const group of monthData.categories) {
      if (group.name === "Credit Card Payments") continue;
      for (const item of group.categoryItems) {
        if (item.snoozed || item.assigned === 0) continue;
        if (item.available < 0) overBudget++;
        else if (item.activity < 0) onTarget++;
      }
    }
    return { onTarget, overBudget, total: onTarget + overBudget };
  }, [budgetData, currentMonth]);

  const { grade, color, message } = getBudgetGrade(onTarget, overBudget, total);
  const spentLess = spent < lastSpent;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
      <p className="text-teal-400 text-sm uppercase tracking-[0.3em] font-semibold">Your Score</p>
      <div className={`text-9xl font-black leading-none ${color}`}>{grade}</div>
      <p className="text-slate-300 text-lg max-w-xs">{message}</p>

      <div className="flex gap-4 mt-4 flex-wrap justify-center">
        {spentLess && lastSpent > 0 && (
          <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 rounded-full">
            ✓ Spent less than last month
          </span>
        )}
        {net > 0 && (
          <span className="bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs px-3 py-1.5 rounded-full">
            ✓ Positive net savings
          </span>
        )}
        {overBudget === 0 && total > 0 && (
          <span className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs px-3 py-1.5 rounded-full">
            ✓ Zero categories over budget
          </span>
        )}
      </div>

      <p className="text-slate-600 text-xs mt-4">
        {format(parseISO(`${currentMonth}-01`), "MMMM yyyy")} · blankslate
      </p>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
interface MonthlyAuditModalProps {
  onClose: () => void;
}

export default function MonthlyAuditModal({ onClose }: MonthlyAuditModalProps) {
  const { accounts } = useAccountContext();
  const { budgetData, currentMonth } = useBudgetContext();
  const [slideIndex, setSlideIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);

  const currentMonthDate = useMemo(() => parseISO(`${currentMonth}-01`), [currentMonth]);
  const lastMonthDate = useMemo(() => subMonths(currentMonthDate, 1), [currentMonthDate]);
  const monthLabel = useMemo(() => format(currentMonthDate, "MMMM yyyy"), [currentMonthDate]);

  const spent = useMemo(() => getSpendingForMonth(accounts, currentMonthDate), [accounts, currentMonthDate]);
  const lastSpent = useMemo(() => getSpendingForMonth(accounts, lastMonthDate), [accounts, lastMonthDate]);
  const income = useMemo(() => getIncomeForMonth(accounts, currentMonthDate), [accounts, currentMonthDate]);
  const lastIncome = useMemo(() => getIncomeForMonth(accounts, lastMonthDate), [accounts, lastMonthDate]);
  const categorySpending = useMemo(() => getCategorySpendingForMonth(accounts, currentMonthDate), [accounts, currentMonthDate]);
  const net = income - spent;

  const TOTAL_SLIDES = 7;

  const goTo = useCallback((newIndex: number, dir: "forward" | "back") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setSlideIndex(newIndex);
      setAnimating(false);
    }, 220);
  }, [animating]);

  const next = useCallback(() => {
    if (slideIndex < TOTAL_SLIDES - 1) goTo(slideIndex + 1, "forward");
  }, [slideIndex, goTo, TOTAL_SLIDES]);

  const prev = useCallback(() => {
    if (slideIndex > 0) goTo(slideIndex - 1, "back");
  }, [slideIndex, goTo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onClose]);

  const slides = [
    <TitleSlide key="title" monthLabel={monthLabel} />,
    <TotalSpendingSlide key="spending" spent={spent} lastSpent={lastSpent} />,
    <TopCategoriesSlide key="categories" categorySpending={categorySpending} />,
    <BiggestSplurgeSlide key="splurge" categorySpending={categorySpending} totalSpent={spent} />,
    <BudgetHealthSlide key="health" budgetData={budgetData} currentMonth={currentMonth} />,
    <SavingsSlide key="savings" income={income} spent={spent} lastIncome={lastIncome} lastSpent={lastSpent} currentMonth={currentMonth} />,
    <SummarySlide key="summary" budgetData={budgetData} currentMonth={currentMonth} spent={spent} lastSpent={lastSpent} net={net} />,
  ];

  const bgTheme = SLIDE_THEMES[slideIndex] ?? SLIDE_THEMES[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card */}
      <div
        className={`relative w-full max-w-sm mx-4 h-[560px] rounded-3xl bg-gradient-to-br ${bgTheme} shadow-2xl overflow-hidden border border-white/5`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div className="absolute top-4 left-0 right-0 flex justify-center gap-1.5 z-10 px-6">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > slideIndex ? "forward" : "back")}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === slideIndex
                  ? "bg-white w-6"
                  : i < slideIndex
                  ? "bg-white/50 w-3"
                  : "bg-white/20 w-3"
              }`}
            />
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white/40 hover:text-white/80 transition-colors text-xl leading-none"
        >
          ✕
        </button>

        {/* Slide content */}
        <div
          className={`h-full w-full transition-all duration-200 ease-in-out ${
            animating
              ? direction === "forward"
                ? "opacity-0 translate-x-8"
                : "opacity-0 -translate-x-8"
              : "opacity-100 translate-x-0"
          }`}
        >
          {slides[slideIndex]}
        </div>

        {/* Nav hit areas */}
        <button
          className="absolute left-0 top-12 bottom-12 w-16 opacity-0 cursor-pointer"
          onClick={prev}
          disabled={slideIndex === 0}
          aria-label="Previous slide"
        />
        <button
          className="absolute right-0 top-12 bottom-12 w-16 opacity-0 cursor-pointer"
          onClick={next}
          disabled={slideIndex === TOTAL_SLIDES - 1}
          aria-label="Next slide"
        />

        {/* Visible nav arrows */}
        <div className="absolute bottom-5 left-0 right-0 flex justify-between px-6">
          <button
            onClick={prev}
            disabled={slideIndex === 0}
            className={`w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all ${
              slideIndex === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            ←
          </button>
          <span className="text-white/20 text-xs self-center tabular-nums">
            {slideIndex + 1} / {TOTAL_SLIDES}
          </span>
          <button
            onClick={next}
            disabled={slideIndex === TOTAL_SLIDES - 1}
            className={`w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all ${
              slideIndex === TOTAL_SLIDES - 1 ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
