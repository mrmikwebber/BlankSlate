"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import { useAccountContext } from "../context/AccountContext";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import { useTableContext } from "../context/TableDataContext";
import MonthNav from "./MonthNav";
import { useBudgetContext } from "../context/BudgetContext";
import { isSameMonth, parseISO } from "date-fns";

export default function CollapsibleTable() {
  const { accounts, setAccounts } = useAccountContext();
  const { currentMonth, updateMonth, budgetData, setBudgetData, computedData, addCategory, addItemToCategory } = useBudgetContext();
  const [assignableMoney, setAssignableMoney] = useState(0);
  const [creditCardPayments, setCreditCardPayments] = useState([]);
  const [readyToAssign, setReadyToAssign] = useState(0);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    assigned: 0,
    activity: 0,
    available: 0,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const computedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
        balance: account.transactions.reduce((sum, tx) => sum + tx.balance, 0),
      })),
    [accounts]
  );

  useEffect(() => {
    const totalDebitFunds = computedAccounts
      .filter((acc) => acc.type === "debit")
      .reduce((sum, acc) => sum + acc.balance, 0);
    setAssignableMoney(totalDebitFunds);
    setReadyToAssign(totalDebitFunds);
  }, [computedAccounts]);

  useEffect(() => {
    const assignedMoney = budgetData[currentMonth]?.categories?.flatMap((category) =>
      category.categoryItems
        .filter((item) => item.assigned > 0)
        .map((item) => ({
          categoryGroup: item.name,
          amount: item.assigned,
        }))
    );

    const newPayments = calculateCreditCardPayments(computedAccounts, assignedMoney);
  
    // Only update state if payments actually changed
    if (JSON.stringify(newPayments) !== JSON.stringify(creditCardPayments)) {
      setCreditCardPayments(newPayments);
    }
  }, [accounts, budgetData]);

  useEffect(() => {
    if (!creditCardPayments.length) return; // Avoid running on first mount
  
    setBudgetData((prev) => {
      if (!prev[currentMonth]) return prev;
  
      let hasChanges = false;
  
      const updatedCategories = prev[currentMonth].categories.map((category) => {
        if (category.name !== "Credit Card Payments") return category;
  
        const updatedItems = category.categoryItems.map((item) => {
          const paymentEntry = creditCardPayments.find((p) => p.card === item.name);
          const newAssigned = paymentEntry ? paymentEntry.payment : item.available;
  
          if (newAssigned !== item.assigned) hasChanges = true;
  
          return { ...item, available: newAssigned };
        });
        return { ...category, categoryItems: updatedItems };
      });
  
      if (!hasChanges) return prev; // Prevent infinite updates'
  
      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
        },
      };
    });
  }, [creditCardPayments]);
  

  const [openCategories, setOpenCategories] = useState(
    computedData?.reduce((acc, category) => {
      acc[category.name] = true;
      return acc;
    }, {} as Record<string, boolean>)
  );

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const calculateCreditCardPayments = (accounts, assignedMoney) => {
    const assignedCategories = new Map(
      assignedMoney?.map((entry) => [entry.categoryGroup, entry.amount])
    );

    let remainingAssigned = new Map(assignedCategories);

    for (const account of accounts.filter((acc) => acc.type === "debit")) {
      for (const transaction of account.transactions) {
        const categoryGroup = transaction.categoryGroup;
        if (remainingAssigned.has(categoryGroup)) {
          const assignedAmount = remainingAssigned.get(categoryGroup);
          const deduction = Math.min(
            assignedAmount,
            Math.abs(transaction.balance)
          );

          remainingAssigned.set(categoryGroup, assignedAmount - deduction);

          if (remainingAssigned.get(categoryGroup) <= 0) {
            remainingAssigned.delete(categoryGroup);
          }
        }
      }
    }

    const creditCardPayments = accounts
      .filter((acc) => acc.type === "credit")
      .map((card) => {
        let payment = 0;

        for (const transaction of card.transactions) {
          const categoryGroup = transaction.categoryGroup;
          if (remainingAssigned.has(categoryGroup)) {
            const assignedAmount = remainingAssigned.get(categoryGroup);
            const deduction = Math.min(
              assignedAmount,
              Math.abs(transaction.balance)
            );

            remainingAssigned.set(categoryGroup, assignedAmount - deduction);
            payment += deduction;

            if (remainingAssigned.get(categoryGroup) <= 0) {
              remainingAssigned.delete(categoryGroup);
            }
          }
        }

        return { card: card.name, payment };
      });
    return creditCardPayments;
  };

  const isBeforeMonth = (monthA: string, monthB: string): boolean => {
    return new Date(monthA) < new Date(monthB);
  };

  const getCumulativeAvailable = (passedInData, itemName) => {
    const pastMonths = Object.keys(passedInData).filter((month) =>
      isBeforeMonth(month, currentMonth)
    );

    const past = pastMonths.reduce((sum, month) => {
      const categoryItem = passedInData[month]?.categories
        .flatMap((cat) => cat.categoryItems)
        .find((item) => item.name === itemName);

      return sum + (categoryItem?.assigned - categoryItem?.activity || 0);
    }, 0);
    return past;
  };

  const handleInputChange = (categoryIndex, itemIndex, value) => {
    setBudgetData((prev) => {
      const updatedCategories =
        prev[currentMonth]?.categories.map((category, catIdx) => {
          if (catIdx !== categoryIndex) return category;
          return {
            ...category,
            categoryItems: category.categoryItems.map((item, itemIdx) => {
              if (itemIdx !== itemIndex) return item;

              const availableSum = value + item.activity; // plus here given that activity is set as a negative
              const cumlativeAvailable = getCumulativeAvailable(
                prev,
                item.name
              );
              return {
                ...item,
                assigned: value,
                available: availableSum + cumlativeAvailable,
              };
            }),
          };
        }) || [];

      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
          readyToAssign:
          (prev[currentMonth]?.readyToAssign || 0) +
          (prev[currentMonth]?.assignableMoney || 0) -
          updatedCategories.reduce(
            (sum, cat) =>
              sum +
              cat.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0),
            0
          ),
        },
      };
    });
  };

  const calculateActivityForMonth = (month, categoryName, accounts) => {
    const filteredAccounts = accounts.flatMap((account) => account.transactions)
      .filter(
        (tx) => {
          const date = new Date(tx.date);
          const convertedMonth = parseISO(`${month}-01`)

          return isSameMonth(date, convertedMonth) && tx.categoryGroup === categoryName
        }
      )
      return filteredAccounts.reduce((sum, tx) => sum + tx.balance, 0);
  };

  const handleAddItem = (category: string) => {
    if (newItem.name.trim() !== "") {
      addItemToCategory(category, {
        name: newItem.name,
        assigned: newItem.assigned,
        activity: newItem.activity,
        available: newItem.assigned + newItem.activity,
      });
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0 });
      setActiveCategory(null);
    }
  };

  useEffect(() => {
    if (!budgetData[currentMonth]) return;

    const readyToAssignBalance = accounts
      .flatMap((account) => account.transactions)
      .reduce(
        (sum, tx) =>
          tx.category === "Ready to Assign" ? sum + tx.balance : sum,
        0
      );

    const currentlyAssigned = budgetData[currentMonth]?.categories?.reduce(
      (sum, category) => {
        return (
          sum +
          category.categoryItems.reduce(
            (itemSum, item) => itemSum + item.assigned,
            0
          )
        );
      },
      0
    );

    const creditCardAccounts = computedAccounts.filter(
      (account) => account.type === "credit"
    );

    const creditCardItems = creditCardAccounts.map((account) => {
      return {
      name: account.name,
      assigned: 0,
      activity:
        -1 * account.transactions.filter(transaction => isSameMonth(transaction.date, parseISO(`${currentMonth}-01`))).reduce((sum, tx) => sum + tx.balance, 0),
      }
    });

    const updatedCategories = budgetData[currentMonth]?.categories?.map(
      (category) => {
        if (category.name === "Credit Card Payments") {
          return { ...category, categoryItems: creditCardItems };
        }
        return {
          ...category,
          categoryItems: category.categoryItems.map((item) => ({
            ...item,
            activity: calculateActivityForMonth(currentMonth, item.name, computedAccounts),
            available: (item.assigned - calculateActivityForMonth(currentMonth, item.name, computedAccounts)) * -1
          })),
        };
      }
    );

    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: { ...prev[currentMonth], categories: updatedCategories },
    }));

    setAssignableMoney(readyToAssignBalance);
    setReadyToAssign(readyToAssignBalance - currentlyAssigned);
  }, [accounts]);

  return (
    <div className="mx-auto mt-8 rounded-md">
      <MonthNav />
      <h1>Ready to Assign - {formatToUSD(readyToAssign)}</h1>
      <div className="flex m-2">
        <AddCategoryButton handleSubmit={addCategory} />
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
          {budgetData[currentMonth]?.categories?.map((group, categoryIndex) => (
            <Fragment key={group.name}>
              <tr
                className="bg-gray-400 text-white"
                onMouseEnter={() => setHoveredCategory(group.name)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <td colSpan={0} className="p-3 font-bold text-lg w-full">
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleCategory(group.name)}
                      className="mr-2"
                    >
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
                    group.categoryItems.reduce(
                      (sum, item) => sum + item.assigned,
                      0
                    )
                  )}
                </td>
                <td className="p-2 border">
                  {formatToUSD(
                    group.categoryItems.reduce(
                      (sum, item) => sum + item.activity,
                      0
                    )
                  )}
                </td>
                <td className="p-2 border">
                  {group.name === "Credit Card Payments"
                    ? "Payment - " +
                      formatToUSD(
                        group.categoryItems.reduce(
                          (sum, item) => sum + item.available,
                          0
                        ) || 0
                      )
                    : formatToUSD(
                        group.categoryItems.reduce(
                          (sum, item) => sum + item.available,
                          0
                        )
                      )}
                </td>
              </tr>

              {activeCategory === group.name && (
                <div className="absolute left-0 mt-2 w-64 bg-white p-4 shadow-lg rounded-lg border z-50">
                  <input
                    type="text"
                    placeholder="Item Name"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
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
                    <EditableAssigned
                      categoryIndex={categoryIndex}
                      itemIndex={itemIndex}
                      item={item}
                      handleInputChange={handleInputChange}
                    />
                    <td className="p-2 border">{formatToUSD(item.activity || 0)}</td>
                    <td className="p-2 border">
                      {formatToUSD(item.available || 0)}
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
