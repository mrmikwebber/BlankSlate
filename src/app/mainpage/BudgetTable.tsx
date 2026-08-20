"use client";
import { useState, useEffect, useLayoutEffect, useMemo, Fragment, useRef, useCallback } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import InlineTransactionRow from "./InlineTransactionRow";
import { useBudgetContext } from "../context/BudgetContext";
import { getCachedView } from "../hooks/useBudgetMonth";
import { getTargetStatus } from "../utils/getTargetStatus";
import { createPortal } from "react-dom";
import InlineTargetEditor from "./TargetInlineEditor";
import { useAccountContext } from "../context/AccountContext";
import { useUndoRedo } from "../context/UndoRedoContext";
import { useGlobalKeyboardShortcuts } from "../hooks/useGlobalKeyboardShortcuts";
import { NotesPopover } from "@/components/ui/NotesPopover";
import type { ComputedCategoryItem } from "@/types/budget";
import { subMonths, format, parse, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight, GripVertical, Plus, RotateCcw, RotateCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { YnabImportDialog } from "./YnabImportDialog";

const DEBUG_RTA = process.env.NEXT_PUBLIC_DEBUG_RTA === "true";
const DEBUG_BUDGET_TABLE = process.env.NEXT_PUBLIC_DEBUG_BUDGET_TABLE === "true";
const rtaLog = (...args: unknown[]) => {
  if (DEBUG_RTA) console.log("[RTA]", ...args);
};
const budgetLog = (...args: unknown[]) => {
  if (DEBUG_BUDGET_TABLE) console.log("[BudgetTable]", ...args);
};

// Right-click context menus are positioned at the raw click coordinates,
// which clips off-screen when the click lands near the bottom/right edge
// (e.g. the last row in a long category list). Measures the menu after it
// mounts and clamps it back into the viewport, before paint so there's no
// visible jump.
function useClampedMenuPosition(x: number | undefined, y: number | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (x == null || y == null || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    setPos({ top: Math.min(y, maxTop), left: Math.min(x, maxLeft) });
  }, [x, y]);

  return { ref, style: { top: pos.top, left: pos.left } };
}

