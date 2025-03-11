"use client";
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useTableContext } from "@/app/context/TableDataContext";
import { addMonths, format, getMonth, isSameMonth, parseISO, subMonths } from "date-fns";

const getPreviousMonth = (month) => {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
}
  

const BudgetContext = createContext(null);

const initialCategories = [
  { name: "Credit Card Payments", categoryItems: [] },
  {
    name: "Subscriptions",
    categoryItems: [
      { name: "Blank Slate Subscription", assigned: 0, activity: 0, available: 0, target: {type: "monthly", amount: 5, targetDate: null, amountNeeded: 5} },
      { name: "Spotify", assigned: 0, activity: 0, available: 0, target: {type: "monthly", amount: 9.99, targetDate: null, amountNeeded: 9.99} },
      { name: "Netflix", assigned: 0, activity: 0, available: 0, target: {type: "monthly", amount: 12.99, targetDate: null, amountNeeded: 12.99} },
      { name: "Adobe CC", assigned: 0, activity: 0, available: 0, target: {type: "yearly", amount: 120, targetDate: null, amountNeeded: 120} },
      { name: "Prime", assigned: 0, activity: 0, available: 0, target: {type: "monthly", amount: 5, targetDate: null, amountNeeded: 5} },
      { name: "YT Premium", assigned: 0, activity: 0, available: 0, target: {type: "weekly", amount: 10, targetDate: null, amountNeeded: 40} },
    ],
  },
  {
    name: "Bills",
    categoryItems: [
      { name: "Water Utility", assigned: 0, activity: 0, available: 0, target: {type: "monthly", amount: 45, targetDate: null, amountNeeded: 45} },
      { name: "Electricity", assigned: 0, activity: 0, available: 0, target: {type: "weekly", amount: 50, targetDate: null, amountNeeded: 200} },
      { name: "Car Loan", assigned: 0, activity: 0, available: 0, target: {type: "custom", amount: 15000, targetDate: '2026-03', amountNeeded: 15000} },
      { name: "Rent", assigned: 0, activity: 0, available: 0 },
    ]
  }
];

export const BudgetProvider = ({ children }) => {
  const [transactions, setTransactions] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(
    format(new Date(), "yyyy-MM")
  );
  const [budgetData, setBudgetData] = useState(() => {
    return {
      [currentMonth]: {
        categories: initialCategories,
        readyToAssign: 0,
        assignableMoney: 0,
      },
    };
  });

  const computedData = useMemo(
    () => {
      console.log('memo', budgetData);
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
    setBudgetData((prev) => {
      const newCategories = [
        ...prev[currentMonth].categories,
        { name: categoryName, categoryItems: [] },
      ];
  
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
    setBudgetData((prev) => {
      const newCategories = prev[currentMonth].categories.map((cat) =>
        cat.name === categoryName
          ? { ...cat, categoryItems: [...cat.categoryItems, newItem] }
          : cat
      );
  
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
  };

  const calculateReadyToAssign = (month: string, accounts): number => {
    const prevMonth = getPreviousMonth(month);

    const previousBalance = budgetData[prevMonth]?.readyToAssign || 0;

    const totalInflow = accounts?
    .filter((acc) => acc.type === "debit") 
    .flatMap((acc) => acc.transactions)
    .filter((tx) => isSameMonth(tx.date, parseISO(`${month}-01`)) && !tx.outflow)
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

                if (item.target?.type === "Custom") {
                  const targetMonthNumber = getMonth(parseISO(item.target.targetDate)) + 1;
                  const currentMonthNumber = getMonth(parseISO(newMonth)) + 1;
                
                  let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
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

                }
                
                return {
                ...item,
                activity: calculateActivityForMonth(newMonth, item.name, accounts),
                target: newTarget,
                available: pastAvailable,
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

              console.log('past Assigned', pastAssigned);
              console.log('past Activity', pastActivity)

              const pastAvailable = isCreditCardPayment
              ? prev[previousMonth]?.categories
                  .find((c) => c.name === "Credit Card Payments")
                  ?.categoryItems.find((i) => i.name === item.name)?.available || 0
              : Math.max(pastAssigned + pastActivity, 0);

              console.log(pastAvailable)

              let newTarget = item.target;

              if (item.target?.type === "Custom") {
                const targetMonthNumber = getMonth(parseISO(item.target.targetDate)) + 1;
                const currentMonthNumber = getMonth(parseISO(newMonth)) + 1;
              
                console.log(`Current Month: ${currentMonthNumber}, Target Month: ${targetMonthNumber}`);
              
                let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
                if (monthsUntilTarget <= 0) monthsUntilTarget = 1;
              
                console.log(`Months Until Target: ${monthsUntilTarget}`);
              
                const totalAssigned = cumulativeAssigned.get(item.name) || 0;
                const remainingAmount = item.target.amount - totalAssigned;
              
                console.log(`Total Assigned: ${totalAssigned}, Remaining Amount: ${remainingAmount}`);
              
                let newAmountNeeded;
                
                if (direction === "forward") {
                  newAmountNeeded = remainingAmount / monthsUntilTarget;
                } else {
                  newAmountNeeded = prev[newMonth]?.categories
                    ?.flatMap((cat) => cat.categoryItems)
                    ?.find((i) => i.name === item.name)?.target?.amountNeeded || remainingAmount / monthsUntilTarget;
                }
              
                console.log(`New Target:`, { ...item.target, amountNeeded: newAmountNeeded });
              
                newTarget = {
                  ...item.target,
                  amountNeeded: newAmountNeeded,
                };
                console.log(newTarget);
              }

              return {
              ...item,
              assigned: 0, 
              activity: calculateActivityForMonth(newMonth, item.name, accounts),
              target: newTarget,
              available: pastAvailable,
            }}),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

      const totalInflow = accounts?
      .filter((acc) => acc.type === "debit") 
      .flatMap((acc) => acc.transactions) 
      .filter((tx) => isSameMonth(tx.date, parseISO(`${newMonth}-01`)) && !tx.outflow)
      .filter((tx) => tx.category === 'Ready to Assign')
      .reduce((sum, tx) => sum + tx.balance, 0); 

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
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
