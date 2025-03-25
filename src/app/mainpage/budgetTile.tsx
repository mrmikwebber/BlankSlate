"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import { useAccountContext } from "../context/AccountContext";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import MonthNav from "./MonthNav";
import { useBudgetContext } from "../context/BudgetContext";
import { format, isSameMonth, parseISO, subMonths } from "date-fns";
import { TargetSidebar } from "./TargetSidebar";
import { LandingCoverPage } from "./LandingCoverPage";
import { useAuth } from "../context/AuthContext";
import InterstitialPage from "../interstitial/InterstitialPage";

export default function CollapsibleTable() {
  const { accounts, hasInitalized } = useAccountContext();
  const {
    currentMonth,
    budgetData,
    setBudgetData,
    setIsDirty,
    addCategory,
    addItemToCategory,
    loading: isBudgetLoading,
  } = useBudgetContext();
  const { loading: isAccountsLoading } = useAccountContext();
  const { user } = useAuth();

  const FILTERS = ["All", "Money Available", "Overspent", "Overfunded", "Underfunded"];

  const [creditCardPayments, setCreditCardPayments] = useState([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [targetSidebarOpen, setTargetSidebarOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    assigned: 0,
    activity: 0,
    available: 0,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!budgetData || !currentMonth || !budgetData[currentMonth]?.categories) return;
    
    const initialOpenState = budgetData[currentMonth].categories.reduce((acc, category) => {
      acc[category.name] = true;
      return acc;
    }, {} as Record<string, boolean>);
    
    setOpenCategories(initialOpenState);
  }, [budgetData, currentMonth]);

  const filteredCategories = useMemo(() => {
    if (!budgetData || !currentMonth) return [];

    const allCategories = budgetData[currentMonth]?.categories || [];

    return allCategories
      .map((category) => {
        const filteredItems = category.categoryItems.filter((item) => {
          switch (selectedFilter) {
            case "Money Available":
              return item.available > 0;
            case "Overspent":
              return item.available < 0;
            case "Overfunded":
              return item.target && item.assigned > item.target.amountNeeded;
            case "Underfunded":
              return item.target && item.assigned < item.target.amountNeeded;
            case "All":
            default:
              return true;
          }
        });

        return filteredItems.length
          ? { ...category, categoryItems: filteredItems }
          : null;
      })
      .filter(Boolean); 
  }, [budgetData, currentMonth, selectedFilter]);


  const computedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
        balance: account.transactions.reduce((sum, tx) => sum + tx.balance, 0),
      })),
    [accounts]
  );

  const getPreviousMonth = (month) => {
    return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
  };

  useEffect(() => {
    const assignedMoney = budgetData[currentMonth]?.categories?.flatMap(
      (category) =>
        category.categoryItems
          .filter((item) => item.assigned > 0)
          .map((item) => ({
            category: item.name,
            amount: item.assigned,
          }))
    );

    const newPayments = calculateCreditCardPayments(
      computedAccounts,
      assignedMoney
    );

    if (JSON.stringify(newPayments) !== JSON.stringify(creditCardPayments)) {
      setCreditCardPayments(newPayments);
    }
  }, [accounts, budgetData]);

  useEffect(() => {
    if (!creditCardPayments.length) return;

    setBudgetData((prev) => {
      const current = prev[currentMonth];
      if (!current) return prev;

      let hasChanges = false;

      const updatedCategories = prev[currentMonth]?.categories?.map(
        (category) => {
          if (category.name !== "Credit Card Payments") return category;

          const updatedItems = category.categoryItems.map((item) => {
            const paymentEntry = creditCardPayments.find(
              (p) => p.card === item.name
            );
            const newAssigned = paymentEntry
              ? paymentEntry.payment
              : item.available;

            if (newAssigned !== item.assigned) hasChanges = true;

            return { ...item, available: newAssigned };
          });
          return { ...category, categoryItems: updatedItems };
        }
      );

      if (!hasChanges) return prev;

      setIsDirty(true);

      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
        },
      };
    });

  }, [creditCardPayments]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const calculateCreditCardPayments = (accounts, assignedMoney) => {
    const assignedCategories = new Map(
      assignedMoney?.map((entry) => [entry.category, entry.amount])
    );

    let remainingAssigned = new Map(assignedCategories);

    for (const account of accounts.filter((acc) => acc.type === "debit")) {
      for (const transaction of account.transactions) {
        const category = transaction.category;
        if (remainingAssigned.has(category)) {
          const assignedAmount = remainingAssigned.get(category);
          const deduction = Math.min(
            assignedAmount,
            Math.abs(transaction.balance)
          );

          remainingAssigned.set(category, assignedAmount - deduction);

          if (remainingAssigned.get(category) <= 0) {
            remainingAssigned.delete(category);
          }
        }
      }
    }

    const creditCardPayments = accounts
      .filter((acc) => acc.type === "credit")
      .map((card) => {
        let payment = 0;

        for (const transaction of card.transactions) {
          const category = transaction.category;
          if (remainingAssigned.has(category)) {
            const assignedAmount = remainingAssigned.get(category);
            const deduction = Math.min(
              assignedAmount,
              Math.abs(transaction.balance)
            );

            remainingAssigned.set(category, assignedAmount - deduction);
            payment += deduction;

            if (remainingAssigned.get(category) <= 0) {
              remainingAssigned.delete(category);
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

      return sum + (categoryItem?.assigned + categoryItem?.activity || 0);
    }, 0);
    return past;
  };

  const handleInputChange = (categoryName, itemName, value) => {
    setBudgetData((prev) => {
      const updatedCategories =
        prev[currentMonth]?.categories.map((category) => {
          if (categoryName !== category.name) return category;
          return {
            ...category,
            categoryItems: category.categoryItems.map((item) => {
              if (itemName !== item.name) return item;

              const availableSum = value + item.activity;
              const cumlativeAvailable = getCumulativeAvailable(
                prev,
                item.name
              );

              return {
                ...item,
                assigned: value,
                available: availableSum + Math.max(cumlativeAvailable, 0),
              };
            }),
          };
        }) || [];

      const prevMonth = getPreviousMonth(currentMonth);

      const previousBalance = budgetData[prevMonth]?.ready_to_assign || 0;

      setIsDirty(true);

      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
          ready_to_assign:
            (previousBalance + prev[currentMonth]?.assignable_money || 0) -
            updatedCategories.reduce(
              (sum, cat) =>
                sum +
                cat.categoryItems.reduce(
                  (itemSum, item) => itemSum + item.assigned,
                  0
                ),
              0
            ),
        },
      };
    });
  };

  const calculateActivityForMonth = (month, categoryName, accounts) => {
    const filteredAccounts = accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        const date = new Date(tx.date);
        const convertedMonth = parseISO(`${month}-01`);

        return (
          isSameMonth(date, convertedMonth) && tx.category === categoryName
        );
      });
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
    if (!budgetData[currentMonth] || !hasInitalized) return;

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
          -1 *
          account.transactions
            .filter((transaction) =>
              isSameMonth(transaction.date, parseISO(`${currentMonth}-01`))
            )
            .reduce((sum, tx) => sum + tx.balance, 0),
      };
    });
    const updatedCategories = budgetData[currentMonth]?.categories?.map(
      (category) => {
        if (category.name === "Credit Card Payments") {
          return { ...category, categoryItems: creditCardItems };
        }
        return {
          ...category,
          categoryItems: category.categoryItems.map((item) => {
            const cumlativeAvailable = getCumulativeAvailable(
              budgetData,
              item.name
            );
            const itemActivity = calculateActivityForMonth(
              currentMonth,
              item.name,
              computedAccounts
            );

            const availableSum = item.assigned + itemActivity;
            return {
              ...item,
              activity: itemActivity,
              available: availableSum + cumlativeAvailable,
            };
          }),
        };
      }
    );

    const totalInflow = computedAccounts
      .filter((acc) => acc.type === "debit")
      .flatMap((acc) => acc.transactions)
      .filter(
        (tx) =>
          isSameMonth(parseISO(tx.date), parseISO(`${currentMonth}-01`)) && !tx.outflow
      )
      .filter((tx) => tx.category === "Ready to Assign")
      .reduce((sum, tx) => sum + tx.balance, 0);
    setBudgetData((prev) => {
      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
          assignable_money: totalInflow,
          ready_to_assign: totalInflow - currentlyAssigned,
        },
      };
    });
    setIsDirty(true);
  }, [accounts]);

  const toggleTargetSideBar = (item) => {
    setSelectedCategory(item.name);
    setTargetSidebarOpen(true);
  };

