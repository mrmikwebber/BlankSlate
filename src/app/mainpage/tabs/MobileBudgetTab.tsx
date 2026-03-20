"use client";

import { useBudgetContext } from "@/app/context/BudgetContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import MonthNav from "../MonthNav";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SelectedItem = { groupName: string; itemName: string };

type MobileCategoryItem = {
  name: string;
  assigned: number;
  activity: number;
  available: number;
};

type MobileCategoryGroup = {
  name: string;
  categoryItems: MobileCategoryItem[];
};

type MobileBudgetDataMap = Record<string, { categories: MobileCategoryGroup[] }>;

type RecentChangeEntry = { description: string; timestamp: string };

export default function MobileBudgetTab() {
  const {
    currentMonth,
    budgetData,
    addItemToCategory,
    addCategoryGroup,
    getCumulativeAvailable,
    setBudgetData,
    calculateActivityForMonth,
    calculateCreditCardAccountActivity,
    refreshAllReadyToAssign,
    setIsDirty,
    setRecentChanges,
  } = useBudgetContext();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [editAssigned, setEditAssigned] = useState("");
  const [addToGroup, setAddToGroup] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Touch detection (tap vs scroll)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const budgetMonth = budgetData[currentMonth];

  const sortedGroups = useMemo(() => {
    if (!budgetMonth) return [] as MobileCategoryGroup[];
    return [...budgetMonth.categories].sort((a, b) => {
      if (a.name === "Credit Card Payments") return -1;
      if (b.name === "Credit Card Payments") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [budgetMonth]);

  // Default all groups expanded when data loads
  useEffect(() => {
    if (!sortedGroups.length) return;
    setExpandedGroups(new Set(sortedGroups.map((g) => g.name)));
  }, [currentMonth]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  };

  const openEdit = (groupName: string, item: MobileCategoryItem) => {
    setSelectedItem({ groupName, itemName: item.name });
    setEditAssigned(String(item.assigned ?? 0));
  };

  const handleSave = () => {
    if (!selectedItem) return;
    const nextAssigned = parseFloat(editAssigned);
    if (Number.isNaN(nextAssigned)) return;

    const { groupName, itemName } = selectedItem;

    setBudgetData((prev: MobileBudgetDataMap) => {
      const updated = { ...prev };
      const updatedCategories = updated[currentMonth]?.categories.map(
        (category: MobileCategoryGroup) => {
          const updatedItems = category.categoryItems.map(
            (item: MobileCategoryItem) => {
              if (category.name !== groupName || item.name !== itemName)
                return item;
              const itemActivity = calculateActivityForMonth(
                currentMonth,
                item.name,
                groupName
              );
              const cumulative = getCumulativeAvailable(
                updated,
                item.name,
                groupName
              );
              return {
                ...item,
                assigned: nextAssigned,
                activity: itemActivity,
                available: nextAssigned + itemActivity + Math.max(cumulative, 0),
              };
            }
          );
          return { ...category, categoryItems: updatedItems };
        }
      );

      updated[currentMonth] = {
        ...updated[currentMonth],
        categories: updatedCategories,
      };

      // Recalc CC payments
      const updatedWithCC = updated[currentMonth].categories.map(
        (category: MobileCategoryGroup) => {
          if (category.name !== "Credit Card Payments") return category;
          const updatedItems = category.categoryItems.map(
            (item: MobileCategoryItem) => {
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
              return {
                ...item,
                activity,
                available: item.assigned + activity + Math.max(cumulative, 0),
              };
            }
          );
          return { ...category, categoryItems: updatedItems };
        }
      );

      updated[currentMonth].categories = updatedWithCC;
      refreshAllReadyToAssign(updated);
      return updated;
    });

    setIsDirty?.(true);
    setRecentChanges?.((prev: RecentChangeEntry[]) => [
      ...(prev || []).slice(-9),
      {
        description: `Assigned $${nextAssigned} to '${itemName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);

    setSelectedItem(null);
  };

  const quickAdd = (amount: number) => {
    const current = parseFloat(editAssigned) || 0;
    setEditAssigned(String(current + amount));
  };

  const cumulativeAvailable = getCumulativeAvailable(currentMonth);

  if (!budgetMonth) {
    return (
      <div className="text-center py-8 text-slate-400">
        No budget data for this month
      </div>
    );
  }

  // Find the item being edited for live display
  const editingItem = selectedItem
    ? budgetMonth.categories
        .find((g: MobileCategoryGroup) => g.name === selectedItem.groupName)
        ?.categoryItems.find(
          (i: MobileCategoryItem) => i.name === selectedItem.itemName
        )
    : null;

  return (
    <div className="pb-6 text-slate-900 dark:text-slate-200">
      {/* Month Navigation */}
      <div className="py-4 flex justify-center">
        <MonthNav />
      </div>

      {/* Ready to Assign banner */}
      <div className="mx-0 mb-4 px-4 py-3 bg-teal-50 dark:bg-teal-900/30 border-y border-teal-100 dark:border-teal-800/40 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
            Ready to Assign
          </p>
          <p className="font-mono text-[22px] font-bold text-teal-700 dark:text-teal-300 leading-tight">
            {formatToUSD(cumulativeAvailable)}
          </p>
        </div>
        <div className="text-2xl opacity-30">💰</div>
      </div>

      {/* Category groups */}
      {sortedGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.name);
        const groupAssigned = group.categoryItems.reduce(
          (s, i) => s + i.assigned,
          0
        );
        const hasOverspent = group.categoryItems.some((i) => i.available < 0);

        return (
          <div key={group.name}>
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              )}
              <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {group.name}
              </span>
              {hasOverspent && (
                <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                  Over
                </span>
              )}
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                {formatToUSD(groupAssigned)}
              </span>
            </button>

            {/* Category rows */}
            {isExpanded && (
              <>
                {group.categoryItems.map((item) => {
                  const isOverspent = item.available < 0;
                  const progress =
                    item.assigned > 0
                      ? Math.min(
                          (Math.abs(item.activity) / item.assigned) * 100,
                          100
                        )
                      : item.activity < 0
                      ? 100
                      : 0;

                  return (
                    <button
                      key={item.name}
                      className="w-full flex items-center px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-left active:bg-slate-50 dark:active:bg-slate-800/50 min-h-[56px]"
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        touchStartRef.current = { x: t.clientX, y: t.clientY };
                      }}
                      onTouchEnd={(e) => {
                        if (!touchStartRef.current) return;
                        const t = e.changedTouches[0];
                        const dx = Math.abs(t.clientX - touchStartRef.current.x);
                        const dy = Math.abs(t.clientY - touchStartRef.current.y);
                        touchStartRef.current = null;
                        if (dx < 10 && dy < 10) openEdit(group.name, item);
                      }}
                      onClick={() => openEdit(group.name, item)}
                    >
                      <div className="flex-1 min-w-0">
                        {/* Name row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.name}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-[14px] font-semibold flex-shrink-0",
                              isOverspent
                                ? "text-red-600 dark:text-red-400"
                                : item.available === 0
                                ? "text-slate-300 dark:text-slate-600"
                                : "text-teal-600 dark:text-teal-400"
                            )}
                          >
                            {isOverspent && "−"}
                            {formatToUSD(Math.abs(item.available))}
                          </span>
                        </div>

                        {/* Sub-row: assigned + activity */}
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatToUSD(item.assigned)} assigned
                          </span>
                          {item.activity !== 0 && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatToUSD(Math.abs(item.activity))} spent
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        {item.assigned > 0 && (
                          <div className="mt-1.5 h-[3px] w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isOverspent ? "bg-red-500" : "bg-teal-500"
                              )}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Tap hint */}
                      <ChevronRight className="w-4 h-4 text-slate-200 dark:text-slate-700 flex-shrink-0 ml-2" />
                    </button>
                  );
                })}

                {/* Add category to group */}
                <button
                  onClick={() => {
                    setAddToGroup(group.name);
                    setNewItemName("");
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[12px] hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add category
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* Add group button */}
      <button
        onClick={() => { setAddGroupOpen(true); setNewGroupName(""); }}
        className="w-full flex items-center gap-2 px-4 py-3 text-slate-400 dark:text-slate-500 text-[12px] hover:text-teal-600 dark:hover:text-teal-400 transition-colors border-b border-slate-100 dark:border-slate-800"
      >
        <Plus className="w-3.5 h-3.5" />
        Add category group
      </button>

      {/* ── Edit assigned sheet ── */}
      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(o) => !o && setSelectedItem(null)}
      >
        <DialogContent className="p-0 overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border-0 shadow-2xl left-0 bottom-0 top-auto translate-x-0 translate-y-0 w-full max-w-none sm:left-[50%] sm:bottom-auto sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[96vw] sm:max-w-sm max-h-[90dvh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <DialogHeader>
                <DialogTitle className="text-[15px] text-slate-900 dark:text-slate-100">
                  {selectedItem?.itemName}
                </DialogTitle>
              </DialogHeader>
              <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
                {selectedItem?.groupName}
              </p>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Stats row */}
            {editingItem && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Assigned", value: editingItem.assigned, mono: true },
                  { label: "Activity", value: editingItem.activity, mono: true },
                  {
                    label: "Available",
                    value: editingItem.available,
                    color:
                      editingItem.available < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-teal-600 dark:text-teal-400",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 text-center"
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                      {stat.label}
                    </p>
                    <p
                      className={cn(
                        "font-mono text-[13px] font-semibold",
                        stat.color ?? "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {formatToUSD(stat.value)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Assigned input */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">
                Assign amount
              </label>
              <Input
                inputMode="decimal"
                value={editAssigned}
                onChange={(e) => setEditAssigned(e.target.value)}
                className="h-12 text-[16px] font-mono text-center border-slate-200 dark:border-slate-700"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            </div>

            {/* Quick-add buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => quickAdd(amt)}
                  className="py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 active:scale-95 transition-all"
                >
                  +${amt}
                </button>
              ))}
            </div>

            {/* Clear + Save */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                onClick={() => setEditAssigned("0")}
              >
                Clear
              </Button>
              <Button
                className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600 text-white font-semibold"
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add category dialog ── */}
      <Dialog
        open={Boolean(addToGroup)}
        onOpenChange={(o) => !o && setAddToGroup(null)}
      >
        <DialogContent className="max-w-none w-[96vw] sm:max-w-sm rounded-2xl bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              Add to {addToGroup}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Category name"
              className="h-11"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!addToGroup || !newItemName.trim()) return;
                  addItemToCategory(addToGroup, {
                    name: newItemName.trim(),
                    assigned: 0,
                    activity: 0,
                    available: 0,
                  });
                  setAddToGroup(null);
                  setNewItemName("");
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 dark:border-slate-700"
                onClick={() => setAddToGroup(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                onClick={() => {
                  if (!addToGroup || !newItemName.trim()) return;
                  addItemToCategory(addToGroup, {
                    name: newItemName.trim(),
                    assigned: 0,
                    activity: 0,
                    available: 0,
                  });
                  setAddToGroup(null);
                  setNewItemName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Add category group dialog ── */}
      <Dialog open={addGroupOpen} onOpenChange={(o) => !o && setAddGroupOpen(false)}>
        <DialogContent className="max-w-none w-[96vw] sm:max-w-sm rounded-2xl bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add category group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="h-11"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!newGroupName.trim()) return;
                  addCategoryGroup(newGroupName.trim());
                  setAddGroupOpen(false);
                  setNewGroupName("");
                }
              }}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 dark:border-slate-700" onClick={() => setAddGroupOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                onClick={() => {
                  if (!newGroupName.trim()) return;
                  addCategoryGroup(newGroupName.trim());
                  setAddGroupOpen(false);
                  setNewGroupName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
