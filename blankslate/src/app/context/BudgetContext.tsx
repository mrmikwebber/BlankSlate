"use client";
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useTableContext } from "@/app/context/TableDataContext";
import { addMonths, format, getMonth, parseISO, subMonths } from "date-fns";

const getPreviousMonth = (month) =>
  format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");

const BudgetContext = createContext(null);

const initialCategories = [
  { name: "Credit Card Payments", categoryItems: [] },
  {
    name: "Subscriptions",
    categoryItems: [
      { name: "Blank Slate Subscription", assigned: 0, activity: 0, available: 0 },
    ],
  },
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
        categoryItems: category.categoryItems?.map((item) => ({
          ...item,
          available: item.assigned + item.activity,
        })),
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
    return accounts
      .flatMap((account) => account.transactions)
      .filter(
        (tx) => tx.categoryGroup === categoryName && tx.date.startsWith(month)
      )
      .reduce((sum, tx) => sum + tx.balance, 0);
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
    setBudgetData((prev) => {
      const pastMonths = Object.keys(prev).filter((month) =>
        isBeforeMonth(month, newMonth)
      );
  
      if (prev[newMonth]) {
        return {
          ...prev,
          [newMonth]: {
            ...prev[newMonth],
            categories: prev[newMonth].categories.map((category) => ({
              ...category,
              categoryItems: category.categoryItems.map((item) => ({
                ...item,
                available: item.assigned + getCumulativeAvailable(prev, item.name, newMonth) - item.activity,
              })),
            })),
          },
        };
      }

      if (prev[newMonth]) {
        return {
          ...prev,
          [newMonth]: {
            ...prev[newMonth],
            categories: prev[newMonth].categories.map((category) => ({
              ...category,
              categoryItems: category.categoryItems.map((item) => ({
                ...item,
                available: getCumulativeAvailable(prev, item.name, newMonth) - item.activity,
              })),
            })),
          },
        };
      }

      const prevCategories =
        prev[currentMonth]?.categories && direction === 'forward'
          ? prev[currentMonth].categories
          : [];

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

      const updatedCategories = prevCategories.length
        ? prevCategories.map((category) => ({
            ...category,
            categoryItems: category.categoryItems.map((item) => {
              const pastAssigned = cumulativeAssigned.get(item.name) || 0;
              return {
                ...item,
                assigned: 0,
                activity: calculateActivityForMonth(newMonth, item.name, accounts),
                available: pastAssigned
              };
            }),
          }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);
  
      return {
        ...prev,
        [newMonth]: {
          categories: updatedCategories,
          assignableMoney: prev[currentMonth]?.assignableMoney || 0,
          readyToAssign:
            (prev[currentMonth]?.readyToAssign || 0) +
            (prev[currentMonth]?.assignableMoney || 0) -
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

    setCurrentMonth(newMonth);
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
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
