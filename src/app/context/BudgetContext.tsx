"use client";
import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { addMonths, differenceInCalendarMonths, format, getMonth, isSameMonth, parseISO, subMonths } from "date-fns";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import debounce from "lodash.debounce";
import { useAccountContext } from "./AccountContext";

const getPreviousMonth = (month: string) => {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
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

    console.log('saving budget', payload);

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
    console.log('setting budget data', budgetData)
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

  const calculateCreditCardPayments = (assignedMoney) => {
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
    assignedMoney
  );

  if (JSON.stringify(newPayments) !== JSON.stringify(creditCardPayments)) {
    setCreditCardPayments(newPayments);
  }
}, [accounts, budgetData]);

useEffect(() => {
  if (!creditCardPayments.length) return;
  console.log('setting budget data', budgetData)
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

          if (newAssigned !== item.available) {
            hasChanges = true;
          } 
          console.log(item.name, newAssigned)

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

  const creditCardAccounts = accounts.filter(
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

  console.log(updatedCategories)

  const totalInflow = accounts
    .filter((acc) => acc.type === "debit")
    .flatMap((acc) => acc.transactions)
    .filter(
      (tx) =>
        isSameMonth(parseISO(tx.date), parseISO(`${currentMonth}-01`)) && !tx.outflow
    )
    .filter((tx) => tx.category === "Ready to Assign")
    .reduce((sum, tx) => sum + tx.balance, 0);

  console.log('setting budget data', budgetData)
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

  const computedData = useMemo(
    () => {
      if (!budgetData || !currentMonth) return [];
      return budgetData[currentMonth]?.categories?.map((category) => ({
        ...category,
        categoryItems: category.categoryItems?.map((item) => {
          if (category.name === 'Credit Card Payments') return item;
          return {
          ...item,
          available: item.assigned + item.activity,
        }}),
      }))
    },
    [budgetData, currentMonth]
  );

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
    .filter((tx) => isSameMonth(parseISO(tx.date), parseISO(`${month}-01`)) && !tx.outflow)
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
          const date = new Date(tx.date);
          const convertedMonth = parseISO(`${month}-01`)

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
                  const targetMonthNumber = getMonth(parseISO(item.target.targetDate)) + 1;
                  const currentMonthNumber = getMonth(parseISO(newMonth)) + 1;
                
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
                const targetMonthNumber = getMonth(parseISO(item.target.targetDate)) + 1;
                const currentMonthNumber = getMonth(parseISO(newMonth)) + 1;
          
              
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
      .filter((tx) => isSameMonth(parseISO(tx.date), parseISO(`${newMonth}-01`)) && !tx.outflow)
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
        computedData,
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
