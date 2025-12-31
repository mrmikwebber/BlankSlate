"use client";
import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import MonthNav from "./MonthNav";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { useBudgetContext } from "../context/BudgetContext";
import { getTargetStatus } from "../utils/getTargetStatus";
import { createPortal } from "react-dom";
import InlineTargetEditor from "./TargetInlineEditor";
import { useAccountContext } from "../context/AccountContext";
import { useUndoRedo } from "../context/UndoRedoContext";
import { NotesPopover } from "@/components/ui/NotesPopover";
import { subMonths, format, parse } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight, GripVertical, Plus, RotateCcw, RotateCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export default function BudgetTable() {
  const {
    currentMonth,
    budgetData,
    setBudgetData,
    setIsDirty,
    addCategoryGroup,
    addItemToCategory,
    deleteCategoryGroup,
    deleteCategoryWithReassignment,
    deleteCategoryItem,
    refreshAllReadyToAssign,
    getCumulativeAvailable,
    renameCategory,
    renameCategoryGroup,
    calculateCreditCardAccountActivity,
    calculateActivityForMonth,
    setRecentChanges,
    reorderCategoryGroups,
    reorderCategoryItems,
    updateCategoryGroupNote,
    updateCategoryItemNote,
    sandboxMode,
    enterSandbox,
    exitSandbox,
    setCategorySnooze,
  } = useBudgetContext();

  const { accounts } = useAccountContext();
  const { registerAction, undo, redo, canUndo, canRedo, undoDescription, redoDescription } = useUndoRedo();

  console.count("BudgetTable render");

  const FILTERS = [
    "All",
    "Money Available",
    "Overspent",
    "Overfunded",
    "Underfunded",
    "Snoozed",
  ];
  const [selectedCategory, setSelectedCategory] = useState("");
  const [inlineEditorCategory, setInlineEditorCategory] = useState<
    string | null
  >(null);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [editingItem, setEditingItem] = useState<{
    category: string;
    item: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [newItem, setNewItem] = useState({
    name: "",
    assigned: 0,
    activity: 0,
    available: 0,
    snoozed: false,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [addPopoverPos, setAddPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [compareToLastMonth, setCompareToLastMonth] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {}
  );
  const [groupContext, setGroupContext] = useState<{
    x: number;
    y: number;
    categoryName: string;
    itemCount: number;
  } | null>(null);
  const [categoryDeleteContext, setCategoryDeleteContext] = useState<{
    categoryName: string;
    itemName: string;
    assigned: number;
    activity: number;
    available: number;
  } | null>(null);
  const [categoryContext, setCategoryContext] = useState<{
    x: number;
    y: number;
    groupName: string;
    itemName: string;
    assigned: number;
    activity: number;
    available: number;
    snoozed?: boolean;
  } | null>(null);

  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ group: string; item: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{
    group: string;
    item: string;
    position?: "before" | "after";
  } | null>(null);
  const [moveMoneyModal, setMoveMoneyModal] = useState<{
    toGroup: string;
    toItem: string;
    available: number;
  } | null>(null);
  const [moveAmount, setMoveAmount] = useState<number>(0);
  const [moveToCategory, setMoveToCategory] = useState<string>("");
  const [sourceAvailable, setSourceAvailable] = useState<number>(0);

  const addItemRef = useRef<HTMLDivElement | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  const prevMonthKey = useMemo(() => {
    if (!currentMonth) return null;
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    return format(subMonths(parsedDate, 1), "yyyy-MM");
  }, [currentMonth]);

  const getPreviousActivity = useCallback((groupName: string, itemName: string): number => {
    if (!budgetData || !prevMonthKey) return 0;
    if (!budgetData[prevMonthKey]) return 0;
    return calculateActivityForMonth(prevMonthKey, itemName, groupName) || 0;
  }, [budgetData, prevMonthKey, calculateActivityForMonth]);

  const getPreviousAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!budgetData || !prevMonthKey) return 0;
    const prevMonth = budgetData[prevMonthKey];
    if (!prevMonth?.categories) return 0;

    const prevGroup = prevMonth.categories.find((c) => c.name === groupName);
    const prevItem = prevGroup?.categoryItems.find((i) => i.name === itemName);
    return prevItem?.assigned ?? 0;
  }, [budgetData, prevMonthKey]);

  useEffect(() => {
    const container = tableRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      isScrolling.current = true;
      clearTimeout(scrollTimeout);

      scrollTimeout = setTimeout(() => {
        isScrolling.current = false;
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addItemRef.current && !addItemRef.current.contains(e.target as Node)) {
        setActiveCategory(null);
        setAddPopoverPos(null);
      }
    };

    if (activeCategory) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeCategory]);

  useEffect(() => {
    if (!budgetData || !currentMonth || !budgetData[currentMonth]?.categories)
      return;

    setOpenCategories((prev) => {
      const updated = { ...prev };

      for (const category of budgetData[currentMonth].categories) {
        if (!(category.name in updated)) {
          updated[category.name] = true;
        }
      }

      return updated;
    });
  }, [budgetData, currentMonth]);

  useEffect(() => {
    const closeMenu = () => {
      setGroupContext(null);
      setCategoryContext(null);
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeMenu();
        setCategoryDeleteContext(null);
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const showCompare = compareToLastMonth && !!prevMonthKey;

  const filteredCategories = useMemo(() => {
    if (!budgetData || !currentMonth) return [];

    const allCategories = budgetData[currentMonth]?.categories || [];

    const orderedCategories = [...allCategories];

    return orderedCategories
      .map((category) => {
        const filteredItems = category.categoryItems.filter((item) => {
          switch (selectedFilter) {
            case "Money Available":
              return item.available > 0;
            case "Overspent":
              return item.available < 0;
            case "Overfunded":
              return item.target && item.assigned > item.target.amountNeeded;
            case "Underfunded":
              return item.target && item.assigned < item.target.amountNeeded;
            case "Snoozed":
              return item.snoozed === true;
            case "All":
            default:
              return true;
          }
        });

        return { ...category, categoryItems: filteredItems };
      })
      .filter(Boolean);
  }, [budgetData, currentMonth, selectedFilter]);

  const toggleCategory = useCallback((category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const handleInputChange = useCallback((categoryName, itemName, value) => {
    // Capture previous state for undo
    const previousState = budgetData[currentMonth];
    const oldValue = previousState?.categories
      .flatMap((c) => c.categoryItems)
      .find((item) => item.name === itemName)?.assigned ?? 0;

    setBudgetData((prev) => {
      const updated = { ...prev };

      // Only update the specific category that changed
      const updatedCategories = updated[currentMonth]?.categories.map(
        (category) => {
          if (category.name !== categoryName && category.name !== "Credit Card Payments") {
            return category; // Skip unchanged categories
          }

          const updatedItems = category.categoryItems.map((item) => {
            // For the target category, update only the specific item
            if (category.name === categoryName) {
              if (item.name !== itemName) return item;

              const itemActivity = calculateActivityForMonth(
                currentMonth,
                item.name,
                categoryName
              );
              const cumulative = getCumulativeAvailable(
                updated,
                item.name,
                categoryName
              );
              const available = value + itemActivity + Math.max(cumulative, 0);

              return {
                ...item,
                assigned: value,
                activity: itemActivity,
                available,
              };
            }

            // For Credit Card Payments, recalculate activity
            if (category.name === "Credit Card Payments") {
              const activity = calculateCreditCardAccountActivity(
                currentMonth,
                item.name,
                updated
              );
              const cumulative = getCumulativeAvailable(
                updated,
                item.name,
                category.name
              );
              const available = item.assigned + activity + Math.max(cumulative, 0);

              return {
                ...item,
                activity,
                available,
              };
            }

            return item;
          });

          return { ...category, categoryItems: updatedItems };
        }
      );

      updated[currentMonth] = {
        ...updated[currentMonth],
        categories: updatedCategories,
      };

      refreshAllReadyToAssign(updated);
      return updated;
    });

    // Register undo/redo action
    registerAction({
      description: `Assigned $${value} to '${itemName}' in '${categoryName}'`,
      execute: async () => {
        // Re-apply the assignment for redo
        setBudgetData((prev) => {
          const updated = { ...prev };
          const updatedCategories = updated[currentMonth]?.categories.map(
            (category) => {
              if (category.name !== categoryName && category.name !== "Credit Card Payments") {
                return category;
              }

              const updatedItems = category.categoryItems.map((item) => {
                if (category.name === categoryName && item.name === itemName) {
                  const itemActivity = calculateActivityForMonth(
                    currentMonth,
                    item.name,
                    categoryName
                  );
                  const cumulative = getCumulativeAvailable(
                    updated,
                    item.name,
                    categoryName
                  );
                  const available = value + itemActivity + Math.max(cumulative, 0);

                  return {
                    ...item,
                    assigned: value,
                    activity: itemActivity,
                    available,
                  };
                }

                if (category.name === "Credit Card Payments") {
                  const activity = calculateCreditCardAccountActivity(
                    currentMonth,
                    item.name,
                    updated
                  );
                  const cumulative = getCumulativeAvailable(
                    updated,
                    item.name,
                    category.name
                  );
                  const available = item.assigned + activity + Math.max(cumulative, 0);

                  return {
                    ...item,
                    activity,
                    available,
                  };
                }

                return item;
              });

              return { ...category, categoryItems: updatedItems };
            }
          );

          updated[currentMonth] = {
            ...updated[currentMonth],
            categories: updatedCategories,
          };

          refreshAllReadyToAssign(updated);
          return updated;
        });
      },
      undo: async () => {
        setBudgetData((prev) => {
          const updated = { ...prev };
          const updatedCategories = updated[currentMonth]?.categories.map(
            (category) => {
              if (category.name !== categoryName && category.name !== "Credit Card Payments") {
                return category;
              }

              const updatedItems = category.categoryItems.map((item) => {
                if (category.name === categoryName && item.name === itemName) {
                  const itemActivity = calculateActivityForMonth(
                    currentMonth,
                    item.name,
                    categoryName
                  );
                  const cumulative = getCumulativeAvailable(
                    updated,
                    item.name,
                    categoryName
                  );
                  const available = oldValue + itemActivity + Math.max(cumulative, 0);

                  return {
                    ...item,
                    assigned: oldValue,
                    activity: itemActivity,
                    available,
                  };
                }

                if (category.name === "Credit Card Payments") {
                  const activity = calculateCreditCardAccountActivity(
                    currentMonth,
                    item.name,
                    updated
                  );
                  const cumulative = getCumulativeAvailable(
                    updated,
                    item.name,
                    category.name
                  );
                  const available = item.assigned + activity + Math.max(cumulative, 0);

                  return {
                    ...item,
                    activity,
                    available,
                  };
                }

                return item;
              });

              return { ...category, categoryItems: updatedItems };
            }
          );

          updated[currentMonth] = {
            ...updated[currentMonth],
            categories: updatedCategories,
          };

          refreshAllReadyToAssign(updated);
          return updated;
        });
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Assigned $${value} to '${itemName}' in '${categoryName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [currentMonth, setBudgetData, setIsDirty, setRecentChanges, registerAction, calculateActivityForMonth, getCumulativeAvailable, calculateCreditCardAccountActivity, refreshAllReadyToAssign]);

  const handleAddItem = useCallback((category: string) => {
    if (newItem.name.trim() !== "") {
      addItemToCategory(category, {
        name: newItem.name,
        assigned: newItem.assigned,
        activity: newItem.activity,
        available: newItem.assigned + newItem.activity,
        snoozed: newItem.snoozed ?? false,
      });
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0, snoozed: false });
      setActiveCategory(null);
    }
  }, [newItem, addItemToCategory]);

  const handleGroupDrop = useCallback(
    (targetName: string) => {
      if (!draggingGroup || draggingGroup === targetName) return;
      reorderCategoryGroups(draggingGroup, targetName);
      setDraggingGroup(null);
      setDragOverGroup(null);
    },
    [draggingGroup, reorderCategoryGroups]
  );

  const handleItemDrop = useCallback(
    (targetGroup: string, targetName?: string, position: "before" | "after" = "before") => {
      if (!draggingItem) return;
      if (
        (draggingItem.group === "Credit Card Payments" && targetGroup !== draggingItem.group) ||
        (targetGroup === "Credit Card Payments" && draggingItem.group !== targetGroup)
      ) {
        setDraggingItem(null);
        setDragOverItem(null);
        return;
      }
      if (draggingItem.item === targetName && draggingItem.group === targetGroup)
        return;

      reorderCategoryItems(
        draggingItem.group,
        draggingItem.item,
        targetGroup,
        targetName,
        position
      );

      setDraggingItem(null);
      setDragOverItem(null);
    },
    [draggingItem, reorderCategoryItems]
  );

  const isDeletingRef = useRef(false);

  const handleReassignDelete = () => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;

    deleteCategoryWithReassignment(
      categoryDeleteContext,
      selectedTargetCategory
    );
    setCategoryDeleteContext(null);

    setTimeout(() => {
      isDeletingRef.current = false;
    }, 100);
  };

  const handleMoveMoney = useCallback(() => {
    if (!moveMoneyModal || !moveToCategory || moveAmount === 0) return;

    const [fromGroup, fromItem] = moveToCategory.split("::");
    const toGroup = moveMoneyModal.toGroup;
    const toItem = moveMoneyModal.toItem;

    const sourceCategory = budgetData[currentMonth]?.categories
      .find((c) => c.name === fromGroup)?.categoryItems.find((i) => i.name === fromItem);

    const targetCategory = budgetData[currentMonth]?.categories
      .find((c) => c.name === toGroup)?.categoryItems.find((i) => i.name === toItem);

    if (!sourceCategory || !targetCategory) return;

    // --- REPLACE your const applyTransfer(...) + applyTransfer("forward") + registerAction(...) block with this ---

    const transferAmount = Math.abs(moveAmount);
    if (transferAmount <= 0) return;

    // Capture the starting assigned values ONCE
    const sourceStartAssigned = sourceCategory.assigned; // (fromGroup/fromItem)
    const targetStartAssigned = targetCategory.assigned; // (toGroup/toItem)

    const applyState = (mode: "applied" | "reverted") => {
      const srcAssigned =
        mode === "applied"
          ? sourceStartAssigned - transferAmount
          : sourceStartAssigned;

      const dstAssigned =
        mode === "applied"
          ? targetStartAssigned + transferAmount
          : targetStartAssigned;

      setBudgetData((prev) => {
        const updated = { ...prev };

        const updatedCategories = updated[currentMonth]?.categories.map((category) => {
          const updatedItems = category.categoryItems.map((item) => {
            if (category.name === fromGroup && item.name === fromItem) {
              const itemActivity = calculateActivityForMonth(currentMonth, item.name, category.name);
              const cumulative = getCumulativeAvailable(updated, item.name, category.name);
              const available = srcAssigned + itemActivity + Math.max(cumulative, 0);
              return { ...item, assigned: srcAssigned, available };
            }

            if (category.name === toGroup && item.name === toItem) {
              const itemActivity = calculateActivityForMonth(currentMonth, item.name, category.name);
              const cumulative = getCumulativeAvailable(updated, item.name, category.name);
              const available = dstAssigned + itemActivity + Math.max(cumulative, 0);
              return { ...item, assigned: dstAssigned, available };
            }

            if (category.name === "Credit Card Payments") {
              const activity = calculateCreditCardAccountActivity(currentMonth, item.name, updated);
              const cumulative = getCumulativeAvailable(updated, item.name, category.name);
              const available = item.assigned + activity + Math.max(cumulative, 0);
              return { ...item, activity, available };
            }

            return item;
          });

          return { ...category, categoryItems: updatedItems };
        });

        updated[currentMonth] = { ...updated[currentMonth], categories: updatedCategories };
        refreshAllReadyToAssign(updated);
        return updated;
      });
    };

    // Apply once now (still fine since registerAction doesn't auto-execute)
    applyState("applied");

    registerAction({
      description: `Moved ${formatToUSD(transferAmount)} from '${fromItem}' to '${toItem}'`,
      execute: async () => applyState("applied"),
      undo: async () => applyState("reverted"),
    });


    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Moved ${formatToUSD(transferAmount)} from '${fromItem}' to '${toItem}'`,
        timestamp: new Date().toISOString(),
      },
    ]);

    setMoveMoneyModal(null);
    setMoveAmount(0);
    setMoveToCategory("");
  }, [moveMoneyModal, moveToCategory, moveAmount, budgetData, currentMonth, setBudgetData, calculateActivityForMonth, getCumulativeAvailable, calculateCreditCardAccountActivity, refreshAllReadyToAssign, registerAction, setIsDirty, setRecentChanges]);

  // Get assigned amount from previous month
  const getLastMonthAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!budgetData || !currentMonth) return 0;
    
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    const prevMonthDate = subMonths(parsedDate, 1);
    const prevMonth = format(prevMonthDate, "yyyy-MM");
    
    if (!budgetData[prevMonth]) return 0;
    
    const item = budgetData[prevMonth].categories
      .find(c => c.name === groupName)?.categoryItems
      .find(i => i.name === itemName);
    
    return item?.assigned ?? 0;
  }, [budgetData, currentMonth]);

  // Get 3-month average assigned
  const getThreeMonthAverageAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!budgetData || !currentMonth) return 0;
    
    const months = [];
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    
    for (let i = 1; i <= 3; i++) {
      const monthDate = subMonths(parsedDate, i);
      const monthKey = format(monthDate, "yyyy-MM");
      months.push(monthKey);
    }
    
    let total = 0;
    let count = 0;
    
    for (const month of months) {
      if (budgetData[month]) {
        const item = budgetData[month].categories
          .find(c => c.name === groupName)?.categoryItems
          .find(i => i.name === itemName);
        
        if (item) {
          total += item.assigned;
          count++;
        }
      }
    }
    
    return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
  }, [budgetData, currentMonth]);

  // Apply quick assign operation (Last Month, Average, or Zero)
  const handleQuickAssign = useCallback((
    groupName: string,
    itemName: string,
    mode: "last-month" | "average" | "zero"
  ) => {
    if (!budgetData || !currentMonth) return;

    const category = budgetData[currentMonth].categories.find(c => c.name === groupName);
    const item = category?.categoryItems.find(i => i.name === itemName);
    
    if (!item) return;

    let newAssigned = 0;
    let description = "";

    if (mode === "last-month") {
      newAssigned = getLastMonthAssigned(groupName, itemName);
      description = `Set '${itemName}' to last month's assigned (${formatToUSD(newAssigned)})`;
    } else if (mode === "average") {
      newAssigned = getThreeMonthAverageAssigned(groupName, itemName);
      description = `Set '${itemName}' to 3-month average (${formatToUSD(newAssigned)})`;
    } else if (mode === "zero") {
      newAssigned = 0;
      description = `Zeroed out '${itemName}'`;
    }

    const oldAssigned = item.assigned;

    // Apply the change
    setBudgetData((prev) => {
      const updated = { ...prev };
      const updatedCategories = updated[currentMonth].categories.map((cat) => {
        if (cat.name !== groupName && cat.name !== "Credit Card Payments") {
          return cat;
        }

        const updatedItems = cat.categoryItems.map((i) => {
          if (cat.name === groupName && i.name === itemName) {
            const itemActivity = calculateActivityForMonth(currentMonth, i.name, cat.name);
            const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
            const available = newAssigned + itemActivity + Math.max(cumulative, 0);
            return { ...i, assigned: newAssigned, available };
          }

          if (cat.name === "Credit Card Payments") {
            const activity = calculateCreditCardAccountActivity(currentMonth, i.name, updated);
            const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
            const available = i.assigned + activity + Math.max(cumulative, 0);
            return { ...i, activity, available };
          }

          return i;
        });

        return { ...cat, categoryItems: updatedItems };
      });

      updated[currentMonth] = { ...updated[currentMonth], categories: updatedCategories };
      refreshAllReadyToAssign(updated);
      return updated;
    });

    // Register undo/redo
    registerAction({
      description,
      execute: async () => {
        setBudgetData((prev) => {
          const updated = { ...prev };
          const updatedCategories = updated[currentMonth].categories.map((cat) => {
            if (cat.name !== groupName && cat.name !== "Credit Card Payments") {
              return cat;
            }

            const updatedItems = cat.categoryItems.map((i) => {
              if (cat.name === groupName && i.name === itemName) {
                const itemActivity = calculateActivityForMonth(currentMonth, i.name, cat.name);
                const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
                const available = newAssigned + itemActivity + Math.max(cumulative, 0);
                return { ...i, assigned: newAssigned, available };
              }

              if (cat.name === "Credit Card Payments") {
                const activity = calculateCreditCardAccountActivity(currentMonth, i.name, updated);
                const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
                const available = i.assigned + activity + Math.max(cumulative, 0);
                return { ...i, activity, available };
              }

              return i;
            });

            return { ...cat, categoryItems: updatedItems };
          });

          updated[currentMonth] = { ...updated[currentMonth], categories: updatedCategories };
          refreshAllReadyToAssign(updated);
          return updated;
        });
      },
      undo: async () => {
        setBudgetData((prev) => {
          const updated = { ...prev };
          const updatedCategories = updated[currentMonth].categories.map((cat) => {
            if (cat.name !== groupName && cat.name !== "Credit Card Payments") {
              return cat;
            }

            const updatedItems = cat.categoryItems.map((i) => {
              if (cat.name === groupName && i.name === itemName) {
                const itemActivity = calculateActivityForMonth(currentMonth, i.name, cat.name);
                const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
                const available = oldAssigned + itemActivity + Math.max(cumulative, 0);
                return { ...i, assigned: oldAssigned, available };
              }

              if (cat.name === "Credit Card Payments") {
                const activity = calculateCreditCardAccountActivity(currentMonth, i.name, updated);
                const cumulative = getCumulativeAvailable(updated, i.name, cat.name);
                const available = i.assigned + activity + Math.max(cumulative, 0);
                return { ...i, activity, available };
              }

              return i;
            });

            return { ...cat, categoryItems: updatedItems };
          });

          updated[currentMonth] = { ...updated[currentMonth], categories: updatedCategories };
          refreshAllReadyToAssign(updated);
          return updated;
        });
      },
    });

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description,
        timestamp: new Date().toISOString(),
      },
    ]);

    setCategoryContext(null);
  }, [budgetData, currentMonth, getLastMonthAssigned, getThreeMonthAverageAssigned, setBudgetData, calculateActivityForMonth, getCumulativeAvailable, calculateCreditCardAccountActivity, refreshAllReadyToAssign, registerAction, setIsDirty, setRecentChanges]);

  // Keyboard shortcuts for quick assign: L=Last Month, A=Average, Z=Zero
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!categoryContext) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      if ((e.key === "l" || e.key === "L") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "last-month");
        return;
      }

      if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "average");
        return;
      }

      if ((e.key === "z" || e.key === "Z") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "zero");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [categoryContext, handleQuickAssign]);

  return (
    <>
      {/* Group context menu */}
      {groupContext &&
        createPortal(
          <div
            data-cy="group-context-menu"
            className="fixed z-50 w-40 bg-white border border-slate-200 shadow-md rounded-md text-xs"
            style={{ top: groupContext.y, left: groupContext.x }}
            onClick={() => setGroupContext(null)}
          >
            <button
              data-cy="group-rename"
              data-category={groupContext.categoryName}
              onClick={() => {
                setEditingGroup(groupContext.categoryName);
                setNewGroupName(groupContext.categoryName);
                setGroupContext(null);
              }}
              className="px-3 py-2 hover:bg-slate-50 text-slate-700 w-full text-left"
            >
              Rename group
            </button>
            {groupContext.itemCount === 0 ? (
              <button
                data-cy="group-delete"
                data-category={groupContext.categoryName}
                onClick={() => {
                  deleteCategoryGroup(groupContext.categoryName);
                  setGroupContext(null);
                }}
                className="px-3 py-2 hover:bg-red-50 text-red-600 w-full text-left"
              >
                Delete group
              </button>
            ) : (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                Cannot delete: group not empty
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Category delete / reassign modal */}
      {categoryDeleteContext &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-center justify-center"
            onClick={() => setCategoryDeleteContext(null)}
          >
            <div
              className="bg-white dark:bg-neutral-900 p-5 rounded-lg shadow-lg w-full max-w-md space-y-4 text-neutral-800 dark:text-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold">
                Delete “{categoryDeleteContext.itemName}”?
              </h2>

              {categoryDeleteContext.assigned !== 0 ||
                categoryDeleteContext.activity !== 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    This category has existing funds or activity. Where should
                    they be moved?
                  </p>

                  <select
                    data-cy="reassign-target-select"
                    className="w-full border border-slate-300 dark:border-neutral-700 rounded-md px-2 py-1 text-sm bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
                    value={selectedTargetCategory}
                    onChange={(e) => setSelectedTargetCategory(e.target.value)}
                  >
                    <option value="">Select a target category</option>
                    {budgetData[currentMonth]?.categories
                      .flatMap((cat) =>
                        cat.categoryItems
                          .filter(
                            (i) => i.name !== categoryDeleteContext.itemName
                          )
                          .map((i) => i.name)
                      )
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      data-cy="reassign-cancel"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCategoryDeleteContext(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      data-cy="reassign-confirm"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        handleReassignDelete();
                        setCategoryDeleteContext(null);
                      }}
                      disabled={!selectedTargetCategory}
                    >
                      Confirm &amp; reassign
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground dark:text-neutral-400">
                    This category has no funds or activity. Are you sure you
                    want to delete it?
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      data-cy="delete-cancel"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCategoryDeleteContext(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      data-cy="delete-confirm"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        deleteCategoryItem(categoryDeleteContext);
                        setCategoryDeleteContext(null);
                      }}
                    >
                      Confirm delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Move money modal */}
      {moveMoneyModal &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-center justify-center"
            onClick={() => {
              setMoveMoneyModal(null);
              setMoveAmount(0);
              setMoveToCategory("");
              setSourceAvailable(0);
            }}
          >
            <div
              className="bg-white dark:bg-neutral-900 p-5 rounded-lg shadow-lg w-full max-w-md space-y-4 text-neutral-800 dark:text-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold">
                Move Money to "{moveMoneyModal.toItem}"
              </h2>

              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Available: <span className={cn(
                    "font-mono font-semibold",
                    moveMoneyModal.available < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>{formatToUSD(moveMoneyModal.available)}</span>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Move from category:
                  </label>
                  <select
                    data-cy="move-money-target-select"
                    className="w-full border border-slate-300 dark:border-neutral-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
                    value={moveToCategory}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMoveToCategory(value);

                      if (!value) {
                        setMoveAmount(moveMoneyModal.available < 0 ? Math.abs(moveMoneyModal.available) : 0);
                        setSourceAvailable(0);
                        return;
                      }

                      const [srcGroup, srcItem] = value.split("::");
                      const source = budgetData[currentMonth]?.categories
                        .find((c) => c.name === srcGroup)?.categoryItems.find((i) => i.name === srcItem);

                      const srcAvail = source?.available ?? 0;
                      setSourceAvailable(srcAvail);

                      const targetDeficit = moveMoneyModal.available < 0 ? Math.abs(moveMoneyModal.available) : srcAvail;
                      setMoveAmount(targetDeficit);
                    }}
                  >
                    <option value="">Select a category</option>
                    {budgetData[currentMonth]?.categories
                      .flatMap((cat) =>
                        cat.categoryItems
                          .filter((i) => !(i.name === moveMoneyModal.toItem && cat.name === moveMoneyModal.toGroup))
                          .map((i) => ({ group: cat.name, item: i }))
                      )
                      .map(({ group, item }) => (
                        <option key={`${group}::${item.name}`} value={`${group}::${item.name}`}>
                          {group} → {item.name} (Avail {formatToUSD(item.available || 0)})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Amount to move:
                  </label>
                  <Input
                    data-cy="move-money-amount-input"
                    type="number"
                    step="0.01"
                    value={moveAmount}
                    onChange={(e) => setMoveAmount(parseFloat(e.target.value) || 0)}
                    className="w-full"
                    placeholder="Enter amount"
                  />
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!moveToCategory}
                      onClick={() => setMoveAmount(Math.max(sourceAvailable, 0))}
                    >
                      Use available ({formatToUSD(sourceAvailable)})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={moveMoneyModal.available >= 0 || !moveToCategory}
                      onClick={() => setMoveAmount(Math.abs(moveMoneyModal.available))}
                    >
                      Cover deficit ({formatToUSD(Math.abs(moveMoneyModal.available))})
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  data-cy="move-money-cancel"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMoveMoneyModal(null);
                    setMoveAmount(0);
                    setMoveToCategory("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-cy="move-money-confirm"
                  size="sm"
                  onClick={handleMoveMoney}
                  disabled={!moveToCategory || moveAmount <= 0}
                  className="bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                >
                  Move Money
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Category context menu */}
      {categoryContext &&
        createPortal(
          <div
            data-cy="category-context-menu"
            className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-md text-xs dark:bg-slate-900 dark:border-slate-700 min-w-max"
            style={{ top: categoryContext.y, left: categoryContext.x }}
            onClick={() => setCategoryContext(null)}
          >
            <div className="py-1">
              <button
                data-cy="category-assign-last-month"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "last-month")}
                className="px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-950 text-teal-600 dark:text-teal-400 w-full text-left flex items-center justify-between gap-4"
              >
                <span>Set to last month</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  {formatToUSD(getLastMonthAssigned(categoryContext.groupName, categoryContext.itemName))}
                </span>
              </button>

              <button
                data-cy="category-assign-average"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "average")}
                className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-600 dark:text-blue-400 w-full text-left flex items-center justify-between gap-4"
              >
                <span>Set to 3-month avg</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  {formatToUSD(getThreeMonthAverageAssigned(categoryContext.groupName, categoryContext.itemName))}
                </span>
              </button>

              <button
                data-cy="category-assign-zero"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "zero")}
                className="px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-950 text-orange-600 dark:text-orange-400 w-full text-left border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
              >
                <span>Zero out</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">$0.00</span>
              </button>
            </div>

              <button
                data-cy="category-snooze-toggle"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => {
                  setCategorySnooze(
                    categoryContext.groupName,
                    categoryContext.itemName,
                    !(categoryContext.snoozed ?? false)
                  );
                  setCategoryContext(null);
                }}
                className="px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-700 dark:text-amber-300 w-full text-left border-t border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
              >
                <span>{categoryContext.snoozed ? "Unsnooze category" : "Snooze category"}</span>
                <span className="text-[10px] uppercase tracking-wide font-semibold">{categoryContext.snoozed ? "On hold" : "Pause"}</span>
              </button>

            <button
              data-cy="category-rename"
              data-category={categoryContext.groupName}
              data-item={categoryContext.itemName}
              onClick={() => {
                setEditingItem({
                  category: categoryContext.groupName,
                  item: categoryContext.itemName,
                });
                setNewCategoryName(categoryContext.itemName);
                setCategoryContext(null);
              }}
              className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 w-full text-left"
            >
              Rename category
            </button>

            {categoryContext.groupName !== "Credit Card Payments" ? (
              <button
                data-cy="category-delete"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => {
                  setCategoryDeleteContext({
                    categoryName: categoryContext.groupName,
                    itemName: categoryContext.itemName,
                    assigned: categoryContext.assigned,
                    activity: categoryContext.activity,
                    available: categoryContext.available,
                  });
                  setCategoryContext(null);
                }}
                className="px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 w-full text-left border-t border-slate-200 dark:border-slate-700"
              >
                Delete category
              </button>
            ) : (
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-slate-200 dark:border-slate-700">
                Cannot delete (credit card category)
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Main card */}
      <Card className="flex flex-col w-full h-full min-h-0 overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950">
        <CardHeader className="pb-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex flex-col gap-4">
            {sandboxMode && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Badge className="bg-amber-600 text-white hover:bg-amber-500">Preview</Badge>
                    <span>Preview mode — not saved</span>
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    All budget edits stay local until you exit.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-50 dark:hover:bg-amber-800"
                    onClick={exitSandbox}
                    data-cy="sandbox-exit-banner"
                  >
                    Exit & discard changes
                  </Button>
                </div>
              </div>
            )}

            {/* Top row: RTA + Month */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div data-cy="ready-to-assign" className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Ready to Assign
                </span>
                <Badge
                  variant="outline"
                  className="text-base font-bold font-mono px-3 py-1 bg-teal-500 dark:bg-teal-600 text-white border-teal-500 dark:border-teal-600"
                >
                  {formatToUSD(budgetData[currentMonth]?.ready_to_assign || 0)}
                </Badge>
              </div>
              <div>
                <MonthNav />
              </div>
            </div>

            {/* Toolbar: Filters + Add Group */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter}
                    data-cy={`filter-${filter.toLowerCase().replace(" ", "-")}`}
                    variant={selectedFilter === filter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedFilter(filter)}
                    className={cn(
                      "text-xs",
                      selectedFilter === filter && "dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600"
                    )}
                  >
                    {filter}
                  </Button>
                ))}

                <Button
                  data-cy="compare-toggle"
                  variant={compareToLastMonth ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCompareToLastMonth((prev) => !prev)}
                  className={cn(
                    "text-xs gap-2",
                    compareToLastMonth
                      ? "bg-teal-600 text-white hover:bg-teal-500 dark:bg-teal-700 dark:hover:bg-teal-600"
                      : "dark:hover:bg-slate-800"
                  )}
                >
                  <TrendingUp className="h-4 w-4" />
                  Compare to last month
                </Button>

                <Button
                  data-cy="sandbox-toggle"
                  variant={sandboxMode ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => (sandboxMode ? exitSandbox() : enterSandbox())}
                  className={cn(
                    "text-xs gap-2",
                    sandboxMode
                      ? "bg-amber-600 text-white hover:bg-amber-500 dark:bg-amber-700 dark:hover:bg-amber-600"
                      : "dark:hover:bg-slate-800"
                  )}
                >
                  {sandboxMode ? "Exit sandbox" : "Sandbox mode"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  data-cy="undo-button"
                  onClick={undo}
                  disabled={!canUndo}
                  title={canUndo ? `Undo: ${undoDescription}` : "Nothing to undo"}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Undo
                </Button>
                <Button
                  data-cy="redo-button"
                  onClick={redo}
                  disabled={!canRedo}
                  title={canRedo ? `Redo: ${redoDescription}` : "Nothing to redo"}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <RotateCw className="h-4 w-4" />
                  Redo
                </Button>
                <KeyboardShortcuts
                  page="budget"
                  shortcuts={[
                    { key: "Ctrl+Z / Cmd+Z", description: "Undo last action" },
                    { key: "Ctrl+Y / Cmd+Shift+Z", description: "Redo last action" },
                    { key: "L", description: "Set category to last month's assigned (right-click menu)" },
                    { key: "A", description: "Set category to 3-month average (right-click menu)" },
                    { key: "Z", description: "Zero out category (right-click menu)" },
                  ]}
                />
                <AddCategoryButton handleSubmit={addCategoryGroup} />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-2 flex-1 flex flex-col min-h-0 gap-0">
          <div className="w-full">
            <Table data-cy="budget-table-header" className="w-full table-fixed">
              <TableHeader className="bg-slate-100 dark:bg-slate-800">
                <TableRow className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <TableHead className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Category
                  </TableHead>
                  <TableHead className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Assigned
                  </TableHead>
                  <TableHead className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Activity
                  </TableHead>
                  <TableHead className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Available
                  </TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>

          <div
            className="flex-1 min-h-0 overflow-auto pb-8"
            style={{ willChange: "transform", transform: "translateZ(0)" }}
          >
            <Table data-cy="budget-table" className="w-full table-fixed">
              <TableBody>
                {filteredCategories.map((group) => (
                  <Fragment key={group.name}>
                    {/* Group row */}
                    <TableRow
                      data-cy="category-group-row"
                      data-category={group.name}
                      className={cn(
                        "group bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700",
                        draggingGroup === group.name && "opacity-70",
                        dragOverGroup === group.name && draggingGroup
                          ? "ring-2 ring-teal-500/70 bg-teal-50/60 dark:bg-teal-950/40 border-l-4 border-l-teal-500 shadow-sm"
                          : "",
                        dragOverItem?.group === group.name && dragOverItem?.item === "__group__"
                          ? "ring-2 ring-teal-500/70 bg-teal-50/60 dark:bg-teal-950/40 border-l-4 border-l-teal-500 shadow-sm"
                          : ""
                      )}
                      onDragOver={(e) => {
                        if (draggingGroup) {
                          e.preventDefault();
                          if (draggingGroup !== group.name) {
                            setDragOverGroup(group.name);
                          }
                          return;
                        }

                        if (draggingItem) {
                          if (
                            group.name === "Credit Card Payments" &&
                            draggingItem.group !== group.name
                          ) {
                            return;
                          }
                          e.preventDefault();
                          setDragOverItem({ group: group.name, item: "__group__", position: "after" });
                        }
                      }}
                      onDrop={(e) => {
                        if (draggingGroup) {
                          e.preventDefault();
                          handleGroupDrop(group.name);
                          return;
                        }

                        if (draggingItem) {
                          if (
                            group.name === "Credit Card Payments" &&
                            draggingItem.group !== group.name
                          ) {
                            setDragOverItem(null);
                            return;
                          }
                          e.preventDefault();
                          handleItemDrop(group.name, undefined, "after");
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverGroup === group.name) {
                          setDragOverGroup(null);
                        }
                        if (
                          dragOverItem?.group === group.name &&
                          dragOverItem?.item === "__group__"
                        ) {
                          setDragOverItem(null);
                        }
                      }}
                    >
                      <TableCell
                        className="p-4 align-middle"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setGroupContext({
                            x: Math.min(
                              e.clientX,
                              window.innerWidth - 160
                            ),
                            y: Math.min(
                              e.clientY,
                              window.innerHeight - 50
                            ),
                            categoryName: group.name,
                            itemCount: group.categoryItems.length,
                          });
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="mr-1 flex h-6 w-6 items-center justify-center text-slate-400 cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDraggingGroup(group.name);
                              setDragOverGroup(group.name);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggingGroup(null);
                              setDragOverGroup(null);
                            }}
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <Button
                            data-cy="group-toggle"
                            data-category={group.name}
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleCategory(group.name)}
                            className="mr-1 h-6 w-6"
                          >
                            {openCategories[group.name] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                          {editingGroup === group.name ? (
                            <Input
                              value={newGroupName}
                              onChange={(e) =>
                                setNewGroupName(e.target.value)
                              }
                              onBlur={async () => {
                                await renameCategoryGroup(
                                  editingGroup,
                                  newGroupName
                                );
                                setEditingGroup(null);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  await renameCategoryGroup(
                                    editingGroup,
                                    newGroupName
                                  );
                                  setEditingGroup(null);
                                }
                              }}
                              className="h-7 text-sm font-semibold"
                              autoFocus
                            />
                          ) : (
                            <span
                              data-cy="group-name"
                              data-category={group.name}
                              className="text-sm font-semibold leading-tight truncate"
                            >
                              {group.name}
                            </span>
                          )}
                          <NotesPopover
                            currentNote={group.notes}
                            history={group.notes_history}
                            onSave={(noteText) => updateCategoryGroupNote(group.name, noteText)}
                            triggerSize="icon"
                            className="ml-1"
                          />
                          <div className="ms-1 w-6 h-6 flex items-center justify-center">
                            <Button
                              data-cy="group-add-item-button"
                              data-category={group.name}
                              size="icon"
                              variant="outline"
                              onClick={(e) => {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setActiveCategory(group.name);
                                setAddPopoverPos({ top: rect.top, left: rect.right + 8 });
                              }}
                              className="relative z-40 h-7 w-7 p-0 rounded-md border border-slate-300 bg-white shadow-sm hover:bg-slate-50 hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:border-slate-500"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className="p-4 text-right text-sm font-medium"
                        data-cy="available-display"
                        data-category={group.name}
                      >
                        {formatToUSD(
                          group.categoryItems.reduce(
                            (sum, item) => sum + item.assigned,
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="p-4 text-right text-sm font-medium">
                        {formatToUSD(
                          group.categoryItems.reduce(
                            (sum, item) => sum + item.activity,
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="p-4 text-right text-sm font-medium">
                        {group.name === "Credit Card Payments"
                          ? "Payment - " +
                          formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + item.available,
                              0
                            ) || 0
                          )
                          : formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + item.available,
                              0
                            )
                          )}
                      </TableCell>
                    </TableRow>

                    {/* Add item popover row */}
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="relative p-0">
                        {activeCategory === group.name && addPopoverPos &&
                          createPortal(
                            <div
                              ref={addItemRef}
                              style={{ position: "fixed", top: addPopoverPos.top, left: addPopoverPos.left }}
                              className="w-72 bg-white dark:bg-slate-900 p-3 shadow-sm rounded-md border border-slate-200 dark:border-slate-700 z-50 space-y-2 text-slate-800 dark:text-slate-200"
                            >
                              <Input
                                data-cy="add-item-input"
                                type="text"
                                placeholder="New category name"
                                value={newItem.name}
                                onChange={(e) =>
                                  setNewItem({
                                    ...newItem,
                                    name: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddItem(group.name);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setActiveCategory(null);
                                    setAddPopoverPos(null);
                                  }
                                }}
                                className="h-8 text-sm"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setActiveCategory(null);
                                    setAddPopoverPos(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  data-cy="add-item-submit"
                                  data-category={group.name}
                                  size="sm"
                                  onClick={() => handleAddItem(group.name)}
                                  className="bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                                >
                                  Add category
                                </Button>
                              </div>
                            </div>,
                            document.body
                          )}
                      </TableCell>
                    </TableRow>

                    {/* Item rows */}
                    {openCategories[group.name] &&
                      group.categoryItems.map((item) => {
                        const previousAssigned = showCompare
                          ? getPreviousAssigned(group.name, item.name)
                          : 0;
                        const assignedDelta = (item.assigned ?? 0) - previousAssigned;
                        const previousActivity = showCompare
                          ? getPreviousActivity(group.name, item.name)
                          : 0;
                        const activityDelta = (item.activity ?? 0) - previousActivity;

                        return (
                          <Fragment
                            key={`${group.name}::${item.name}-fragment`}
                          >
                          <TableRow
                            data-cy="category-row"
                            data-category={group.name}
                            data-item={item.name}
                            className={cn(
                              "relative odd:bg-white dark:odd:bg-slate-950 even:bg-slate-50/60 dark:even:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700",
                              draggingItem?.group === group.name &&
                              draggingItem?.item === item.name &&
                              "opacity-70",
                              dragOverItem?.group === group.name &&
                              dragOverItem?.item === item.name &&
                              cn(
                                "ring-2 ring-teal-500/70 bg-teal-50/60 dark:bg-teal-950/40 shadow-sm",
                                dragOverItem?.position === "after"
                                  ? "border-b-4 border-b-teal-500"
                                  : "border-l-4 border-l-teal-500"
                              ),
                              item.snoozed && "opacity-80 dark:opacity-70"
                            )}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setCategoryContext({
                                x: e.clientX,
                                y: e.clientY,
                                groupName: group.name,
                                itemName: item.name,
                                assigned: item.assigned,
                                activity: item.activity,
                                available: item.available,
                                snoozed: item.snoozed ?? false,
                              });
                            }}
                            onDragOver={(e) => {
                              if (!draggingItem) return;
                              if (
                                group.name === "Credit Card Payments" &&
                                draggingItem.group !== group.name
                              ) {
                                return;
                              }
                              e.preventDefault();
                              const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                              const position = e.clientY - rect.top > rect.height / 2 ? "after" : "before";
                              setDragOverItem({ group: group.name, item: item.name, position });
                            }}
                            onDrop={(e) => {
                              if (!draggingItem) return;
                              if (
                                group.name === "Credit Card Payments" &&
                                draggingItem.group !== group.name
                              ) {
                                setDragOverItem(null);
                                return;
                              }
                              e.preventDefault();
                              handleItemDrop(group.name, item.name, dragOverItem?.position || "before");
                            }}
                            onDragLeave={() => {
                              if (
                                dragOverItem?.group === group.name &&
                                dragOverItem?.item === item.name
                              ) {
                                setDragOverItem(null);
                              }
                            }}
                          >
                            <TableCell
                              data-cy="category-item-name"
                              data-category={group.name}
                              data-item={item.name}
                              className="p-4 align-middle"
                              onClick={() => {
                                setInlineEditorCategory((prev) =>
                                  prev === item.name ? null : item.name
                                );
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setCategoryContext({
                                  x: e.clientX,
                                  y: e.clientY,
                                  groupName: group.name,
                                  itemName: item.name,
                                  assigned: item.assigned,
                                  activity: item.activity,
                                  available: item.available,
                                  snoozed: item.snoozed ?? false,
                                });
                              }}
                            >
                              {editingItem?.category === group.name &&
                                editingItem.item === item.name ? (
                                <Input
                                  value={newCategoryName}
                                  onChange={(e) =>
                                    setNewCategoryName(e.target.value)
                                  }
                                  onBlur={async () => {
                                    await renameCategory(
                                      group.name,
                                      editingItem.item,
                                      newCategoryName
                                    );
                                    setEditingItem(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      await renameCategory(
                                        group.name,
                                        editingItem.item,
                                        newCategoryName
                                      );
                                      setEditingItem(null);
                                    }
                                  }}
                                  className="h-7 text-sm font-medium"
                                  autoFocus
                                />
                                  ) : (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="flex h-5 w-5 items-center justify-center text-slate-400 cursor-grab active:cursor-grabbing"
                                    draggable
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      setDraggingItem({ group: group.name, item: item.name });
                                      setDragOverItem({ group: group.name, item: item.name });
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                      setDraggingItem(null);
                                      setDragOverItem(null);
                                    }}
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </span>
                                  <div className="relative h-6 rounded-md px-1 flex-1">
                                    {item.target && (
                                      <div
                                        className="absolute top-0 left-0 h-full bg-teal-500 dark:bg-teal-600 rounded-md"
                                        style={{
                                          width: `${Math.min(
                                            (item.assigned /
                                              item.target.amountNeeded) *
                                            100,
                                            100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                    <div className="relative z-10 px-2 flex items-center h-full gap-2">
                                      <span className="font-medium truncate text-slate-800 dark:text-slate-200 text-sm">
                                        {item.name}
                                      </span>
                                      <NotesPopover
                                        currentNote={item.notes}
                                        history={item.notes_history}
                                        onSave={(noteText) => updateCategoryItemNote(group.name, item.name, noteText)}
                                        triggerSize="icon"
                                        className="flex-shrink-0"
                                      />
                                      {item.snoozed && (
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700" data-cy="snoozed-pill">
                                          Snoozed
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  {item.target && getTargetStatus(item).message && (
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${getTargetStatus(item).type === "overspent"
                                      ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200"
                                      : getTargetStatus(item).type === "funded"
                                        ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-200"
                                        : getTargetStatus(item).type === "overfunded"
                                          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200"
                                          : getTargetStatus(item).type === "underfunded"
                                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200"
                                            : "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300"
                                      }`}>
                                      {getTargetStatus(item).type === "funded" && "✓ Funded"}
                                      {getTargetStatus(item).type === "overfunded" && "↑ Overfunded"}
                                      {getTargetStatus(item).type === "underfunded" && "↓ " + (item.target.amountNeeded - item.assigned > 0 ? formatToUSD(item.target.amountNeeded - item.assigned) + " left" : "")}
                                      {getTargetStatus(item).type === "overspent" && "⚠ Overspent"}
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            <EditableAssigned
                              categoryName={group.name}
                              itemName={item.name}
                              item={item}
                              handleInputChange={handleInputChange}
                              showDelta={showCompare}
                              deltaAmount={assignedDelta}
                            />

                            <TableCell
                              data-cy="item-activity"
                              data-item={item.name}
                              className="p-4 text-right align-middle cursor-pointer font-mono font-medium"
                              onClick={() => {
                                setInlineEditorCategory((prev) =>
                                  prev === item.name ? null : item.name
                                );
                              }}
                            >
                              <div className="flex flex-col items-end gap-1">
                                <span>{formatToUSD(item.activity || 0)}</span>
                                {showCompare && (
                                  <span className={`text-[11px] font-semibold ${activityDelta > 0
                                    ? "text-emerald-600"
                                    : activityDelta < 0
                                      ? "text-red-600"
                                      : "text-slate-500"
                                    }`}>
                                    {activityDelta === 0
                                      ? "No change"
                                      : `${activityDelta > 0 ? "▲" : "▼"} ${activityDelta > 0 ? "+" : "-"}${formatToUSD(Math.abs(activityDelta))}`}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              data-cy="item-available"
                              data-item={item.name}
                              className={cn(
                                "p-4 text-right align-middle font-mono text-sm font-semibold",
                                item.available > 0
                                  ? "text-emerald-600"
                                  : item.available < 0
                                    ? "text-red-600"
                                    : "text-slate-700"
                              )}
                            >
                              <button
                                type="button"
                                data-cy="move-money-trigger"
                                className="inline-flex items-center justify-end gap-1 rounded px-2 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 hover:bg-slate-200/80 dark:hover:bg-slate-700/60"
                                onClick={() => {
                                  setMoveMoneyModal({
                                    toGroup: group.name,
                                    toItem: item.name,
                                    available: item.available,
                                  });
                                  setMoveAmount(item.available < 0 ? Math.abs(item.available) : 0);
                                  setMoveToCategory("");
                                  setSourceAvailable(0);
                                }}
                              >
                                <span className="underline decoration-dotted underline-offset-4">
                                  {formatToUSD(item.available || 0)}
                                </span>
                              </button>
                            </TableCell>
                          </TableRow>

                          {inlineEditorCategory === item.name && (
                            <InlineTargetEditor
                              itemName={item.name}
                              onClose={() =>
                                setInlineEditorCategory(null)
                              }
                            />
                          )}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
