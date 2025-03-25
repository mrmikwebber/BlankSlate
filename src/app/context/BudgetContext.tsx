"use client";
import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { addMonths, differenceInCalendarMonths, format, getMonth, isSameMonth, parseISO, subMonths } from "date-fns";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import debounce from "lodash.debounce";

const getPreviousMonth = (month: string) => {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
}
  

const BudgetContext = createContext(null);

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const [transactions, setTransactions] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const { user } = useAuth();
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
        console.log('setting budget data');
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
        console.log('setting budget data');
        setBudgetData(formatted);
      }
    };
  
    fetchBudget();
  }, [user]);
  

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
      assignable_money: data.assignableMoney,
      ready_to_assign: data.readyToAssign,
    };
  
    const { error } = existing
      ? await supabase.from("budget_data").update(payload).eq("id", existing.id)
      : await supabase.from("budget_data").insert(payload);
  
    if (error) console.error("Save budget error:", error);
  };
  
  const debouncedSave = debounce(_saveBudget, 450); // waits 1.5s
  
  const saveBudgetMonth = (month, data) => {
    debouncedSave(month, data);
  };

  const lastSaved = useRef<string | null>(null);

useEffect(() => {

  if (!budgetData[currentMonth]) return;

  const key = `${currentMonth}-${JSON.stringify(budgetData[currentMonth])}`;
  if (lastSaved.current === key) return;

  if (!isDirty) return;

  console.log('Checking trigger');
  setIsDirty(false);
  return;

  console.log('saving budget');
  saveBudgetMonth(currentMonth, budgetData[currentMonth]);

  lastSaved.current = key;
}, [budgetData, currentMonth]);

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

  const addCategory = (categoryName: string) => {
    console.log('adding category');
    setBudgetData((prev) => {
      const newCategories = [
        ...prev[currentMonth].categories,
        { name: categoryName, categoryItems: [] },
      ];
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
  
  const addItemToCategory = (
    categoryName: string,
    newItem: { name: string; assigned: number; activity: number; available: number }
  ) => {
    console.log('adding item to category');
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
    console.log('setting category target');
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

  const calculateReadyToAssign = (month: string, accounts): number => {
    const prevMonth = getPreviousMonth(month);

    const previousBalance = budgetData[prevMonth]?.readyToAssign || 0;

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

  const calculateActivityForMonth = (month, categoryName, accounts) => {
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

  const updateMonth = (newMonth: string, direction: string, accounts) => {
    console.log('updating month');
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
        return {
          ...prev,
          [newMonth]: {
            ...prev[newMonth],
            readyToAssign: calculateReadyToAssign(newMonth, accounts),
            categories: prev[newMonth].categories.map((category) => {
              if (category.name === 'Credit Card Payemnts') return category
              return {
              ...category,
              categoryItems: category.categoryItems.map((item) => {

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

                const itemActivity = calculateActivityForMonth(newMonth, item.name, accounts);
                
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

              const itemActivity = calculateActivityForMonth(newMonth, item.name, accounts);

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
          assignableMoney: totalInflow || 0,
          readyToAssign: calculateReadyToAssign(newMonth, accounts)
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
        addCategory,
        setCategoryTarget,
        saveBudgetMonth,
        setIsDirty,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
