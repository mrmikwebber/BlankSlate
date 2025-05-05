import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getMonth, parseISO, subMonths, format, isSameMonth } from "date-fns";
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
  useEffect(() => {
    const foundItem = findCategoryItemByName(itemName);
    setCategoryItem(foundItem);
    setIsVisible(!!foundItem);

    if (foundItem) {
      const existingTarget = foundItem.target || null;
      setTarget(existingTarget);
      setTargetAmount(existingTarget?.amount || "");
      if (foundItem.categoryName === "Credit Card Payments") {
        setTargetType(existingTarget?.type || "Full Payoff");
      } else {
        setTargetType(existingTarget?.type.toLowerCase() || "monthly");
      }
      setCustomTargetDate(existingTarget?.targetDate || "");
      setIsCreditCard(foundItem.categoryName === "Credit Card Payments");
    }
  }, [itemName, currentMonth]);

  useEffect(() => {
    if (targetType === "Full Payoff") {
      const accountBalance =
        -1 * accounts.filter((account) => account.name === itemName)[0].balance;
      setTargetAmount(accountBalance.toString());
    }
  }, [targetType]);

  const calculateNeededAmount = () => {
    if (!targetAmount) return 0;
    const amount = parseFloat(targetAmount);
    if (targetType === "Weekly") {
      return amount * 4;
    } else if (targetType === "monthly") {
      return amount;
    } else if (
      (targetType === "Custom" || targetType === "Full Payoff") &&
      customTargetDate
    ) {
      const targetMonthNumber = getMonth(parseISO(customTargetDate)) + 1;
      const currentMonthNumber = getMonth(parseISO(currentMonth));

      let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
      if (monthsUntilTarget <= 0) monthsUntilTarget = 1;

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

      const remainingAmount = amount - totalAssigned;

      return remainingAmount / monthsUntilTarget;
    }

    return 0;
  };

  const getPreviousMonthAvailable = (categoryItem) => {
    if (!categoryItem) return 0;

    const prevMonth = subMonths(
      format(parseISO(`${currentMonth}-01`), "yyyy-MM"),
      1
    );
    const prevMonthKey = `${prevMonth.getFullYear()}-${(getMonth(prevMonth) + 1)
      .toString()
      .padStart(2, "0")}`;

    return (
      budgetData[prevMonthKey]?.categories
        ?.flatMap((category) => category.categoryItems)
        ?.find((item) => item.name === categoryItem.name)?.available || 0
    );
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

  const previousMonthAvailable = getPreviousMonthAvailable(categoryItem);
  const cashSpending = getSpendingByType(categoryItem, "debit");
  const creditSpending = getSpendingByType(categoryItem, "credit");

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
    <div
      ref={sidebarRef}
      className={`fixed right-0 top-[76px] h-full w-64 bg-white shadow-lg border-l border-gray-300 p-4 
      transition-transform duration-300 ${
        isVisible ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition"
      >
        <X size={20} className="text-gray-600" />
      </button>

      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        {categoryItem.name}
      </h2>
      <p className="text-sm text-gray-600 mb-2">
        <strong>Category:</strong> {categoryItem.categoryName}
      </p>
      {!isCreditCard && (
        <>
          <p className="text-sm text-gray-600">
            <strong>Assigned:</strong> {formatToUSD(categoryItem.assigned)}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Available:</strong> {formatToUSD(categoryItem.available)}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Leftover Money: </strong>
            {formatToUSD(Math.max(previousMonthAvailable, 0))}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Cash Spending:</strong> {formatToUSD(cashSpending)}
          </p>
          <p className="text-sm text-gray-600 mb-2">
            <strong>Credit Spending:</strong> {formatToUSD(creditSpending)}
          </p>
        </>
      )}

      {isCreditCard && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Debt Payment Plan
          </label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mt-1"
          >
            <option value="Full Payoff">Pay Full Balance by Date</option>
            <option value="monthly">Fixed Monthly Payment</option>
          </select>
        </div>
      )}

      {target && targetType !== "Full Payoff" && (
        <div className="mt-4 p-3 border border-gray-300 rounded bg-gray-100">
          <p className="text-sm font-medium text-gray-700">Current Target:</p>
          <p className="text-sm">Type: {target.type}</p>
          <p className="text-sm">Amount: ${target.amount.toFixed(2)}</p>
          {target.type === "Custom" && (
            <p className="text-sm">Due: {target.targetDate}</p>
          )}
          <p className="text-sm font-medium mt-2">
            Amount Needed: ${target.amountNeeded.toFixed(2)}
          </p>
        </div>
      )}

      {targetType === "Full Payoff" && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Pay Off By
          </label>
          <input
            type="month"
            value={customTargetDate}
            onChange={(e) => setCustomTargetDate(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mt-1"
          />
        </div>
      )}

      {targetType !== "Full Payoff" && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Target Amount
          </label>
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mt-1"
          />
        </div>
      )}

      {!isCreditCard && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Target Type
          </label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mt-1"
          >
            <option value="monthly">Monthly</option>
            <option value="Weekly">Weekly</option>
            <option value="Custom">Custom</option>
          </select>
        </div>
      )}

      {targetType === "Custom" && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Target Date
          </label>
          <input
            type="date"
            value={customTargetDate}
            onChange={(e) => setCustomTargetDate(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mt-1"
          />
        </div>
      )}

      <p className="text-sm text-gray-600 mt-2">
        <strong>Amount Needed:</strong> {formatToUSD(calculateNeededAmount())}
      </p>

      <button
        onClick={handleSave}
        className="mt-4 w-full bg-teal-600 text-white py-2 rounded-md hover:bg-teal-500 transition"
      >
        {target ? "Update Target" : "Save Target"}
      </button>
      {target && (
        <button
          onClick={handleRemoveTarget}
          className="mt-4 w-full bg-teal-600 text-white py-2 rounded-md hover:bg-teal-500 transition"
        >
          Remove Target
        </button>
      )}
    </div>
  );
};
