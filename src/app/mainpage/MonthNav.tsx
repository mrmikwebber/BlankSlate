import { useMemo } from "react";
import React from "react";
import { addMonths, format, parse, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import { useAccountContext } from "../context/AccountContext";

const MonthNav = () => {
  const { currentMonth, updateMonth, budgetData } = useBudgetContext();
  const { accounts } = useAccountContext();

  const formattedMonth = useMemo(() => {
    const parsedDate = parse(currentMonth, "yyyy-MM", new Date());
    return format(parsedDate, "MMMM yyyy");
  }, [currentMonth]);

  const goToNextMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const nextMonthDate = addMonths(parsedDate, 1);
    const nextMonth = format(nextMonthDate, "yyyy-MM");
    updateMonth(nextMonth, "forward", accounts);
  };

  const goToPreviousMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const prevMonthDate = subMonths(parsedDate, 1);
    const prevMonth = format(prevMonthDate, "yyyy-MM");
    updateMonth(prevMonth, "backward", accounts);
  };

  return (
    <div className="w-full px-6 py-3 border border-gray-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm dark:shadow-md text-sm">
      <div className="flex justify-between items-center mb-2">
        <button
          data-cy="month-prev"
          onClick={goToPreviousMonth}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <span data-cy="month-label" className="font-semibold text-gray-800 dark:text-slate-100 tracking-wide">
          {formattedMonth}
        </span>

        <button
          data-cy="month-next"
          onClick={goToNextMonth}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {budgetData && currentMonth && (
        <div className="text-center border-t dark:border-slate-700 pt-2 text-gray-700 dark:text-slate-300 text-sm">
          Remaining:{" "}
          <span
            className={`font-semibold ${
              budgetData[currentMonth]?.ready_to_assign >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatToUSD(budgetData[currentMonth]?.ready_to_assign)}
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(MonthNav);
