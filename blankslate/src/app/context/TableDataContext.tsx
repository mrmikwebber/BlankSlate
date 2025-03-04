"use client"
import { createContext, useContext, useState } from "react";

interface CategoryData {
  name: string;
  assigned: number;
  activity: number;
  available: number;
}

export interface CategoryCreditCardData extends CategoryData {
  payment: number;
}

export interface CategoryGroupData {
  name: string;
  categoryItems: CategoryData[];
}

interface CreditCardCategoryGroupData extends CategoryGroupData {
  categoryItems: CategoryCreditCardData[];
}

interface TableData {
  categories: CategoryGroupData[];
  addCategory: (categoryName: string) => void;
  addItemToCategory: (categoryName: string, newItem: { name: string; assigned: number; activity: number, available: number }) => void;
}

const TableContext = createContext<TableData | undefined>(undefined);

export const useTableContext = () => {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error("useTableContext must be used within an TableProvider");
  }
  return context;
};

export const TableProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const subscriptionCategoryItems: CategoryData[] = [
    { name: "Max Bundle", assigned: 0, activity: 0, available: 0 },
    { name: "Adobe CC", assigned: 0, activity: 0, available: 0 },
    { name: "Prime", assigned: 0, activity: 0, available: 0 },
    { name: "Spotify", assigned: 0, activity: 0, available: 0 },
    { name: "Netflix", assigned: 0, activity: 0, available: 0 },
    { name: "YT Premium", assigned: 0, activity: 0, available: 0 },
  ];

  const billsCategoryItems: CategoryData[] = [
    { name: "Rent", assigned: 0, activity: 0, available: 0},
    { name: "Electricity", assigned: 0, activity: 0, available: 0 },
    { name: "Car Loan", assigned: 0, activity: 0, available: 0 },
    { name: "Water Utility", assigned: 0, activity: 0, available: 0 },
    { name: "Internet", assigned: 0, activity: 0, available: 0 },
    { name: "Student Loans", assigned: 0, activity: 0, available: 0 },
  ];

  const creditCardsCategoryGroup: CreditCardCategoryGroupData = {
    name: "Credit Card Payments",
    categoryItems: [],
  }

  const billCategoryGroup: CategoryGroupData = {
    name: "Bills",
    categoryItems: billsCategoryItems
  }

  const subscriptionCategoryGroup: CategoryGroupData = {
    name: "Subscriptions",
    categoryItems: subscriptionCategoryItems
  }

  const [categories, setCategories] = useState<CategoryGroupData[]>([
    creditCardsCategoryGroup,
    billCategoryGroup,
    subscriptionCategoryGroup
  ]);

  const addCategory = (categoryName: string) => {
    const newCategoryList = categories;
    newCategoryList.push({
      name: categoryName,
      categoryItems: [],
    });
    setCategories(newCategoryList);
  };

  const addItemToCategory = (categoryName: string, newItem: { name: string; assigned: number; activity: number, available: number }) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.name === categoryName ? { ...cat, categoryItems: [...cat.categoryItems, newItem] } : cat
      )
    );
  };

  return (
    <TableContext.Provider value={{ categories, addCategory, addItemToCategory }}>
      {children}
    </TableContext.Provider>
  );
};
