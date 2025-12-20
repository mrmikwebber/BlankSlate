import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  getMonth,
  parseISO,
  format,
  isSameMonth,
} from "date-fns";
import { useBudgetContext } from "../context/BudgetContext";
import { useAccountContext } from "../context/AccountContext";
import { formatToUSD } from "../utils/formatToUSD";

export const TargetSidebar = ({ itemName, onClose }) => {
  const [categoryItem, setCategoryItem] = useState(null);
  const [target, setTarget] = useState(null);
  const [targetAmount, setTargetAmount] = useState("");
  const [targetType, setTargetType] = useState("");
  const [customTargetDate, setCustomTargetDate] = useState("");
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const { currentMonth, budgetData, setCategoryTarget } = useBudgetContext();
  const { accounts } = useAccountContext();

  const sidebarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const foundItem = findCategoryItemByName(itemName);
    setCategoryItem(foundItem);
    setIsVisible(!!foundItem);

    if (foundItem) {
      const existingTarget = foundItem.target || null;
      setTarget(existingTarget);
      setTargetAmount(existingTarget?.amount || "");
      setTargetType(
        foundItem.categoryName === "Credit Card Payments"
          ? existingTarget?.type || "Full Payoff"
          : existingTarget?.type?.toLowerCase() || "monthly"
      );
      setCustomTargetDate(existingTarget?.targetDate || "");
      setIsCreditCard(foundItem.categoryName === "Credit Card Payments");
    }
  }, [itemName, currentMonth]);

  useEffect(() => {
    if (targetType === "Full Payoff") {
      const account = accounts.find((a) => a.name === itemName);
      if (account) {
        setTargetAmount((-1 * account.balance).toString());
      }
    }
  }, [targetType]);

  const findCategoryItemByName = (itemName) => {
    return budgetData[currentMonth]?.categories
      ?.flatMap((category) =>
        category.categoryItems.map((item) => ({
          ...item,
          categoryName: category.name,
        }))
      )
      .find((item) => item.name === itemName);
  };

  const calculateNeededAmount = () => {
    const amount = parseFloat(targetAmount || "0");
    if (targetType === "Weekly") return amount * 4;
    if (targetType === "monthly") return amount;

    if (
      (targetType === "Custom" || targetType === "Full Payoff") &&
      customTargetDate
    ) {
      const targetMonthNumber = getMonth(parseISO(customTargetDate)) + 1;
      const currentMonthNumber = getMonth(parseISO(currentMonth));
      let monthsUntil = targetMonthNumber - currentMonthNumber;
      if (monthsUntil <= 0) monthsUntil = 1;

      let totalAssigned = 0;
      Object.keys(budgetData).forEach((month) => {
        const monthData = budgetData[month]?.categories?.flatMap((category) =>
          category.categoryItems.filter((item) => item.name === itemName)
        );

        totalAssigned += monthData.reduce(
          (sum, item) => sum + item.assigned,
          0
        );
      });

      const remaining = amount - totalAssigned;
      return remaining / monthsUntil;
    }

    return 0;
  };

  const handleSave = () => {
    if (categoryItem && targetAmount) {
      const neededAmount = calculateNeededAmount();
      const newTarget = {
        type: targetType,
        amount: parseFloat(targetAmount),
        targetDate:
          targetType === "Custom" || targetType === "Full Payoff"
            ? customTargetDate
            : null,
        amountNeeded: neededAmount,
      };
      setCategoryTarget(categoryItem.name, newTarget);
      setTarget(newTarget);
    }
  };

  const getSpendingByType = (categoryItem, type) => {
    if (!categoryItem) return 0;

    return accounts
      .filter((account) => account.type === type)
      .flatMap((account) => account.transactions)
      .filter((transaction) => {
        return (
          transaction.category === categoryItem.name &&
          isSameMonth(
            format(parseISO(transaction.date), "yyyy-MM"),
            format(parseISO(currentMonth), "yyyy-MM")
          )
        );
      })
      .reduce((sum, tx) => sum + Math.abs(tx.balance), 0);
  };

  const handleRemoveTarget = () => {
    setCategoryTarget(categoryItem.name, null);
    handleClose();
  };

  const handleClose = () => {
    setIsVisible(false);
    setTargetType("");
    setTimeout(onClose, 300);
  };

  if (!categoryItem) return null;

  return (
    <>
      <div
        ref={sidebarRef}
        className={`fixed top-[72px] right-0 bottom-0 w-80 max-h-[calc(100vh-72px)] overflow-y-auto bg-white dark:bg-slate-900 shadow-2xl dark:shadow-2xl border-l border-gray-200 dark:border-slate-700 z-50 transition-transform duration-300 ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-base font-semibold text-gray-800 dark:text-slate-100">
            {categoryItem.name}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-full p-1 hover:bg-gray-200 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="px-4 py-4 text-sm space-y-3">
          <div>
            <p className="text-gray-600 dark:text-slate-400">
              <strong>Group:</strong> {categoryItem.categoryName}
            </p>
            {!isCreditCard && (
              <>
                <p>
                  <strong>Assigned:</strong>{" "}
                  {formatToUSD(categoryItem.assigned)}
                </p>
                <p>
                  <strong>Available:</strong>{" "}
                  {formatToUSD(categoryItem.available)}
                </p>
              </>
            )}
          </div>

          {!isCreditCard && (
            <>
              <p>
                <strong>Last Month Leftover:</strong>{" "}
                {formatToUSD(
                  budgetData?.[currentMonth]?.previousMonthAvailable || 0
                )}
              </p>
              <p>
                <strong>Spending:</strong>{" "}
                {formatToUSD(
                  getSpendingByType(categoryItem, "debit") +
                    getSpendingByType(categoryItem, "credit")
                )}
              </p>
            </>
          )}

          {isCreditCard && (
            <div>
              <label className="block font-medium mb-1">
                Debt Payment Plan
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="Full Payoff">Pay Full Balance by Date</option>
                <option value="monthly">Fixed Monthly Payment</option>
              </select>
            </div>
          )}

          {target && targetType !== "Full Payoff" && (
            <div className="p-3 bg-gray-100 dark:bg-slate-800 border dark:border-slate-700 rounded">
              <p className="text-slate-900 dark:text-slate-100">
                <strong>Current:</strong> {target.type} — ${target.amount}
              </p>
              {target.targetDate && (
                <p className="text-sm">Due: {target.targetDate}</p>
              )}
              <p className="mt-1">
                <strong>Amount Needed:</strong>{" "}
                {formatToUSD(target.amountNeeded)}
              </p>
            </div>
          )}

          {targetType === "Full Payoff" && (
            <div>
              <label className="block font-medium mb-1 dark:text-slate-200">Pay Off By</label>
              <input
                type="month"
                value={customTargetDate}
                onChange={(e) => setCustomTargetDate(e.target.value)}
                className="w-full p-2 border rounded border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {targetType !== "Full Payoff" && (
            <div>
              <label className="block font-medium mb-1 dark:text-slate-200">Target Amount</label>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full p-2 border rounded border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {!isCreditCard && (
            <div>
              <label className="block font-medium mb-1 dark:text-slate-200">Target Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full p-2 border rounded border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="monthly">Monthly</option>
                <option value="Weekly">Weekly</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          )}

          {targetType === "Custom" && (
            <div>
              <label className="block font-medium mb-1 dark:text-slate-200">Target Date</label>
              <input
                type="date"
                value={customTargetDate}
                onChange={(e) => setCustomTargetDate(e.target.value)}
                className="w-full p-2 border rounded border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <p className="dark:text-slate-300">
            <strong>Amount Needed:</strong>{" "}
            {formatToUSD(calculateNeededAmount())}
          </p>

          <button
            onClick={handleSave}
            className="w-full bg-teal-600 dark:bg-teal-700 text-white py-2 rounded hover:bg-teal-500 dark:hover:bg-teal-600 transition"
          >
            {target ? "Update Target" : "Save Target"}
          </button>

          {target && (
            <button
              onClick={handleRemoveTarget}
              className="w-full bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-slate-200 py-2 rounded hover:bg-gray-300 dark:hover:bg-slate-600 transition"
            >
              Remove Target
            </button>
          )}
        </div>
      </div>
    </>
  );
};
