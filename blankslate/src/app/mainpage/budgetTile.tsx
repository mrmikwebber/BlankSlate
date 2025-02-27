"use client";
import { useState, useEffect, Fragment } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import { useAccountContext } from "../context/AccountContext";
import AddCategoryButton from "./AddCategoryButton";

export default function CollapsibleTable() {
  const { accounts } = useAccountContext();
  const [assignableMoney, setAssignableMoney] = useState(0);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [readyToAssign, setReadyToAssign] = useState(0);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [data, setData] = useState([
    {
      category: "Bills",
      items: [
        { name: "Rent", assigned: 0, activity: -1817.11 },
        { name: "Electricity", assigned: 0, activity: -56.92 },
        { name: "Car Payment", assigned: 0, activity: 0 },
        { name: "Renters Insurance", assigned: 0, activity: 0 },
        { name: "Internet", assigned: 0, activity: -69.99 },
        { name: "Student Loans", assigned: 0, activity: 0 },
      ],
    },
    {
      category: "Subscriptions",
      items: [
        { name: "Max Bundle", assigned: 0, activity: -32.57 },
        { name: "Game Pass", assigned: 0, activity: -21.39 },
        { name: "Prime", assigned: 0, activity: -22.79 },
        { name: "Spotify", assigned: 0, activity: -13.02 },
        { name: "Amex Gold", assigned: 0, activity: 0 },
        { name: "Google Subscription", assigned: 0, activity: -3.16 },
      ],
    },
  ]);

  useEffect(() => {
    const totalDebitFunds = accounts
      .filter((acc) => acc.type === "debit")
      .reduce((sum, acc) => sum + acc.balance, 0);
    setAssignableMoney(totalDebitFunds);
    setReadyToAssign(totalDebitFunds);
  }, [accounts]);

  useEffect(() => {
    const updatedData = data.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        available: item.assigned + item.activity, // Calculate available dynamically
      })),
    }));
    setData(updatedData);
  }, [data]);

  const [openCategories, setOpenCategories] = useState(
    data.reduce((acc, category) => {
      acc[category.category] = true; // Default: All categories expanded
      return acc;
    }, {} as Record<string, boolean>)
  );

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const addCategory = (categoryName: string) => {
    data.push({
      category: categoryName,
      items: [],
    });
  };

  const handleInputChange = (categoryIndex, itemIndex, value) => {
    const newData = [...data]; // Copy state
    newData[categoryIndex].items[itemIndex].assigned = parseFloat(value) || 0; // Update assigned
    const currentlyAssigned = data.reduce((sum, category) => {
      return (
        sum +
        category.items.reduce((itemSum, item) => itemSum + item.assigned, 0)
      );
    }, 0);
    setReadyToAssign(assignableMoney - currentlyAssigned);
    setData(newData); // Update state
  };


  return (
    <div className="mx-auto mt-8 rounded-md">
      <h1>Ready to Assign - {formatToUSD(readyToAssign)}</h1>
      <div className="flex m-2">
        <AddCategoryButton handleSubmit={addCategory}/>
      </div>
      <table className="w-full border border-gray-300 rounded-md">
        <thead>
          <tr className="bg-gray-200 text-left">
            <th className="p-2 border">Category</th>
            <th className="p-2 border">Assigned</th>
            <th className="p-2 border">Activity</th>
            <th className="p-2 border">Available</th>
          </tr>
        </thead>
        <tbody>
          {data.map((group, categoryIndex) => (
            <Fragment key={group.category}>
              {/* Collapsible Category Header (Expands Full Width) */}
              <tr
                className="cursor-pointer bg-gray-400 text-white"
                onClick={() => toggleCategory(group.category)}
              >
                <td colSpan={0} className="p-3 font-bold text-lg w-full">
                  <div className="flex items-center">
                    <span className="mr-2">
                      {openCategories[group.category] ? "▼" : "▶"}
                    </span>
                    {group.category}
                  </div>
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.items.reduce((sum, item) => sum + item.assigned, 0)
                  )}
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.items.reduce((sum, item) => sum + item.activity, 0)
                  )}
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.items.reduce((sum, item) => sum + item.available, 0)
                  )}
                </td>
              </tr>

              {/* Food Items (Collapsible) */}
              {openCategories[group.category] &&
                group.items.map((item, itemIndex) => (
                  <tr key={itemIndex} className="border-t">
                    <td className="p-2 border">{item.name}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input
                        type="number"
                        value={item.assigned}
                        onChange={(e) =>
                          handleInputChange(
                            categoryIndex,
                            itemIndex,
                            e.target.value
                          )
                        }
                        className="w-full p-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="p-2 border">{formatToUSD(item.activity)}</td>
                    <td className="p-2 border">
                      {formatToUSD(item.available)}
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
