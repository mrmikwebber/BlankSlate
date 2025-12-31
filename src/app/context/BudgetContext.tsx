"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  differenceInCalendarMonths,
  format,
  getMonth,
  isAfter,
  isSameMonth,
  parseISO,
  subMonths,
} from "date-fns";
import { useAuth } from "./AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { useAccountContext } from "./AccountContext";
import { useUndoRedo } from "./UndoRedoContext";

const getPreviousMonth = (month: string) => {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
};

interface Target {
  type: string;
  amount: number;
  targetDate: string;
  amountNeeded: number;
}

interface NoteEntry {
  text: string;
  updated_at: string;
}

interface BudgetData {
  categories: {
    name: string;
    notes?: string;
    notes_history?: NoteEntry[];
    categoryItems: {
      name: string;
      assigned: number;
      activity: number;
      available: number;
      target?: Target;
      notes?: string;
      notes_history?: NoteEntry[];
    }[];
  }[];
  assignable_money?: number;
  ready_to_assign?: number;
  id?: string;
}

interface CategoryItem {
  name: string;
  assigned: number;
  activity: number;
  available: number;
}

interface Category {
  name: string;
  categoryItems: CategoryItem[];
}

const BudgetContext = createContext(null);

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [recentChanges, setRecentChanges] = useState([]);
  const dirtyMonths = useRef<Set<string>>(new Set());
  const { user } = useAuth() || { user: null };
  const { registerAction } = useUndoRedo();
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

  // Helper: Update or add a note to a category group
  const updateCategoryGroupNote = useCallback(
    (categoryName: string, noteText: string) => {
      setBudgetData((prev) => {
        const updated = { ...prev };
        const monthData = updated[currentMonth];
        if (!monthData?.categories) return prev;

        const updatedCategories = monthData.categories.map((cat) => {
          if (cat.name !== categoryName) return cat;

          const now = new Date().toISOString();
          const newHistory = [
            ...(cat.notes_history || []),
            { text: noteText, updated_at: now },
          ];

          return {
            ...cat,
            notes: noteText,
            notes_history: newHistory,
          };
        });

        updated[currentMonth] = {
          ...monthData,
          categories: updatedCategories,
        };

        setIsDirty(true);
        return updated;
      });
    },
    [currentMonth, setIsDirty]
  );

  // Helper: Update or add a note to a category item
  const updateCategoryItemNote = useCallback(
    (categoryName: string, itemName: string, noteText: string) => {
      setBudgetData((prev) => {
        const updated = { ...prev };
        const monthData = updated[currentMonth];
        if (!monthData?.categories) return prev;

        const updatedCategories = monthData.categories.map((cat) => {
          if (cat.name !== categoryName) return cat;

          const updatedItems = cat.categoryItems.map((item) => {
            if (item.name !== itemName) return item;

            const now = new Date().toISOString();
            const newHistory = [
              ...(item.notes_history || []),
              { text: noteText, updated_at: now },
            ];

            return {
              ...item,
              notes: noteText,
              notes_history: newHistory,
            };
          });

          return { ...cat, categoryItems: updatedItems };
        });

        updated[currentMonth] = {
          ...monthData,
          categories: updatedCategories,
        };

        setIsDirty(true);
        return updated;
      });
    },
    [currentMonth, setIsDirty]
  );

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
        const newMonth = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}`;
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

        setBudgetData((prev) => ({
          ...prev,
          [newMonth]: {
            id: inserted[0].id as string,
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
        data.forEach((entryRaw) => {
          const {
            month,
            data: { categories },
            ...rest
          } = entryRaw as {
            month: string;
            data: { categories: Category[] };
            [key: string]: unknown;
          };

          formatted[month] = {
            ...rest,
            month,
            categories,
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

  const refreshAccounts = async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*, transactions(*)")
      .order("date", { foreignTable: "transactions", ascending: true });

    if (error) {
      console.error("Error refreshing accounts:", error);
      return;
    }

    setAccounts(data);
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

    if (process.env.TESTING) return;

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
      setBudgetData((prev) => ({
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
    const assignedMap = new Map<string, number>();

    for (const category of budgetData[currentMonth]?.categories || []) {
      for (const item of category.categoryItems) {
        if (item.assigned > 0) {
          assignedMap.set(
            item.name,
            (assignedMap.get(item.name) || 0) + item.assigned
          );
        }
      }
    }

    const cardPaymentsByName = new Map<string, number>();

    for (const account of accounts.filter((acc) => acc.type === "credit")) {
      for (const tx of account.transactions) {
        const category = tx.category;
        if (
          assignedMap.has(category) &&
          category !== "Ready to Assign" &&
          isSameMonth(
            format(parseISO(tx.date), "yyyy-MM"),
            format(parseISO(currentMonth), "yyyy-MM")
          )
        ) {
          const assigned = assignedMap.get(category)!;
          const spent = Math.abs(tx.balance);
          const deduction = Math.min(spent, assigned);
          const newAssigned = assigned - deduction;

          if (newAssigned <= 0) {
            assignedMap.delete(category);
          } else {
            assignedMap.set(category, newAssigned);
          }
        }
      }
    }

    for (const account of accounts.filter((acc) => acc.type === "debit")) {
      for (const tx of account.transactions) {
        const category = tx.category;
        if (
          assignedMap.has(category) &&
          category !== "Ready to Assign" &&
          isSameMonth(
            format(parseISO(tx.date), "yyyy-MM"),
            format(parseISO(currentMonth), "yyyy-MM")
          )
        ) {
          const assigned = assignedMap.get(category)!;
          const spent = Math.abs(tx.balance);
          const deduction = Math.min(spent, assigned);
          const newAssigned = assigned - deduction;

          if (newAssigned <= 0) {
            assignedMap.delete(category);
          } else {
            assignedMap.set(category, newAssigned);
          }
        }
      }
    }

    const creditCardPayments = accounts
      .filter((acc) => acc.type === "credit")
      .map((card) => {
        let payment = 0;

        for (const tx of card.transactions) {
          const category = tx.category;
          if (
            assignedMap.has(category) &&
            category !== "Ready to Assign" &&
            isSameMonth(
              format(parseISO(tx.date), "yyyy-MM"),
              format(parseISO(currentMonth), "yyyy-MM")
            )
          ) {
            const assigned = assignedMap.get(category)!;
            const spent = Math.abs(tx.balance);
            const deduction = Math.min(spent, assigned);
            payment += deduction;

            const newAssigned = assigned - deduction;
            if (newAssigned <= 0) {
              assignedMap.delete(category);
            } else {
              assignedMap.set(category, newAssigned);
            }
          }
        }

        const paymentsMade = cardPaymentsByName.get(card.name) || 0;
        return {
          card: card.name,
          payment: Math.max(payment - paymentsMade, 0),
        };
      });

    return creditCardPayments;
  };

  const categoryKey = (groupName: string, itemName: string) =>
    `${groupName}::${itemName}`;

  const getCumulativeAvailable = (
    passedInData,
    itemName,
    categoryGroupName?: string
  ) => {
    const currentDate = parseISO(`${currentMonth}-01`);

    const pastMonths = Object.keys(passedInData)
      .filter((month) => {
        const date = parseISO(`${month}-01`);
        return date < currentDate;
      })
      .sort();

    return pastMonths.reduce((sum, month) => {
      const categories = passedInData[month]?.categories ?? [];

      let matchingItem = null;

      for (const category of categories) {
        if (categoryGroupName && category.name !== categoryGroupName) continue;

        const found = category.categoryItems.find(
          (item) => item.name === itemName
        );
        if (found) {
          matchingItem = found;
          break;
        }
      }

      if (!matchingItem) return sum;

      const assigned = matchingItem.assigned || 0;
      const activity = matchingItem.activity || 0;

      return sum + assigned + activity;
    }, 0);
  };

  const renameCategoryGroup = async (oldName: string, newName: string) => {
    const { data: existingRows, error: fetchError } = await supabase
      .from("budget_data")
      .select("id, data")
      .eq("month", currentMonth)
      .single();

    if (fetchError || !existingRows) {
      console.error("Failed to fetch budget data:", fetchError?.message);
      return;
    }

    const updatedCategories = existingRows.data.categories.map((group) => {
      if (group.name !== oldName) return group;

      return {
        ...group,
        name: newName,
        categoryItems: group.categoryItems.map((item) => ({
          ...item,
          category_group: newName,
        })),
      };
    });

    const updatedData = {
      ...existingRows.data,
      categories: updatedCategories,
    };

    const { error: updateError } = await supabase
      .from("budget_data")
      .update({ data: updatedData })
      .eq("id", existingRows.id);

    if (updateError) {
      console.error("Failed to rename group in Supabase:", updateError.message);
      return;
    }

    setBudgetData((prev) => {
      const updated = { ...prev };
      updated[currentMonth].categories = updatedCategories;
      return updated;
    });
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Renamed group '${oldName}' to '${newName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const renameCategory = async (
    categoryName: string,
    oldItem: string,
    newItem: string
  ) => {
    await supabase
      .from("categories")
      .update({ name: newItem })
      .eq("name", oldItem)
      .eq("category_group", categoryName);

    setBudgetData((prev) => {
      const updated = { ...prev };
      updated[currentMonth].categories = updated[currentMonth].categories.map(
        (cat) =>
          cat.name === categoryName
            ? {
              ...cat,
              categoryItems: cat.categoryItems.map((item) =>
                item.name === oldItem ? { ...item, name: newItem } : item
              ),
            }
            : cat
      );
      return updated;
    });
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Renamed category '${oldItem}' to '${newItem}' in '${categoryName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
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
    if (!budgetData[currentMonth] || !accounts.length) return;

    const creditCardAccounts = accounts.filter((acc) => acc.type === "credit");
    const creditCardAccountNames = creditCardAccounts.map((acc) => acc.name);
    const creditCardAccountNamesSet = new Set(creditCardAccountNames);

    const updatedCategories = budgetData[currentMonth]?.categories?.map(
      (category) => {
        if (category.name === "Credit Card Payments") {
          const existingItemNames = category.categoryItems.map(
            (item) => item.name
          );
          
          // Filter out removed credit cards and add missing ones
          const filteredItems = category.categoryItems.filter((item) =>
            creditCardAccountNamesSet.has(item.name)
          );
          
          const missingItems = creditCardAccountNames
            .filter((name) => !existingItemNames.includes(name))
            .map((name) => ({
              name,
              assigned: 0,
              activity: calculateCreditCardAccountActivity(currentMonth, name),
              available: 0,
            }));

          const allItems = [...filteredItems, ...missingItems];

          const updatedItems = allItems.map((item) => {
            const cumulativeAvailable = getCumulativeAvailable(
              budgetData,
              item.name,
              category.name
            );
            const itemActivity = calculateCreditCardAccountActivity(
              currentMonth,
              item.name
            );
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
          const cumulativeAvailable = getCumulativeAvailable(
            budgetData,
            item.name,
            category.name
          );
          const itemActivity = calculateActivityForMonth(
            currentMonth,
            item.name,
            category.name
          );
          const availableSum = item.assigned + itemActivity;

          return {
            ...item,
            activity: itemActivity,
            available: availableSum + Math.max(cumulativeAvailable, 0),
          };
        });

        return {
          ...category,
          categoryItems: updatedItems,
        };
      }
    );


    const totalInflow = accounts
      .filter((acc) => acc.type === "debit")
      .flatMap((acc) => acc.transactions)
      .filter(
        (tx) =>
          tx.date &&
          isSameMonth(
            format(parseISO(tx.date), "yyyy-MM"),
            format(parseISO(currentMonth), "yyyy-MM")
          ) &&
          tx.balance > 0
      )
      .filter((tx) => tx.category === "Ready to Assign")
      .reduce((sum, tx) => sum + tx.balance, 0);

    setBudgetData((prev) => {
      const updated = {
        ...prev,
        [currentMonth]: {
          ...prev[currentMonth],
          categories: updatedCategories,
          assignable_money: totalInflow,
        },
      };

      // Avoid recalculating all months; update Ready To Assign for currentMonth only
      const rta = calculateReadyToAssign(currentMonth, updated);
      updated[currentMonth].ready_to_assign = rta;
      dirtyMonths.current.add(currentMonth);

      return updated;
    });
    setIsDirty(true);
  }, [accounts, currentMonth]);

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
      const groupExists = monthData.categories.some(
        (cat) => cat.name === groupName
      );

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

    registerAction({
      description: `Added group '${groupName}'`,
      execute: async () => {
        // Re-add the group for redo
        setBudgetData((prev) => {
          const monthData = prev[currentMonth];
          const groupExists = monthData.categories.some(
            (cat) => cat.name === groupName
          );

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
      },
      undo: async () => {
        setBudgetData((prev) => {
          const updated = { ...prev };
          updated[currentMonth].categories = updated[currentMonth].categories.filter(
            (cat) => cat.name !== groupName
          );
          return updated;
        });
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Added group '${groupName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

    const reorderCategoryGroups = useCallback(
      (draggedName: string, targetName: string) => {
        if (!draggedName || !targetName || draggedName === targetName) return;

        const previousData = JSON.parse(JSON.stringify(budgetData));

        const applyReorder = (data) => {
          const updated = { ...data };

          Object.keys(updated).forEach((month) => {
            const monthData = updated[month];
            if (!monthData?.categories) return;

            const categories = [...monthData.categories];
            const fromIndex = categories.findIndex(
              (cat) => cat.name === draggedName
            );
            const toIndex = categories.findIndex((cat) => cat.name === targetName);

            if (fromIndex === -1 || toIndex === -1) return;

            const [moved] = categories.splice(fromIndex, 1);
            categories.splice(toIndex, 0, moved);

            updated[month] = {
              ...monthData,
              categories,
            };

            dirtyMonths.current.add(month);
          });

          return updated;
        };

        setBudgetData((prev) => applyReorder(prev));

        registerAction({
          description: `Moved group '${draggedName}'`,
          execute: async () => {
            setBudgetData((prev) => applyReorder(prev));
          },
          undo: async () => {
            Object.keys(previousData).forEach((month) =>
              dirtyMonths.current.add(month)
            );
            setBudgetData(previousData);
          },
        });

        setIsDirty(true);
        setRecentChanges((prev) => [
          ...prev.slice(-9),
          {
            description: `Moved group '${draggedName}'`,
            timestamp: new Date().toISOString(),
          },
        ]);
      },
      [budgetData, registerAction]
    );

  const deleteCategoryGroup = (groupName: string) => {
    
    // Capture previous state for undo BEFORE any changes
    const previousData = JSON.parse(JSON.stringify(budgetData));
    
    // Create the new state (don't rely on setBudgetData callback)
    const updatedData = { ...budgetData };
    for (const month in updatedData) {
      const before = updatedData[month].categories;
      const after = before.filter((cat) => cat.name !== groupName);

      if (before.length !== after.length) {
        updatedData[month].categories = after;
        dirtyMonths.current.add(month);
      }
    }

    // Update state with the new data
    setBudgetData(updatedData);

    registerAction({
      description: `Deleted group '${groupName}'`,
      execute: async () => {
        // Re-delete the group for redo
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
      },
      undo: async () => {
        // Restore the previous state
        setBudgetData(previousData);
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Deleted group '${groupName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const addItemToCategory = (
    categoryName: string,
    newItem: {
      name: string;
      assigned: number;
      activity: number;
      available: number;
    }
  ) => {
    const monthData = budgetData[currentMonth];
    if (!monthData) return;

    const existingGroup = monthData.categories.find(
      (cat) => cat.name === categoryName
    );

    let newCategories;

    if (existingGroup) {
      // If the item already exists, don't add a duplicate
      const itemExists = existingGroup.categoryItems.some(
        (i) => i.name === newItem.name
      );
      if (itemExists) return;

      newCategories = monthData.categories.map((cat) =>
        cat.name === categoryName
          ? { ...cat, categoryItems: [...cat.categoryItems, newItem] }
          : cat
      );
    } else {
      // Group doesn't exist yet – create it with this one item
      newCategories = [
        ...monthData.categories,
        { name: categoryName, categoryItems: [newItem] },
      ];
    }

    // Update state FIRST
    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: {
        ...monthData,
        categories: newCategories,
      },
    }));

    // THEN register action (outside setState callback)
    registerAction({
      description: `Added category '${newItem.name}' to group '${categoryName}'`,
      execute: async () => {
        // Re-add the item for redo
        setBudgetData((prev) => {
          const monthData = prev[currentMonth];
          if (!monthData) return prev;

          const existingGroup = monthData.categories.find(
            (cat) => cat.name === categoryName
          );

          const itemExists = existingGroup?.categoryItems.some(
            (i) => i.name === newItem.name
          );
          if (itemExists) return prev;

          const newCategories = monthData.categories.map((cat) =>
            cat.name === categoryName
              ? { ...cat, categoryItems: [...cat.categoryItems, newItem] }
              : cat
          );

          return {
            ...prev,
            [currentMonth]: {
              ...monthData,
              categories: newCategories,
            },
          };
        });
      },
      undo: async () => {
        setBudgetData((undoPrev) => {
          const undoMonthData = undoPrev[currentMonth];
          const undoCategories = undoMonthData.categories.map((cat) =>
            cat.name === categoryName
              ? {
                  ...cat,
                  categoryItems: cat.categoryItems.filter(
                    (i) => i.name !== newItem.name
                  ),
                }
              : cat
          );

          return {
            ...undoPrev,
            [currentMonth]: {
              ...undoMonthData,
              categories: undoCategories,
            },
          };
        });
      },
    });

    setIsDirty(true);
    setRecentChanges((prevChanges) => [
      ...prevChanges.slice(-9),
      {
        description: `Added category '${newItem.name}' to group '${categoryName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };


  const hasReassignedRef = useRef(false);

  const deleteCategoryWithReassignment = useCallback(
    (context, targetItemName: string) => {
      if (hasReassignedRef.current) return;
      hasReassignedRef.current = true;

      const { itemName } = context;

      setBudgetData((prev) => {
        const updated = { ...prev };

        for (const monthKey of Object.keys(updated)) {
          const monthData = updated[monthKey];
          if (!monthData) continue;

          let monthChanged = false;

          const newCategories = monthData.categories.map((cat) => {
            let fromAssignedDelta = 0;
            let fromActivityDelta = 0;

            const newItems: CategoryItem[] = [];

            // First pass: remove the fromItem in this month and accumulate its values
            for (const item of cat.categoryItems) {
              if (item.name === itemName) {
                fromAssignedDelta += item.assigned || 0;
                fromActivityDelta += item.activity || 0;
                monthChanged = true;
                continue; // drop this item
              }
              newItems.push(item);
            }

            // If nothing to move from this category in this month, just return as-is
            if (fromAssignedDelta === 0 && fromActivityDelta === 0) {
              return { ...cat, categoryItems: newItems };
            }

            // Second pass: apply the deltas to the target item in THIS month
            const idx = newItems.findIndex((i) => i.name === targetItemName);

            if (idx !== -1) {
              const target = newItems[idx];
              const newAssigned = (target.assigned || 0) + fromAssignedDelta;
              const newActivity = (target.activity || 0) + fromActivityDelta;

              newItems[idx] = {
                ...target,
                assigned: newAssigned,
                activity: newActivity,
                available: newAssigned + newActivity,
              };
            } else {
              // If target item somehow doesn't exist in this category for this month,
              // we can either create it, or just ignore. For now, we create it.
              const newAssigned = fromAssignedDelta;
              const newActivity = fromActivityDelta;
              newItems.push({
                name: targetItemName,
                assigned: newAssigned,
                activity: newActivity,
                available: newAssigned + newActivity,
              });
            }

            return { ...cat, categoryItems: newItems };
          });

          if (monthChanged) {
            updated[monthKey] = {
              ...monthData,
              categories: newCategories,
            };
            dirtyMonths.current.add(monthKey);
          }
        }

        return updated;
      });

      // Now fix transactions: change their category to the target
      const targetCategoryGroup = budgetData[currentMonth]?.categories.find(
        (cat) => cat.categoryItems.some((item) => item.name === targetItemName)
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
    },
    [budgetData, currentMonth, setAccounts]
  );

  const reorderCategoryItems = useCallback(
    (
      fromGroup: string,
      draggedName: string,
      toGroup: string,
      targetName?: string,
      position: "before" | "after" = "before"
    ) => {
      if (!fromGroup || !draggedName || !toGroup) return;
      if (draggedName === targetName && fromGroup === toGroup) return;

      // Disallow moving items into or out of Credit Card Payments
      if (
        (fromGroup === "Credit Card Payments" && toGroup !== fromGroup) ||
        (toGroup === "Credit Card Payments" && fromGroup !== toGroup)
      ) {
        return;
      }

      const previousData = JSON.parse(JSON.stringify(budgetData));

      const applyReorder = (data) => {
        const updated = { ...data };

        Object.keys(updated).forEach((month) => {
          const monthData = updated[month];
          if (!monthData?.categories) return;

          const categories = monthData.categories.map((cat) => ({ ...cat }));

          const fromCat = categories.find((c) => c.name === fromGroup);
          const toCat = categories.find((c) => c.name === toGroup);
          if (!fromCat || !toCat) return;

          const fromItems = [...fromCat.categoryItems];
          const itemIndex = fromItems.findIndex((i) => i.name === draggedName);
          if (itemIndex === -1) return;

          const [moved] = fromItems.splice(itemIndex, 1);
          fromCat.categoryItems = fromItems;

          const toItems = [...toCat.categoryItems];

          if (targetName) {
            const targetIndex = toItems.findIndex((i) => i.name === targetName);
            if (targetIndex === -1) {
              toItems.push(moved);
            } else {
              const insertIndex = Math.min(
                Math.max(targetIndex + (position === "after" ? 1 : 0), 0),
                toItems.length
              );
              toItems.splice(insertIndex, 0, moved);
            }
          } else {
            toItems.push(moved);
          }

          toCat.categoryItems = toItems;

          updated[month] = {
            ...monthData,
            categories,
          };

          dirtyMonths.current.add(month);
        });

        return updated;
      };

      setBudgetData((prev) => applyReorder(prev));

      // Keep transactions aligned with the new group assignment
      setAccounts((prevAccounts) =>
        prevAccounts.map((account) => ({
          ...account,
          transactions: account.transactions.map((tx) => {
            if (tx.category === draggedName && tx.category_group === fromGroup) {
              return { ...tx, category_group: toGroup };
            }
            return tx;
          }),
        }))
      );

      registerAction({
        description: `Moved category '${draggedName}'`,
        execute: async () => {
          setBudgetData((prev) => applyReorder(prev));
          setAccounts((prevAccounts) =>
            prevAccounts.map((account) => ({
              ...account,
              transactions: account.transactions.map((tx) => {
                if (tx.category === draggedName && tx.category_group === fromGroup) {
                  return { ...tx, category_group: toGroup };
                }
                return tx;
              }),
            }))
          );
        },
        undo: async () => {
          Object.keys(previousData).forEach((month) =>
            dirtyMonths.current.add(month)
          );
          setBudgetData(previousData);
          setAccounts((prevAccounts) =>
            prevAccounts.map((account) => ({
              ...account,
              transactions: account.transactions.map((tx) => {
                if (tx.category === draggedName && tx.category_group === toGroup) {
                  return { ...tx, category_group: fromGroup };
                }
                return tx;
              }),
            }))
          );
        },
      });

      setIsDirty(true);
      setRecentChanges((prev) => [
        ...prev.slice(-9),
        {
          description: `Moved category '${draggedName}'`,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    [budgetData, registerAction, setAccounts]
  );


  const deleteCategoryItem = (context) => {
    const { itemName } = context;
    const previousData = JSON.parse(JSON.stringify(budgetData));

    setBudgetData((prev) => {
      const updated = { ...prev };

      for (const month in updated) {
        const before = updated[month].categories
          .map((cat) => cat.categoryItems.length)
          .join();
        updated[month].categories = updated[month].categories.map((cat) => ({
          ...cat,
          categoryItems: cat.categoryItems.filter(
            (item) => item.name !== itemName
          ),
        }));
        const after = updated[month].categories
          .map((cat) => cat.categoryItems.length)
          .join();
        if (before !== after) dirtyMonths.current.add(month);
      }

      return updated;
    });

    registerAction({
      description: `Deleted category '${itemName}'`,
      execute: async () => {
        // Re-delete the item for redo
        setBudgetData((prev) => {
          const updated = { ...prev };

          for (const month in updated) {
            updated[month].categories = updated[month].categories.map((cat) => ({
              ...cat,
              categoryItems: cat.categoryItems.filter(
                (item) => item.name !== itemName
              ),
            }));
            dirtyMonths.current.add(month);
          }

          return updated;
        });
      },
      undo: async () => {
        setBudgetData(previousData);
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Deleted category '${itemName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const setCategoryTarget = (categoryItemName, target) => {
    // Capture old target for undo
    const oldTarget = budgetData[currentMonth]?.categories
      .flatMap((c) => c.categoryItems)
      .find((item) => item.name === categoryItemName)?.target;

    setBudgetData((prev) => {
      const updated = { ...prev };

      const current = parseISO(`${currentMonth}-01`);

      for (const monthKey of Object.keys(prev)) {
        const monthDate = parseISO(`${monthKey}-01`);

        if (isAfter(monthDate, current) || isSameMonth(monthDate, current)) {
          const updatedCategories = prev[monthKey].categories.map(
            (category) => ({
              ...category,
              categoryItems: category.categoryItems.map((item) =>
                item.name === categoryItemName ? { ...item, target } : item
              ),
            })
          );

          updated[monthKey] = {
            ...prev[monthKey],
            categories: updatedCategories,
          };
        }
      }

      return updated;
    });

    registerAction({
      description: `Set target for '${categoryItemName}' to ${target?.amount ?? 0}`,
      execute: async () => {
        // Re-set the target for redo
        setBudgetData((prev) => {
          const updated = { ...prev };
          const current = parseISO(`${currentMonth}-01`);

          for (const monthKey of Object.keys(prev)) {
            const monthDate = parseISO(`${monthKey}-01`);

            if (isAfter(monthDate, current) || isSameMonth(monthDate, current)) {
              const updatedCategories = prev[monthKey].categories.map(
                (category) => ({
                  ...category,
                  categoryItems: category.categoryItems.map((item) =>
                    item.name === categoryItemName ? { ...item, target } : item
                  ),
                })
              );

              updated[monthKey] = {
                ...prev[monthKey],
                categories: updatedCategories,
              };
            }
          }

          return updated;
        });
      },
      undo: async () => {
        setBudgetData((prev) => {
          const updated = { ...prev };
          const current = parseISO(`${currentMonth}-01`);

          for (const monthKey of Object.keys(prev)) {
            const monthDate = parseISO(`${monthKey}-01`);

            if (isAfter(monthDate, current) || isSameMonth(monthDate, current)) {
              const undoCategories = prev[monthKey].categories.map(
                (category) => ({
                  ...category,
                  categoryItems: category.categoryItems.map((item) =>
                    item.name === categoryItemName
                      ? { ...item, target: oldTarget }
                      : item
                  ),
                })
              );

              updated[monthKey] = {
                ...prev[monthKey],
                categories: undoCategories,
              };
            }
          }

          return updated;
        });
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Set target for '${categoryItemName}' to ${target?.amount ?? 0
          }`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const getFirstInflowMonth = () => {
    const inflowMonths = accounts
      .filter((acc) => acc.type === "debit")
      .flatMap((acc) => acc.transactions)
      .filter((tx) => tx.category === "Ready to Assign" && tx.balance > 0)
      .map((tx) => format(parseISO(tx.date), "yyyy-MM"));

    return inflowMonths.sort()[0] ?? null;
  };

  const calculateReadyToAssign = (month: string, data): number => {
    const allMonths = Object.keys(data).sort();
    const currentIndex = allMonths.indexOf(month);
    if (currentIndex === -1) return 0;

    // 1️⃣ Inflows up to and including `month`
    const inflowUpTo = allMonths.slice(0, currentIndex + 1).reduce((sum, m) => {
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

    // 2️⃣ Total assigned across ALL months (future budgeting hits the same pool)
    const totalAssigned = Object.keys(data).reduce((sum, m) => {
      const assigned = data[m]?.categories?.reduce(
        (catSum, cat) =>
          catSum +
          cat.categoryItems.reduce(
            (itemSum, item) => itemSum + (item.assigned || 0),
            0
          ),
        0
      );
      return sum + (assigned || 0);
    }, 0);

    // 3️⃣ Total cash overspending from ALL *past* months (cash accounts only)
    let totalCashOverspending = 0;

    // Envelope balance per (group, item)
    const envelope = new Map<string, number>();

    const pastMonths = allMonths.slice(0, currentIndex); // months strictly before current

    for (const m of pastMonths) {
      const monthCategories = data[m]?.categories || [];

      // Precompute debit spending per (group,item) for this month
      const debitSpendingMap = new Map<string, number>();

      for (const acc of accounts.filter((a) => a.type === "debit")) {
        for (const tx of acc.transactions) {
          if (!tx.date || tx.balance >= 0) continue;

          const txMonth = format(parseISO(tx.date), "yyyy-MM");
          const mMonth = format(parseISO(`${m}-01`), "yyyy-MM");
          if (!isSameMonth(txMonth, mMonth)) continue;

          const groupName = tx.category_group || "";
          const itemName = tx.category;
          if (!itemName) continue;

          const key = categoryKey(groupName, itemName);
          const current = debitSpendingMap.get(key) || 0;
          debitSpendingMap.set(key, current + Math.abs(tx.balance));
        }
      }

      for (const category of monthCategories) {
        // Skip credit card payments – they use different rules
        if (category.name === "Credit Card Payments") continue;

        for (const item of category.categoryItems) {
          // ignore the RTA line itself
          if (item.name === "Ready to Assign") continue;

          const key = categoryKey(category.name, item.name);
          const assigned = item.assigned || 0;

          const prevEnv = envelope.get(key) || 0;
          const envelopeBefore = prevEnv + assigned;

          const debitSpending = debitSpendingMap.get(key) || 0;

          if (debitSpending <= envelopeBefore) {
            // Fully covered by existing envelope + this month's budget
            envelope.set(key, envelopeBefore - debitSpending);
          } else {
            // Cash overspending: debit spending exceeded envelope
            const cashOverspend = debitSpending - envelopeBefore;
            totalCashOverspending += cashOverspend;
            envelope.set(key, 0);
          }
        }
      }
    }

    // 4️⃣ Final RTA
    return inflowUpTo - totalAssigned - totalCashOverspending;

  };


  const refreshAllReadyToAssign = (data = budgetData) => {
    const updated = { ...data };
    const sortedMonths = Object.keys(updated).sort();

    for (const month of sortedMonths) {
      updated[month].ready_to_assign = calculateReadyToAssign(month, data);
      dirtyMonths.current.add(month);
    }

    setBudgetData(updated);
    setIsDirty(true);
  };

  const calculateCreditCardAccountActivity = useCallback((
    month,
    accountName,
    data = budgetData
  ) => {
    const monthStr = format(parseISO(`${month}-01`), "yyyy-MM");
    const account = accounts.find((a) => a.name === accountName);
    if (!account) return 0;

    // 1) Build map of how much was assigned to each category this month
    const assignedMap = new Map<string, number>();
    for (const category of data[month]?.categories || []) {
      for (const item of category.categoryItems) {
        if (item.assigned > 0) {
          assignedMap.set(
            item.name,
            (assignedMap.get(item.name) || 0) + item.assigned
          );
        }
      }
    }

    // 2) First pass: collect spending/refunds per category (no netActivity yet)
    type Activity = {
      spending: number;    // sum of |negative| transactions
      refunds: number;     // sum of positive transactions
      netActivity: number; // to fill in later
    };

    const categoryActivity = new Map<string, Activity>();

    for (const tx of account.transactions) {
      const txMonth = format(parseISO(tx.date), "yyyy-MM");
      if (txMonth !== monthStr) continue;

      const { category, balance } = tx;

      // Ignore direct payments + RTA here — we handle those separately
      if (category === "Ready to Assign" || category === accountName) continue;

      if (!categoryActivity.has(category)) {
        categoryActivity.set(category, {
          spending: 0,
          refunds: 0,
          netActivity: 0,
        });
      }

      const activity = categoryActivity.get(category)!;

      if (balance < 0) {
        // spending
        activity.spending += Math.abs(balance);
      } else if (balance > 0) {
        // refund
        activity.refunds += balance;
      }

      categoryActivity.set(category, activity);
    }

    // 3) Second pass: compute netActivity using budget + netSpending
    for (const [category, activity] of categoryActivity.entries()) {
      const netSpending = activity.spending - activity.refunds;

      if (assignedMap.has(category)) {
        const available = assignedMap.get(category) ?? 0;

        if (netSpending > 0) {
          // Normal case: more spending than refunds this month
          const used = Math.min(netSpending, available);
          activity.netActivity = used;
          assignedMap.set(category, Math.max(0, available - used));
        } else if (netSpending < 0) {
          // More refunds than spending:
          // treat this as reducing how much we need to pay the card
          activity.netActivity = netSpending; // negative number
        } else {
          activity.netActivity = 0;
        }
      } else {
        // No current-month budget:
        // - Positive netSpending: unbudgeted spending → we can decide to ignore or treat as 0
        // - Negative netSpending: refunds > spending → still reduces payment
        if (netSpending < 0) {
          activity.netActivity = netSpending;
        } else {
          activity.netActivity = 0;
        }
      }

      categoryActivity.set(category, activity);
    }

    // 4) Sum up total activity from all categories
    let totalActivity = 0;
    for (const activity of categoryActivity.values()) {
      totalActivity += activity.netActivity;
    }

    // 5) Handle direct payments to the credit card account itself
    for (const tx of account.transactions) {
      const txMonth = format(parseISO(tx.date), "yyyy-MM");
      if (txMonth !== monthStr) continue;

      if (tx.category === accountName && tx.balance > 0) {
        // A positive transaction with category = card name is a payment
        totalActivity -= tx.balance;
      }
    }

    return totalActivity;
  }, [budgetData, accounts]);


  const calculateActivityForMonth = useCallback((
    month,
    categoryName,
    categoryGroupName?: string
  ) => {
    const filteredAccounts = accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        if (!tx.date) return false;
        const txMonth = format(parseISO(tx.date), "yyyy-MM");
        const convertedMonth = format(parseISO(month), "yyyy-MM");

        const sameMonth = isSameMonth(txMonth, convertedMonth);
        const categoryMatch = tx.category === categoryName;
        const groupMatch = !categoryGroupName
          ? true
          : tx.category_group === categoryGroupName;

        return sameMonth && categoryMatch && groupMatch;
      });

    return filteredAccounts.reduce((sum, tx) => sum + tx.balance, 0);
  }, [accounts]);


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
            const key = categoryKey(category.name, item.name);
            if (!cumulativeAssigned.has(key)) {
              cumulativeAssigned.set(key, 0);
            }
            cumulativeAssigned.set(
              key,
              cumulativeAssigned.get(key) + item.assigned
            );
          });
        });
      });

      const cumulativeActivity = new Map();
      pastMonths.forEach((month) => {
        prev[month]?.categories.forEach((category) => {
          category.categoryItems.forEach((item) => {
            const key = categoryKey(category.name, item.name);
            if (!cumulativeActivity.has(key)) {
              cumulativeActivity.set(key, 0);
            }
            cumulativeActivity.set(
              key,
              cumulativeActivity.get(key) + item.activity
            );
          });
        });
      });


      if (prev[newMonth]) {
        const allGroupNames = new Set(
          Object.values(prev).flatMap(
            (month) => month?.categories?.map((cat) => cat.name) || []
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

              const missingItems =
                prev[previousMonth]?.categories
                  .find((c) => c.name === category.name)
                  ?.categoryItems
                  .filter((item) => !existingItemsMap[item.name])
                  .map((item) => ({
                    ...item,
                    assigned: 0,
                    activity: 0,
                    available: 0,
                    target: item.target ?? null,
                  })) || [];


              const patchedCategoryItems = [
                ...category.categoryItems,
                ...missingItems,
              ];

              if (
                !areCategoriesEqual(
                  patchedCategoryItems,
                  category.categoryItems
                )
              ) {
                setIsDirty(true);
              }

              return {
                ...category,
                categoryItems: patchedCategoryItems.map((item) => {
                  const key = categoryKey(category.name, item.name);
                  const pastAssigned = cumulativeAssigned.get(key) || 0;
                  const pastActivity = cumulativeActivity.get(key) || 0;
                  const isCreditCardPayment =
                    category.name === "Credit Card Payments";

                  if (cumulativeActivity.size === 0) return item;

                  const pastAvailable = isCreditCardPayment
                    ? prev[previousMonth]?.categories
                      .find((c) => c.name === "Credit Card Payments")
                      ?.categoryItems.find((i) => i.name === item.name)
                      ?.available || 0
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
                  } else if (
                    previousItem?.target?.type === "Custom" ||
                    previousItem?.target?.type === "Full Payoff"
                  ) {
                    const targetMonthNumber =
                      getMonth(parseISO(previousItem.target.targetDate)) + 1;
                    const currentMonthNumber = getMonth(parseISO(newMonth));

                    let monthsUntilTarget =
                      targetMonthNumber - currentMonthNumber;
                    if (monthsUntilTarget <= 0) monthsUntilTarget = 1;

                    const totalAssigned =
                      cumulativeAssigned.get(item.name) || 0;
                    const remainingAmount =
                      previousItem.target.amount - totalAssigned;

                    const base =
                      Math.floor((remainingAmount / monthsUntilTarget) * 100) /
                      100;
                    const baseTotal = base * monthsUntilTarget;
                    const extraCents = Math.round(
                      (remainingAmount - baseTotal) * 100
                    );

                    const monthAmounts = Array(monthsUntilTarget).fill(base);
                    for (let i = 0; i < extraCents; i++) {
                      monthAmounts[i] += 0.01;
                    }

                    const monthIndex =
                      direction === "forward"
                        ? currentMonthNumber -
                        (targetMonthNumber - monthsUntilTarget)
                        : 0;
                    const newAmountNeeded = monthAmounts[monthIndex] ?? base;

                    newTarget = {
                      ...previousItem.target,
                      amountNeeded: newAmountNeeded,
                    };

                    const targetMonth =
                      previousItem.target.type === "Custom"
                        ? parseISO(newTarget.targetDate)
                        : parseISO(`${newTarget.targetDate}-01`);

                    const currentMonthDate =
                      previousItem.target.type === "Custom"
                        ? parseISO(newMonth)
                        : parseISO(`${newMonth}-01`);

                    if (
                      differenceInCalendarMonths(
                        currentMonthDate,
                        targetMonth
                      ) >= 1
                    ) {
                      newTarget = null;
                    }
                  }

                  let itemActivity;

                  if (category.name === "Credit Card Payments") {
                    const currentMonthActivity = calculateCreditCardAccountActivity(
                      newMonth,
                      item.name,
                      prev
                    );
                    itemActivity = currentMonthActivity;
                    const prevAvailable = prev[previousMonth]?.categories
                      ?.find(c => c.name === "Credit Card Payments")
                      ?.categoryItems
                      ?.find(i => i.name === item.name)
                      ?.available ?? 0;
                    item.available = prevAvailable + currentMonthActivity;
                  } else {
                    itemActivity = calculateActivityForMonth(
                      newMonth,
                      item.name,
                      category.name
                    );

                    // If previous month had debit overspending for this category, reset available to 0 for the new month
                    const wasDebitOverspent =
                      (previousItem?.available ?? 0) < 0 &&
                      accounts.some(acc =>
                        acc.type === "debit" &&
                        acc.transactions.some(tx =>
                          tx.category === item.name &&
                          isSameMonth(
                            format(parseISO(tx.date), "yyyy-MM"),
                            previousMonth
                          ) &&
                          tx.balance < 0
                        )
                      );

                    // Start new month with zero assigned
                    // item.assigned = 0;

                    if (wasDebitOverspent) {
                      // Reset available to 0; overspending impact has already been applied to RTA
                      return {
                        ...item,
                        activity: itemActivity,
                        target: newTarget,
                        available: 0,
                      };
                    }
                  }

                  return {
                    ...item,
                    activity: itemActivity,
                    target: newTarget,
                    available:
                      category.name !== "Credit Card Payments"
                        ? pastAvailable + itemActivity + 0 /* assigned reset */
                        : item.available,
                  };
                }),
              };
            }),
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
            const key = categoryKey(category.name, item.name);
            const pastAssigned = cumulativeAssigned.get(key) || 0;
            const pastActivity = cumulativeActivity.get(key) || 0;
            const isCreditCardPayment =
              category.name === "Credit Card Payments";
            const pastAvailable = isCreditCardPayment
              ? prev[previousMonth]?.categories
                .find((c) => c.name === "Credit Card Payments")
                ?.categoryItems.find((i) => i.name === item.name)
                ?.available || 0
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
            } else if (
              previousItem?.target?.type === "Custom" ||
              previousItem?.target?.type === "Full Payoff"
            ) {
              const targetMonthNumber =
                getMonth(parseISO(previousItem.target.targetDate)) + 1;
              const currentMonthNumber = getMonth(parseISO(newMonth));

              let monthsUntilTarget = targetMonthNumber - currentMonthNumber;
              if (monthsUntilTarget <= 0) monthsUntilTarget = 1;

              const totalAssigned = cumulativeAssigned.get(item.name) || 0;
              const remainingAmount =
                previousItem.target.amount - totalAssigned;

              const base =
                Math.floor((remainingAmount / monthsUntilTarget) * 100) / 100;
              const baseTotal = base * monthsUntilTarget;
              const extraCents = Math.round(
                (remainingAmount - baseTotal) * 100
              );

              const monthAmounts = Array(monthsUntilTarget).fill(base);
              for (let i = 0; i < extraCents; i++) {
                monthAmounts[i] += 0.01;
              }

              const monthIndex =
                direction === "forward"
                  ? currentMonthNumber -
                  (targetMonthNumber - monthsUntilTarget)
                  : 0;
              const newAmountNeeded = monthAmounts[monthIndex] ?? base;

              newTarget = {
                ...previousItem.target,
                amountNeeded: newAmountNeeded,
              };

              const targetMonth =
                previousItem.target.type === "Custom"
                  ? parseISO(newTarget.targetDate)
                  : parseISO(`${newTarget.targetDate}-01`);

              const currentMonthDate =
                previousItem.target.type === "Custom"
                  ? parseISO(newMonth)
                  : parseISO(`${newMonth}-01`);

              if (
                differenceInCalendarMonths(currentMonthDate, targetMonth) >= 1
              ) {
                newTarget = null;
              }
            }

            let itemActivity;

            if (category.name === "Credit Card Payments") {
              itemActivity = calculateCreditCardAccountActivity(
                newMonth,
                item.name
              );
            } else {
              itemActivity = calculateActivityForMonth(newMonth, item.name, category.name);
            }

            // For non-credit card categories, if there was debit overspending,
            // reset the available to 0 as it's being handled by Ready to Assign
            const wasDebitOverspent = category.name !== "Credit Card Payments" &&
              (previousItem?.available ?? 0) < 0 &&
              accounts.some(acc =>
                acc.type === "debit" &&
                acc.transactions.some(tx =>
                  tx.category === item.name &&
                  isSameMonth(format(parseISO(tx.date), "yyyy-MM"), previousMonth)
                )
              );

            return {
              ...item,
              assigned: 0,
              activity: itemActivity,
              target: newTarget,
              available:
                category.name === "Credit Card Payments"
                  ? item.available
                  : wasDebitOverspent
                    ? 0
                    : pastAvailable + itemActivity,
            };
          }),
        }))
        : createEmptyCategories(prev[getLatestMonth(prev)]?.categories || []);

      const totalInflow = accounts
        ?.filter((acc) => acc.type === "debit")
        .flatMap((acc) => acc.transactions)
        .filter(
          (tx) =>
            tx.date &&
            isSameMonth(
              format(parseISO(tx.date), "yyyy-MM"),
              parseISO(newMonth)
            ) &&
            tx.balance > 0
        )
        .filter((tx) => tx.category === "Ready to Assign")
        .reduce((sum, tx) => sum + tx.balance, 0);

      setIsDirty(true);
      const newBudgetData = {
        ...prev,
        [newMonth]: {
          categories: updatedCategories,
          assignable_money: totalInflow || 0,
        },
      };

      refreshAllReadyToAssign(newBudgetData);

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
        reorderCategoryGroups,
        reorderCategoryItems,
        dirtyMonths,
        refreshAllReadyToAssign,
        calculateCreditCardAccountActivity,
        calculateActivityForMonth,
        getCumulativeAvailable,
        renameCategory,
        renameCategoryGroup,
        recentChanges,
        setRecentChanges,
        refreshAccounts,
        updateCategoryGroupNote,
        updateCategoryItemNote,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => useContext(BudgetContext);
