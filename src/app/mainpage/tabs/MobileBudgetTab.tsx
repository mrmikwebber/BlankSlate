"use client";

import { useBudgetContext } from "@/app/context/BudgetContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { getTargetStatus } from "@/app/utils/getTargetStatus";
import { useAccountContext } from "@/app/context/AccountContext";
import MonthNav from "../MonthNav";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InlineTargetEditor from "../TargetInlineEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SelectedItem = { groupName: string; itemName: string };

export default function MobileBudgetTab() {
  const {
    currentMonth,
    budgetData,
    addItemToCategory,
    getCumulativeAvailable,
    setBudgetData,
    calculateActivityForMonth,
    calculateCreditCardAccountActivity,
    refreshAllReadyToAssign,
    setIsDirty,
    setRecentChanges,
  } = useBudgetContext();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [editAssigned, setEditAssigned] = useState<string>("");
  const [addToGroup, setAddToGroup] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState<string>("");

  const openItemSheet = (groupName: string, itemName: string, assigned: number) => {
    setSelectedItem({ groupName, itemName });
    setEditAssigned(String(assigned ?? 0));
  };

  const closeItemSheet = () => {
    setSelectedItem(null);
    setEditAssigned("");
  };

  const handleAssignedSave = () => {
    if (!selectedItem) return;
    const nextAssigned = Number(editAssigned);
    if (Number.isNaN(nextAssigned)) return;

    const { groupName, itemName } = selectedItem;

    // Same math as BudgetTable.handleInputChange
    setBudgetData((prev: any) => {
      const updated = { ...prev };

      const updatedCategories = updated[currentMonth]?.categories.map((category: any) => {
        const updatedItems = category.categoryItems.map((item: any) => {
          if (category.name !== groupName || item.name !== itemName) return item;

          const itemActivity = calculateActivityForMonth(currentMonth, item.name, groupName);
          const cumulative = getCumulativeAvailable(updated, item.name, groupName);
          const available = nextAssigned + itemActivity + Math.max(cumulative, 0);

          return { ...item, assigned: nextAssigned, activity: itemActivity, available };
        });

        return { ...category, categoryItems: updatedItems };
      });

      updated[currentMonth] = { ...updated[currentMonth], categories: updatedCategories };

      // Recalc CC payments like BudgetTable
      const updatedCategoriesWithCreditCards = updated[currentMonth].categories.map((category: any) => {
        if (category.name !== "Credit Card Payments") return category;

        const updatedItems = category.categoryItems.map((item: any) => {
          const activity = calculateCreditCardAccountActivity(currentMonth, item.name, updated);
          const cumulative = getCumulativeAvailable(updated, item.name, category.name);
          const available = item.assigned + activity + Math.max(cumulative, 0);
          return { ...item, activity, available };
        });

        return { ...category, categoryItems: updatedItems };
      });

      updated[currentMonth].categories = updatedCategoriesWithCreditCards;
      refreshAllReadyToAssign(updated);
      return updated;
    });

    setIsDirty?.(true);
    setRecentChanges?.((prev: any[]) => [
      ...(prev || []).slice(-9),
      {
        description: `Assigned $${nextAssigned} to '${itemName}' in '${groupName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);

    closeItemSheet();
  };

  const budgetMonth = budgetData[currentMonth];

  // Sort groups with Credit Card Payments first, then the rest alphabetically
  const sortedGroups = useMemo(() => {
    if (!budgetMonth) return [] as typeof budgetMonth.categories;
    const groups = [...budgetMonth.categories];
    return groups.sort((a, b) => {
      if (a.name === "Credit Card Payments") return -1;
      if (b.name === "Credit Card Payments") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [budgetMonth]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Default all groups to expanded when data loads
  useEffect(() => {
    if (!sortedGroups.length) return;
    setExpandedGroups(new Set(sortedGroups.map((g) => g.name)));
  }, [sortedGroups]);

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  if (!budgetMonth) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p>No budget data for this month</p>
      </div>
    );
  }

  const getStatusColor = (statusType?: string) => {
    if (statusType === "overspent") return "destructive";
    if (statusType === "overfunded") return "secondary";
    if (statusType === "underfunded") return "outline";
    return "default";
  };

  const cumulativeAvailable = getCumulativeAvailable(currentMonth);

  return (
    <div className="space-y-4 pb-20 text-slate-900 dark:text-slate-200">
      {/* Month Navigation */}
      <MonthNav />

      {/* Ready to Assign */}
      <Card className="shadow-none border border-teal-100 dark:border-teal-800/40 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200">
        <CardContent className="py-3">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-300 mb-1">Ready to Assign</p>
          <p className="text-2xl font-bold">
            {formatToUSD(cumulativeAvailable)}
          </p>
        </CardContent>
      </Card>

      {/* Category Groups */}
      {sortedGroups.map((group) => (
        <div key={group.name} className="space-y-2">
          {/* Group Header */}
          <button
            onClick={() => toggleGroup(group.name)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-semibold text-slate-900 dark:text-slate-100"
          >
            <span>{group.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {formatToUSD(
                  group.categoryItems.reduce((sum, item) => sum + item.assigned, 0)
                )}
              </span>
              {expandedGroups.has(group.name) ? (
                <ChevronDown className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              )}
            </div>
          </button>

          {/* Category Items */}
          {expandedGroups.has(group.name) && (
            <div className="space-y-3 px-1">
              {group.categoryItems.map((item) => {
                const status = getTargetStatus(item);
                return (
                  <Card key={item.name} className="shadow-none border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" onClick={() => openItemSheet(group.name, item.name, item.assigned)}>
                    <CardContent className="pt-3">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.name}
                          </p>
                          {status && status.type && (
                            <Badge
                              variant={getStatusColor(status.type)}
                              className={`mt-2 text-xs ${status.type === 'funded' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200' : ''}`}
                            >
                              {status.message}
                            </Badge>
                          )}
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">Available</p>
                          <p className={`text-base font-bold ${item.available > 0 ? 'text-teal-600' : 'text-red-600'
                            }`}>
                            {formatToUSD(item.available)}
                          </p>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="space-y-2 bg-slate-50 dark:bg-slate-800 rounded p-2">
                        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                          <span>Assigned: {formatToUSD(item.assigned)}</span>
                          <span>Activity: {formatToUSD(item.activity)}</span>
                        </div>
                        <div className="w-full bg-slate-300 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${item.available < 0 ? 'bg-red-500' : 'bg-teal-500'
                              }`}
                            style={{
                              width: `${Math.min(
                                (Math.abs(item.activity) / (item.assigned || 1)) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Add Category Button */}
              <Button
                size="sm"
                className="w-full gap-1.5 bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                onClick={() => {
                  setAddToGroup(group.name);
                  setNewItemName("");
                }}
              >
                <Plus className="h-4 w-4" />
                Add to {group.name}
              </Button>

            </div>
          )}
        </div>
      ))}
      <Dialog open={Boolean(selectedItem)} onOpenChange={(o) => !o && closeItemSheet()}>
        <DialogContent className="p-0 overflow-hidden max-w-none w-[96vw] sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
          <div className="p-4 border-b bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedItem?.itemName}</DialogTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">{selectedItem?.groupName}</p>
            </DialogHeader>
          </div>

          {selectedItem && (() => {
            const group = budgetData[currentMonth]?.categories?.find((g: any) => g.name === selectedItem.groupName);
            const item = group?.categoryItems?.find((i: any) => i.name === selectedItem.itemName);
            const status = item ? getTargetStatus(item) : null;

            return (
              <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
                    <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Assigned</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-200">{formatToUSD(item?.assigned ?? 0)}</p>
                    </div>
                        <Button size="sm" className="bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600" onClick={handleAssignedSave}>
                          Done
                        </Button>
                  </div>

                  <Input
                    inputMode="decimal"
                    value={editAssigned}
                    onChange={(e) => setEditAssigned(e.target.value)}
                    className="h-11"
                  />

                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Activity: {formatToUSD(item?.activity ?? 0)}</span>
                    <span>Available: {formatToUSD(item?.available ?? 0)}</span>
                  </div>
                </div>

                {item && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Target</p>
                    <table className="w-full">
                      <tbody>
                        <InlineTargetEditor
                          itemName={selectedItem.itemName}
                          onClose={closeItemSheet}
                        />
                      </tbody>
                    </table>
                    {status?.type && (
                      <div className="mt-2">
                        <Badge variant={getStatusColor(status.type)} className="text-xs">
                          {status.message}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(addToGroup)} onOpenChange={(o) => !o && setAddToGroup(null)}>
        <DialogContent className="max-w-none w-[96vw] sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base">Add category to {addToGroup}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Category name"
              className="h-11"
              autoFocus
            />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 dark:border-slate-700" onClick={() => setAddToGroup(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-500 dark:hover:bg-teal-600"
                onClick={() => {
                  if (!addToGroup) return;
                  const name = newItemName.trim();
                  if (!name) return;

                  addItemToCategory(addToGroup, { name, assigned: 0, activity: 0, available: 0 });
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

    </div>
  );
}
