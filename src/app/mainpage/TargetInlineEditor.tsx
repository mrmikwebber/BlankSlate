import { useEffect, useState } from "react";
import { useBudgetContext } from "../context/BudgetContext";
import { useAccountContext } from "../context/AccountContext";
import { formatToUSD } from "../utils/formatToUSD";
import { getMonth, parseISO } from "date-fns";

export default function InlineTargetEditor({ itemName, onClose }) {
  const { currentMonth, budgetData, setCategoryTarget } = useBudgetContext();
  const { accounts } = useAccountContext();

  const [targetAmount, setTargetAmount] = useState("");
  const [targetType, setTargetType] = useState("monthly");
  const [customTargetDate, setCustomTargetDate] = useState("");

  const categoryItem = budgetData[currentMonth]?.categories
    .flatMap((cat) =>
      cat.categoryItems.map((item) => ({ ...item, categoryName: cat.name }))
    )
    .find((item) => item.name === itemName);

  useEffect(() => {
    if (!categoryItem) return;
    const existing = categoryItem.target || null;
    setTargetAmount(existing?.amount || "");
    setTargetType(
      categoryItem.categoryName === "Credit Card Payments"
        ? existing?.type || "Full Payoff"
        : existing?.type?.toLowerCase() || "monthly"
    );
    setCustomTargetDate(existing?.targetDate || "");
  }, [itemName]);

  const calculateNeededAmount = () => {
    const amount = parseFloat(targetAmount || "0");
    if (targetType === "Weekly") return amount * 4;
    if (targetType === "monthly") return amount;

    if ((targetType === "Custom" || targetType === "Full Payoff") && customTargetDate) {
      const targetMonthNumber = getMonth(parseISO(customTargetDate)) + 1;
      const currentMonthNumber = getMonth(parseISO(currentMonth));
      let monthsUntil = targetMonthNumber - currentMonthNumber;
      if (monthsUntil <= 0) monthsUntil = 1;

      let totalAssigned = 0;
      Object.keys(budgetData).forEach((month) => {
        const items = budgetData[month]?.categories
          ?.flatMap((cat) => cat.categoryItems.filter((i) => i.name === itemName));
        totalAssigned += items.reduce((sum, i) => sum + i.assigned, 0);
      });

      return (amount - totalAssigned) / monthsUntil;
    }

    return 0;
  };

  const handleSave = () => {
    const needed = calculateNeededAmount();
    const newTarget = {
      type: targetType,
      amount: parseFloat(targetAmount),
      targetDate:
        targetType === "Custom" || targetType === "Full Payoff"
          ? customTargetDate
          : null,
      amountNeeded: needed,
    };
    setCategoryTarget(itemName, newTarget);
    onClose();
  };

  if (!categoryItem) return null;

  return (
    <tr>
      <td colSpan={4} className="bg-gray-50 border-t px-4 py-3">
        <div className="space-y-3 text-sm">
          <div>
            <label className="block font-medium mb-1">Target Type</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-full border p-2 rounded"
            >
              <option value="monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Custom">Custom</option>
              <option value="Full Payoff">Pay Full Balance by Date</option>
            </select>
          </div>

          {targetType === "Custom" || targetType === "Full Payoff" ? (
            <div>
              <label className="block font-medium mb-1">Target Date</label>
              <input
                type="date"
                value={customTargetDate}
                onChange={(e) => setCustomTargetDate(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
          ) : null}

          {targetType !== "Full Payoff" && (
            <div>
              <label className="block font-medium mb-1">Target Amount</label>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              Amount Needed: {formatToUSD(calculateNeededAmount())}
            </span>
            <div className="space-x-2">
              <button
                onClick={onClose}
                className="bg-gray-200 px-3 py-1 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-teal-600 text-white px-3 py-1 rounded text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
