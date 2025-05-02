"use client";
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { differenceInCalendarMonths, format, getMonth, isAfter, isSameMonth, parseISO, subMonths } from "date-fns";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { useAccountContext } from "./AccountContext";

const getPreviousMonth = (month: string) => {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
}

interface Target {
  type: string;
  amount: number;
  targetDate: string;
  amountNeeded: number;
}
  
interface BudgetData {
  categories: {
    name: string;
    categoryItems: {
      name: string;
      assigned: number;
      activity: number;
      available: number;
      target?: Target;
    }[];
  }[];
  assignable_money: number;
  ready_to_assign: number;
  id?: string;
}

const BudgetContext = createContext(null);

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const dirtyMonths = useRef<Set<string>>(new Set());
  const { user } = useAuth() || { user: null };
  const [currentMonth, setCurrentMonth] = useState(
    format(new Date(), "yyyy-MM")
  );
  const [budgetData, setBudgetData] = useState<Record<string, BudgetData>>({});

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

const { accounts, setAccounts } = useAccountContext();

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
        const today = new Date();
        const newMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const initial = {
          user_id: user.id,
          month: newMonth,
          data: {
            categories: createDefaultCategories(),
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

        setBudgetData(prev => ({
          ...prev,
          [newMonth]: {
            id: inserted[0].id,
            user_id: initial.user_id,
            month: initial.month,
            categories: initial.data.categories,
            assignable_money: initial.assignable_money,
            ready_to_assign: initial.ready_to_assign,
          },
        }));
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

  useEffect(() => {
    if (dirtyMonths.current.size === 0) return;
  
    for (const month of dirtyMonths.current) {
      const key = `${month}-${JSON.stringify(budgetData[month])}`;
      if (lastSaved.current === key) continue;
  
      saveBudgetMonth(month, budgetData[month]);
      lastSaved.current = key;
    }
  
    dirtyMonths.current.clear();
  }, [budgetData]);
  
  
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
    setBudgetData(prev => ({
      ...prev,
      [month]: {
        ...data,
        id: newId,
      },
    }));
    }
  };
  
  const saveBudgetMonth = (month, data) => {
    _saveBudget(month, data);
  };

  const lastSaved = useRef<string | null>(null);
  const calculateCreditCardPayments = () => {

    const assignedMoney = budgetData[currentMonth]?.categories?.flatMap(
      (category) =>
        category.categoryItems
          .filter((item) => item.assigned > 0)
          .map((item) => ({
            category: item.name,
            amount: item.assigned,
          }))
    );

    const assignedCategories = new Map(
      assignedMoney?.map((entry) => [entry.category, entry.amount])
    );

    const remainingAssigned = new Map(assignedCategories);

    for (const account of accounts.filter((acc) => acc.type === "debit")) {
      for (const transaction of account.transactions) {
        const category = transaction.category;
        if (remainingAssigned.has(category) && category !== 'Ready to Assign' && isSameMonth(format(parseISO(transaction.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM"))) {
          const assignedAmount = remainingAssigned.get(category);
          const deduction = Math.min(
            assignedAmount as number,
            Math.abs(transaction.balance)
          );

          remainingAssigned.set(category, assignedAmount as number - deduction);

          if (remainingAssigned.get(category) as number <= 0) {
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
          if (remainingAssigned.has(category) && category !== 'Ready to Assign' && isSameMonth(format(parseISO(transaction.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM"))) {
            const assignedAmount = remainingAssigned.get(category);
            const deduction = Math.min(
              assignedAmount as number,
              Math.abs(transaction.balance)
            );

            remainingAssigned.set(category, assignedAmount as number - deduction);
            payment += deduction;

            if (remainingAssigned.get(category) as number <= 0) {
              remainingAssigned.delete(category);
            }
          }
        }
        return { card: card.name, payment };
      });
    return creditCardPayments;
  };
  

  const getCumulativeAvailable = (passedInData, itemName) => {
    const currentDate = parseISO(`${currentMonth}-01`);
    
    const pastMonths = Object.keys(passedInData)
      .filter((month) => {
        const date = parseISO(`${month}-01`);
        return date < currentDate;
      })
      .sort();
  
    return pastMonths.reduce((sum, month) => {
      const categories = passedInData[month]?.categories ?? [];
  
      const matchingItem = categories
        .flatMap((cat) => cat.categoryItems)
        .find((item) => item.name === itemName);
  
      if (!matchingItem) return sum;
  
      const assigned = matchingItem.assigned || 0;
      const activity = matchingItem.activity || 0;
  
      return sum + assigned + activity;
    }, 0);
  };

  const applyCreditCardPaymentsToBudget = (payments) => {
    setBudgetData((prev) => {
      const current = prev[currentMonth];
      if (!current) return prev;
  
      const prevMonthKey = format(
        subMonths(parseISO(`${currentMonth}-01`), 1),
        "yyyy-MM"
      );
  
      let hasChanges = false;
  
      const updatedCategories = current.categories.map((cat) => {
        if (cat.name !== "Credit Card Payments") return cat;
  
        const updatedItems = cat.categoryItems.map((item) => {
          const match = payments.find((p) => p.card === item.name);
          const categoryAssigned = match?.payment ?? 0;
  
          const prevAvailable =
            prev[prevMonthKey]?.categories
              ?.find((cat) => cat.name === "Credit Card Payments")
              ?.categoryItems.find((i) => i.name === item.name)?.available ?? 0;
  
          const carryover = prevAvailable > 0 ? prevAvailable : 0;
          const manualAssigned = item.assigned ?? 0;
  
          const newAvailable = carryover + categoryAssigned + manualAssigned;
  
          if (newAvailable !== item.available) hasChanges = true;
  
          return {
            ...item,
            available: newAvailable,
          };
        });
  
        return {
          ...cat,
          categoryItems: updatedItems,
        };
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
  applyCreditCardPaymentsToBudget(payments);
}, [budgetData, currentMonth]);

useEffect(() => {
  if (!budgetData[currentMonth]) return;

  const currentlyAssigned = budgetData[currentMonth]?.categories?.reduce(
    (sum, category) =>
      sum +
      category.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0),
    0
  );

  const creditCardAccounts = accounts.filter((acc) => acc.type === "credit");
  const creditCardAccountNames = creditCardAccounts.map((acc) => acc.name);

  const updatedCategories = budgetData[currentMonth]?.categories?.map((category) => {
    if (category.name === "Credit Card Payments") {
      const existingItemNames = category.categoryItems.map((item) => item.name);
      const missingItems = creditCardAccountNames
        .filter((name) => !existingItemNames.includes(name))
        .map((name) => ({
          name,
          assigned: 0,
          activity: calculateCreditCardAccountActivity(currentMonth, name),
          available: 0,
        }));

      const allItems = [...category.categoryItems, ...missingItems];

      const updatedItems = allItems.map((item) => {
        const cumulativeAvailable = getCumulativeAvailable(budgetData, item.name);
        const itemActivity = calculateCreditCardAccountActivity(currentMonth, item.name);
        const availableSum = item.assigned + itemActivity;

        return {
          ...item,
          activity: itemActivity,
          available: availableSum + cumulativeAvailable,
        };
      });

      return {
        ...category,
        categoryItems: updatedItems,
      };
    }

    const updatedItems = category.categoryItems.map((item) => {
      const cumulativeAvailable = getCumulativeAvailable(budgetData, item.name);
      const itemActivity = calculateActivityForMonth(currentMonth, item.name);
      const availableSum = item.assigned + itemActivity;

      return {
        ...item,
        activity: itemActivity,
        available: availableSum + cumulativeAvailable,
      };
    });

    return {
      ...category,
      categoryItems: updatedItems,
    };
  });

  const totalInflow = accounts
    .filter((acc) => acc.type === "debit")
    .flatMap((acc) => acc.transactions)
    .filter(
      (tx) =>
        tx.date &&
        isSameMonth(format(parseISO(tx.date), "yyyy-MM"), format(parseISO(currentMonth), "yyyy-MM")) &&
        tx.balance > 0
    )
    .filter((tx) => tx.category === "Ready to Assign")
    .reduce((sum, tx) => sum + tx.balance, 0);

  setBudgetData((prev) => ({
    ...prev,
    [currentMonth]: {
      ...prev[currentMonth],
      categories: updatedCategories,
      assignable_money: totalInflow,
      ready_to_assign: calculateReadyToAssign(currentMonth),
    },
  }));
  setIsDirty(true);
}, [accounts]);

useEffect(() => {
  if (!accounts.length || !budgetData) return;

  const creditCardAccountNames = new Set(
    accounts.filter((acc) => acc.type === "credit").map((acc) => acc.name)
  );
  setBudgetData((prev) => {
    const updated = { ...prev };
    let modified = false;

    for (const month in updated) {
      updated[month].categories = updated[month].categories.map((category) => {
        if (category.name !== "Credit Card Payments") return category;

        const filteredItems = category.categoryItems.filter((item) =>
          creditCardAccountNames.has(item.name)
        );

        if (filteredItems.length !== category.categoryItems.length) {
          modified = true;
        }

        return { ...category, categoryItems: filteredItems };
      });

      if (modified) {
        dirtyMonths.current?.add(month);
      }
    }

    return updated;
  });

  if (dirtyMonths.current?.size) {
    setIsDirty(true);
  }
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
        target: null,
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
  
    setIsDirty(true);
  };

  const deleteCategoryGroup = (groupName: string) => {
    setBudgetData((prev) => {
      const updated = { ...prev };
  
      for (const month in updated) {
        const before = updated[month].categories;
        const after = before.filter((cat) => cat.name !== groupName);
  
        if (before.length !== after.length) {
          updated[month].categories = after;
          dirtyMonths.current.add(month);
        }
      }
  
      return updated;
    });
  
    setIsDirty(true);
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

  const hasReassignedRef = useRef(false);

  const deleteCategoryWithReassignment = useCallback((context, targetItemName) => {
    if (hasReassignedRef.current) return;
    hasReassignedRef.current = true;

    const updatedMonths = new Set();

    setBudgetData((prev) => {
      if (updatedMonths.has(currentMonth)) return prev;
      updatedMonths.add(currentMonth);
      const updated = { ...prev };
      const { itemName, assigned, activity } = context;
      for (const month in updated) {
        updated[month].categories = updated[month].categories.map((cat) => {
          return {
            ...cat,
            categoryItems: cat.categoryItems
              .map((item) => {
                if (item.name === itemName) return null;
                if (item.name === targetItemName) {
                  const newAssigned = item.assigned + assigned;
                  const newActivity = item.activity + activity;
      
                  return {
                    ...item,
                    assigned: newAssigned,
                    activity: newActivity,
                    available: newAssigned + newActivity,
                  };
                }
                return item;
              })
              .filter(Boolean),
          };
        });
        dirtyMonths.current.add(month);
      }
      return updated;
    });

    const targetCategoryGroup = budgetData[currentMonth]?.categories.find((cat) =>
      cat.categoryItems.some((item) => item.name === targetItemName)
    )?.name;

    setAccounts((prevAccounts) =>
      prevAccounts.map((account) => ({
        ...account,
        transactions: account.transactions.map((tx) => {
          if (
            tx.category === context.itemName &&
            tx.category_group === context.categoryName
          ) {
            return {
              ...tx,
              category: targetItemName,
              category_group: targetCategoryGroup,
            };
          }
          return tx;
        }),
      }))
    );

    setTimeout(() => {
      hasReassignedRef.current = false;
    }, 100);
  
    setIsDirty(true);
  }, [budgetData, currentMonth]);

  const deleteCategoryItem = (context) => {
    const { itemName } = context;
  
    setBudgetData((prev) => {
      const updated = { ...prev };
  
      for (const month in updated) {
        const before = updated[month].categories.map(cat => cat.categoryItems.length).join();
        updated[month].categories = updated[month].categories.map((cat) => ({
          ...cat,
          categoryItems: cat.categoryItems.filter((item) => item.name !== itemName),
        }));
        const after = updated[month].categories.map(cat => cat.categoryItems.length).join();
        if (before !== after) dirtyMonths.current.add(month);
      }
  
      return updated;
    });
  
    setIsDirty(true);
  };

  const setCategoryTarget = (categoryItemName, target) => {
    setBudgetData((prev) => {
      const updated = { ...prev };
  
      const current = parseISO(`${currentMonth}-01`);
  
      for (const monthKey of Object.keys(prev)) {
        const monthDate = parseISO(`${monthKey}-01`);
  
        if (isAfter(monthDate, current) || isSameMonth(monthDate, current)) {
          const updatedCategories = prev[monthKey].categories.map((category) => ({
            ...category,
            categoryItems: category.categoryItems.map((item) =>
              item.name === categoryItemName ? { ...item, target } : item
            ),
          }));
  
          updated[monthKey] = {
            ...prev[monthKey],
            categories: updatedCategories,
          };
        }
      }
  
      return updated;
    });
  
    setIsDirty(true);
  };

  const getFirstInflowMonth = () => {
    const inflowMonths = accounts
      .filter((acc) => acc.type === "debit")
      .flatMap((acc) => acc.transactions)
      .filter((tx) => tx.category === "Ready to Assign" && tx.balance > 0)
      .map((tx) => format(parseISO(tx.date), "yyyy-MM"));
  
    return inflowMonths.sort()[0] ?? null;
  };

  const calculateReadyToAssign = (month: string): number => {
    const allMonths = Object.keys(budgetData).sort();
    const currentIndex = allMonths.indexOf(month);
    if (currentIndex === -1) return 0;
  
    const firstInflowMonth = getFirstInflowMonth();

    console.log("firstInflowMonth =", firstInflowMonth, "| checking RTA for", month);
    console.log(month < firstInflowMonth);

    if (firstInflowMonth && month < firstInflowMonth) {
      const assignedUpTo = allMonths
        .slice(0, currentIndex + 1)
        .reduce((sum, m) => {
          const assigned = budgetData[m]?.categories?.reduce(
            (catSum, cat) =>
              catSum +
              cat.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0),
            0
          );
          return sum + (assigned || 0);
        }, 0);
  
      return -assignedUpTo; 
    }

    const inflowUpTo = allMonths
      .slice(0, currentIndex + 1)
      .reduce((sum, m) => {
        const inflow = accounts
          .filter((acc) => acc.type === "debit")
          .flatMap((acc) => acc.transactions)
          .filter(
            (tx) =>
              tx.date &&
              isSameMonth(
                format(parseISO(tx.date), "yyyy-MM"),
                format(parseISO(m), "yyyy-MM")
              ) &&
              tx.balance > 0 &&
              tx.category === "Ready to Assign"
          )
          .reduce((s, tx) => s + tx.balance, 0);
        return sum + inflow;
      }, 0);
  
    const totalAssigned = Object.keys(budgetData).reduce((sum, m) => {
      const assigned = budgetData[m]?.categories?.reduce(
        (catSum, cat) =>
          catSum +
          cat.categoryItems.reduce((itemSum, item) => itemSum + item.assigned, 0),
        0
      );
      return sum + (assigned || 0);
    }, 0);
  
    return inflowUpTo - totalAssigned;
  };
  
  
  const refreshAllReadyToAssign = (data = budgetData) => {
    const updated = { ...data };
    const sortedMonths = Object.keys(updated).sort();
  
    for (const month of sortedMonths) {
      console.log("🟢 Setting RTA for", month, "to", calculateReadyToAssign(month));
      updated[month].ready_to_assign = calculateReadyToAssign(month);
      dirtyMonths.current.add(month);
    }
  
    setBudgetData(updated);
    setIsDirty(true);
  };

  const calculateCreditCardAccountActivity = (month, accountName) => {
    const monthStr = format(parseISO(`${month}-01`), "yyyy-MM");
  
    const account = accounts.find((a) => a.name === accountName);
    if (!account) return 0;
  
    const matchingTxs = account.transactions.filter((tx) => {
      if (!tx.date || tx.category === 'Ready to Assign') return false;
  
      const txMonth = format(parseISO(tx.date), "yyyy-MM");
      return txMonth === monthStr;
    });
  
    return matchingTxs.reduce((sum, tx) => sum + tx.balance, 0);
  };

  const calculateActivityForMonth = (month, categoryName) => {
    const filteredAccounts = accounts.flatMap((account) => account.transactions)
      .filter(
        (tx) => {
            if(!tx.date) return false;
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
            month?.categories?.map((cat) => cat.name) || []
          )
        );
        
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
            categories: patchedCategories.map((category) => {

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

                const previousItem = prev[previousMonth]?.categories
                ?.find((cat) => cat.name === category.name)
                ?.categoryItems.find((i) => i.name === item.name);

                if (previousItem?.target?.type === "monthly") {
                  newTarget = {
                    ...previousItem.target,
                    amount: 0,
                  };
                }
                else if (previousItem?.target?.type === "Custom" || previousItem?.target?.type === "Full Payoff") {
                  const targetMonthNumber = getMonth(parseISO(previousItem.target.targetDate)) + 1;
                  const currentMonthNumber = getMonth(parseISO(newMonth));

                
                  let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
                  if (monthsUntilTarget <= 0) monthsUntilTarget = 1;

                
                  const totalAssigned = cumulativeAssigned.get(item.name) || 0;
                  const remainingAmount = previousItem.target.amount - totalAssigned;
                
                  const base = Math.floor((remainingAmount / monthsUntilTarget) * 100) / 100;
                  const baseTotal = base * monthsUntilTarget;
                  const extraCents = Math.round((remainingAmount - baseTotal) * 100);
                
                  const monthAmounts = Array(monthsUntilTarget).fill(base);
                  for (let i = 0; i < extraCents; i++) {
                    monthAmounts[i] += 0.01;
                  }

                  const monthIndex = direction === "forward" ? currentMonthNumber - (targetMonthNumber - monthsUntilTarget) : 0;
                  const newAmountNeeded = monthAmounts[monthIndex] ?? base;
                
                  newTarget = {
                    ...previousItem.target,
                    amountNeeded: newAmountNeeded,
                  };
                
                  const targetMonth = previousItem.target.type === 'Custom'
                    ? parseISO(newTarget.targetDate)
                    : parseISO(`${newTarget.targetDate}-01`);
                
                  const currentMonthDate = previousItem.target.type === 'Custom'
                    ? parseISO(newMonth)
                    : parseISO(`${newMonth}-01`);

                  if (differenceInCalendarMonths(currentMonthDate, targetMonth) >= 1) {
                    newTarget = null;
                  }
                }

                let itemActivity

                if (category.name === 'Credit Card Payments') {
                  itemActivity = calculateCreditCardAccountActivity(newMonth, item.name);
                } else {
                  itemActivity = calculateActivityForMonth(newMonth, item.name);
                }

                return {
                ...item,
                activity: itemActivity,
                target: newTarget,
                available: category.name !== 'Credit Card Payments' ? pastAvailable + itemActivity + item.assigned : item.available,
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

              const previousItem = prev[previousMonth]?.categories
                ?.find((cat) => cat.name === category.name)
                ?.categoryItems.find((i) => i.name === item.name);

                if (previousItem?.target?.type === "monthly") {
                  newTarget = {
                    ...previousItem.target,
                    amount: 0,
                  };
                }

                else if (previousItem?.target?.type === "Custom" || previousItem?.target?.type === "Full Payoff") {
                  const targetMonthNumber = getMonth(parseISO(previousItem.target.targetDate)) + 1;
                  const currentMonthNumber = getMonth(parseISO(newMonth));

                
                  let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
                  if (monthsUntilTarget <= 0) monthsUntilTarget = 1;
                
                  const totalAssigned = cumulativeAssigned.get(item.name) || 0;
                  const remainingAmount = previousItem.target.amount - totalAssigned;
                
                  const base = Math.floor((remainingAmount / monthsUntilTarget) * 100) / 100;
                  const baseTotal = base * monthsUntilTarget;
                  const extraCents = Math.round((remainingAmount - baseTotal) * 100);
                
                  const monthAmounts = Array(monthsUntilTarget).fill(base);
                  for (let i = 0; i < extraCents; i++) {
                    monthAmounts[i] += 0.01;
                  }

                  const monthIndex = direction === "forward" ? currentMonthNumber - (targetMonthNumber - monthsUntilTarget) : 0;
                  const newAmountNeeded = monthAmounts[monthIndex] ?? base;
                
                  newTarget = {
                    ...previousItem.target,
                    amountNeeded: newAmountNeeded,
                  };
                
                  const targetMonth = previousItem.target.type === 'Custom'
                    ? parseISO(newTarget.targetDate)
                    : parseISO(`${newTarget.targetDate}-01`);
                
                  const currentMonthDate = previousItem.target.type === 'Custom'
                    ? parseISO(newMonth)
                    : parseISO(`${newMonth}-01`);

                  if (differenceInCalendarMonths(currentMonthDate, targetMonth) >= 1) {
                    newTarget = null;
                  }
                }

              let itemActivity

              if (category.name === 'Credit Card Payments') {
                itemActivity = calculateCreditCardAccountActivity(newMonth, item.name);
              } else {
                itemActivity = calculateActivityForMonth(newMonth, item.name);
              }

              return {
              ...item,
              assigned: 0, 
              activity: itemActivity,
              target: newTarget,
              available: category.name !== 'Credit Card Payments' ? pastAvailable + itemActivity : item.available,
            }}),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

      const totalInflow = accounts?.filter((acc) => acc.type === "debit") 
      .flatMap((acc) => acc.transactions) 
      .filter((tx) => tx.date && isSameMonth(format(parseISO(tx.date), "yyyy-MM"), parseISO(newMonth)) && tx.balance > 0)
      .filter((tx) => tx.category === 'Ready to Assign')
      .reduce((sum, tx) => sum + tx.balance, 0); 

      setIsDirty(true);
      const newBudgetData = {
        ...prev,
        [newMonth]: {
          categories: updatedCategories,
          assignable_money: totalInflow || 0
        },
      };

      const sortedMonths = Object.keys(newBudgetData).sort();
      for (const m of sortedMonths) {
        newBudgetData[m].ready_to_assign = calculateReadyToAssign(m);
        dirtyMonths.current.add(m);
      }

      setIsDirty(true);
      return newBudgetData;
    });
  };

  return (
    <BudgetContext.Provider
      value={{
        budgetData,
        setBudgetData,
        currentMonth,
        updateMonth,
        addItemToCategory,
        addCategoryGroup,
        setCategoryTarget,
        saveBudgetMonth,
        setIsDirty,
        loading,
        resetBudgetData,
        deleteCategoryGroup,
        deleteCategoryWithReassignment,
        deleteCategoryItem,
        dirtyMonths,
        calculateReadyToAssign,
        refreshAllReadyToAssign,
        getCumulativeAvailable,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
