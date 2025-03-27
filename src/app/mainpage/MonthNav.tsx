import { useCallback, useEffect, useMemo, useState } from "react";
import React from 'react'
import { addMonths, format, parse, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBudgetContext } from "../context/BudgetContext";
import { formatToUSD } from "../utils/formatToUSD";
import next from "next";
import { useAccountContext } from "../context/AccountContext";

const MonthNav = () => {
    const { currentMonth, updateMonth, budgetData } = useBudgetContext();
    const { accounts } = useAccountContext();


  const formattedMonth = useMemo(
    () => {
        const parsedDate = parse(currentMonth, 'yyyy-MM', new Date());
        return format(parsedDate, "MMMM yyyy")
    },
    [currentMonth]
  );

  const goToNextMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const nextMonthDate = addMonths(parsedDate, 1);
    const nextMonth = format(nextMonthDate, 'yyyy-MM');
    updateMonth(nextMonth, 'forward', accounts);
  };
  
  const goToPreviousMonth = () => {
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const prevMonthDate = subMonths(parsedDate, 1);
    const prevMonth = format(prevMonthDate, 'yyyy-MM');
    updateMonth(prevMonth, 'backward', accounts);
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
      <button onClick={() => goToPreviousMonth()} className="p-2 rounded-lg hover:bg-gray-200">
        <ChevronLeft size={24} />
      </button>

      {budgetData && currentMonth && (
      <div className="text-lg font-semibold">
        {formattedMonth} — <span className="text-gray-600">Remaining to Assign:</span>  
        <span className={budgetData[currentMonth]?.ready_to_assign >= 0 ? "text-green-600" : "text-red-600"}>
          {formatToUSD(budgetData[currentMonth]?.ready_to_assign)}
        </span>
      </div>
      )}

      <button onClick={() => goToNextMonth()} className="p-2 rounded-lg hover:bg-gray-200">
        <ChevronRight size={24} />
      </button>
    </div>
  );
};

export default React.memo(MonthNav);