export default function BudgetTable() {
  const {
    currentMonth,
    setCurrentMonth,
    budgetView,
    isLoading,
    error,
    getDisplayedRta,
    rtaCarryByMonth,
    rtaStartMonth,
    addCategoryGroup,
    addItemToCategory,
    deleteCategoryGroup,
    deleteCategoryItem,
    patchAssigned,
    moveMoney,
    planningMode,
    setPlanningMode,
    setGlobalAssigned,
    renameCategory,
    renameCategoryGroup,
    reorderCategoryGroups,
    reorderCategoryItems,
    moveCategoryItemToGroup,
    updateCategoryGroupNote,
    updateCategoryItemNote,
    sandboxMode,
    enterSandbox,
    exitSandbox,
    setCategorySnooze,
    importPending,
    confirmImport,
    undoImport,
    getItemIdByName,
    getGroupIdByName,
    invalidate,
    seedDefaultCategories,
  } = useBudgetContext();
  const { accounts, refetchAccounts } = useAccountContext();
  const { registerAction, undo, redo, canUndo, canRedo, undoDescription, redoDescription } = useUndoRedo();

  // Optimistic assigned values — updated instantly on input, cleared when server responds
  const [optimisticAssigned, setOptimisticAssigned] = useState<Record<string, number>>({});
  // Global-mode shadow assigned — same optimistic-then-clear shape, but a
  // separate map/handler since it writes to setGlobalAssigned (never
  // patchAssigned) and never touches real assigned/RTA.
  const [optimisticGlobalAssigned, setOptimisticGlobalAssigned] = useState<Record<string, number>>({});

  // Shared real-vs-shadow swap — used by item rows and group header subtotals
  // so both agree on what "displayed" means under the active planning mode.
  const getDisplayedAssignedFor = useCallback(
    (item: ComputedCategoryItem) =>
      planningMode === "global"
        ? (optimisticGlobalAssigned[item.id] ?? item.globalAssigned)
        : (optimisticAssigned[item.id] ?? item.assigned),
    [planningMode, optimisticGlobalAssigned, optimisticAssigned]
  );

  const getDisplayedAvailableFor = useCallback(
    (item: ComputedCategoryItem) => {
      if (planningMode !== "global") return item.available;
      const displayedAssigned = getDisplayedAssignedFor(item);
      return item.available + (displayedAssigned - item.assigned);
    },
    [planningMode, getDisplayedAssignedFor]
  );

  const FILTERS = [
    "All",
    "Money Available",
    "Overspent",
    "Overfunded",
    "Underfunded",
    "Snoozed",
  ];
  const [inlineEditorCategory, setInlineEditorCategory] = useState<
    string | null
  >(null);
  const [activityDetailModal, setActivityDetailModal] = useState<{
    categoryName: string;
    groupName: string;
  } | null>(null);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [editingItem, setEditingItem] = useState<{
    category: string;
    item: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
  const groupMenuPos = useClampedMenuPosition(groupContext?.x, groupContext?.y);
  const categoryMenuPos = useClampedMenuPosition(categoryContext?.x, categoryContext?.y);

  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ group: string; item: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{
    group: string;
    item: string;
    position?: "before" | "after";
  } | null>(null);
  // Key = "group::item" of whichever row's Move Money popover is open.
  const [openMoveMoneyFor, setOpenMoveMoneyFor] = useState<string | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [selectedAccountForTransaction, setSelectedAccountForTransaction] = useState<number | null>(null);

  const addItemRef = useRef<HTMLDivElement | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  const prevMonthKey = useMemo(() => {
    if (!currentMonth) return null;
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    return format(subMonths(parsedDate, 1), "yyyy-MM");
  }, [currentMonth]);

  const getPreviousActivity = useCallback((groupName: string, itemName: string): number => {
    if (!prevMonthKey) return 0;
    const prevView = getCachedView(prevMonthKey);
    if (!prevView) return 0;
    return prevView.categories
      .find((c) => c.name === groupName)
      ?.categoryItems.find((i) => i.name === itemName)?.activity ?? 0;
  }, [prevMonthKey]);

  // Last month's credit-card spend that never got assigned money to cover
  // it — a fresh snapshot each month (not a running balance), same shape as
  // the prevMonth helpers above.
  const getPreviousCardOverspend = useCallback((itemName: string): number => {
    if (!prevMonthKey) return 0;
    const prevView = getCachedView(prevMonthKey);
    if (!prevView) return 0;
    return prevView.categories
      .find((c) => c.name === "Credit Card Payments")
      ?.categoryItems.find((i) => i.name === itemName)?.ccActivityBreakdown?.unbudgeted ?? 0;
  }, [prevMonthKey]);

  const overspentCategoriesCount = useMemo(() => {
    if (!budgetView) return 0;
    return budgetView.categories.reduce((count, group) => {
      return count + group.categoryItems.filter(item => item.available < 0).length;
    }, 0);
  }, [budgetView]);

  const displayedRta = useMemo(() => {
    return getDisplayedRta ? getDisplayedRta(currentMonth) : (budgetView?.ready_to_assign ?? 0);
  }, [getDisplayedRta, currentMonth, budgetView]);

  const currentCarry = rtaCarryByMonth?.[currentMonth] ?? 0;
  const showCarryNote = currentCarry < 0 && currentMonth !== rtaStartMonth;

  const openMoveMoneyModal = useCallback(() => {
    if (!budgetView) return;
    for (const group of budgetView.categories) {
      for (const item of group.categoryItems) {
        if (item.available > 0) {
          setOpenMoveMoneyFor(`${group.name}::${item.name}`);
          return;
        }
      }
    }
  }, [budgetView]);

  useEffect(() => {
    if (!budgetView) return;

    const totalAssigned = budgetView.categories.reduce(
      (sum, group) =>
        sum + group.categoryItems.reduce((s, item) => s + (item.assigned || 0), 0),
      0
    );

    const totalAvailable = budgetView.categories.reduce(
      (sum, group) =>
        sum + group.categoryItems.reduce((s, item) => s + (item.available || 0), 0),
      0
    );

    rtaLog("BudgetTable:month-summary", {
      month: currentMonth,
      readyToAssign: displayedRta,
      totalAssigned,
      totalAvailable,
      overspentCategoriesCount,
      categories: budgetView.categories.length,
    });
  }, [budgetView, currentMonth, overspentCategoriesCount, displayedRta]);

  useEffect(() => {
    budgetLog("state", {
      month: currentMonth,
      isLoading,
      error,
      categories: budgetView?.categories.length ?? 0,
      readyToAssign: budgetView?.ready_to_assign ?? null,
    });
  }, [currentMonth, isLoading, error, budgetView]);

  const getPreviousAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!prevMonthKey) return 0;
    const prevView = getCachedView(prevMonthKey);
    if (!prevView) return 0;
    return prevView.categories
      .find((c) => c.name === groupName)
      ?.categoryItems.find((i) => i.name === itemName)?.assigned ?? 0;
  }, [prevMonthKey]);

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
    if (!budgetView) return;

    setOpenCategories((prev) => {
      const updated = { ...prev };
      for (const group of budgetView.categories) {
        if (!(group.name in updated)) {
          updated[group.name] = true;
        }
      }
      return updated;
    });
  }, [budgetView]);

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
    const allCategories = budgetView?.categories ?? [];

    const orderedCategories = [...allCategories].sort((a, b) => {
      if (a.name === "Credit Card Payments") return -1;
      if (b.name === "Credit Card Payments") return 1;
      return 0;
    });

    const withFilteredItems = orderedCategories.map((category) => {
      const filteredItems = category.categoryItems.filter((item) => {
        switch (selectedFilter) {
          case "Money Available":  return item.available > 0;
          case "Overspent":        return item.available < 0;
          case "Overfunded":       return (item.target as { amountNeeded?: number } | undefined)?.amountNeeded != null && item.assigned > ((item.target as { amountNeeded?: number }).amountNeeded ?? 0);
          case "Underfunded":      return (item.target as { amountNeeded?: number } | undefined)?.amountNeeded != null && item.assigned < ((item.target as { amountNeeded?: number }).amountNeeded ?? 0);
          case "Snoozed":          return item.snoozed === true;
          default:                 return true;
        }
      });
      return { ...category, categoryItems: filteredItems };
    });

    // A specific filter (not "All") is about finding items that need
    // attention — a group with none left after filtering is just clutter,
    // not a result. "All" still shows every group, including empty ones,
    // since that's the view you'd use to add items to a new group.
    return selectedFilter === "All"
      ? withFilteredItems
      : withFilteredItems.filter((category) => category.categoryItems.length > 0);
  }, [budgetView, selectedFilter]);

  const toggleCategory = useCallback((category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const handleInputChange = useCallback(
    (categoryName: string, itemName: string, value: number) => {
      const itemId = getItemIdByName(categoryName, itemName);
      if (!itemId) return;

      const oldValue =
        budgetView?.categories
          .find((c) => c.name === categoryName)
          ?.categoryItems.find((i) => i.name === itemName)?.assigned ?? 0;

      // Optimistic update — assigned cell reflects new value instantly
      setOptimisticAssigned((prev) => ({ ...prev, [itemId]: value }));

      const clearOptimistic = () =>
        setOptimisticAssigned((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });

      registerAction({
        description: `Assigned ${formatToUSD(value)} to '${itemName}'`,
        execute: async () => {
          setOptimisticAssigned((prev) => ({ ...prev, [itemId]: value }));
          await patchAssigned(itemId, currentMonth, value);
          clearOptimistic();
        },
        undo: async () => {
          setOptimisticAssigned((prev) => ({ ...prev, [itemId]: oldValue }));
          await patchAssigned(itemId, currentMonth, oldValue);
          clearOptimistic();
        },
      });

      patchAssigned(itemId, currentMonth, value).then(clearOptimistic).catch(clearOptimistic);
    },
    [budgetView, currentMonth, patchAssigned, registerAction, getItemIdByName]
  );

  // Global-mode counterpart to handleInputChange — same optimistic-then-fire
  // shape, but no registerAction/undo-redo (this is a revisited scratch plan,
  // not a real-money action) and it calls setGlobalAssigned, never
  // patchAssigned, so real assigned/RTA are never touched.
  const handleGlobalInputChange = useCallback(
    (categoryName: string, itemName: string, value: number) => {
      const itemId = getItemIdByName(categoryName, itemName);
      if (!itemId) return;

      setOptimisticGlobalAssigned((prev) => ({ ...prev, [itemId]: value }));

      const clearOptimistic = () =>
        setOptimisticGlobalAssigned((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });

      setGlobalAssigned(itemId, currentMonth, value).then(clearOptimistic).catch(clearOptimistic);
    },
    [currentMonth, setGlobalAssigned, getItemIdByName]
  );

  const handleAddItem = useCallback((groupName: string) => {
    if (newItem.name.trim() !== "") {
      const groupId = getGroupIdByName(groupName);
      if (groupId) {
        addItemToCategory(groupId, newItem.name.trim());
      }
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0, snoozed: false });
      setActiveCategory(null);
    }
  }, [newItem, addItemToCategory, getGroupIdByName]);

  const handleGroupDrop = useCallback(
    (targetName: string) => {
      if (!draggingGroup || draggingGroup === targetName || !budgetView) return;
      const groups = budgetView.categories.map((c) => c.name);
      const fromIdx = groups.indexOf(draggingGroup);
      const toIdx = groups.indexOf(targetName);
      if (fromIdx === -1 || toIdx === -1) return;
      const reordered = [...groups];
      reordered.splice(fromIdx, 1);
      // Removing the dragged item shifts everything after it back by one —
      // account for that before inserting, or forward drags land one slot short.
      const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      reordered.splice(adjustedToIdx, 0, draggingGroup);
      const orderedIds = reordered
        .map((name, i) => {
          const id = getGroupIdByName(name);
          return id ? { id, sortOrder: i } : null;
        })
        .filter((x): x is { id: string; sortOrder: number } => x !== null);
      reorderCategoryGroups(orderedIds);
      setDraggingGroup(null);
      setDragOverGroup(null);
    },
    [draggingGroup, budgetView, getGroupIdByName, reorderCategoryGroups]
  );

  const handleItemDrop = useCallback(
    (targetGroup: string, targetName?: string, position: "before" | "after" = "before") => {
      if (!draggingItem || !budgetView) return;
      if (
        (draggingItem.group === "Credit Card Payments" && targetGroup !== draggingItem.group) ||
        (targetGroup === "Credit Card Payments" && draggingItem.group !== targetGroup)
      ) {
        setDraggingItem(null);
        setDragOverItem(null);
        return;
      }
      if (draggingItem.item === targetName && draggingItem.group === targetGroup) return;

      const sourceGroup = budgetView.categories.find((c) => c.name === draggingItem.group);
      if (!sourceGroup) return;

      // Same-group drop: pure reorder within one group's sort_order.
      if (targetGroup === draggingItem.group) {
        const items = sourceGroup.categoryItems.map((i) => i.name);
        const fromIdx = items.indexOf(draggingItem.item);
        if (fromIdx === -1) return;
        const reordered = [...items];
        reordered.splice(fromIdx, 1);
        let insertAt = targetName ? items.indexOf(targetName) : items.length;
        if (position === "after") insertAt += 1;
        // Removing the dragged item shifts everything after it back by one —
        // account for that before inserting, or forward drags land one slot short.
        if (fromIdx < insertAt) insertAt -= 1;
        reordered.splice(Math.max(0, Math.min(insertAt, reordered.length)), 0, draggingItem.item);
        const orderedIds = reordered
          .map((name, i) => {
            const id = getItemIdByName(draggingItem.group, name);
            return id ? { id, sortOrder: i } : null;
          })
          .filter((x): x is { id: string; sortOrder: number } => x !== null);
        reorderCategoryItems(orderedIds);
        setDraggingItem(null);
        setDragOverItem(null);
        return;
      }

      // Cross-group drop: re-point the item at the target group and
      // resequence both groups (target gets the item inserted at the dropped
      // position, source closes the gap it leaves behind).
      const targetGroupObj = budgetView.categories.find((c) => c.name === targetGroup);
      const targetGroupId = getGroupIdByName(targetGroup);
      const itemId = getItemIdByName(draggingItem.group, draggingItem.item);
      if (!targetGroupObj || !targetGroupId || !itemId) return;

      const targetItems = targetGroupObj.categoryItems.map((i) => i.name);
      let insertAt = targetName ? targetItems.indexOf(targetName) : targetItems.length;
      if (insertAt === -1) insertAt = targetItems.length;
      if (position === "after") insertAt += 1;
      const reorderedTarget = [...targetItems];
      reorderedTarget.splice(Math.max(0, Math.min(insertAt, reorderedTarget.length)), 0, draggingItem.item);

      const targetOrderedIds = reorderedTarget
        .map((name, i) => {
          const id = name === draggingItem.item ? itemId : getItemIdByName(targetGroup, name);
          return id ? { id, sortOrder: i } : null;
        })
        .filter((x): x is { id: string; sortOrder: number } => x !== null);

      const sourceOrderedIds = sourceGroup.categoryItems
        .map((i) => i.name)
        .filter((name) => name !== draggingItem.item)
        .map((name, i) => {
          const id = getItemIdByName(draggingItem.group, name);
          return id ? { id, sortOrder: i } : null;
        })
        .filter((x): x is { id: string; sortOrder: number } => x !== null);

      moveCategoryItemToGroup(itemId, targetGroupId, targetOrderedIds, sourceOrderedIds).then(() =>
        refetchAccounts()
      );
      setDraggingItem(null);
      setDragOverItem(null);
    },
    [draggingItem, budgetView, getItemIdByName, getGroupIdByName, reorderCategoryItems, moveCategoryItemToGroup, refetchAccounts]
  );

  const isDeletingRef = useRef(false);

  const handleReassignDelete = () => {
    if (isDeletingRef.current || !categoryDeleteContext) return;
    isDeletingRef.current = true;

    const itemId = getItemIdByName(categoryDeleteContext.categoryName, categoryDeleteContext.itemName);
    if (itemId) {
      deleteCategoryItem(itemId);
    }
    setCategoryDeleteContext(null);

    setTimeout(() => {
      isDeletingRef.current = false;
    }, 100);
  };

  // Selecting a source in the Move Money popover executes immediately — no
  // separate amount field or confirm button. The amount is unambiguous:
  // exactly enough to zero out a deficit, or the source's full available
  // balance otherwise (matches YNAB's minimal "Cover Overspending From").
  type MoveMoneySource =
    | { type: "rta" }
    | { type: "category"; group: string; item: string; available: number };

  const executeMoveMoney = useCallback(
    async (toGroup: string, toItem: string, toAvailable: number, source: MoveMoneySource) => {
      const destItemId = getItemIdByName(toGroup, toItem);
      if (!destItemId) return;

      const sourceAvailable = source.type === "rta" ? displayedRta : source.available;
      const transferAmount = toAvailable < 0 ? Math.abs(toAvailable) : Math.max(sourceAvailable, 0);
      if (transferAmount <= 0) return;

      // Close on selection rather than waiting for the transfer to finish —
      // patchAssigned/moveMoney apply optimistically in the background like
      // every other budget mutation in this app, so there's no reason to
      // keep the picker open (or risk it never closing) while that's in flight.
      setOpenMoveMoneyFor(null);

      const isMovingFromRTA = source.type === "rta";
      let sourceItemId: string | null = null;
      if (source.type === "category") {
        sourceItemId = getItemIdByName(source.group, source.item);
        if (!sourceItemId) return;
      }

      const description = source.type === "rta"
        ? `Moved ${formatToUSD(transferAmount)} from RTA to '${toItem}'`
        : `Moved ${formatToUSD(transferAmount)} from '${source.item}' to '${toItem}'`;

      registerAction({
        description,
        execute: async () => {
          if (isMovingFromRTA) {
            const toCurrentAssigned = budgetView?.categories
              .find((c) => c.name === toGroup)
              ?.categoryItems.find((i) => i.name === toItem)?.assigned ?? 0;
            await patchAssigned(destItemId, currentMonth, toCurrentAssigned + transferAmount);
          } else if (sourceItemId) {
            await moveMoney(sourceItemId, destItemId, currentMonth, transferAmount);
          }
        },
        undo: async () => {
          if (isMovingFromRTA) {
            const toCurrentAssigned = budgetView?.categories
              .find((c) => c.name === toGroup)
              ?.categoryItems.find((i) => i.name === toItem)?.assigned ?? 0;
            await patchAssigned(destItemId, currentMonth, Math.max(0, toCurrentAssigned - transferAmount));
          } else if (sourceItemId) {
            await moveMoney(destItemId, sourceItemId, currentMonth, transferAmount);
          }
        },
      });

      if (isMovingFromRTA) {
        const toCurrentAssigned = budgetView?.categories
          .find((c) => c.name === toGroup)
          ?.categoryItems.find((i) => i.name === toItem)?.assigned ?? 0;
        await patchAssigned(destItemId, currentMonth, toCurrentAssigned + transferAmount);
      } else if (sourceItemId) {
        await moveMoney(sourceItemId, destItemId, currentMonth, transferAmount);
      }
    },
    [budgetView, currentMonth, moveMoney, patchAssigned, registerAction, getItemIdByName, displayedRta]
  );

  // Get assigned amount from previous month
  const getLastMonthAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!prevMonthKey) return 0;
    const prevView = getCachedView(prevMonthKey);
    if (!prevView) return 0;
    return prevView.categories
      .find((c) => c.name === groupName)
      ?.categoryItems.find((i) => i.name === itemName)?.assigned ?? 0;
  }, [prevMonthKey]);

  // Get 3-month average assigned
  const getThreeMonthAverageAssigned = useCallback((groupName: string, itemName: string): number => {
    if (!currentMonth) return 0;
    const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
    let total = 0;
    let count = 0;
    for (let i = 1; i <= 3; i++) {
      const monthKey = format(subMonths(parsedDate, i), "yyyy-MM");
      const view = getCachedView(monthKey);
      if (view) {
        const val = view.categories
          .find((c) => c.name === groupName)
          ?.categoryItems.find((i) => i.name === itemName)?.assigned ?? 0;
        total += val;
        count++;
      }
    }
    return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
  }, [currentMonth]);

  // Apply quick assign operation (Last Month, Average, or Zero)
  const handleQuickAssign = useCallback(async (
    groupName: string,
    itemName: string,
    mode: "last-month" | "average" | "zero"
  ) => {
    if (!currentMonth) return;
    const itemId = getItemIdByName(groupName, itemName);
    if (!itemId) return;

    const currentItem = budgetView?.categories
      .find((c) => c.name === groupName)
      ?.categoryItems.find((i) => i.name === itemName);
    const oldAssigned = currentItem?.assigned ?? 0;

    let newAssigned = 0;
    let description = "";

    if (mode === "last-month") {
      newAssigned = getLastMonthAssigned(groupName, itemName);
      description = `Set '${itemName}' to last month's assigned (${formatToUSD(newAssigned)})`;
    } else if (mode === "average") {
      newAssigned = getThreeMonthAverageAssigned(groupName, itemName);
      description = `Set '${itemName}' to 3-month average (${formatToUSD(newAssigned)})`;
    } else {
      newAssigned = 0;
      description = `Zeroed out '${itemName}'`;
    }

    setOptimisticAssigned((prev) => ({ ...prev, [itemId]: newAssigned }));
    const clearOptimistic = () =>
      setOptimisticAssigned((prev) => { const next = { ...prev }; delete next[itemId]; return next; });

    registerAction({
      description,
      execute: async () => {
        setOptimisticAssigned((prev) => ({ ...prev, [itemId]: newAssigned }));
        await patchAssigned(itemId, currentMonth, newAssigned);
        clearOptimistic();
      },
      undo: async () => {
        setOptimisticAssigned((prev) => ({ ...prev, [itemId]: oldAssigned }));
        await patchAssigned(itemId, currentMonth, oldAssigned);
        clearOptimistic();
      },
    });

    await patchAssigned(itemId, currentMonth, newAssigned).then(clearOptimistic).catch(clearOptimistic);
    setCategoryContext(null);
  }, [currentMonth, budgetView, getLastMonthAssigned, getThreeMonthAverageAssigned, patchAssigned, registerAction, getItemIdByName]);

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

  // Global keyboard shortcuts
  useGlobalKeyboardShortcuts({
    onAddTransaction: () => {
      setShowAddTransactionModal(true);
    },
    onToggleFilter: () => {
      // Cycle through filters
      const currentIndex = FILTERS.indexOf(selectedFilter);
      const nextIndex = (currentIndex + 1) % FILTERS.length;
      setSelectedFilter(FILTERS[nextIndex]);
    },
    onMoveMoney: () => {
      openMoveMoneyModal();
    },
    onNextMonth: () => {
      const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
      const nextMonthDate = new Date(parsedDate);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      setCurrentMonth(format(nextMonthDate, "yyyy-MM"));
    },
    onPrevMonth: () => {
      const parsedDate = parse(`${currentMonth}-01`, "yyyy-MM-dd", new Date());
      const prevMonthDate = new Date(parsedDate);
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
      setCurrentMonth(format(prevMonthDate, "yyyy-MM"));
    },
    onShowHelp: () => {
      setShowShortcutsHelp(true);
    },
    enabled: !categoryContext && !openMoveMoneyFor && !groupContext && !categoryDeleteContext,
  });

  const hasBudgetCategories = (budgetView?.categories.length ?? 0) > 0;

  if (isLoading && !budgetView) {
    return (
      <Card className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Loading budget...</div>
        </CardHeader>
        <CardContent className="text-sm text-slate-500 dark:text-slate-400">
          Fetching the current month from the server.
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-900/60 bg-slate-50 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold text-red-700 dark:text-red-300">Budget data failed to load</div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p>{error}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If the page is otherwise working, the server route may be returning no normalized budget rows for this user/month.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!hasBudgetCategories) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-6">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">No budget categories found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Get started by importing your budget, using defaults, or adding a group manually.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="default"
              onClick={() => setImportDialogOpen(true)}
            >
              Import from YNAB
            </Button>
            <Button
              variant="outline"
              onClick={seedDefaultCategories}
            >
              Start with default categories
            </Button>
            <AddCategoryButton handleSubmit={addCategoryGroup} />
          </div>
        </div>
        <YnabImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
        />
      </>
    );
  }

  return (
    <>
      {/* Group context menu */}
      {groupContext &&
        createPortal(
          <div
            ref={groupMenuPos.ref}
            data-cy="group-context-menu"
            className="fixed z-50 w-40 bg-slate-50 border border-slate-200 shadow-md rounded-md text-xs"
            style={groupMenuPos.style}
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
                  const groupId = getGroupIdByName(groupContext.categoryName);
                  if (groupId) deleteCategoryGroup(groupId);
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
              className="bg-slate-50 dark:bg-slate-900 p-5 rounded-lg shadow-lg w-full max-w-md space-y-4 text-slate-800 dark:text-slate-200"
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
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    value={selectedTargetCategory}
                    onChange={(e) => setSelectedTargetCategory(e.target.value)}
                  >
                    <option value="">Select a target category</option>
                    {budgetView?.categories
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
                  <p className="text-sm text-muted-foreground dark:text-slate-400">
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
                        if (categoryDeleteContext) {
                          const itemId = getItemIdByName(categoryDeleteContext.categoryName, categoryDeleteContext.itemName);
                          if (itemId) deleteCategoryItem(itemId);
                        }
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
            ref={categoryMenuPos.ref}
            data-cy="category-context-menu"
            className="fixed z-50 bg-slate-50 border border-slate-200 rounded-md shadow-md text-xs dark:bg-slate-900 dark:border-slate-700 min-w-max"
            style={categoryMenuPos.style}
            onClick={() => setCategoryContext(null)}
          >
            <div className="py-1">
              <button
                data-cy="category-assign-last-month"
                data-category={categoryContext.groupName}
                data-item={categoryContext.itemName}
                onClick={() => handleQuickAssign(categoryContext.groupName, categoryContext.itemName, "last-month")}
                className="px-3 py-2 hover:bg-ledger-50 dark:hover:bg-ledger-950 text-ledger-600 dark:text-ledger-400 w-full text-left flex items-center justify-between gap-4"
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
                  const iid = getItemIdByName(categoryContext.groupName, categoryContext.itemName);
                  if (iid) setCategorySnooze(iid, !(categoryContext.snoozed ?? false));
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

      {/* Keyboard Shortcuts Help Modal */}
      <Dialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Speed up your budgeting with these keyboard shortcuts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Navigation</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Previous month</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">←</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Next month</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">→</kbd>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Actions</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Toggle filters</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Ctrl+F</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Add transaction</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt+N</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Move money</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Ctrl+M</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Undo</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Ctrl+Z</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Redo</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Ctrl+Y</kbd>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Quick Assign (Right-click menu)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Set to last month</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">L</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Set to 3-month average</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">A</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Zero out</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Z</kbd>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Help</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 dark:text-slate-400">Show this dialog</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">?</kbd>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowShortcutsHelp(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Modal - Account Selection */}
      <Dialog open={showAddTransactionModal && !selectedAccountForTransaction} onOpenChange={(open) => {
        setShowAddTransactionModal(open);
        if (!open) setSelectedAccountForTransaction(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Select an account to add a transaction to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {accounts && accounts.length > 0 ? (
              accounts.map((account) => (
                <Button
                  key={account.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4"
                  onClick={() => {
                    setSelectedAccountForTransaction(Number(account.id));
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-xs text-slate-500">
                      Balance: ${account.balance?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                </Button>
              ))
            ) : (
              <p className="text-center text-slate-500 py-4">No accounts found</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setShowAddTransactionModal(false);
              setSelectedAccountForTransaction(null);
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Inline Form - Shows after account is selected */}
      {selectedAccountForTransaction && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl shadow-2xl max-h-[90vh] w-[90vw] max-w-6xl flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-200 dark:border-slate-700 px-8 py-6 flex justify-between items-center bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-800 dark:to-transparent rounded-t-2xl">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Add Transaction to <span className="text-ledger-600 dark:text-ledger-400">{accounts.find(a => a.id === selectedAccountForTransaction)?.name}</span></h2>
              <button
                onClick={() => {
                  setSelectedAccountForTransaction(null);
                  setShowAddTransactionModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-3xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="w-full overflow-x-auto">
                <table className="w-full text-lg border-collapse">
                  <thead className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 sticky top-0 rounded-lg">
                    <tr className="rounded-lg">
                      <th className="border border-slate-200 dark:border-slate-700 px-6 py-5 text-left font-bold text-base text-slate-900 dark:text-slate-50">Date</th>
                      <th className="border border-slate-200 dark:border-slate-700 px-6 py-5 text-left font-bold text-base text-slate-900 dark:text-slate-50">Payee</th>
                      <th className="border border-slate-200 dark:border-slate-700 px-6 py-5 text-left font-bold text-base text-slate-900 dark:text-slate-50">Category</th>
                      <th className="border border-slate-200 dark:border-slate-700 px-6 py-5 text-right font-bold text-base text-slate-900 dark:text-slate-50">Amount</th>
                      <th className="border border-slate-200 dark:border-slate-700 px-6 py-5 text-center font-bold text-base text-slate-900 dark:text-slate-50">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-ledger-50 dark:hover:bg-ledger-950/20 h-24 transition-colors">
                      <td colSpan={5} className="p-0">
                        <InlineTransactionRow
                          accountId={selectedAccountForTransaction}
                          mode="add"
                          autoFocus
                          onCancel={() => {
                            setSelectedAccountForTransaction(null);
                            setShowAddTransactionModal(false);
                          }}
                          onSave={() => {
                            setSelectedAccountForTransaction(null);
                            setShowAddTransactionModal(false);
                          }}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main card */}
      <Card className="flex flex-col w-full h-full min-h-0 overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950">
        <CardHeader className="py-2.5 px-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex flex-col gap-2">
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

            {planningMode === "global" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Badge className="bg-amber-600 text-white hover:bg-amber-500">Global</Badge>
                    <span>Planning against Global Ready to Assign</span>
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Assigned amounts here are a separate plan — they never change your real assigned or Ready to Assign.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-50 dark:hover:bg-amber-800"
                    onClick={() => setPlanningMode("period")}
                    data-cy="global-mode-exit-banner"
                  >
                    Back to Period
                  </Button>
                </div>
              </div>
            )}

            {/* Status row — month nav now lives in the page-level toolbar */}
            {(showCarryNote || overspentCategoriesCount > 0 || (!showCarryNote && overspentCategoriesCount === 0 && displayedRta > 0)) && (
              <div className="flex items-center gap-2 flex-wrap">
                {!showCarryNote && overspentCategoriesCount === 0 && displayedRta > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                    Assign it all before the month ends.
                  </span>
                )}
                {showCarryNote && (
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Reduced by {formatToUSD(Math.abs(currentCarry))} from prior months
                  </span>
                )}
                {overspentCategoriesCount > 0 && (
                  <Badge data-cy="overspent-indicator" variant="negative">
                    {overspentCategoriesCount} overspent
                  </Badge>
                )}
              </div>
            )}


            {/* Toolbar: Filters + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-0.5">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter}
                    data-cy={`filter-${filter.toLowerCase().replace(" ", "-")}`}
                    variant={selectedFilter === filter ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedFilter(filter)}
                    className={cn(
                      "text-[11px] h-6 px-2",
                      selectedFilter === filter
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    )}
                  >
                    {filter}
                  </Button>
                ))}

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                <Button
                  data-cy="compare-toggle"
                  variant={compareToLastMonth ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCompareToLastMonth((prev) => !prev)}
                  title="Compare to last month"
                  className={cn(
                    "h-6 w-6 p-0",
                    compareToLastMonth
                      ? "bg-ledger-600 text-white hover:bg-ledger-500 dark:bg-ledger-700 dark:hover:bg-ledger-600"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  )}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                </Button>

                <Button
                  data-cy="sandbox-toggle"
                  variant={sandboxMode ? "destructive" : "ghost"}
                  size="sm"
                  onClick={() => (sandboxMode ? exitSandbox() : enterSandbox())}
                  title={sandboxMode ? "Exit sandbox" : "Sandbox mode"}
                  className={cn(
                    "text-[11px] h-6 px-2",
                    sandboxMode
                      ? "bg-amber-600 text-white hover:bg-amber-500 dark:bg-amber-700 dark:hover:bg-amber-600"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  )}
                >
                  {sandboxMode ? "Exit sandbox" : "Sandbox"}
                </Button>

                <Button
                  data-cy="ynab-import-button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportDialogOpen(true)}
                  className="text-[11px] h-6 px-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  style={{ display: importPending ? "none" : "inline-flex" }}
                >
                  Import
                </Button>

                {importPending && (
                  <div className="flex gap-1">
                    <Button
                      data-cy="confirm-import-button"
                      variant="default"
                      size="sm"
                      onClick={confirmImport}
                      className="text-[11px] h-6 px-2 bg-green-600 hover:bg-green-700"
                    >
                      Confirm Import
                    </Button>
                    <Button
                      data-cy="undo-import-button"
                      variant="destructive"
                      size="sm"
                      onClick={undoImport}
                      className="text-[11px] h-6 px-2"
                    >
                      Undo Import
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  data-cy="undo-button"
                  onClick={undo}
                  disabled={!canUndo}
                  title={canUndo ? `Undo: ${undoDescription}` : "Nothing to undo"}
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  data-cy="redo-button"
                  onClick={redo}
                  disabled={!canRedo}
                  title={canRedo ? `Redo: ${redoDescription}` : "Nothing to redo"}
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  data-cy="keyboard-shortcuts-button"
                  onClick={() => setShowShortcutsHelp(true)}
                  variant="outline"
                  size="icon"
                  title="Keyboard Shortcuts (press ? for help)"
                  className="h-6 w-6 text-[11px]"
                >
                  ?
                </Button>
                <AddCategoryButton handleSubmit={addCategoryGroup} />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-2 flex-1 flex flex-col min-h-0 gap-0 overflow-hidden">
          <div className="w-full">
            <Table data-cy="budget-table-header" className="w-full table-fixed">
              <TableHeader className="bg-slate-100 dark:bg-slate-800">
                <TableRow className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <TableHead className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Category
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Assigned
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Activity
                  </TableHead>
                  <TableHead className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ledger-600 dark:text-ledger-400">
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
                {filteredCategories.map((group, groupIndex) => (
                  <Fragment key={group.name}>
                    {/* Gap between groups — real HTML tables ignore margin on
                        rows, so a spacer row matching the page background is
                        what actually makes each group read as its own block
                        instead of one continuous flat table. */}
                    {groupIndex > 0 && (
                      <TableRow className="border-none hover:bg-transparent">
                        <TableCell colSpan={4} className="h-3 p-0 bg-slate-100 dark:bg-slate-900" />
                      </TableRow>
                    )}
                    {/* Group row */}
                    <TableRow
                      data-cy="category-group-row"
                      data-category={group.name}
                      className={cn(
                        "group bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100 border-b-2 border-slate-200 dark:border-slate-700",
                        draggingGroup === group.name && "opacity-70",
                        dragOverGroup === group.name && draggingGroup
                          ? "ring-2 ring-ledger-500/70 bg-ledger-50/60 dark:bg-ledger-950/40 shadow-sm"
                          : "",
                        dragOverItem?.group === group.name && dragOverItem?.item === "__group__"
                          ? "ring-2 ring-ledger-500/70 bg-ledger-50/60 dark:bg-ledger-950/40 shadow-sm"
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
                        className="py-3 px-3 align-middle rounded-tl-md"
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
                                const gid = getGroupIdByName(editingGroup);
                                if (gid) { await renameCategoryGroup(gid, newGroupName); void refetchAccounts(); }
                                setEditingGroup(null);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  const gid = getGroupIdByName(editingGroup);
                                  if (gid) { await renameCategoryGroup(gid, newGroupName); void refetchAccounts(); }
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
                              className="text-[13px] font-bold uppercase tracking-wide leading-tight truncate"
                            >
                              {group.name}
                            </span>
                          )}
                          <NotesPopover
                            currentNote={group.notes}
                            history={group.notes_history}
                            onSave={(noteText) => { const gid = getGroupIdByName(group.name); if (gid) updateCategoryGroupNote(gid, noteText); }}
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
                              className="relative z-40 h-7 w-7 p-0 rounded-md border border-slate-300 bg-slate-50 shadow-sm hover:bg-slate-50 hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-ledger-500 focus-visible:ring-offset-1 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:border-slate-500"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className="py-2.5 px-3 text-right text-sm font-medium"
                        data-cy="available-display"
                        data-category={group.name}
                      >
                        {formatToUSD(
                          group.categoryItems.reduce(
                            (sum, item) => sum + getDisplayedAssignedFor(item),
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right text-sm font-medium">
                        {formatToUSD(
                          group.categoryItems.reduce(
                            (sum, item) => sum + item.activity,
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right text-sm font-medium rounded-tr-md">
                        {group.name === "Credit Card Payments"
                          ? "Payment - " +
                          formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + getDisplayedAvailableFor(item),
                              0
                            ) || 0
                          )
                          : formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + getDisplayedAvailableFor(item),
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
                              className="w-72 bg-slate-50 dark:bg-slate-900 p-3 shadow-sm rounded-md border border-slate-200 dark:border-slate-700 z-50 space-y-2 text-slate-800 dark:text-slate-200"
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
                                  className="bg-ledger-600 dark:bg-ledger-700 text-white hover:bg-ledger-500 dark:hover:bg-ledger-600"
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

                        const previousCardOverspend = group.name === "Credit Card Payments"
                          ? getPreviousCardOverspend(item.name)
                          : 0;

                        // Same real-vs-shadow swap the assign cell already
                        // uses — the target funding badge and progress bar
                        // should track whichever "assigned" is actually on
                        // screen, or a plan that fully funds a target would
                        // still show "Underfunded" in Global mode.
                        const displayedAssigned = getDisplayedAssignedFor(item);
                        const displayItem = { ...item, assigned: displayedAssigned };

                        // Available under the shadow plan — exact, not an
                        // approximation: available = assigned + activity +
                        // prevAvailable, and only `assigned` differs between
                        // real and shadow this month, so shifting by the
                        // same delta gives the true figure. Now the primary
                        // Available figure in Global mode (Move Money is
                        // disabled there, so there's no real-money action
                        // left that needs the real number on screen).
                        const displayedAvailable = getDisplayedAvailableFor(item);

                        return (
                          <Fragment
                            key={`${group.name}::${item.name}-fragment`}
                          >
                          <TableRow
                            data-cy="category-row"
                            data-category={group.name}
                            data-item={item.name}
                            className={cn(
                              "relative odd:bg-slate-50 dark:odd:bg-slate-950 even:bg-slate-50/60 dark:even:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700",
                              draggingItem?.group === group.name &&
                              draggingItem?.item === item.name &&
                              "opacity-70",
                              dragOverItem?.group === group.name &&
                              dragOverItem?.item === item.name &&
                              cn(
                                "ring-2 ring-ledger-500/70 bg-ledger-50/60 dark:bg-ledger-950/40 shadow-sm",
                                dragOverItem?.position === "after"
                                  ? "border-b-4 border-b-ledger-500"
                                  : "border-l-4 border-l-ledger-500"
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
                              className="py-2 px-3 align-middle"
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
                                    const iid = getItemIdByName(group.name, editingItem.item);
                                    if (iid) { await renameCategory(iid, newCategoryName); void refetchAccounts(); }
                                    setEditingItem(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      const iid = getItemIdByName(group.name, editingItem.item);
                                      if (iid) { await renameCategory(iid, newCategoryName); void refetchAccounts(); }
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
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium truncate text-slate-800 dark:text-slate-200 text-sm">
                                        {group.name === "Credit Card Payments"
                                          ? item.name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
                                          : item.name}
                                      </span>
                                      <NotesPopover
                                        currentNote={item.notes}
                                        history={item.notes_history}
                                        onSave={(noteText) => { const iid = getItemIdByName(group.name, item.name); if (iid) updateCategoryItemNote(iid, noteText); }}
                                        triggerSize="icon"
                                        className="flex-shrink-0"
                                      />
                                      {item.snoozed && (
                                        <Badge variant="warning" data-cy="snoozed-pill">
                                          Snoozed
                                        </Badge>
                                      )}
                                      {previousCardOverspend > 0 && (
                                        <Badge
                                          variant="negative"
                                          data-cy="card-overspend-last-month"
                                          title="Card spending last month that wasn't covered by an assignment — it's now part of the card's balance. Assign extra here to catch up."
                                        >
                                          Overspent {formatToUSD(previousCardOverspend)} last month
                                        </Badge>
                                      )}
                                      {displayItem.target && getTargetStatus(displayItem).message && (
                                        <Badge
                                          variant={
                                            getTargetStatus(displayItem).type === "overspent"
                                              ? "negative"
                                              : getTargetStatus(displayItem).type === "funded"
                                                ? "positive"
                                                : getTargetStatus(displayItem).type === "overfunded"
                                                  ? "info"
                                                  : getTargetStatus(displayItem).type === "underfunded"
                                                    ? "warning"
                                                    : "neutral"
                                          }
                                        >
                                          {getTargetStatus(displayItem).type === "funded" && "Funded"}
                                          {getTargetStatus(displayItem).type === "overfunded" && "Overfunded"}
                                          {getTargetStatus(displayItem).type === "underfunded" && (displayItem.target.amountNeeded - displayItem.assigned > 0 ? formatToUSD(displayItem.target.amountNeeded - displayItem.assigned) + " left" : "Underfunded")}
                                          {getTargetStatus(displayItem).type === "overspent" && "Overspent"}
                                        </Badge>
                                      )}
                                    </div>
                                    {displayItem.target && (
                                      <div className="h-0.5 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                        <div
                                          className="h-full bg-ledger-500 dark:bg-ledger-600 rounded-full"
                                          style={{ width: `${Math.min((displayItem.assigned / displayItem.target.amountNeeded) * 100, 100)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </TableCell>

                            <EditableAssigned
                              categoryName={group.name}
                              itemName={item.name}
                              item={displayItem}
                              handleInputChange={planningMode === "global" ? handleGlobalInputChange : handleInputChange}
                              showDelta={showCompare && planningMode === "period"}
                              deltaAmount={assignedDelta}
                            />

                            <TableCell
                              data-cy="item-activity"
                              data-item={item.name}
                              className="py-2 px-3 text-right align-middle font-mono tabular-nums font-medium"
                            >
                              <div className="flex flex-col items-end gap-1">
                                {item.activity !== 0 ? (
                                  <button
                                    type="button"
                                    className="rounded px-1 py-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500 hover:bg-slate-200/80 dark:hover:bg-slate-700/60 font-mono font-medium text-sm"
                                    onClick={() => setActivityDetailModal({ categoryName: item.name, groupName: group.name })}
                                  >
                                    <span className="underline decoration-dotted underline-offset-4">{formatToUSD(item.activity)}</span>
                                  </button>
                                ) : (
                                  <span className="px-1 py-0.5 text-sm">{formatToUSD(0)}</span>
                                )}
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
                                "py-2 px-3 text-right align-middle font-mono tabular-nums text-sm font-semibold",
                                Math.round(displayedAvailable * 100) > 0
                                  ? "text-emerald-600"
                                  : Math.round(displayedAvailable * 100) < 0
                                    ? "text-red-600"
                                    : "text-slate-700"
                              )}
                            >
                              {(() => {
                                // Overspend attribution is tagging actual past transactions
                                // to actual accounts, not the hypothetical plan — but it must
                                // still be gated on the *displayed* figure too, or Global mode
                                // can show a "CC"/"Cash" badge (real overspend) sitting right
                                // next to a $0.00 (shadow-covered) number, which reads as a
                                // contradiction even though both are individually correct.
                                const availableCents = Math.round(item.available * 100);
                                const displayedAvailableCents = Math.round(displayedAvailable * 100);
                                let overspendType: "credit" | "debit" | "both" | null = null;
                                let ccAmount = 0, cashAmount = 0;
                                if (availableCents < 0 && displayedAvailableCents < 0) {
                                  const selMonth = format(parse(currentMonth, "yyyy-MM", new Date()), "yyyy-MM");
                                  for (const a of accounts) {
                                    for (const tx of a.transactions) {
                                      if (!tx.date) continue;
                                      if (format(parseISO(tx.date), "yyyy-MM") !== selMonth) continue;
                                      if (tx.category !== item.name || tx.category_group !== group.name) continue;
                                      if (tx.balance < 0) {
                                        if (a.type === "credit") ccAmount += Math.abs(tx.balance);
                                        else cashAmount += Math.abs(tx.balance);
                                      }
                                    }
                                  }
                                  if (ccAmount > 0 && cashAmount > 0) overspendType = "both";
                                  else if (ccAmount > 0) overspendType = "credit";
                                  else if (cashAmount > 0) overspendType = "debit";
                                }

                                const pillLabel = overspendType === "credit" ? "CC"
                                  : overspendType === "debit" ? "Cash"
                                  : overspendType === "both" ? "CC + Cash"
                                  : null;
                                const pillColors = overspendType === "credit"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                                  : overspendType === "debit"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60"
                                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/60";

                                return (
                                  <>
                                  <div className="flex flex-row items-center justify-end gap-1.5">
                                    {pillLabel && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className={cn(
                                              "text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full transition cursor-pointer",
                                              pillColors
                                            )}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {pillLabel}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-3" align="end">
                                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Overspend breakdown</p>
                                          {(() => {
                                            const totalUncovered = Math.abs(item.available);
                                            const ccUncovered = Math.min(ccAmount, totalUncovered);
                                            const cashUncovered = Math.max(0, totalUncovered - ccUncovered);
                                            return (
                                              <>
                                                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-xs items-center">
                                                  <span className="text-slate-400 dark:text-slate-500 font-medium" />
                                                  <span className="text-right text-slate-400 dark:text-slate-500 font-medium">Spent</span>
                                                  <span className="text-right text-slate-400 dark:text-slate-500 font-medium">Still owed</span>
                                                  {cashAmount > 0 && (
                                                    <>
                                                      <span className="text-red-700 dark:text-red-400 font-medium">Cash</span>
                                                      <span className="font-mono text-right text-slate-700 dark:text-slate-300">-{formatToUSD(cashAmount)}</span>
                                                      <span className={cn("font-mono text-right", cashUncovered > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500")}>
                                                        {cashUncovered > 0 ? `-${formatToUSD(cashUncovered)}` : "—"}
                                                      </span>
                                                    </>
                                                  )}
                                                  {ccAmount > 0 && (
                                                    <>
                                                      <span className="text-amber-700 dark:text-amber-400 font-medium">CC</span>
                                                      <span className="font-mono text-right text-slate-700 dark:text-slate-300">-{formatToUSD(ccAmount)}</span>
                                                      <span className={cn("font-mono text-right", ccUncovered > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500")}>
                                                        {ccUncovered > 0 ? `-${formatToUSD(ccUncovered)}` : "—"}
                                                      </span>
                                                    </>
                                                  )}
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                    {planningMode === "global" ? (
                                      <span
                                        data-cy="move-money-trigger"
                                        data-disabled="true"
                                        title="This is a planning figure — switch to Period mode to move real money."
                                        className="inline-flex items-center justify-end gap-1 rounded px-2 py-1 cursor-not-allowed"
                                      >
                                        <span className="underline decoration-dotted underline-offset-4 decoration-slate-400">
                                          {formatToUSD(displayedAvailable || 0)}
                                        </span>
                                      </span>
                                    ) : (() => {
                                      const rowKey = `${group.name}::${item.name}`;
                                      const sources = (budgetView?.categories ?? [])
                                        .flatMap((cat) =>
                                          cat.categoryItems
                                            .filter((i) => !(i.name === item.name && cat.name === group.name))
                                            .map((i) => ({ group: cat.name, item: i }))
                                        )
                                        .filter(({ item: i }) => i.available > 0);

                                      return (
                                        <Popover
                                          open={openMoveMoneyFor === rowKey}
                                          onOpenChange={(o) => setOpenMoveMoneyFor(o ? rowKey : null)}
                                        >
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              data-cy="move-money-trigger"
                                              className="inline-flex items-center justify-end gap-1 rounded px-2 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500 focus-visible:ring-offset-1 hover:bg-slate-200/80 dark:hover:bg-slate-700/60"
                                            >
                                              <span className="underline decoration-dotted underline-offset-4">
                                                {formatToUSD(item.available || 0)}
                                              </span>
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-64 p-0" align="end">
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-3 pt-3 pb-2">
                                              {item.available < 0 ? "Cover Overspending From" : "Move Money From"}
                                            </p>
                                            <Command>
                                              <CommandInput placeholder="Search categories…" autoFocus />
                                              <CommandList>
                                                <CommandEmpty>No matches.</CommandEmpty>
                                                <CommandGroup>
                                                  {displayedRta > 0 && (
                                                    <CommandItem
                                                      value="Ready to Assign"
                                                      data-cy="move-money-source-rta"
                                                      className="group"
                                                      onSelect={() =>
                                                        executeMoveMoney(group.name, item.name, item.available, { type: "rta" })
                                                      }
                                                    >
                                                      <span className="flex-1">Ready to Assign</span>
                                                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500 group-data-[selected=true]:text-accent-foreground">
                                                        {formatToUSD(displayedRta || 0)}
                                                      </span>
                                                    </CommandItem>
                                                  )}
                                                  {sources.map(({ group: srcGroup, item: srcItem }) => (
                                                    <CommandItem
                                                      key={`${srcGroup}::${srcItem.name}`}
                                                      value={`${srcGroup} ${srcItem.name}`}
                                                      data-cy="move-money-source-item"
                                                      className="group"
                                                      onSelect={() =>
                                                        executeMoveMoney(group.name, item.name, item.available, {
                                                          type: "category",
                                                          group: srcGroup,
                                                          item: srcItem.name,
                                                          available: srcItem.available,
                                                        })
                                                      }
                                                    >
                                                      <span className="flex-1 truncate">{srcGroup} → {srcItem.name}</span>
                                                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500 group-data-[selected=true]:text-accent-foreground flex-shrink-0">
                                                        {formatToUSD(srcItem.available || 0)}
                                                      </span>
                                                    </CommandItem>
                                                  ))}
                                                </CommandGroup>
                                              </CommandList>
                                            </Command>
                                          </PopoverContent>
                                        </Popover>
                                      );
                                    })()}
                                  </div>
                                  </>
                                );
                              })()}
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

        <YnabImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
        />

        {/* Activity detail dialog */}
        <Dialog open={!!activityDetailModal} onOpenChange={(open) => { if (!open) setActivityDetailModal(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{activityDetailModal?.categoryName} — Activity</DialogTitle>
              <DialogDescription>
                Transactions in {currentMonth ? format(parse(currentMonth, "yyyy-MM", new Date()), "MMMM yyyy") : ""} that make up this amount.
              </DialogDescription>
            </DialogHeader>
            {activityDetailModal && (() => {
              const selMonth = format(parse(currentMonth, "yyyy-MM", new Date()), "yyyy-MM");
              const isCreditCardRow = activityDetailModal.groupName === "Credit Card Payments";
              const ccBreakdown = isCreditCardRow
                ? budgetView?.categories
                    .find((g) => g.name === "Credit Card Payments")
                    ?.categoryItems.find((i) => i.name === activityDetailModal.categoryName)
                    ?.ccActivityBreakdown
                : undefined;
              const txs = isCreditCardRow
                ? (() => {
                    const cardAccount = accounts.find((a) => a.name === activityDetailModal.categoryName && a.type === "credit");
                    if (!cardAccount) return [];
                    return cardAccount.transactions
                      .filter((tx) => {
                        if (!tx.date) return false;
                        if (format(parseISO(tx.date), "yyyy-MM") !== selMonth) return false;
                        if (tx.category === "Ready to Assign" || tx.category === cardAccount.name) return false;
                        if (tx.category === "Category Not Needed" || tx.category_group === "Reconciliation (Hidden)") return false;
                        return true;
                      })
                      .map((tx) => ({ ...tx, accountName: cardAccount.name, accountType: cardAccount.type }))
                      .sort((a, b) => b.date.localeCompare(a.date));
                  })()
                : accounts
                    .flatMap((a) => a.transactions.map((tx) => ({ ...tx, accountName: a.name, accountType: a.type })))
                    .filter((tx) => {
                      if (!tx.date) return false;
                      if (tx.category === "Category Not Needed" || tx.category_group === "Reconciliation (Hidden)") return false;
                      return (
                        format(parseISO(tx.date), "yyyy-MM") === selMonth &&
                        tx.category === activityDetailModal.categoryName &&
                        tx.category_group === activityDetailModal.groupName
                      );
                    })
                    .sort((a, b) => b.date.localeCompare(a.date));

              const total = txs.reduce((sum, tx) => sum + tx.balance, 0);

              if (txs.length === 0 && !ccBreakdown) {
                return <p className="text-sm text-slate-500 py-2">No transactions found.</p>;
              }

              return (
                <div className="flex flex-col gap-2">
                  {ccBreakdown && (() => {
                    const totalSpending = ccBreakdown.spending + ccBreakdown.returns;
                    const totalActivity = ccBreakdown.fundedSpending + ccBreakdown.payments;
                    const fmt = (n: number) => formatToUSD(n);
                    const line = (label: string, value: number, opts?: { bold?: boolean; border?: boolean }) => (
                      <div className={cn(
                        "flex justify-between items-center px-1 py-0.5 text-sm",
                        opts?.bold && "font-semibold",
                        opts?.border && "border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-0.5"
                      )}>
                        <span className={opts?.bold ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>{label}</span>
                        <span className={cn("font-mono", value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                          {fmt(value)}
                        </span>
                      </div>
                    );
                    return (
                      <div className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5 mb-1">
                        {line("Spending", ccBreakdown.spending)}
                        {line("Returns", ccBreakdown.returns)}
                        {line("Total Spending", totalSpending, { bold: true, border: true })}
                        {line("Funded Spending", ccBreakdown.fundedSpending, { border: true })}
                        {line("Payments", ccBreakdown.payments)}
                        {line("Total Activity", totalActivity, { bold: true, border: true })}
                        {ccBreakdown.unbudgeted !== 0 &&
                          line("Unbudgeted (still owed)", -ccBreakdown.unbudgeted, { border: true })}
                      </div>
                    );
                  })()}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    {txs.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate text-slate-900 dark:text-slate-100">{tx.payee}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-500">{format(parseISO(tx.date), "MMM d")}</span>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-px rounded-full",
                              tx.accountType === "credit"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            )}>
                              {tx.accountName}
                            </span>
                          </div>
                        </div>
                        <span className={cn("font-mono font-medium ml-4 shrink-0", tx.balance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                          {formatToUSD(tx.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!ccBreakdown && (
                    <div className="flex justify-between items-center px-1 pt-1 text-sm font-semibold">
                      <span className="text-slate-600 dark:text-slate-400">Total</span>
                      <span className={cn("font-mono", total < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {formatToUSD(total)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
    </>
  );
}
