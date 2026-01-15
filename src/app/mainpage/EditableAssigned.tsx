import { useState, useEffect, memo, useCallback } from "react";
import { evaluate } from "mathjs";
import { formatToUSD } from "../utils/formatToUSD";
import { TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface EditableAssignedProps {
  categoryName: string;
  itemName: string;
  item: { assigned: number };
  handleInputChange: (categoryName: string, itemName: string, value: number) => void;
  showDelta?: boolean;
  deltaAmount?: number;
}

const EditableAssigned = memo(({
  categoryName,
  itemName,
  item,
  handleInputChange,
  showDelta = false,
  deltaAmount = 0,
}: EditableAssignedProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState((item.assigned ?? 0).toString());

  const handleSave = useCallback(() => {
    try {
      // Remove commas before evaluation
      const cleanedValue = inputValue.replace(/,/g, '');
      const evaluatedValue = evaluate(cleanedValue);
      const parsedValue = parseFloat(evaluatedValue as string);

      if (isNaN(parsedValue)) {
        handleInputChange(categoryName, itemName, 0);
      } else {
        handleInputChange(categoryName, itemName, parsedValue);
      }

      setIsEditing(false);
    } catch (error) {
      handleInputChange(categoryName, itemName, 0);
      setIsEditing(false);
      console.error(error);
    }
  }, [categoryName, itemName, inputValue, handleInputChange]);

  useEffect(() => {
    if (!isEditing) {
      setInputValue((item.assigned ?? 0).toString());
    }
  }, [item.assigned, isEditing]);

  const deltaClass = deltaAmount > 0
    ? "text-emerald-600"
    : deltaAmount < 0
      ? "text-red-600"
      : "text-slate-500";

  return (
    <td className="p-2 text-right align-middle">
      <div className="flex flex-col items-end gap-1">
        {isEditing ? (
          <input
            data-cy="assigned-input"
            data-category={categoryName}
            data-item={itemName}
            type="text"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="w-full h-7 px-2 text-right font-mono text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        ) : (
          <span
            data-cy="assigned-display"
            data-category={categoryName}
            data-item={itemName}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="block cursor-pointer px-2 py-0.5 text-right font-mono text-sm rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors"
          >
            {formatToUSD(item.assigned)}
          </span>
        )}

        {showDelta && (
          <span className={`text-[11px] font-semibold ${deltaClass}`}>
            {deltaAmount === 0
              ? "No change"
              : `${deltaAmount > 0 ? "▲" : "▼"} ${deltaAmount > 0 ? "+" : "-"}${formatToUSD(Math.abs(deltaAmount))}`}
          </span>
        )}
      </div>
    </td>
  );
});

EditableAssigned.displayName = 'EditableAssigned';

export default EditableAssigned;
