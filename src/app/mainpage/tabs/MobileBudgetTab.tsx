"use client";

import { useBudgetContext } from "@/app/context/BudgetContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { useToast } from "@/hooks/use-toast";
import MonthNav from "../MonthNav";
import ReadyToAssignBreakdown from "../ReadyToAssignBreakdown";
import { ChevronDown, ChevronRight, Plus, Wallet } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import type { ComputedCategory, ComputedCategoryItem } from "@/types/budget";

type SelectedItem = { groupName: string; itemName: string; itemId: string };

export default function MobileBudgetTab() {
  const {
    currentMonth,
    budgetView,
    addItemToCategory,
    addCategoryGroup,
    patchAssigned,
    getGroupIdByName,
    planningMode,
    setPlanningMode,
    setGlobalAssigned,
    getDisplayedRta,
  } = useBudgetContext();
  const { toast } = useToast();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [editAssigned, setEditAssigned] = useState("");
  const [saving, setSaving] = useState(false);
  const [addToGroup, setAddToGroup] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Touch detection (tap vs scroll)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const sortedGroups = useMemo(() => {
    if (!budgetView) return [] as ComputedCategory[];
    return [...budgetView.categories]
      .map((group) => ({
        ...group,
        categoryItems: group.categoryItems.filter((item) => !item.archived),
      }))
      .sort((a, b) => {
        if (a.name === "Credit Card Payments") return -1;
        if (b.name === "Credit Card Payments") return 1;
        return a.name.localeCompare(b.name);
      });
  }, [budgetView]);

  // Default all groups expanded once data first loads for a month. Keyed
  // only on [currentMonth], this never re-ran once budgetView finished its
  // (async) initial fetch — sortedGroups was still [] on the first pass, so
  // every group stayed permanently collapsed on a fresh load. Track which
  // month we've already auto-expanded so this fires exactly once per month
  // (not on every later budgetView update from an edit, which would
  // otherwise undo a manual collapse mid-session).
  const autoExpandedMonthRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sortedGroups.length) return;
    if (autoExpandedMonthRef.current === currentMonth) return;
    autoExpandedMonthRef.current = currentMonth;
    setExpandedGroups(new Set(sortedGroups.map((g) => g.name)));
  }, [currentMonth, sortedGroups]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  };

  // Real-vs-shadow swap for Global planning mode — same shape as
  // BudgetTable.tsx's getDisplayedAssignedFor/getDisplayedAvailableFor, but
  // without a local optimistic-update layer: patchAssigned and
  // setGlobalAssigned both already patch budgetView optimistically inside
  // BudgetContext, which is all this modal-with-explicit-Save flow needs.
  const getDisplayedAssigned = (item: ComputedCategoryItem) =>
    planningMode === "global" ? item.globalAssigned : item.assigned;
  // Server-computed shadow available, not a per-item delta shift — a Credit
  // Card Payments item's shadow available also depends on the shadow
  // assigned amounts of the spending categories whose card purchases it
  // covers (see globalAvailable in lib/budgetMath.ts).
  const getDisplayedAvailable = (item: ComputedCategoryItem) =>
    planningMode === "global" ? item.globalAvailable : item.available;

  const openEdit = (groupName: string, item: ComputedCategoryItem) => {
    setSelectedItem({ groupName, itemName: item.name, itemId: item.id });
    setEditAssigned(String(getDisplayedAssigned(item) ?? 0));
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    const nextAssigned = parseFloat(editAssigned);
    if (Number.isNaN(nextAssigned)) return;

    setSaving(true);
    try {
      if (planningMode === "global") {
        await setGlobalAssigned(selectedItem.itemId, currentMonth, nextAssigned);
      } else {
        await patchAssigned(selectedItem.itemId, currentMonth, nextAssigned);
      }
      setSelectedItem(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save assignment";
      toast({ title: "Couldn't save assignment", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const quickAdd = (amount: number) => {
    const current = parseFloat(editAssigned) || 0;
    setEditAssigned(String(current + amount));
  };

  const readyToAssign = getDisplayedRta ? getDisplayedRta(currentMonth) : (budgetView?.ready_to_assign ?? 0);

  if (!budgetView) {
    return (
      <div className="text-center py-8 text-slate-400">
        No budget data for this month
      </div>
    );
  }

  // Find the item being edited for live display
  const editingItem = selectedItem
    ? budgetView.categories
        .flatMap((g) => g.categoryItems)
        .find((i) => i.id === selectedItem.itemId)
    : null;

  return (
    <div className="pb-6 text-slate-900 dark:text-slate-200">
      {/* Month Navigation */}
      <div className="py-4 flex justify-center">
        <MonthNav />
      </div>

      {/* Ready to Assign banner */}
      <ReadyToAssignBreakdown>
        <div
          role="button"
          tabIndex={0}
          className="mx-0 mb-4 px-5 py-4 bg-ledger-50 dark:bg-ledger-900/30 border-y border-ledger-100 dark:border-ledger-800/40 flex items-center justify-between cursor-pointer active:bg-ledger-100 dark:active:bg-ledger-900/50 transition-colors"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ledger-600 dark:text-ledger-400">
              Ready to Assign{planningMode === "global" ? " (Global)" : ""}
            </p>
            <p className="font-mono tabular-nums text-[32px] font-bold text-ledger-700 dark:text-ledger-300 leading-tight tracking-tight">
              {formatToUSD(readyToAssign)}
            </p>
          </div>
          <Wallet className="h-6 w-6 text-ledger-400 dark:text-ledger-600 opacity-40" />
        </div>
      </ReadyToAssignBreakdown>

      {/* Global mode banner */}
      {planningMode === "global" && (
        <div className="mx-0 mb-4 px-5 py-3 bg-amber-50 dark:bg-amber-900/40 border-y border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Badge className="bg-amber-600 text-white hover:bg-amber-500">Global</Badge>
            <span>Planning against Global Ready to Assign</span>
          </div>
          <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1">
            Assigned amounts here are a separate plan — they never change your real assigned or Ready to Assign.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-8 border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-50 dark:hover:bg-amber-800"
            onClick={() => setPlanningMode("period")}
            data-cy="global-mode-exit-banner"
          >
            Back to Period
          </Button>
        </div>
      )}

      {/* Category groups */}
      {sortedGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.name);
        const groupAssigned = group.categoryItems.reduce(
          (s, i) => s + getDisplayedAssigned(i),
          0
        );
        const hasOverspent = group.categoryItems.some((i) => getDisplayedAvailable(i) < 0);

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
              {hasOverspent && <Badge variant="negative">Over</Badge>}
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                {formatToUSD(groupAssigned)}
              </span>
            </button>

            {/* Category rows */}
            {isExpanded && (
              <>
                {group.categoryItems.map((item) => {
                  const displayedAssigned = getDisplayedAssigned(item);
                  const displayedAvailable = getDisplayedAvailable(item);
                  const isOverspent = displayedAvailable < 0;
                  const progress =
                    displayedAssigned > 0
                      ? Math.min(
                          (Math.abs(item.activity) / displayedAssigned) * 100,
                          100
                        )
                      : item.activity < 0
                      ? 100
                      : 0;

                  return (
                    <button
                      key={item.name}
                      className="w-full flex items-center px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-left active:bg-slate-50 dark:active:bg-slate-800/50 min-h-[56px]"
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
                                : displayedAvailable === 0
                                ? "text-slate-300 dark:text-slate-600"
                                : "text-ledger-600 dark:text-ledger-400"
                            )}
                          >
                            {isOverspent && "−"}
                            {formatToUSD(Math.abs(displayedAvailable))}
                          </span>
                        </div>

                        {/* Sub-row: assigned + activity */}
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatToUSD(displayedAssigned)} assigned
                          </span>
                          {item.activity !== 0 && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatToUSD(Math.abs(item.activity))} spent
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        {displayedAssigned > 0 && (
                          <div className="mt-1.5 h-[3px] w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isOverspent ? "bg-red-500" : "bg-ledger-500"
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
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[12px] hover:text-ledger-600 dark:hover:text-ledger-400 transition-colors"
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
        className="w-full flex items-center gap-2 px-4 py-3 text-slate-400 dark:text-slate-500 text-[12px] hover:text-ledger-600 dark:hover:text-ledger-400 transition-colors border-b border-slate-100 dark:border-slate-800"
      >
        <Plus className="w-3.5 h-3.5" />
        Add category group
      </button>

      {/* ── Edit assigned sheet ── */}
      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(o) => { if (!o && !saving) setSelectedItem(null); }}
      >
        <DialogContent className="p-0 overflow-hidden rounded-t-2xl sm:rounded-2xl bg-slate-50 dark:bg-slate-900 border-0 shadow-2xl left-0 bottom-0 top-auto translate-x-0 translate-y-0 w-full max-w-none sm:left-[50%] sm:bottom-auto sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[96vw] sm:max-w-sm max-h-[90dvh] overflow-y-auto">
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
                  { label: "Assigned", value: getDisplayedAssigned(editingItem), mono: true },
                  { label: "Activity", value: editingItem.activity, mono: true },
                  {
                    label: "Available",
                    value: getDisplayedAvailable(editingItem),
                    color:
                      getDisplayedAvailable(editingItem) < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-ledger-600 dark:text-ledger-400",
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
                className="flex-1 h-11 bg-ledger-600 hover:bg-ledger-700 dark:bg-ledger-700 dark:hover:bg-ledger-600 text-white font-semibold"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
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
        <DialogContent className="max-w-none w-[96vw] sm:max-w-sm rounded-2xl bg-slate-50 dark:bg-slate-900">
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
                  const gid = getGroupIdByName(addToGroup);
                  if (gid) addItemToCategory(gid, newItemName.trim());
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
                className="flex-1 bg-ledger-600 dark:bg-ledger-700 text-white hover:bg-ledger-500 dark:hover:bg-ledger-600"
                onClick={() => {
                  if (!addToGroup || !newItemName.trim()) return;
                  const gid = getGroupIdByName(addToGroup);
                  if (gid) addItemToCategory(gid, newItemName.trim());
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
        <DialogContent className="max-w-none w-[96vw] sm:max-w-sm rounded-2xl bg-slate-50 dark:bg-slate-900">
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
                className="flex-1 bg-ledger-600 dark:bg-ledger-700 text-white hover:bg-ledger-500 dark:hover:bg-ledger-600"
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
