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
    <div className="w-full px-6 py-3 border border-gray-300 rounded-xl bg-white shadow-sm text-sm">
      <div className="flex justify-between items-center mb-2">
        <button
          onClick={goToPreviousMonth}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="font-semibold text-gray-800 tracking-wide">
          {formattedMonth}
        </span>

        <button
          onClick={goToNextMonth}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {budgetData && currentMonth && (
        <div className="text-center border-t pt-2 text-gray-700 text-sm">
          Remaining:{" "}
          <span
            className={`font-semibold ${
              budgetData[currentMonth]?.ready_to_assign >= 0
                ? "text-green-600"
                : "text-red-600"
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
