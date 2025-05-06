import { formatToUSD } from "./formatToUSD";

export const getTargetStatus = (item) => {
  const assigned = item.assigned || 0;
  const activity = Math.abs(item.activity || 0);
  const available = item.available || 0;
  const overspent = available < 0;

  // Always show overspent status if available is negative
  if (overspent && assigned < activity) {
    return {
      message: `Overspent ${formatToUSD(available * -1)} of ${formatToUSD(
        assigned
      )}`,
      color: "text-red-600 font-semibold",
      type: "overspent",
    };
  }

  // If no target, return empty (but not null)
  if (!item.target) return { message: "", color: "", type: undefined };

  const needed = item.target.amountNeeded;
  const fullyFunded = assigned === needed;
  const overFunded = assigned > needed;
  const partiallyFunded = assigned < needed && assigned >= activity;
  const stillNeeded = needed - assigned;

  if (
    ((fullyFunded || overFunded) && available === 0) ||
    (fullyFunded && available > 0)
  ) {
    return {
      message: "Fully Funded",
      color: "text-green-600 font-semibold",
      type: "funded",
    };
  }

  if (overFunded) {
    return {
      message: `Funded ${formatToUSD(needed)} of ${formatToUSD(assigned)}`,
      color: "text-blue-600 font-semibold",
      type: "overfunded",
    };
  }

  if (partiallyFunded) {
    return {
      message: `${formatToUSD(stillNeeded)} more needed to fulfill target`,
      color: "text-yellow-600 font-semibold",
      type: "underfunded",
    };
  }

  return {
    message: `${formatToUSD(assigned)} / ${formatToUSD(needed)}`,
    color: "text-gray-600",
    type: "partial",
  };
};
