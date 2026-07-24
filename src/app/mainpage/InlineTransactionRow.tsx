import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { useAccountContext, Transaction } from "@/app/context/AccountContext";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import { findLastCategoryForPayee } from "@/app/utils/lastCategoryForPayee";

const DROPDOWN_MAX_HEIGHT = 240; // matches max-h-60
const DROPDOWN_GAP = 4;

interface DropdownPosition {
  top: number | null;
  bottom: number | null;
  left: number;
  width: number;
}

// Minimal shape shared by BudgetContext's `budgetData[month]` (legacy shim,
// only ever holds the currently-navigated month) and the raw ComputedMonthView
// returned by GET /api/budget/month/[month] — either satisfies this.
interface TxFormCategoryItem {
  name: string;
  available: number;
}
interface TxFormCategoryGroup {
  name: string;
  categoryItems: TxFormCategoryItem[];
}

// Fixed-position dropdowns anchored to an input's rect only work if they
// stay inside the viewport — a row near the bottom of a long scrollable
// table otherwise pushes the dropdown past window.innerHeight and clips it.
// Flip upward (anchor to `bottom` instead of `top`) when there isn't enough
// room below but there's more room above.
function getDropdownPosition(rect: DOMRect): DropdownPosition {
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;

  return openUpward
    ? { top: null, bottom: window.innerHeight - rect.top + DROPDOWN_GAP, left: rect.left, width: rect.width }
    : { top: rect.bottom + DROPDOWN_GAP, bottom: null, left: rect.left, width: rect.width };
}