const getTargetStatus = (item) => {
  if (!item.target) return { message: "", color: "" };

  const assigned = item.assigned || 0;
  const needed = item.target.amountNeeded;
  const activity = Math.abs(item.activity || 0);
  const available = item.available || 0;
  const overspent = available < 0;
  const fullyFunded = assigned === needed;
  const overFunded = assigned > needed;
  const partiallyFunded = assigned < needed && assigned >= activity;
  const stillNeeded = needed - assigned;

  if (overspent && assigned < activity) {
    return { message: `Overspent ${formatToUSD(available * -1)} of ${formatToUSD(assigned)}`, color: "text-red-600 font-semibold" };
  }
  if ((fullyFunded || overFunded) && available === 0 || fullyFunded && available > 0) {
    return { message: "Fully Funded", color: "text-green-600 font-semibold" }; 
  }
  if (overFunded) {
    return { message: `Funded ${formatToUSD(needed)} of ${formatToUSD(assigned)}`, color: "text-blue-600 font-semibold" }; 
  }
  if (partiallyFunded) {
    return { message: `${formatToUSD(stillNeeded)} more needed to fulfill target`, color: "text-yellow-600 font-semibold" }; 
  }
  return { message: `${formatToUSD(assigned)} / ${formatToUSD(needed)}`, color: "text-gray-600" };
};


  if (!user) {
    return <LandingCoverPage />;
  }

  if (isAccountsLoading || isBudgetLoading) {
    return <InterstitialPage />;
  }

  return (
    <div className="mx-auto mt-8 rounded-md">
      <MonthNav />
      <div className="flex mt-2 mb-2">
        <AddCategoryButton handleSubmit={addCategory} />
      </div>
      <div className="flex gap-2 mb-4">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            className={`px-4 py-2 rounded-md ${
              selectedFilter === filter ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setSelectedFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="flex">
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
            {filteredCategories.map(
              (group) => (
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
                        <td
                          onClick={() => {toggleTargetSideBar(item)}}
                          className="p-2 border relative"
                        >
                          {item.target && (
                            <div className="absolute top-0 left-0 w-full h-full bg-gray-200 rounded">
                              <div
                                className="h-full bg-teal-500 transition-all duration-300 rounded"
                                style={{
                                  width: `${Math.min(
                                    (item.assigned / item.target.amountNeeded) *
                                      100,
                                    100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          )}
                          <span className="relative z-10 font-medium">
                            {item.name}{" "}
                            {item.target && (
                              <span className={getTargetStatus(item).color}>
                                {getTargetStatus(item).message}
                              </span>
                            )}
                          </span>
                        </td>
                        <EditableAssigned
                          categoryName={group.name}
                          itemName={item.name}
                          item={item}
                          handleInputChange={handleInputChange}
                        />
                        <td className="p-2 border">
                          {formatToUSD(item.activity || 0)}
                        </td>
                        <td className="p-2 border">
                          {formatToUSD(item.available || 0)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              )
            )}
          </tbody>
        </table>
        {targetSidebarOpen && (
          <TargetSidebar
            itemName={selectedCategory}
            onClose={() => {
              setTargetSidebarOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
