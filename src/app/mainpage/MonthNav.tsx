import { useMemo } from "react";
import React from "react";
import { addMonths, format, parse, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBudgetContext } from "../context/BudgetContext";

const MonthNav = () => {
  const { currentMonth, setCurrentMonth } = useBudgetContext();

  const formattedMonth = useMemo(() => {
    const parsedDate = parse(currentMonth, "yyyy-MM", new Date());
    return format(parsedDate, "MMMM yyyy");
  }, [currentMonth]);

  const goToNextMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const nextMonth = format(addMonths(parsedDate, 1), "yyyy-MM");
    setCurrentMonth(nextMonth);
  };

  const goToPreviousMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const prevMonth = format(subMonths(parsedDate, 1), "yyyy-MM");
    setCurrentMonth(prevMonth);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        data-cy="month-prev"
        onClick={goToPreviousMonth}
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
      >
        <ChevronLeft size={14} />
      </button>

      <span data-cy="month-label" className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tracking-wide px-1 min-w-[108px] text-center">
        {formattedMonth}
      </span>

      <button
        data-cy="month-next"
        onClick={goToNextMonth}
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

export default React.memo(MonthNav);