export default function InlineTransactionRow({
  accountId,
  mode = "add",
  initialData,
  onCancel,
  onSave,
  autoFocus = false,
}: {
  accountId: string | number;
  mode?: "add" | "edit";
  initialData?: Transaction;
  onCancel?: () => void;
  onSave?: () => void;
  autoFocus?: boolean;
}) {
  const isEdit = mode === "edit";
  const {
    budgetData,
    currentMonth,
    addItemToCategory,
    getGroupIdByName,
    getItemIdByName,
    invalidateAll,
  } = useBudgetContext();

  const { addTransaction, addTransactionWithMirror, editTransaction, accounts, deleteTransaction, savedPayees, upsertPayee } =
    useAccountContext();

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(
    isEdit && initialData ? initialData.date : today
  );
  const [amount, setAmount] = useState(
    isEdit && initialData ? Math.abs(initialData.balance).toString() : ""
  );
  const [isNegative, setIsNegative] = useState(
    isEdit && initialData ? initialData.balance < 0 : true
  );
  const [cleared, setCleared] = useState(
    isEdit && initialData ? (initialData.cleared ?? false) : false
  );

  // category group + item (backing state)
  const [selectedGroup, setSelectedGroup] = useState(() => {
    if (!isEdit || !initialData) return "";
    if (initialData.category === "Ready to Assign" || initialData.category_group === "Ready to Assign") {
      return "Ready to Assign";
    }
    return initialData.category_group || "";
  });
  const [selectedItem, setSelectedItem] = useState(
    isEdit && initialData?.category && initialData.category !== "Ready to Assign" ? initialData.category : ""
  );

  // "add new category" flow
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGroupIsNew, setNewCategoryGroupIsNew] = useState(false);
  const [newCategoryGroupName, setNewCategoryGroupName] = useState("");

  // payee / transfer
  const extractPayeeName = (payeeLabel: string): string => {
    const matches = payeeLabel.match(/(?:Transfer|Payment) (?:to|from) (.+)/);
    return matches ? matches[1] : payeeLabel;
  };
  const [newPayeeMode] = useState(false);
  const [transferPayee, setTransferPayee] = useState(
    isEdit && initialData ? extractPayeeName(initialData.payee) : ""
  );
  // Payee combobox
  const [payeeInput, setPayeeInput] = useState(
    isEdit && initialData ? extractPayeeName(initialData.payee) : ""
  );
  const [payeeDropdownOpen, setPayeeDropdownOpen] = useState(false);
  const [selectedPayeeAccountName, setSelectedPayeeAccountName] = useState<string | null>(null);

  // Category combobox (for normal mode, not "Add New Category")
  const [categoryInput, setCategoryInput] = useState(() => {
    if (!isEdit || !initialData) return "";
    if (initialData.category_group === "Ready to Assign" || initialData.category === "Ready to Assign") {
      return "Ready to Assign";
    }
    if (initialData.category_group && initialData.category) {
      return `${initialData.category_group} ▸ ${initialData.category}`;
    }
    return initialData.category || "";
  });
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isTypingPayee, setIsTypingPayee] = useState(false);
  const [isTypingCategory, setIsTypingCategory] = useState(false);
  const [payeeSelectedIndex, setPayeeSelectedIndex] = useState(0);
  const [categorySelectedIndex, setCategorySelectedIndex] = useState(0);




  const formRef = useRef<HTMLTableRowElement>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const payeeSelectRef =
    useRef<HTMLSelectElement | HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryGroupInputRef = useRef<HTMLInputElement | null>(null);
  const payeeInputRef = useRef<HTMLInputElement | null>(null);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);
  const [payeeDropdownPos, setPayeeDropdownPos] = useState<DropdownPosition>({ top: 0, bottom: null, left: 0, width: 0 });
  const [categoryDropdownPos, setCategoryDropdownPos] = useState<DropdownPosition>({ top: 0, bottom: null, left: 0, width: 0 });




  const thisAccount = accounts.find((a) => a.id === accountId);
  const otherAccount = accounts.find((a) => a.name === transferPayee);

  const sameTypeTransfer =
    thisAccount && otherAccount && thisAccount.type === otherAccount.type;
  const crossTypeTransfer =
    thisAccount && otherAccount && thisAccount.type !== otherAccount.type;

  // The category "$X left" figures must reflect the transaction's own month,
  // not whatever month the main budget table happens to be navigated to —
  // BudgetContext's `budgetData` only ever caches the currently-viewed month,
  // so editing/adding a transaction dated in a different month fetches that
  // month's view directly rather than silently showing the wrong numbers.
  const txMonth = date.slice(0, 7);
  const [otherMonthCategories, setOtherMonthCategories] = useState<TxFormCategoryGroup[] | null>(null);

  useEffect(() => {
    if (txMonth === currentMonth) {
      setOtherMonthCategories(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/budget/month/${txMonth}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { categories?: TxFormCategoryGroup[] } | null) => {
        if (!cancelled) setOtherMonthCategories(data?.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setOtherMonthCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [txMonth, currentMonth]);

  const categoryGroups: TxFormCategoryGroup[] =
    txMonth === currentMonth
      ? budgetData?.[currentMonth]?.categories ?? []
      : otherMonthCategories ?? [];



  // when editing, initialize category from existing transaction
  useEffect(() => {
    if (mode === "edit" && initialData?.category) {
      // Ready to Assign is not in categoryGroups — preserve it as-is
      if (initialData.category === "Ready to Assign" || initialData.category_group === "Ready to Assign") {
        setSelectedGroup("Ready to Assign");
        setSelectedItem("");
        return;
      }
      const group = categoryGroups.find((catGroup) =>
        catGroup.categoryItems.some(
          (item) => item.name === initialData.category
        )
      );

      if (group) {
        setSelectedGroup(group.name);
        setSelectedItem(initialData.category);
      }
      // If not found in categoryGroups, keep the initialData values (set during useState init)
    }
  }, [mode, initialData, categoryGroups]);

  // cross-type transfer → default to "Credit Card Payments / <Card>"
  useEffect(() => {
    if (crossTypeTransfer && thisAccount && otherAccount) {
      const creditAccount =
        thisAccount.type === "credit" ? thisAccount : otherAccount;
      setSelectedGroup("Credit Card Payments");
      setSelectedItem(creditAccount.name);
      // Also update categoryInput to show the full label
      setCategoryInput(`Credit Card Payments ▸ ${creditAccount.name}`);
    }
  }, [crossTypeTransfer, thisAccount, otherAccount]);

  // Autofocus for “excely” feel
  useEffect(() => {
    if (!autoFocus) return;

    if (newPayeeMode && payeeSelectRef.current instanceof HTMLInputElement) {
      payeeSelectRef.current.focus();
      return;
    }
    if (payeeSelectRef.current instanceof HTMLSelectElement) {
      payeeSelectRef.current.focus();
      return;
    }
    if (dateRef.current) {
      dateRef.current.focus();
    }
  }, [autoFocus, newPayeeMode]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        onCancel?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  // Autofocus when starting "Add New Category"
  useEffect(() => {
    if (newCategoryMode && newCategoryInputRef.current) {
      // Small timeout ensures element has rendered
      setTimeout(() => newCategoryInputRef.current?.focus(), 10);
    }
  }, [newCategoryMode]);

  // Autofocus when "Add New Category Group" is selected
  useEffect(() => {
    if (newCategoryGroupIsNew && newCategoryGroupInputRef.current) {
      setTimeout(() => newCategoryGroupInputRef.current?.focus(), 10);
    }
  }, [newCategoryGroupIsNew]);


  // Get payees from saved payees table
  const allPayees = savedPayees.map((p) => p.name).filter((n) => typeof n === "string" && n.trim() !== "");

  const transferTargets = accounts.filter((a) => a.id !== accountId);



  const getPreviewLabel = (targetName: string) => {
    if (!thisAccount) return targetName;
    const other = accounts.find((a) => a.name === targetName);
    if (!other) return targetName;

    const isThisCredit = thisAccount.type === "credit";
    const isOtherCredit = other.type === "credit";
    const amt = parseFloat(amount || "0");
    const isNeg = isNegative;

    if (!amt || Number.isNaN(amt)) return `To/From: ${targetName}`;

    if (isNeg) {
      if (isThisCredit) return `Transfer to ${targetName}`;
      return isOtherCredit
        ? `Payment to ${targetName}`
        : `Transfer to ${targetName}`;
    } else {
      if (isThisCredit)
        return isOtherCredit
          ? `Transfer from ${targetName}`
          : `Payment from ${targetName}`;
      return `Transfer from ${targetName}`;
    }
  };

  // On selecting a real (non-transfer) payee while adding a new transaction,
  // prefill the category from that payee's most recent transaction — mirrors
  // YNAB's payee autofill. Never runs in edit mode, so changing a payee on
  // an existing transaction never clobbers its already-set category.
  const applyPayeeAutofillCategory = (name: string) => {
    if (isEdit) return;
    const match = findLastCategoryForPayee(accounts, name);
    if (!match) {
      setSelectedGroup("");
      setSelectedItem("");
      setCategoryInput("");
      return;
    }
    if (match.category === "Ready to Assign") {
      setSelectedGroup("Ready to Assign");
      setSelectedItem("");
      setCategoryInput("Ready to Assign");
      return;
    }
    setSelectedGroup(match.categoryGroup ?? "");
    setSelectedItem(match.category);
    setCategoryInput(
      match.categoryGroup ? `${match.categoryGroup} ▸ ${match.category}` : match.category
    );
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // Close new category mode if it's open, otherwise cancel the form
      if (newCategoryMode) {
        setNewCategoryMode(false);
        setNewCategoryName("");
        setNewCategoryGroupIsNew(false);
        setNewCategoryGroupName("");
      } else {
        onCancel?.();
      }
    }
  };

  // Calculate if category is required (outside handleSubmit so it can be used in render)
  const needsCategory =
    !selectedPayeeAccountName &&
    !transferPayee &&
    !sameTypeTransfer &&
    selectedGroup !== "Ready to Assign" &&
    (!selectedGroup || !selectedItem) &&
    !newCategoryMode;

  const handleSubmit = async () => {
    const payeeName = selectedPayeeAccountName || transferPayee || payeeInput.trim();

    let groupName = selectedGroup;
    let itemName = selectedItem;

    // If we're creating a new category, override from the "new" fields
    if (newCategoryMode) {
      const catName = newCategoryName.trim();
      const newGroup = newCategoryGroupName.trim();

      if (!catName) {
        return; // need a category name
      }

      if (newCategoryGroupIsNew) {
        if (!newGroup) return; // need a group name
        groupName = newGroup;
      } else {
        // must have chosen an existing group
        if (!groupName && newGroup) {
          groupName = newGroup;
        }
        if (!groupName) return;
      }

      itemName = catName;
    }


    const thisAccount = accounts.find((a) => a.id === accountId);
    const otherAccount = accounts.find((a) => a.name === payeeName);
    const isSameType =
      thisAccount && otherAccount && thisAccount.type === otherAccount.type;

    const isTransfer = Boolean(otherAccount);
    if (isTransfer) {
      groupName = "";
      itemName = "";
    }

    // Basic validation
    if (
      !amount ||
      parseFloat(amount) === 0 ||
      !payeeName ||
      (!isTransfer &&
        !isSameType &&
        groupName !== "Ready to Assign" &&
        (!itemName || !groupName))
    ) {
      return;
    }

    // Resolves a group/item name pair to the category_item's stable UUID —
    // the canonical FK the budget calc engine actually reads. Creates the
    // item first if it doesn't exist yet (e.g. "new category" mode).
    const resolveCategoryItemId = async (
      resolveGroupName: string | null,
      resolveItemName: string | null
    ): Promise<string | null> => {
      if (!resolveGroupName || !resolveItemName || resolveGroupName === "Ready to Assign") {
        return null;
      }
      const groupId = getGroupIdByName(resolveGroupName);
      if (!groupId) return null;
      const existingId = getItemIdByName(resolveGroupName, resolveItemName);
      if (existingId) return existingId;
      return addItemToCategory(groupId, resolveItemName);
    };

    const balance = (isNegative ? -1 : 1) * Number(amount);

    const payeeLabel = (() => {
      if (!thisAccount || !otherAccount) return payeeName;

      const isThisCredit = thisAccount.type === "credit";
      const isOtherCredit = otherAccount.type === "credit";

      if (balance < 0) {
        if (isThisCredit) return `Transfer to ${otherAccount.name}`;
        return isOtherCredit
          ? `Payment to ${otherAccount.name}`
          : `Transfer to ${otherAccount.name}`;
      } else {
        if (isThisCredit)
          return isOtherCredit
            ? `Transfer from ${otherAccount.name}`
            : `Payment from ${otherAccount.name}`;
        return `Transfer from ${otherAccount.name}`;
      }
    })();

    // If transfer to a credit card, force category to card payment
    const isCreditPayment = isTransfer && otherAccount?.type === "credit";
    const effectiveGroup = isCreditPayment ? "Credit Card Payments" : groupName;
    const effectiveItem = isCreditPayment ? otherAccount!.name : itemName;

    const isReadyToAssign = effectiveGroup === "Ready to Assign";

    const mainCategoryItemId =
      isTransfer && !isCreditPayment ? null : await resolveCategoryItemId(effectiveGroup, effectiveItem);

    const transactionData = {
      date,
      payee: payeeLabel,
      category: isTransfer && !isCreditPayment ? null : isReadyToAssign ? effectiveGroup : effectiveItem || null,
      // for anything that's not "Ready to Assign", store the group
      category_group: isTransfer && !isCreditPayment ? null : isReadyToAssign ? null : effectiveGroup || null,
      category_item_id: mainCategoryItemId,
      balance,
      cleared,
    };

    // Save payee to database if it's not a transfer
    if (!isTransfer) {
      await upsertPayee(payeeName);
    }

    if (isEdit && initialData) {
      await editTransaction(accountId, initialData.id, transactionData);

      const matchMirror = accounts.find((acc) =>
        acc.transactions.some(
          (t) =>
            t.date === initialData.date &&
            t.balance === -initialData.balance &&
            t.category === initialData.category &&
            t.payee?.includes(thisAccount?.name ?? "")
        )
      );

      if (matchMirror) {
        const mirrored = matchMirror.transactions.find(
          (t) =>
            t.date === initialData.date &&
            t.balance === -initialData.balance &&
            t.category === initialData.category &&
            t.payee?.includes(thisAccount?.name ?? "")
        );
        if (mirrored) {
          await deleteTransaction(matchMirror.id, mirrored.id);
        }
      }

      if (otherAccount) {
        const isThisCredit = thisAccount.type === "credit";
        const isOtherCredit = otherAccount.type === "credit";

        const mirrorPayee = (() => {
          if (balance < 0) {
            if (isOtherCredit) {
              return isThisCredit
                ? `Transfer from ${thisAccount.name}`
                : `Payment from ${thisAccount.name}`;
            }
            return `Transfer from ${thisAccount.name}`;
          } else {
            if (isOtherCredit) {
              return `Transfer to ${thisAccount.name}`;
            }
            return isThisCredit
              ? `Payment to ${thisAccount.name}`
              : `Transfer to ${thisAccount.name}`;
          }
        })();

        const mirrorCategoryItemId = isOtherCredit
          ? await resolveCategoryItemId("Credit Card Payments", otherAccount.name)
          : effectiveItem
            ? await resolveCategoryItemId(effectiveGroup, effectiveItem)
            : null;

        await addTransaction(otherAccount.id, {
          date,
          payee: mirrorPayee,
          category: isOtherCredit ? otherAccount.name : effectiveItem || null,
          category_group: isOtherCredit ? "Credit Card Payments" : (effectiveItem ? effectiveGroup : null),
          category_item_id: mirrorCategoryItemId,
          balance: -balance,
        });
      }
    } else {
      // Add mode - use addTransactionWithMirror for transfers
      if (otherAccount) {
        const isThisCredit = thisAccount.type === "credit";
        const isOtherCredit = otherAccount.type === "credit";

        const mirrorPayee = (() => {
          if (balance < 0) {
            if (isOtherCredit) {
              return isThisCredit
                ? `Transfer from ${thisAccount.name}`
                : `Payment from ${thisAccount.name}`;
            }
            return `Transfer from ${thisAccount.name}`;
          } else {
            if (isOtherCredit) {
              return `Transfer to ${thisAccount.name}`;
            }
            return isThisCredit
              ? `Payment to ${thisAccount.name}`
              : `Transfer to ${thisAccount.name}`;
          }
        })();

        const mirrorCategoryItemId = isOtherCredit
          ? await resolveCategoryItemId("Credit Card Payments", otherAccount.name)
          : effectiveItem
            ? await resolveCategoryItemId(effectiveGroup, effectiveItem)
            : null;

        const mirrorTransactionData = {
          date,
          payee: mirrorPayee,
          category: isOtherCredit ? otherAccount.name : effectiveItem || null,
          category_group: isOtherCredit ? "Credit Card Payments" : (effectiveItem ? effectiveGroup : null),
          category_item_id: mirrorCategoryItemId,
          balance: -balance,
        };

        await addTransactionWithMirror(accountId, transactionData, otherAccount.id, mirrorTransactionData);
      } else {
        // Normal single transaction
        addTransaction(accountId, transactionData);
      }
    }

    // Transactions affect activity/available/RTA in BudgetContext's separately
    // cached view, which never hears about AccountContext mutations on its
    // own — force a refetch so the budget table doesn't show stale numbers.
    invalidateAll();

    onSave?.();
    setTransferPayee("");
    setPayeeInput("");
    setSelectedPayeeAccountName(null);
    setSelectedGroup("");
    setSelectedItem("");
    setCategoryInput("");
    setAmount("");

    setNewCategoryMode(false);
    setNewCategoryName("");
    setNewCategoryGroupIsNew(false);
    setNewCategoryGroupName("");

  };

  // PAYEE suggestions: accounts (transfers) + saved payees
  const payeeSuggestions = [
    ...transferTargets.map((acc) => ({
      type: "account" as const,
      accountName: acc.name,
      label: getPreviewLabel(acc.name), // e.g. "Payment to Amex"
    })),
    ...allPayees.map((p) => ({
      type: "payee" as const,
      accountName: null,
      label: p, // normal payee string
    })),
  ].filter((s) =>
    isTypingPayee && payeeInput
      ? s.label.toLowerCase().includes(payeeInput.toLowerCase())
      : true
  );

  // CATEGORY suggestions: "Group ▸ Item"
  const categorySuggestions = categoryGroups
    .flatMap((group) =>
      group.categoryItems.map((item) => ({
        groupName: group.name,
        itemName: item.name,
        label: `${group.name} ▸ ${item.name}`,
      }))
    )
    .filter((s) =>
      isTypingCategory && categoryInput
        ? s.label.toLowerCase().includes(categoryInput.toLowerCase())
        : true
    );




  return (
    <tr
      ref={formRef}
      data-cy={
        isEdit ? "transaction-form-row-edit" : "transaction-form-row-add"
      }
      data-mode={isEdit ? "edit" : "add"}
      className="bg-ledger-50/30 dark:bg-ledger-950/30 hover:bg-ledger-50/50 dark:hover:bg-ledger-950/50 transition-colors duration-150 border-b border-slate-200 dark:border-slate-700"
    >
      {/* Empty checkbox cell to match the checkbox column */}
      <td className="px-2 py-2 border-r border-slate-200 dark:border-slate-700"></td>
      {/* Empty approved cell to match the approved column */}
      <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-700"></td>
      {/* Cleared toggle */}
      <td
        className="px-3 py-2 text-center border-r border-slate-200 dark:border-slate-700 cursor-pointer"
        onClick={() => setCleared((prev) => !prev)}
        title={cleared ? "Cleared — click to uncleared" : "Uncleared — click to clear"}
      >
        {cleared
          ? <CheckCircle2 className="h-4 w-4 text-ledger-500 dark:text-ledger-400 mx-auto" />
          : <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
        }
      </td>
      <td className="px-4 py-2 border-r border-slate-200 dark:border-slate-700">
        <Input
          ref={dateRef}
          data-cy="tx-date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-9 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus-visible:ring-ledger-500 dark:focus-visible:ring-ledger-600 dark:[color-scheme:dark]"
        />
      </td>

      <td className="px-4 py-2 border-r border-slate-200 relative overflow-visible">
        <div className="relative">
          <Input
            ref={payeeInputRef}
            data-cy="tx-payee-select"
            type="text"
            placeholder="Select or type payee..."
            className="h-9 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus-visible:ring-ledger-500 dark:focus-visible:ring-ledger-600"
            value={payeeInput}
            onChange={(e) => {
              setPayeeInput(e.target.value);
              setIsTypingPayee(true);
              setPayeeSelectedIndex(0);
              if (payeeInputRef.current) {
                const rect = payeeInputRef.current.getBoundingClientRect();
                setPayeeDropdownPos(getDropdownPosition(rect));
              }
              setPayeeDropdownOpen(true);
            }}
            onFocus={() => {
              if (payeeInputRef.current) {
                const rect = payeeInputRef.current.getBoundingClientRect();
                setPayeeDropdownPos(getDropdownPosition(rect));
              }
              setPayeeDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (payeeSuggestions.length > 0) {
                  const match = payeeSuggestions[payeeSelectedIndex] || payeeSuggestions[0];
                  setIsTypingPayee(false);
                  if (match.type === "account") {
                    setTransferPayee(match.accountName);
                    setSelectedPayeeAccountName(match.accountName);
                    const acc = accounts.find((a) => a.name === match.accountName);
                    if (acc?.type === "credit") {
                      setSelectedGroup("Credit Card Payments");
                      setSelectedItem(acc.name);
                      setCategoryInput(acc.name);
                      setIsTypingCategory(false);
                    } else {
                      setSelectedGroup("");
                      setSelectedItem("");
                      setCategoryInput("");
                    }
                  } else {
                    setTransferPayee(match.label);
                    setSelectedPayeeAccountName(null);
                    applyPayeeAutofillCategory(match.label);
                  }
                  setPayeeInput(match.label);
                  setPayeeDropdownOpen(false);
                } else {
                  // Create new payee
                  setTransferPayee(payeeInput);
                  setSelectedPayeeAccountName(null);
                  setPayeeDropdownOpen(false);
                }
                void handleSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setPayeeDropdownOpen(false);
                onCancel?.();
              } else if (e.key === "ArrowDown" && payeeDropdownOpen) {
                e.preventDefault();
                setPayeeSelectedIndex((prev) => Math.min(prev + 1, payeeSuggestions.length - 1));
              } else if (e.key === "ArrowUp" && payeeDropdownOpen) {
                e.preventDefault();
                setPayeeSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === "ArrowDown" && !payeeDropdownOpen) {
                e.preventDefault();
                setPayeeDropdownOpen(true);
                setPayeeSelectedIndex(0);
              }
            }}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => {
                setPayeeDropdownOpen(false);
              }, 200);
            }}
          />
          {payeeDropdownOpen && (
            <div
              className="fixed z-[9999] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl dark:shadow-2xl max-h-60 overflow-y-auto"
              data-cy="payee-dropdown"
              style={{
                ...(payeeDropdownPos.top !== null
                  ? { top: `${payeeDropdownPos.top}px` }
                  : { bottom: `${payeeDropdownPos.bottom}px` }),
                left: `${payeeDropdownPos.left}px`,
                width: `${payeeDropdownPos.width}px`,
              }}
            >
              {payeeSuggestions.length === 0 ? (
                <div
                  className="px-3 py-2 hover:bg-ledger-50 dark:hover:bg-ledger-950 cursor-pointer text-sm text-slate-700 dark:text-slate-300"
                  onClick={() => {
                    setTransferPayee(payeeInput);
                    setSelectedPayeeAccountName(null);
                    setPayeeDropdownOpen(false);
                  }}
                >
                  ➕ Create: {payeeInput || "New Payee"}
                </div>
              ) : (
                <>
                  {transferTargets.some(t => 
                    payeeSuggestions.some(s => s.type === "account" && s.accountName === t.name)
                  ) && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      Payments & Transfers
                    </div>
                  )}
                  {payeeSuggestions
                    .filter((s) => s.type === "account")
                    .map((suggestion) => {
                      const actualIndex = payeeSuggestions.findIndex((s) => s.accountName === suggestion.accountName && s.type === "account");
                      const isSelected = actualIndex === payeeSelectedIndex;
                      const acc = accounts.find((a) => a.name === suggestion.accountName);
                      return (
                        <div
                          key={suggestion.accountName}
                          className={`px-3 py-2 cursor-pointer ${
                            isSelected
                              ? "bg-ledger-100 dark:bg-ledger-900"
                              : "hover:bg-ledger-50 dark:hover:bg-ledger-950"
                          }`}
                          onClick={() => {
                            setIsTypingPayee(false);
                            setTransferPayee(suggestion.accountName!);
                            setSelectedPayeeAccountName(suggestion.accountName!);
                            if (acc?.type === "credit") {
                              setSelectedGroup("Credit Card Payments");
                              setSelectedItem(acc.name);
                              setCategoryInput(acc.name);
                              setIsTypingCategory(false);
                            } else {
                              setSelectedGroup("");
                              setSelectedItem("");
                              setCategoryInput("");
                            }
                            setPayeeInput(suggestion.label);
                            setPayeeDropdownOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm ${isSelected ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                              {suggestion.label}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                acc?.type === "credit"
                                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                              }`}>
                                {acc?.type === "credit" ? "credit" : "checking"}
                              </span>
                              <span className={`text-[11px] font-mono ${(acc?.balance ?? 0) < 0 ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                                {acc ? acc.balance.toLocaleString("en-US", { style: "currency", currency: "USD" }) : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {payeeSuggestions.some((s) => s.type === "payee") && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      Saved Payees
                    </div>
                  )}
                  {payeeSuggestions
                    .filter((s) => s.type === "payee")
                    .map((suggestion) => {
                      const actualIndex = payeeSuggestions.findIndex((s) => s.label === suggestion.label && s.type === "payee");
                      const isSelected = actualIndex === payeeSelectedIndex;
                      const savedPayee = savedPayees.find((p) => p.name === suggestion.label);
                      return (
                        <div
                          key={suggestion.label}
                          className={`px-3 py-2 cursor-pointer ${
                            isSelected
                              ? "bg-ledger-100 dark:bg-ledger-900"
                              : "hover:bg-ledger-50 dark:hover:bg-ledger-950"
                          }`}
                          onClick={() => {
                            setIsTypingPayee(false);
                            setTransferPayee(suggestion.label);
                            setSelectedPayeeAccountName(null);
                            applyPayeeAutofillCategory(suggestion.label);
                            setPayeeInput(suggestion.label);
                            setPayeeDropdownOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm ${isSelected ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                              {suggestion.label}
                            </span>
                            {savedPayee?.last_used_at && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                                {formatDistanceToNow(parseISO(savedPayee.last_used_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {payeeInput && (
                    <div
                      className="px-3 py-2 hover:bg-ledger-50 dark:hover:bg-ledger-950 cursor-pointer text-sm border-t border-slate-200 dark:border-slate-700 text-ledger-600 dark:text-ledger-400 font-medium"
                      onClick={() => {
                        setTransferPayee(payeeInput);
                        setSelectedPayeeAccountName(null);
                        setPayeeDropdownOpen(false);
                      }}
                    >
                      ➕ Create: {payeeInput}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-2 border-r border-slate-200 dark:border-slate-700 relative overflow-visible">
        {/* Hidden group value for tests / debugging */}
        <input
          type="hidden"
          data-cy="tx-group-select"
          value={selectedGroup}
          readOnly
        />

        {newCategoryMode ? (
          <div className="flex flex-col gap-2">
            {/* New category name */}
            <Input
              data-cy="tx-new-category-input"
              ref={newCategoryInputRef}
              type="text"
              className="h-9"
              placeholder="New Category Name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sameTypeTransfer}
            />

            {/* Choose existing group or 'Add New Category Group...' */}
            <select
              data-cy="tx-category-group-select"
              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ledger-500 dark:focus:ring-ledger-400 focus:border-transparent bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              value={
                newCategoryGroupIsNew
                  ? "__new_group__"
                  : selectedGroup || ""
              }
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__new_group__") {
                  setNewCategoryGroupIsNew(true);
                  setSelectedGroup("");
                  setNewCategoryGroupName("");
                } else {
                  setNewCategoryGroupIsNew(false);
                  setSelectedGroup(value);
                  setNewCategoryGroupName("");
                }
              }}
              onKeyDown={handleKeyDown}
              disabled={sameTypeTransfer}
            >
              <option value="">Select Category Group</option>
              <option value="__new_group__">➕ Add New Category Group...</option>
              {categoryGroups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>

            {/* New group name input (only when creating a group) */}
            {newCategoryGroupIsNew && (
              <Input
                data-cy="tx-new-category-group-input"
                ref={newCategoryGroupInputRef}
                type="text"
                className="h-9"
                placeholder="New Category Group Name"
                value={newCategoryGroupName}
                onChange={(e) => setNewCategoryGroupName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sameTypeTransfer}
              />
            )}

            {/* Tiny cancel back to normal dropdown */}
            <button
              type="button"
              className="self-start text-xs text-slate-500 dark:text-slate-400 hover:text-ledger-600 dark:hover:text-ledger-400 transition-colors"
              onClick={() => {
                setNewCategoryMode(false);
                setNewCategoryName("");
                setNewCategoryGroupIsNew(false);
                setNewCategoryGroupName("");
              }}
            >
              Cancel new category
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              ref={categoryInputRef}
              data-cy="tx-item-select"
              type="text"
              placeholder="Select or type category..."
              className={cn(
                "h-9 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus-visible:ring-ledger-500 dark:focus-visible:ring-ledger-600",
                needsCategory && "border-red-400 focus-visible:ring-red-500"
              )}
              value={categoryInput}
              onChange={(e) => {
                setCategoryInput(e.target.value);
                setIsTypingCategory(true);
                setCategorySelectedIndex(0);
                // Only clear payee if it was a credit card payment and category changed
                if (isTypingCategory && selectedPayeeAccountName) {
                  const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                  if (acc?.type === "credit") {
                    setPayeeInput("");
                    setTransferPayee("");
                    setSelectedPayeeAccountName(null);
                  }
                }
                if (categoryInputRef.current) {
                  const rect = categoryInputRef.current.getBoundingClientRect();
                  setCategoryDropdownPos(getDropdownPosition(rect));
                }
                setCategoryDropdownOpen(true);
              }}
              onFocus={() => {
                if (categoryInputRef.current) {
                  const rect = categoryInputRef.current.getBoundingClientRect();
                  setCategoryDropdownPos(getDropdownPosition(rect));
                }
                setCategoryDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (categorySuggestions.length > 0) {
                    const match = categorySuggestions[categorySelectedIndex] || categorySuggestions[0];
                    setIsTypingCategory(false);
                    setSelectedGroup(match.groupName);
                    setSelectedItem(match.itemName);
                    setCategoryInput(match.label);
                    if (match.groupName === "Credit Card Payments") {
                      const acc = accounts.find((a) => a.name === match.itemName && a.type === "credit");
                      if (acc) {
                        setTransferPayee(acc.name);
                        setSelectedPayeeAccountName(acc.name);
                        setPayeeInput(getPreviewLabel(acc.name));
                        setIsTypingPayee(false);
                      }
                    } else if (selectedPayeeAccountName) {
                      // Check if current payee is a credit card - if so, clear it since category doesn't match
                      const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                      if (acc?.type === "credit") {
                        setTransferPayee("");
                        setSelectedPayeeAccountName(null);
                        setPayeeInput("");
                      }
                    }
                    setCategoryDropdownOpen(false);
                  } else if (categoryInput.toLowerCase() === "ready to assign") {
                    setSelectedGroup("Ready to Assign");
                    setSelectedItem("");
                    setCategoryInput("Ready to Assign");
                    setCategoryDropdownOpen(false);
                  } else {
                    // Start creating new category
                    setNewCategoryMode(true);
                    setNewCategoryName(categoryInput);
                    setCategoryDropdownOpen(false);
                  }
                  void handleSubmit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCategoryDropdownOpen(false);
                  onCancel?.();
                } else if (e.key === "ArrowDown" && categoryDropdownOpen) {
                  e.preventDefault();
                  setCategorySelectedIndex((prev) => Math.min(prev + 1, categorySuggestions.length - 1));
                } else if (e.key === "ArrowUp" && categoryDropdownOpen) {
                  e.preventDefault();
                  setCategorySelectedIndex((prev) => Math.max(prev - 1, 0));
                } else if (e.key === "ArrowDown" && !categoryDropdownOpen) {
                  e.preventDefault();
                  setCategoryDropdownOpen(true);
                  setCategorySelectedIndex(0);
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  setCategoryDropdownOpen(false);
                }, 200);
              }}
              disabled={sameTypeTransfer}
            />
            {categoryDropdownOpen && !sameTypeTransfer && (
              <div
                className="fixed z-[9999] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl dark:shadow-2xl max-h-60 overflow-y-auto"
                data-cy="category-dropdown"
                style={{
                  ...(categoryDropdownPos.top !== null
                    ? { top: `${categoryDropdownPos.top}px` }
                    : { bottom: `${categoryDropdownPos.bottom}px` }),
                  left: `${categoryDropdownPos.left}px`,
                  width: `${categoryDropdownPos.width}px`,
                }}
              >
                {categorySuggestions.length === 0 && !categoryInput.toLowerCase().includes("ready to assign") ? (
                  <div
                    className="px-3 py-2 hover:bg-ledger-50 dark:hover:bg-ledger-950 cursor-pointer text-sm text-ledger-600 dark:text-ledger-400 font-medium"
                    onClick={() => {
                      setNewCategoryMode(true);
                      setNewCategoryName(categoryInput);
                      setCategoryDropdownOpen(false);
                    }}
                  >
                    ➕ Create New Category: {categoryInput || "..."}
                  </div>
                ) : (
                  <>
                    {(categoryInput === "" || "ready to assign".includes(categoryInput.toLowerCase())) && (
                      <div
                        className={`px-3 py-2 cursor-pointer text-sm font-semibold ${
                          categorySelectedIndex === 0
                            ? "bg-ledger-100 dark:bg-ledger-900 text-slate-900 dark:text-slate-100"
                            : "hover:bg-ledger-50 dark:hover:bg-ledger-950 text-slate-700 dark:text-slate-300"
                        }`}
                        onClick={() => {
                          setSelectedGroup("Ready to Assign");
                          setSelectedItem("");
                          setCategoryInput("Ready to Assign");
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        Ready to Assign
                      </div>
                    )}
                    {categorySuggestions.map((suggestion, idx) => {
                      const prevGroup = idx > 0 ? categorySuggestions[idx - 1].groupName : null;
                      const showHeader = suggestion.groupName !== prevGroup;
                      // Index in the rendered list (accounting for "Ready to Assign" if visible)
                      const readyToAssignOffset = (categoryInput === "" || "ready to assign".includes(categoryInput.toLowerCase())) ? 1 : 0;
                      const itemIndex = readyToAssignOffset + idx;
                      const isSelected = itemIndex === categorySelectedIndex;
                      const catGroup = categoryGroups.find((g) => g.name === suggestion.groupName);
                      const catItem = catGroup?.categoryItems.find((i) => i.name === suggestion.itemName);
                      const available = catItem?.available ?? 0;
                      return (
                        <div key={`${suggestion.groupName}::${suggestion.itemName}`}>
                          {showHeader && (
                            <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                              {suggestion.groupName}
                            </div>
                          )}
                          <div
                            className={`px-3 py-2 cursor-pointer pl-6 ${
                              isSelected
                                ? "bg-ledger-100 dark:bg-ledger-900"
                                : "hover:bg-ledger-50 dark:hover:bg-ledger-950"
                            }`}
                            onClick={() => {
                              setIsTypingCategory(false);
                              setSelectedGroup(suggestion.groupName);
                              setSelectedItem(suggestion.itemName);
                              setCategoryInput(suggestion.label);
                              if (suggestion.groupName === "Credit Card Payments") {
                                const acc = accounts.find((a) => a.name === suggestion.itemName && a.type === "credit");
                                if (acc) {
                                  setTransferPayee(acc.name);
                                  setSelectedPayeeAccountName(acc.name);
                                  setPayeeInput(getPreviewLabel(acc.name));
                                  setIsTypingPayee(false);
                                }
                              } else if (selectedPayeeAccountName) {
                                // Check if current payee is a credit card - if so, clear it since category doesn't match
                                const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                                if (acc?.type === "credit") {
                                  setTransferPayee("");
                                  setSelectedPayeeAccountName(null);
                                  setPayeeInput("");
                                }
                              }
                              setCategoryDropdownOpen(false);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm ${isSelected ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                                {suggestion.itemName}
                              </span>
                              <span className={`text-[11px] font-mono flex-shrink-0 ${
                                available < 0
                                  ? "text-red-500 dark:text-red-400"
                                  : available === 0
                                    ? "text-slate-400 dark:text-slate-500"
                                    : "text-ledger-600 dark:text-ledger-400"
                              }`}>
                                {available.toLocaleString("en-US", { style: "currency", currency: "USD" })} left
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {categoryInput && (
                      <div
                        className="px-3 py-2 hover:bg-ledger-50 dark:hover:bg-ledger-950 cursor-pointer text-sm border-t border-slate-200 dark:border-slate-700 text-ledger-600 dark:text-ledger-400 font-medium"
                        onClick={() => {
                          setNewCategoryMode(true);
                          setNewCategoryName(categoryInput);
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        ➕ Create New Category: {categoryInput}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {needsCategory && !categoryDropdownOpen && (
          <></>
        )}
      </td>


      <td className="px-4 py-2 border-r border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Button
            data-cy="tx-sign-toggle"
            data-state={isNegative ? "negative" : "positive"}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`h-9 px-3 ${isNegative
              ? "text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
              : "text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-700 dark:hover:text-green-300"
              }`}
            aria-pressed={isNegative}
            aria-label={isNegative ? "Outflow" : "Inflow"}
          >
            {isNegative ? "Outflow" : "Inflow"}
          </Button>
          <Input
            ref={amountInputRef}
            data-cy="tx-amount-input"
            type="text"
            inputMode="decimal"
            className="h-9 text-right font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus-visible:ring-ledger-500 dark:focus-visible:ring-ledger-600"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/,/g, ""))}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
          />
          <Button
            data-cy="tx-submit"
            onClick={() => void handleSubmit()}
            size="sm"
            className="h-9"
            disabled={needsCategory || !payeeInput.trim() || !amount || parseFloat(amount) === 0}
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}
