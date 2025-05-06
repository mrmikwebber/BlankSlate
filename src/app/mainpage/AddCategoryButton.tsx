import { useState } from "react";

const AddCategoryButton = ({ handleSubmit }: { handleSubmit: (categoryName: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryGroupName, setCategoryGroupName] = useState("");

  const onSubmit = () => {
    if (categoryGroupName.trim() !== "") {
      handleSubmit(categoryGroupName);
      setCategoryGroupName(""); 
      setIsOpen(false); 
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow hover:bg-teal-600 transition"
      >
        Add Category Group
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white p-4 shadow-lg rounded-lg border z-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category Group Name
          </label>
          <input
            type="text"
            value={categoryGroupName}
            onChange={(e) => setCategoryGroupName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Enter category group name"
          />
          <button
            onClick={onSubmit}
            className="mt-3 w-full bg-blue-600 text-white py-2 rounded-md hover:bg-teal-600 transition"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
};

export default AddCategoryButton;
