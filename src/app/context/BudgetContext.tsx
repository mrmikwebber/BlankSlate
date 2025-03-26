"use client";
import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { addMonths, differenceInCalendarMonths, format, getMonth, isSameMonth, parseISO, subMonths } from "date-fns";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import debounce from "lodash.debounce";
import { useAccountContext } from "./AccountContext";

const getPreviousMonth = (month: string) => {
  return format(subMonths(format(parseISO(month), "yyyy-MM"), 1), "yyyy-MM");
}
  
const BudgetContext = createContext(null);

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const [transactions, setTransactions] = useState([]);
  const [creditCardPayments, setCreditCardPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { user } = useAuth() || { user: null };
  const [currentMonth, setCurrentMonth] = useState(
    format(new Date(), "yyyy-MM")
  );
  const [budgetData, setBudgetData] = useState({});

  const createDefaultCategories = () => [
  {
    name: "Bills",
    categoryItems: [
      { name: "Rent", assigned: 0, activity: 0, available: 0 },
      { name: "Electricity", assigned: 0, activity: 0, available: 0 },
      { name: "Water", assigned: 0, activity: 0, available: 0 },
    ],
  },
  {
    name: "Subscriptions",
    categoryItems: [
      { name: "Spotify", assigned: 0, activity: 0, available: 0 },
      { name: "Netflix", assigned: 0, activity: 0, available: 0 },
    ],
  },
  {
    name: "Credit Card Payments",
    categoryItems: [],
  },
];

const { accounts } = useAccountContext();

  useEffect(() => {
    if (!user) return;

    const fetchBudget = async () => {
      const { data, error } = await supabase
        .from("budget_data")
        .select("*")
        .eq("user_id", user.id);
  
      if (error) {
        console.error("Fetch budget error:", error);
        return;
      }
  
      if (!data || data.length === 0) {
        // 🆕 New user – initialize default month
        const today = new Date();
        const newMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const initial = {
          user_id: user.id,
          month: newMonth,
          data: {
            categories: createDefaultCategories(), // see below 👇
          },
          assignable_money: 0,
          ready_to_assign: 0,
        };
  
        const { data: inserted, error: insertError } = await supabase
          .from("budget_data")
          .insert([initial])
          .select();
  
        if (insertError) {
          console.error("Insert error:", insertError);
          return;
        }
        setBudgetData({ [newMonth]: { ...initial, id: inserted[0].id } });
        setCurrentMonth(newMonth);
      } else {
        const formatted = {};
        data.forEach((entry) => {
          formatted[entry.month] = {
            ...entry,
            categories: entry.data.categories,
          };
        });
        setBudgetData(formatted);
      }
    };
    fetchBudget();
  }, [user]);
  
  const resetBudgetData = () => {
    setBudgetData({});
    setLoading(true);
  };

  const _saveBudget = async (month, data) => {
    if (!user?.id) {
      console.error("No user ID found. Not saving budget.");
      return;
    }
    const existing = budgetData[month];
    const payload = {
      user_id: user.id,
      month,
      data: { categories: data.categories },
      assignable_money: data.assignable_money,
      ready_to_assign: data.ready_to_assign,
    };

    if(process.env.TESTING) return;
  
    if (existing?.id) {
      const { error } = await supabase
        .from("budget_data")
        .update(payload)
        .eq("id", existing.id);
  
      if (error) console.error("Update budget error:", error);
    } else {
      const { data: insertedRows } = await supabase
      .from("budget_data")
      .insert(payload)
      .select();
    
    const newId = insertedRows?.[0]?.id;
    // Store this in setBudgetData:
    setBudgetData(prev => ({
      ...prev,
      [month]: {
        ...data,
        id: newId,
      },
    }));
    }
  };
  
  const debouncedSave = debounce(_saveBudget, 450); // waits 1.5s
  
  const saveBudgetMonth = (month, data) => {
    debouncedSave(month, data);
  };

  const lastSaved = useRef<string | null>(null);

  const calculateCreditCardPayments = () => {
    const categoryAssignments = {};
  
    budgetData[currentMonth]?.categories?.forEach((cat) => {
      cat.categoryItems.forEach((item) => {
        categoryAssignments[item.name] = item.assigned;
      });
    });
  
    const paymentsMap = {};
  
    for (const account of accounts) {
      if (account.type !== "credit") continue;
  
      for (const tx of account.transactions) {
        if (!isSameMonth(format(parseISO(tx.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM"))) continue;
        if (!tx.category) continue;
  
        const assignedToCategory = categoryAssignments[tx.category] || 0;
  
        if (!paymentsMap[account.name]) {
          paymentsMap[account.name] = 0;
        }
  
        paymentsMap[account.name] += assignedToCategory;
      }
    }

    console.log("paymentsMap", paymentsMap);
  
    return Object.entries(paymentsMap).map(([card, payment]) => ({
      card,
      payment,
    }));
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

  const applyCreditCardPaymentsToBudget = (creditCardPayments) => {
    setBudgetData((prev) => {
      const current = prev[currentMonth];
      if (!current) return prev;
  
      let hasChanges = false;
  
      const updatedCategories = current.categories.map((cat) => {
        if (cat.name !== "Credit Card Payments") return cat;
  
        const updatedItems = cat.categoryItems.map((item) => {
          const match = creditCardPayments.find((p) => p.card === item.name);
          const newAvailable = match?.payment ?? item.available;
  
          if (item.available !== newAvailable) hasChanges = true;
  
          return { ...item, available: newAvailable };
        });
  
        return { ...cat, categoryItems: updatedItems };
      });
  
      if (!hasChanges) return prev;
  
      return {
        ...prev,
        [currentMonth]: {
          ...current,
          categories: updatedCategories,
        },
      };
    });
  };
  

useEffect(() => {

  if (!budgetData[currentMonth]) return;

  const key = `${currentMonth}-${JSON.stringify(budgetData[currentMonth])}`;
  if (lastSaved.current === key) return;

  if (!isDirty) return;

  setIsDirty(false);

  saveBudgetMonth(currentMonth, budgetData[currentMonth]);

  lastSaved.current = key;
}, [budgetData, currentMonth]);

useEffect(() => {
  const payments = calculateCreditCardPayments();
  console.log("Calculated credit card available:", payments);
  applyCreditCardPaymentsToBudget(payments);
}, [budgetData, accounts, currentMonth]);

useEffect(() => {
  if (!budgetData[currentMonth]) return;

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

  const updatedCategories = budgetData[currentMonth]?.categories?.map(
    (category) => {
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
            accounts
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

  const totalInflow = accounts
    .filter((acc) => acc.type === "debit")
    .flatMap((acc) => acc.transactions)
    .filter(
      (tx) =>
        isSameMonth(format(parseISO(tx.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM")) && tx.balance > 0
    )
    .filter((tx) => tx.category === "Ready to Assign")
    .reduce((sum, tx) => sum + tx.balance, 0);
    console.log('updated categories', updatedCategories);
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

  const getLatestMonth = (budgetData) => {
    return Object.keys(budgetData).sort().pop();
  };

  const createEmptyCategories = (prevCategories) => {
    return prevCategories.map((category) => ({
      ...category,
      categoryItems: category.categoryItems.map((item) => ({
        ...item,
        assigned: 0,
        activity: 0,
        available: 0,
      })),
    }));
  };

  const addCategoryGroup = (groupName: string) => {
    setBudgetData((prev) => {
      const monthData = prev[currentMonth];
      const groupExists = monthData.categories.some((cat) => cat.name === groupName);
  
      if (groupExists) return prev;
  
      const updatedMonth = {
        ...monthData,
        categories: [
          ...monthData.categories,
          { name: groupName, categoryItems: [] },
        ],
      };
  
      return {
        ...prev,
        [currentMonth]: updatedMonth,
      };
    });
  
    setIsDirty(true); // Triggers save for current month only
  };
  
  const addItemToCategory = (
    categoryName: string,
    newItem: { name: string; assigned: number; activity: number; available: number }
  ) => {
    setBudgetData((prev) => {
      const newCategories = prev[currentMonth].categories.map((cat) =>
        cat.name === categoryName
          ? { ...cat, categoryItems: [...cat.categoryItems, newItem] }
          : cat
      );
      setIsDirty(true);
      return {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: newCategories,
        },
      };
    });
  };

  const setCategoryTarget = (categoryItemName, target) => {
    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: {
        ...prev[currentMonth],
        categories: prev[currentMonth].categories.map((category) => ({
          ...category,
          categoryItems: category.categoryItems.map((item) =>
            item.name === categoryItemName ? { ...item, target } : item
          ),
        })),
      },
    }));
    setIsDirty(true);
  };

  const calculateReadyToAssign = (month: string): number => {
    const prevMonth = getPreviousMonth(month);

    const previousBalance = budgetData[prevMonth]?.ready_to_assign || 0;

    const totalInflow = accounts?
    .filter((acc) => acc.type === "debit") 
    .flatMap((acc) => acc.transactions)
    .filter((tx) => isSameMonth(format(parseISO(tx.date), "yyyy-MM"), format(parseISO(month), "yyyy-MM")) && tx.balance > 0)
    .filter((tx) => tx.category === 'Ready to Assign')
    .reduce((sum, tx) => sum + tx.balance, 0); 

    const totalAssigned =
      budgetData[month]?.categories.reduce((sum, category) => {
        return (
          sum +
          category.categoryItems.reduce(
            (itemSum, item) => itemSum + item.assigned,
            0
          )
        );
      }, 0) || 0;
    return (previousBalance + totalInflow) - totalAssigned;
  };

  const calculateActivityForMonth = (month, categoryName) => {
    const filteredAccounts = accounts.flatMap((account) => account.transactions)
      .filter(
        (tx) => {
          const date = format(parseISO(tx.date), "yyyy-MM");
          const convertedMonth = format(parseISO(month), "yyyy-MM")
          return isSameMonth(date, convertedMonth) && tx.category === categoryName
        }
      )
      return filteredAccounts.reduce((sum, tx) => sum + tx.balance, 0);
  };

  const isBeforeMonth = (monthA: string, monthB: string): boolean => {
    return new Date(monthA) < new Date(monthB);
  };

  const areCategoriesEqual = (a, b) => {
    if (a.length !== b.length) return false;
  
    const aNames = a.map((cat) => cat.name).sort();
    const bNames = b.map((cat) => cat.name).sort();
  
    return aNames.every((name, idx) => name === bNames[idx]);
  };

  const updateMonth = (newMonth: string, direction: string) => {
    setCurrentMonth(newMonth); 
    setBudgetData((prev) => {
      const previousMonth = getPreviousMonth(newMonth);
      const pastMonths = Object.keys(prev).filter((month) =>
        isBeforeMonth(month, newMonth)
      );

            const cumulativeAssigned = new Map();
            pastMonths.forEach((month) => {
              prev[month]?.categories.forEach((category) => {
                category.categoryItems.forEach((item) => {
                  if (!cumulativeAssigned.has(item.name)) {
                    cumulativeAssigned.set(item.name, 0);
                  }
                  cumulativeAssigned.set(
                    item.name,
                    cumulativeAssigned.get(item.name) + item.assigned
                  );
                });
              });
            });
      
            const cumulativeActivity = new Map();
            pastMonths.forEach((month) => {
              prev[month]?.categories.forEach((category) => {
                category.categoryItems.forEach((item) => {
                  if (!cumulativeActivity.has(item.name)) {
                    cumulativeActivity.set(item.name, 0);
                  }
                  cumulativeActivity.set(
                    item.name,
                    cumulativeActivity.get(item.name) + item.activity
                  );
                });
              });
            });

      if (prev[newMonth]) {

        const allGroupNames = new Set(
          Object.values(prev).flatMap((month) =>
            month.categories.map((cat) => cat.name)
          )
        );
        
        // Find any groups missing from this month's data
        const existingGroupNames = new Set(
          prev[newMonth].categories.map((cat) => cat.name)
        );
        
        const missingGroups = [...allGroupNames].filter(
          (name) => !existingGroupNames.has(name)
        );
        
        const patchedCategories = [
          ...prev[newMonth].categories,
          ...missingGroups.map((name) => ({
            name,
            categoryItems: [],
          })),
        ];

        if (!areCategoriesEqual(patchedCategories, prev[newMonth].categories)) {
          setIsDirty(true);
        }

        return {
          ...prev,
          [newMonth]: {
            ...prev[newMonth],
            ready_to_assign: calculateReadyToAssign(newMonth),
            categories: patchedCategories.map((category) => {
              if (category.name === 'Credit Card Payemnts') return category

              const existingItemsMap = Object.fromEntries(
                category.categoryItems.map((item) => [item.name, item])
              );

              const missingItems = prev[previousMonth]?.categories
                .find((c) => c.name === category.name)
                ?.categoryItems.filter((item) => !existingItemsMap[item.name]) || [];


              const patchedCategoryItems = [
                ...category.categoryItems,
                ...missingItems,
              ];


              if (!areCategoriesEqual(patchedCategoryItems, category.categoryItems)) {
                setIsDirty(true);
              } 
              
              return {
              ...category,
              categoryItems: patchedCategoryItems.map((item) => {

                const pastAssigned = cumulativeAssigned.get(item.name) || 0;
                const pastActivity = cumulativeActivity.get(item.name) || 0;
                const isCreditCardPayment = category.name === "Credit Card Payments";

                if(cumulativeActivity.size === 0) return item;

                const pastAvailable = isCreditCardPayment
                ? prev[previousMonth]?.categories
                    .find((c) => c.name === "Credit Card Payments")
                    ?.categoryItems.find((i) => i.name === item.name)?.available || 0
                : Math.max(pastAssigned + pastActivity, 0);

                let newTarget = item.target;

                if (item.target?.type === "Custom" || item.target?.type === "Full Payoff") {
                  const targetMonthNumber = getMonth(format(parseISO(item.target.targetDate), "yyyy-MM")) + 1;
                  const currentMonthNumber = getMonth(format(parseISO(newMonth), "yyyy-MM")) + 1;
                
                  let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
                  if (monthsUntilTarget <= 0) monthsUntilTarget = 1; 
                
                  const totalAssigned = cumulativeAssigned.get(item.name) || 0;
                  const remainingAmount = item.target.amount - totalAssigned;
                
                  let newAmountNeeded;
                  
                  if (direction === "forward") {
                    newAmountNeeded = remainingAmount / monthsUntilTarget + 1;
                  } else {
                    newAmountNeeded = prev[newMonth]?.categories
                      ?.flatMap((cat) => cat.categoryItems)
                      ?.find((i) => i.name === item.name)?.target?.amountNeeded || remainingAmount / monthsUntilTarget;
                  }
                
                  newTarget = {
                    ...item.target,
                    amountNeeded: newAmountNeeded,
                  };

                    const targetMonth = item.target.type === 'Custom' ? parseISO(newTarget.targetDate) : parseISO(`${newTarget.targetDate}-01`);
                  const currentMonthDate = item.target.type === 'Custom' ? parseISO(newMonth) : parseISO(`${newMonth}-01`);
    
                  if (differenceInCalendarMonths(currentMonthDate, targetMonth) >= 1) {
                    newTarget = null;
                  }

                }

                const itemActivity = calculateActivityForMonth(newMonth, item.name);
                
                return {
                ...item,
                activity: itemActivity,
                target: newTarget,
                available: pastAvailable + itemActivity,
              }}),
            }}),
          },
        };
      }
  
      const prevCategories =
        prev[previousMonth]?.categories && direction === "forward"
          ? prev[previousMonth].categories
          : [];

      const updatedCategories = prevCategories.length
        ? prevCategories.map((category) => ({
            ...category,
            categoryItems: category.categoryItems.map((item) => {

              const pastAssigned = cumulativeAssigned.get(item.name) || 0;
              const pastActivity = cumulativeActivity.get(item.name) || 0;
              const isCreditCardPayment = category.name === "Credit Card Payments";
              const pastAvailable = isCreditCardPayment
              ? prev[previousMonth]?.categories
                  .find((c) => c.name === "Credit Card Payments")
                  ?.categoryItems.find((i) => i.name === item.name)?.available || 0
              : Math.max(pastAssigned + pastActivity, 0);
              let newTarget = item.target;

              if (item?.target?.type === "Custom" || item?.target?.type === "Full Payoff") {
                const targetMonthNumber = getMonth(format(parseISO(item.target.targetDate), "yyyy-MM")) + 1;
                const currentMonthNumber = getMonth(format(parseISO(newMonth), "yyyy-MM")) + 1;
          
              
                let monthsUntilTarget = (targetMonthNumber - currentMonthNumber) + 1;
                if (monthsUntilTarget <= 0) monthsUntilTarget = 1;
              
                const totalAssigned = cumulativeAssigned.get(item.name) || 0;
                const remainingAmount = item.target.amount - totalAssigned;
                let newAmountNeeded;
                
                if (direction === "forward") {
                  newAmountNeeded = remainingAmount / monthsUntilTarget;
                } else {
                  newAmountNeeded = prev[newMonth]?.categories
                    ?.flatMap((cat) => cat.categoryItems)
                    ?.find((i) => i.name === item.name)?.target?.amountNeeded || remainingAmount / monthsUntilTarget;
                }
              
                newTarget = {
                  ...item.target,
                  amountNeeded: newAmountNeeded,
                };

                const targetMonth = item.target.type === 'Custom' ? parseISO(newTarget.targetDate) : parseISO(`${newTarget.targetDate}-01`);
                const currentMonthDate = item.target.type === 'Custom' ? parseISO(newMonth) : parseISO(`${newMonth}-01`);
  
                if (differenceInCalendarMonths(currentMonthDate, targetMonth) >= 1) {
                  newTarget = null;
                }
              };

              const itemActivity = calculateActivityForMonth(newMonth, item.name);

              return {
              ...item,
              assigned: 0, 
              activity: itemActivity,
              target: newTarget,
              available: pastAvailable + itemActivity,
            }}),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

      const totalInflow = accounts?
      .filter((acc) => acc.type === "debit") 
      .flatMap((acc) => acc.transactions) 
      .filter((tx) => isSameMonth(format(parseISO(tx.date), "yyyy-MM"), parseISO(newMonth)) && tx.balance > 0)
      .filter((tx) => tx.category === 'Ready to Assign')
      .reduce((sum, tx) => sum + tx.balance, 0); 

      setIsDirty(true);
      return {
        ...prev,
        [newMonth]: {
          categories: updatedCategories,
          assignable_money: totalInflow || 0,
          ready_to_assign: calculateReadyToAssign(newMonth)
        },
      };
    });
  };

  return (
    <BudgetContext.Provider
      value={{
        budgetData,
        setBudgetData,
        transactions,
        currentMonth,
        updateMonth,
        addItemToCategory,
        addCategoryGroup,
        setCategoryTarget,
        saveBudgetMonth,
        setIsDirty,
        loading,
        resetBudgetData,
        creditCardPayments,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
