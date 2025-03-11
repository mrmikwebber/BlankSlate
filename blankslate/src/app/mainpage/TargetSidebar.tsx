import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { differenceInDays, differenceInMonths, getMonth, isSameMonth, parseISO } from "date-fns";
import { useBudgetContext } from "../context/BudgetContext";

export const TargetSidebar = ({ itemName, onClose }) => {
  const [categoryItem, setCategoryItem] = useState(null);
  const [target, setTarget] = useState(null); 
  const [targetAmount, setTargetAmount] = useState(""); 
  const [targetType, setTargetType] = useState("Monthly");
  const [customTargetDate, setCustomTargetDate] = useState(""); 
  const [isVisible, setIsVisible] = useState(false);
  const [showForm, setShowForm] = useState(false);

    const {
    currentMonth,
    budgetData,
    setCategoryTarget,
    } = useBudgetContext();


  const findCategoryItemByName = (itemName) => {
    return budgetData[currentMonth]?.categories
      ?.flatMap((category) =>
        category.categoryItems.map((item) => ({ ...item, categoryName: category.name }))
      )
      .find((item) => item.name === itemName);
  };

  useEffect(() => {
    const foundItem = findCategoryItemByName(itemName);
    setCategoryItem(foundItem);
    setIsVisible(!!foundItem);

    if (foundItem) {
      const existingTarget = foundItem.target || null;
      console.log(existingTarget);
      setTarget(existingTarget);
      setTargetAmount(existingTarget?.amount || "");
      setTargetType(existingTarget?.type || "Monthly");
      setCustomTargetDate(existingTarget?.targetDate || "");
      setShowForm(!!existingTarget);
    }
  }, [itemName, currentMonth]);

  const calculateNeededAmount = () => {
    if (!targetAmount) return 0;
    const amount = parseFloat(targetAmount);
    if (targetType === "Weekly") {
      return amount * 4; 
    } else if (targetType === "Monthly") {
      return amount;
    } else if (targetType === "Custom" && customTargetDate) {
        const targetMonthNumber = getMonth(parseISO(customTargetDate)) + 1;
        const currentMonthNumber = getMonth(new Date()) + 1;

        const monthsUntilTarget = targetMonthNumber - currentMonthNumber === 0 ? 1 : targetMonthNumber - currentMonthNumber + 1;

        let totalAssigned = 0;
        Object.keys(budgetData).forEach((month) => {
          const monthData = budgetData[month]?.categories?.flatMap((category) =>
            category.categoryItems.filter((item) => item.name === itemName)
          );
      
          totalAssigned += monthData.reduce((sum, item) => sum + item.assigned, 0);
        });

        let remainingAmount = amount - totalAssigned;
      
        return remainingAmount / monthsUntilTarget;
    }

    return 0;
  };

  const handleSave = () => {
    if (categoryItem && targetAmount) {
      const neededAmount = calculateNeededAmount();
      const newTarget = {
        type: targetType,
        amount: parseFloat(targetAmount),
        targetDate: targetType === "Custom" ? customTargetDate : null,
        amountNeeded: neededAmount,
      };
      setCategoryTarget(categoryItem.name, newTarget);
      setTarget(newTarget);
      setShowForm(true);
    }
  };
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); 
  };

  if (!categoryItem) return null;

  return (
    <div
      className={`fixed right-0 top-0 h-full w-64 bg-white shadow-lg border-l border-gray-300 p-4 
      transition-transform duration-300 ${isVisible ? "translate-x-0" : "translate-x-full"}`}
    >
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition"
      >
        <X size={20} className="text-gray-600" />
      </button>

      <h2 className="text-lg font-semibold text-gray-900 mb-2">{categoryItem.name}</h2>
      <p className="text-sm text-gray-600 mb-2">
        <strong>Category:</strong> {categoryItem.categoryName}
      </p>
      <p className="text-sm text-gray-600">
        <strong>Assigned:</strong> ${categoryItem.assigned.toFixed(2)}
      </p>
      <p className="text-sm text-gray-600">
        <strong>Available:</strong> ${categoryItem.available.toFixed(2)}
      </p>

      {!target && !showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="mt-4 w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-400 transition"
        >
          Create Target
        </button>
      ) : (
        <>
          {target && (
            <div className="mt-4 p-3 border border-gray-300 rounded bg-gray-100">
              <p className="text-sm font-medium text-gray-700">Current Target:</p>
              <p className="text-sm">Type: {target.type}</p>
              <p className="text-sm">Amount: ${target.amount.toFixed(2)}</p>
              {target.type === "Custom" && <p className="text-sm">Due: {target.targetDate}</p>}
              <p className="text-sm font-medium mt-2">Amount Needed: ${target.amountNeeded.toFixed(2)}</p>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Set Target</label>
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded mt-1"
              placeholder="Enter target amount"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Target Type</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded mt-1"
            >
              <option value="Monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          {targetType === "Custom" && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Target Date</label>
              <input
                type="date"
                value={customTargetDate}
                onChange={(e) => setCustomTargetDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded mt-1"
              />
            </div>
          )}

          <p className="text-sm text-gray-600 mt-2">
            <strong>Amount Needed:</strong> ${calculateNeededAmount().toFixed(2)}
          </p>

          <button
            onClick={handleSave}
            className="mt-4 w-full bg-teal-600 text-white py-2 rounded-md hover:bg-teal-500 transition"
          >
            {target ? "Update Target" : "Save Target"}
          </button>
        </>
      )}
    </div>
  );
};
