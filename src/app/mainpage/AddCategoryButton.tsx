import { useState } from "react";

const AddCategoryButton = ({ handleSubmit }: { handleSubmit: (categoryName: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const onSubmit = () => {
    if (categoryName.trim() !== "") {
      handleSubmit(categoryName);
      setCategoryName(""); 
      setIsOpen(false); 
    }
  };

  return (
    <div className="relative inline-block">
      {/* Add Category Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-teal-500 text-white px-4 py-2 rounded-md shadow-md hover:bg-blue-500 transition"
      >
        Add Category
      </button>

      {/* Hovering Box */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white p-4 shadow-lg rounded-lg border z-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category Name
          </label>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Enter category name"
          />
          <button
            onClick={onSubmit}
            className="mt-3 w-full bg-teal-500 text-white py-2 rounded-md hover:bg-green-500 transition"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
};

export default AddCategoryButton;
