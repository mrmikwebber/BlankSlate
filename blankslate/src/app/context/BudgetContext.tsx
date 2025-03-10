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
      { name: "Blank Slate Subscription", assigned: 0, activity: 0, available: 0 },
      { name: "Spotify", assigned: 0, activity: 0, available: 0 },
      { name: "Netflix", assigned: 0, activity: 0, available: 0 },
      { name: "Adobe CC", assigned: 0, activity: 0, available: 0 },
      { name: "Prime", assigned: 0, activity: 0, available: 0 },
      { name: "YT Premium", assigned: 0, activity: 0, available: 0 },
    ],
  },
  {
    name: "Bills",
    categoryItems: [
      { name: "Water Utility", assigned: 0, activity: 0, available: 0 },
      { name: "Electricity", assigned: 0, activity: 0, available: 0 },
      { name: "Car Loan", assigned: 0, activity: 0, available: 0 },
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
    () =>
      budgetData[currentMonth]?.categories?.map((category) => ({
        ...category,
        categoryItems: category.categoryItems?.map((item) => {
          if (category.name === 'Credit Card Payments') return item;
          return {
          ...item,
          available: item.assigned + item.activity,
        }}),
      })),
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


  const calculateReadyToAssign = (month: string, accounts): number => {
    const prevMonth = getPreviousMonth(month);

    const previousBalance = budgetData[prevMonth]?.readyToAssign || 0;

    const totalInflow = accounts?
    .filter((acc) => acc.type === "debit") // Only debit accounts
    .flatMap((acc) => acc.transactions) // Get all transactions
    .filter((tx) => isSameMonth(tx.date, parseISO(`${month}-01`)) && !tx.outflow) // Filter inflows
    .reduce((sum, tx) => sum + tx.balance, 0); // Sum inflows

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

    console.log('totalInflow', totalInflow);
    console.log('totalAssigned', totalAssigned);
    console.log('previousBalance', previousBalance);

    return (previousBalance + totalInflow) - totalAssigned;
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

  const isBeforeMonth = (monthA: string, monthB: string): boolean => {
    return new Date(monthA) < new Date(monthB);
  };

  const updateMonth = (newMonth: string, direction: string, accounts) => {
    setCurrentMonth(newMonth); // Ensure newMonth is set before using it in logic
    setBudgetData((prev) => {
      const previousMonth = getPreviousMonth(newMonth);
      const pastMonths = Object.keys(prev).filter((month) =>
        isBeforeMonth(month, newMonth)
      );

            // Calculate cumulative assigned amounts for past months
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

          console.log(calculateReadyToAssign(newMonth, accounts))

      // If the month already exists, update available without changing structure
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
                
                return {
                ...item,
                activity: calculateActivityForMonth(newMonth, item.name, accounts),
                available: pastAvailable,
              }}),
            }}),
          },
        };
      }
  
      // Get previous month's categories if moving forward, else use empty categories
      const prevCategories =
        prev[previousMonth]?.categories && direction === "forward"
          ? prev[previousMonth].categories
          : [];

      // Create the new month's categories
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

              return {
              ...item,
              assigned: 0, // Reset assigned to 0 for the new month
              activity: calculateActivityForMonth(newMonth, item.name, accounts),
              available: pastAvailable, // Carry over available
            }}),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

      const totalInflow = accounts?
      .filter((acc) => acc.type === "debit") // Only debit accounts
      .flatMap((acc) => acc.transactions) // Get all transactions
      .filter((tx) => isSameMonth(tx.date, parseISO(`${newMonth}-01`)) && !tx.outflow) // Filter inflows
      .reduce((sum, tx) => sum + tx.balance, 0); // Sum inflows

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
  

  // useEffect(() => {
  //   console.log('setting');
  //   setBudgetData((prev) => ({
  //     ...prev,
  //     [currentMonth]: {
  //       ...prev[currentMonth],
  //       readyToAssign: calculateReadyToAssign(currentMonth),
  //     },
  //   }));
  // }, [transactions]);

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
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
