"use client";
import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import MonthNav from "./MonthNav";
import { useBudgetContext } from "../context/BudgetContext";
import { getTargetStatus } from "../utils/getTargetStatus";
import { createPortal } from "react-dom";
import InlineTargetEditor from "./TargetInlineEditor";
import { useAccountContext } from "../context/AccountContext";
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
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
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
  } = useBudgetContext();

  const { accounts } = useAccountContext();

  const FILTERS = [
    "All",
    "Money Available",
    "Overspent",
    "Overfunded",
    "Underfunded",
  ];
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [inlineEditorCategory, setInlineEditorCategory] = useState<
    string | null
  >(null);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState("");
  const [dropUp, setDropUp] = useState(false);
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
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");
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
  } | null>(null);

  const addItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addItemRef.current && !addItemRef.current.contains(e.target as Node)) {
        setActiveCategory(null);
      }
    };

    if (activeCategory) {
      document.addEventListener("mousedown", handleClickOutside);

      const rect = addItemRef.current?.getBoundingClientRect();
      if (rect && rect.bottom + 120 > window.innerHeight) {
        setDropUp(true);
      } else {
        setDropUp(false);
      }
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

  const filteredCategories = useMemo(() => {
    if (!budgetData || !currentMonth) return [];

    const allCategories = budgetData[currentMonth]?.categories || [];

    const sortedCategories = [...allCategories].sort((a, b) => {
      if (a.name === "Credit Card Payments") return -1;
      if (b.name === "Credit Card Payments") return 1;
      return 0;
    });

    return sortedCategories
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
            case "All":
            default:
              return true;
          }
        });

        return { ...category, categoryItems: filteredItems };
      })
      .filter(Boolean);
  }, [budgetData, currentMonth, selectedFilter]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleInputChange = useCallback((categoryName, itemName, value) => {
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

    setIsDirty(true);
    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Assigned $${value} to '${itemName}' in '${categoryName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [currentMonth, setBudgetData, setIsDirty, setRecentChanges, calculateActivityForMonth, getCumulativeAvailable, calculateCreditCardAccountActivity, refreshAllReadyToAssign]);

  const handleAddItem = (category: string) => {
    if (newItem.name.trim() !== "") {
      addItemToCategory(category, {
        name: newItem.name,
        assigned: newItem.assigned,
        activity: newItem.activity,
        available: newItem.assigned + newItem.activity,
      });
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0 });
      setActiveCategory(null);
    }
  };

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
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
            onClick={() => setCategoryDeleteContext(null)}
          >
            <div 
              className="bg-white p-5 rounded-lg shadow-lg w-full max-w-md space-y-4"
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
                    className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
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
                  <p className="text-sm text-muted-foreground">
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

      {/* Category context menu */}
      {categoryContext &&
        createPortal(
          <div
            data-cy="category-context-menu"
            className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-md text-xs"
            style={{ top: categoryContext.y, left: categoryContext.x }}
            onClick={() => setCategoryContext(null)}
          >
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
              className="px-3 py-2 hover:bg-slate-50 text-slate-700 w-full text-left"
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
                className="px-3 py-2 hover:bg-red-50 text-red-600 w-full text-left border-t border-slate-200"
              >
                Delete category
              </button>
            ) : (
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-slate-200">
                Cannot delete (credit card category)
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Main card */}
      <Card className="flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div data-cy="ready-to-assign" className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">
                Ready to Assign
              </span>
              <Badge
                variant="outline"
                className="text-base font-bold font-mono px-3 py-1 bg-teal-500 text-white border-teal-500"
              >
                {formatToUSD(budgetData[currentMonth]?.ready_to_assign || 0)}
              </Badge>
            </div>
            <div className="ml-auto">
              <MonthNav />
            </div>
          </div>

          {/* filters row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <Button
                  key={filter}
                  data-cy={`filter-${filter.toLowerCase().replace(" ", "-")}`}
                  variant={selectedFilter === filter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFilter(filter)}
                >
                  {filter}
                </Button>
              ))}
            </div>
            <div className="ml-auto">
              <AddCategoryButton handleSubmit={addCategoryGroup} />
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            <Table data-cy="budget-table" className="w-full">
              <TableHeader>
                <TableRow className="bg-slate-200 text-slate-800 border-b border-slate-300">
                  <TableHead className="text-left px-3 py-2 text-sm font-semibold">
                    Category
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-sm font-semibold">
                    Assigned
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-sm font-semibold">
                    Activity
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-sm font-semibold">
                    Available
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.map((group) => (
                  <Fragment key={group.name}>
                    {/* Group row */}
                    <TableRow
                      data-cy="category-group-row"
                      data-category={group.name}
                      className="bg-[#e9edf2] hover:bg-[#e9edf2] text-sm font-semibold text-slate-900 border-b border-slate-300"
                      onMouseEnter={() => setHoveredCategory(group.name)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      <TableCell
                        className="p-2 align-middle"
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
                          <div className="ms-1 w-6 h-6 flex items-center justify-center">
                            {hoveredCategory === group.name && (
                              <Button
                                data-cy="group-add-item-button"
                                data-category={group.name}
                                size="icon"
                                variant="outline"
                                onClick={() => setActiveCategory(group.name)}
                                className="h-6 w-6"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className="p-2 text-right text-sm"
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
                      <TableCell className="p-2 text-right text-sm">
                        {formatToUSD(
                          group.categoryItems.reduce(
                            (sum, item) => sum + item.activity,
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="p-2 text-right text-sm">
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
                        {activeCategory === group.name && (
                          <div
                            ref={addItemRef}
                            className={`${dropUp
                              ? "bottom-full mb-2"
                              : "top-full mt-2"
                              } absolute left-0 w-72 bg-white p-3 shadow-lg rounded-md border border-slate-200 z-50 space-y-2`}
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
                              className="h-8 text-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveCategory(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                data-cy="add-item-submit"
                                data-category={group.name}
                                size="sm"
                                onClick={() => handleAddItem(group.name)}
                              >
                                Add category
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Item rows */}
                    {openCategories[group.name] &&
                      group.categoryItems.map((item) => (
                        <Fragment
                          key={`${group.name}::${item.name}-fragment`}
                        >
                          <TableRow
                            data-cy="category-row"
                            data-category={group.name}
                            data-item={item.name}
                            className="odd:bg-white even:bg-slate-100 hover:bg-slate-200"
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
                              });
                            }}
                          >
                            <TableCell
                              data-cy="category-item-name"
                              data-category={group.name}
                              data-item={item.name}
                              className="p-2 align-middle"
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
                                <div className="relative h-6 rounded-md px-1">
                                  {item.target && (
                                    <div
                                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-300"
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
                                  <div className="relative z-10 px-2 flex justify-between items-center h-full">
                                    <span className="font-medium truncate text-slate-800 text-sm">
                                      {item.name}
                                    </span>
                                    {getTargetStatus(item).message && (
                                      <span
                                        className={`text-[11px] ml-2 ${getTargetStatus(item).color
                                          }`}
                                      >
                                        {getTargetStatus(item).message}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </TableCell>

                            <EditableAssigned
                              categoryName={group.name}
                              itemName={item.name}
                              item={item}
                              handleInputChange={handleInputChange}
                            />

                            <TableCell
                              data-cy="item-activity"
                              data-item={item.name}
                              className="p-2 text-right align-middle cursor-pointer"
                              onClick={() => {
                                setInlineEditorCategory((prev) =>
                                  prev === item.name ? null : item.name
                                );
                              }}
                            >
                              {formatToUSD(item.activity || 0)}
                            </TableCell>
                            <TableCell
                              data-cy="item-available"
                              data-item={item.name}
                              className={cn(
                                "p-2 text-right align-middle font-mono text-sm font-medium cursor-pointer",
                                item.available > 0
                                  ? "text-emerald-600"
                                  : item.available < 0
                                    ? "text-red-600"
                                    : "text-slate-700"
                              )}
                              onClick={() => {
                                setInlineEditorCategory((prev) =>
                                  prev === item.name ? null : item.name
                                );
                              }}
                            >
                              {formatToUSD(item.available || 0)}
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
                      ))}
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
