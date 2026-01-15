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
    <div className="w-full px-8 py-4 border border-gray-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm dark:shadow-md">
      <div className="flex justify-between items-center">
        <button
          data-cy="month-prev"
          onClick={goToPreviousMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors"
        >
          <ChevronLeft size={22} />
        </button>

        <span data-cy="month-label" className="text-lg font-semibold text-gray-800 dark:text-slate-100 tracking-wide">
          {formattedMonth}
        </span>

        <button
          data-cy="month-next"
          onClick={goToNextMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(MonthNav);
