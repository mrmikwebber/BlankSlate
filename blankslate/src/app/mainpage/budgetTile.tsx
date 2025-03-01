"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import { useAccountContext } from "../context/AccountContext";
import AddCategoryButton from "./AddCategoryButton";
import { CategoryCreditCardData, useTableContext } from "../context/TableDataContext";

export default function CollapsibleTable() {
  const { accounts } = useAccountContext();
  const { categories, addCategory, addItemToCategory } = useTableContext();
  const [assignableMoney, setAssignableMoney] = useState(0);
  const [activeAccounts, setActiveAccounts] = useState(accounts);
  const [readyToAssign, setReadyToAssign] = useState(0);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [categoryGroupBalances, setCategoryGroupBalances] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", assigned: 0, activity: 0, available: 0 });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [data, setData] = useState(categories);

  const computedAccounts = useMemo(() =>
    activeAccounts.map(account => (
      {
        ...account,
        balance: account.transactions.reduce((sum, tx) => sum + tx.balance, 0)
      }
    ))
  , [activeAccounts]);

  useEffect(() => {
    const totalDebitFunds = computedAccounts
      .filter((acc) => acc.type === "debit")
      .reduce((sum, acc) => sum + acc.balance, 0);
    setAssignableMoney(totalDebitFunds);
    setReadyToAssign(totalDebitFunds);
  }, [computedAccounts]);

  const computedData = useMemo(() => 
    data.map((category) => ({
      ...category,
      categoryItems: category.categoryItems.map((item) => ({
        ...item,
        available: item.assigned + item.activity,
      })),
    })),
    [data]
  );

  const [openCategories, setOpenCategories] = useState(
    data.reduce((acc, category) => {
      acc[category.name] = true;
      return acc;
    }, {} as Record<string, boolean>)
  );

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleInputChange = (categoryIndex, itemIndex, value) => {
    const newData = [...data];
    newData[categoryIndex].categoryItems[itemIndex].assigned = parseFloat(value) || 0; // Update assigned
    const currentlyAssigned = data.reduce((sum, category) => {
      return (
        sum +
        category.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0)
      );
    }, 0);
    setReadyToAssign(assignableMoney - currentlyAssigned);
    setData(newData);
  };

  const handleAddItem = (category: string) => {
    if (newItem.name.trim() !== "") {
      addItemToCategory(category, { 
        name: newItem.name, 
        assigned: newItem.assigned, 
        activity: newItem.activity,
        available: newItem.assigned + newItem.activity
      });
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0 });
      setActiveCategory(null);
    }
  };

  useEffect(() => {
    const categoryGroupBalances = accounts.flatMap(account => account.transactions)
      .reduce((acc, tx) => {
        if (!acc[tx.categoryGroup]) {
          acc[tx.categoryGroup] = 0;
        }
        acc[tx.categoryGroup] += tx.balance;
        return acc;
      }, {} as Record<string, number>);
    const readyToAssignBalance = accounts
    .flatMap(account => account.transactions)
    .reduce((sum, tx) => tx.category === 'Ready to Assign' ? sum + tx.balance : sum, 0);

    const currentlyAssigned = data.reduce((sum, category) => {
      return (
        sum +
        category.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0)
      );
    }, 0);

    const creditCardAccounts = accounts.filter(account => account.type === "credit");

    const creditCardItems = creditCardAccounts.map(account => ({
      name: account.name,
      assigned: 0,
      activity: -1 * account.transactions.reduce((sum, tx) => sum + tx.balance, 0),
      payment: Math.abs(account.balance),
    }));
  
    const updatedData = data.map(category => {
      if (category.name === "Credit Card Payments") {
        return { ...category, categoryItems: creditCardItems };
      }
  
      return {
        ...category,
        categoryItems: category.categoryItems.map(item => ({
          ...item,
          activity: categoryGroupBalances[item.name] || 0, 
        })),
      };
    });
    setData(updatedData);
    setAssignableMoney(readyToAssignBalance);
    setReadyToAssign(readyToAssignBalance - currentlyAssigned);
  }, [accounts]); 

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
          {computedData.map((group, categoryIndex) => (
            <Fragment key={group.name}>
              <tr
                className="bg-gray-400 text-white"
                onMouseEnter={() => setHoveredCategory(group.name)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <td colSpan={0} className="p-3 font-bold text-lg w-full">
                  <div className="flex items-center">
                    <button onClick={() => toggleCategory(group.name)} className="mr-2">
                      {openCategories[group.name] ? "▼" : "▶"}
                    </button>
                    {group.name}
                    {hoveredCategory === group.name && (
                  <button
                    onClick={() => setActiveCategory(group.name)}
                    className="ms-2 text-sm bg-blue-500 text-white px-2 py-1 rounded-full hover:bg-teal-500 transition"
                  >
                    +
                  </button>
                )}
                  </div>
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.categoryItems.reduce((sum, item) => sum + item.assigned, 0)
                  )}
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.categoryItems.reduce((sum, item) => sum + item.activity, 0)
                  )}
                </td>
                <td className="p-2 border">
                  {group.name === 'Credit Card Payments' ? 'Payment - ' + formatToUSD(
                    (group.categoryItems as CategoryCreditCardData[]).reduce((sum, item) => sum + item.payment, 0)
                  ) : formatToUSD(
                    group.categoryItems.reduce((sum, item) => sum + item.available, 0)
                  )}
                </td>
              </tr>

            {activeCategory === group.name && (
              <div className="absolute left-0 mt-2 w-64 bg-white p-4 shadow-lg rounded-lg border z-50">
                  <input
                    type="text"
                    placeholder="Item Name"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full border rounded px-2 py-1"
                  />
                  <button
                    onClick={() => handleAddItem(group.name)}
                    className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-500 transition"
                  >
                    Submit
                  </button>
              </div>
            )}
              {openCategories[group.name] &&
                group.categoryItems.map((item, itemIndex) => (
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
