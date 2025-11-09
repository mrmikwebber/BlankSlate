import { useState, useEffect } from "react";
import { evaluate } from "mathjs";
import { formatToUSD } from "../utils/formatToUSD";

const EditableAssigned = ({ categoryName, itemName, item, handleInputChange }: { categoryName: string, itemName: string, item, handleInputChange: (categoryName: string, itemName: string, value: number) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState((item.assigned ?? 0).toString());

  const handleSave = () => {
    try {
      const evaluatedValue = evaluate(inputValue);
      const parsedValue = parseFloat(evaluatedValue);
  
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
    <td className="border border-gray-300 px-4 py-2">
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
          className="w-full p-1 border border-gray-300 rounded"
        />
      ) : (
        <span 
          data-cy="assigned-display"
          data-category={categoryName}
          data-item={itemName}
          onClick={() => setIsEditing(true)} 
          className="cursor-pointer"
        >
          {formatToUSD(item.assigned)}
        </span>
      )}
    </td>
  );
};

export default EditableAssigned;
