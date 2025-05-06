import { getTargetStatus } from "@/app/utils/getTargetStatus";

interface CategoryItem {
  name: string;
  assigned: number;
  activity: number;
  available: number;
  target?: any;
}

interface CategoryGroup {
  name: string;
  categoryItems: CategoryItem[];
}

interface Props {
  categories: CategoryGroup[];
  unassignedAmount: number;
  creditCardsNeedingPayment: string[];
}

export default function ItemsToAddress({
  categories,
  unassignedAmount,
  creditCardsNeedingPayment,
}: Props) {
  const overspentCategories = categories.flatMap(group =>
    group.categoryItems.filter(item => item.available < 0)
  );

  const unfundedTargets = categories.flatMap(group =>
    group.categoryItems.filter(item => {
      const status = getTargetStatus(item);
      return status && status.type === "underfunded";
    })
  );

  return (
    <div className="bg-white rounded-md p-4 shadow-sm space-y-1">
      <h3 className="text-sm font-semibold">Items to Address</h3>
      <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
        {unassignedAmount > 0 && (
          <li>{`$${unassignedAmount.toFixed(2)} remains unassigned`}</li>
        )}
        {overspentCategories.length > 0 && (
          <li>{`${overspentCategories.length} categor${
            overspentCategories.length > 1 ? "ies are" : "y is"
          } overspent`}</li>
        )}
        {creditCardsNeedingPayment.length > 0 && (
          <li>
            {`Payment needed for: ${creditCardsNeedingPayment.join(", ")}`}
          </li>
        )}
        {unfundedTargets.length > 0 && (
          <li>
            {`${unfundedTargets.length} target${
              unfundedTargets.length > 1 ? "s" : ""
            } still underfunded`}
          </li>
        )}
        {unassignedAmount === 0 &&
          overspentCategories.length === 0 &&
          creditCardsNeedingPayment.length === 0 &&
          unfundedTargets.length === 0 && (
            <li className="text-green-600">Everything looks good 🎉</li>
          )}
      </ul>
    </div>
  );
}