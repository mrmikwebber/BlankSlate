"use client";
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useTableContext } from "@/app/context/TableDataContext";
import { addMonths, format, getMonth, isSameMonth, parseISO, subMonths } from "date-fns";

const getPreviousMonth = (month) =>
  format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");

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


  const calculateReadyToAssign = (month: string): number => {
    const prevMonth = getPreviousMonth(month);

    const previousBalance = budgetData[prevMonth]?.readyToAssign || 0;

    const totalIncome = transactions
      .filter((tx) => format(tx.date, "yyyy-MM") === month && tx.inflow)
      .reduce((sum, tx) => sum + tx.amount, 0);

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

    return previousBalance + totalIncome - totalAssigned;
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

  const getCumulativeAvailable = (passedInData, itemName, newMonth) => {
    const pastMonths = Object.keys(passedInData).filter((month) =>
      isBeforeMonth(month, newMonth)
    );
  
    const past = pastMonths.reduce((sum, month) => {
      const categoryItem = passedInData[month]?.categories
        .flatMap((cat) => cat.categoryItems)
        .find((item) => item.name === itemName);
  
      return sum + (categoryItem?.assigned - categoryItem?.activity || 0);
    }, 0);
    return past;
  };

  const updateMonth = (newMonth: string, direction: string, accounts) => {
    setCurrentMonth(newMonth); // Ensure newMonth is set before using it in logic
  
    setBudgetData((prev) => {
      const previousMonth = getPreviousMonth(newMonth);
      const pastMonths = Object.keys(prev).filter((month) =>
        isBeforeMonth(month, newMonth)
      );

      // If the month already exists, update available without changing structure
      if (prev[newMonth]) {
        return {
          ...prev,
          [newMonth]: {
            ...prev[newMonth],
            categories: prev[newMonth].categories.map((category) => {
              if (category.name === 'Credit Card Payemnts') return category
              return {
              ...category,
              categoryItems: category.categoryItems.map((item) => ({
                ...item,
                activity: calculateActivityForMonth(newMonth, item.name, accounts),
                available: getCumulativeAvailable(prev, item.name, newMonth) - item.activity,
              })),
            }}),
          },
        };
      }
  
      // Get previous month's categories if moving forward, else use empty categories
      const prevCategories =
        prev[previousMonth]?.categories && direction === "forward"
          ? prev[previousMonth].categories
          : [];
  
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
  
      // Create the new month's categories
      const updatedCategories = prevCategories.length
        ? prevCategories.map((category) => ({
            ...category,
            categoryItems: category.categoryItems.map((item) => {

              const pastAssigned = cumulativeAssigned.get(item.name) || 0;
              const isCreditCardPayment = category.name === "Credit Card Payments";

              const pastAvailable = isCreditCardPayment
              ? prev[previousMonth]?.categories
                  .find((c) => c.name === "Credit Card Payments")
                  ?.categoryItems.find((i) => i.name === item.name)?.available || 0
              : pastAssigned;

              console.log(isCreditCardPayment, ': ', pastAvailable);

              return {
              ...item,
              assigned: 0, // Reset assigned to 0 for the new month
              activity: calculateActivityForMonth(newMonth, item.name, accounts),
              available: pastAvailable, // Carry over available
            }}),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);
  
      return {
        ...prev,
        [newMonth]: {
          categories: updatedCategories,
          assignableMoney: prev[currentMonth]?.assignableMoney || 0,
          readyToAssign:
            (prev[previousMonth]?.readyToAssign || 0) +
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
  

  useEffect(() => {
    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: {
        ...prev[currentMonth],
        readyToAssign: calculateReadyToAssign(currentMonth),
      },
    }));
  }, [transactions, currentMonth]);

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
