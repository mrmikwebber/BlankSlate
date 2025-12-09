import { useState, useEffect } from "react";
import { evaluate } from "mathjs";
import { formatToUSD } from "../utils/formatToUSD";
import { TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface EditableAssignedProps {
  categoryName: string;
  itemName: string;
  item: { assigned: number };
  handleInputChange: (categoryName: string, itemName: string, value: number) => void;
}

const EditableAssigned = ({
  categoryName,
  itemName,
  item,
  handleInputChange,
}: EditableAssignedProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState((item.assigned ?? 0).toString());

  const handleSave = () => {
    try {
      const evaluatedValue = evaluate(inputValue);
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
  };

  useEffect(() => {
    if (!isEditing) {
      setInputValue((item.assigned ?? 0).toString());
    }
  }, [item.assigned, isEditing]);

  return (
    <td className="p-2 text-right align-middle">
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
          className="w-full h-7 px-2 text-right font-mono text-sm border border-slate-300 rounded"
        />
      ) : (
        <span
          data-cy="assigned-display"
          data-category={categoryName}
          data-item={itemName}
          onClick={() => setIsEditing(true)}
          className="block cursor-pointer px-2 py-0.5 text-right font-mono text-sm rounded hover:bg-slate-100 transition-colors"
        >
          {formatToUSD(item.assigned)}
        </span>
      )}
    </td>
  );
};

export default EditableAssigned;
