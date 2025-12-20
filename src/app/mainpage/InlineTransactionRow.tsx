import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { useAccountContext, Transaction } from "@/app/context/AccountContext";
import { format } from "date-fns";
import { supabase } from "@/utils/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus } from "lucide-react";

export default function InlineTransactionRow({
  accountId,
  mode = "add",
  initialData,
  onCancel,
  onSave,
  autoFocus = false,
}: {
  accountId: number;
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
    refreshAccounts,
    addCategoryGroup,
    addItemToCategory,
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

  // category group + item (backing state)
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedItem, setSelectedItem] = useState("");

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
  const [newPayeeMode, setNewPayeeMode] = useState(false);
  const [newPayeeName, setNewPayeeName] = useState("");
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
  const [categoryInput, setCategoryInput] = useState(
    isEdit && initialData?.category ? initialData.category : ""
  );
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isTypingPayee, setIsTypingPayee] = useState(false);
  const [isTypingCategory, setIsTypingCategory] = useState(false);




  const formRef = useRef<HTMLTableRowElement>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const payeeSelectRef =
    useRef<HTMLSelectElement | HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryGroupInputRef = useRef<HTMLInputElement | null>(null);
  const payeeTypeaheadRef = useRef({ buffer: "", lastTime: 0 });
  const categoryTypeaheadRef = useRef({ buffer: "", lastTime: 0 });
  const payeeInputRef = useRef<HTMLInputElement | null>(null);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);
  const [payeeDropdownPos, setPayeeDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [categoryDropdownPos, setCategoryDropdownPos] = useState({ top: 0, left: 0, width: 0 });




  const thisAccount = accounts.find((a) => a.id === accountId);
  const otherAccount = accounts.find((a) => a.name === transferPayee);

  const sameTypeTransfer =
    thisAccount && otherAccount && thisAccount.type === otherAccount.type;
  const crossTypeTransfer =
    thisAccount && otherAccount && thisAccount.type !== otherAccount.type;

  const categoryGroups = budgetData[currentMonth].categories;



  // when editing, initialize category from existing transaction
  useEffect(() => {
    if (mode === "edit" && initialData?.category) {
      const group = categoryGroups.find((catGroup) =>
        catGroup.categoryItems.some(
          (item) => item.name === initialData.category
        )
      );

      if (group) {
        setSelectedGroup(group.name);
        setSelectedItem(initialData.category);
      } else {
        setSelectedGroup("");
        setSelectedItem("");
      }
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
      !payeeName ||
      (!isTransfer &&
        !isSameType &&
        groupName !== "Ready to Assign" &&
        (!itemName || !groupName))
    ) {
      return;
    }

    if (groupName && groupName !== "Ready to Assign" && itemName) {
      addItemToCategory(groupName, {
        name: itemName,
        assigned: 0,
        activity: 0,
        available: 0,
      });
    }



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

    const transactionData = {
      date,
      payee: payeeLabel,
      category: isTransfer && !isCreditPayment ? null : isReadyToAssign ? effectiveGroup : effectiveItem || null,
      // for anything that's not "Ready to Assign", store the group
      category_group: isTransfer && !isCreditPayment ? null : isReadyToAssign ? null : effectiveGroup || null,
      balance,
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

        await addTransaction(otherAccount.id, {
          date,
          payee: mirrorPayee,
          category: isOtherCredit ? otherAccount.name : effectiveItem || null,
          category_group: isOtherCredit ? "Credit Card Payments" : (effectiveItem ? effectiveGroup : null),
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

        const mirrorTransactionData = {
          date,
          payee: mirrorPayee,
          category: isOtherCredit ? otherAccount.name : effectiveItem || null,
          category_group: isOtherCredit ? "Credit Card Payments" : (effectiveItem ? effectiveGroup : null),
          balance: -balance,
        };

        await addTransactionWithMirror(accountId, transactionData, otherAccount.id, mirrorTransactionData);
      } else {
        // Normal single transaction
        addTransaction(accountId, transactionData);
      }
    }

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

  // Build one dropdown: bold group headers, selectable items
  const categorySelectValue =
    selectedGroup === "Ready to Assign"
      ? "RTA::RTA"
      : selectedGroup && selectedItem
        ? `${selectedGroup}::${selectedItem}`
        : "";

  const categoryOptions = [
    { kind: "option" as const, value: "RTA::RTA", label: "Ready to Assign" },
    // NEW: add new category entry at the top
    {
      kind: "option" as const,
      value: "__new_category__",
      label: "➕ Add New Category...",
    },
    ...categoryGroups.flatMap((group) => [
      {
        kind: "header" as const,
        key: `header-${group.name}`,
        label: group.name,
      },
      ...group.categoryItems.map((item) => ({
        kind: "option" as const,
        value: `${group.name}::${item.name}`,
        label: item.name,
      })),
    ]),
  ];

  const payeeTypeaheadOptions = [
    // transfers (accounts)
    ...transferTargets.map((acc) => ({
      value: acc.name,
      label: getPreviewLabel(acc.name),
    })),
    // saved payees (string payee names)
    ...allPayees.map((p) => ({
      value: p,
      label: p,
    })),
  ];

  const categoryTypeaheadOptions = categoryOptions
    .filter(
      (opt) => opt.kind === "option" && opt.value !== "__new_category__"
    )
    .map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));

  const handleTypeahead = (
    e: KeyboardEvent,
    ref: React.MutableRefObject<{ buffer: string; lastTime: number }>,
    options: { value: string; label: string }[],
    onMatch: (value: string) => void
  ) => {
    // Let Enter/Escape/etc be handled elsewhere
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;

    const now = Date.now();
    const timeoutMs = 600; // reset buffer if you pause typing

    let { buffer, lastTime } = ref.current;
    if (now - lastTime > timeoutMs) {
      buffer = e.key;
    } else {
      buffer += e.key;
    }

    ref.current = { buffer, lastTime: now };

    const search = buffer.toLowerCase();
    const match = options.find((opt) =>
      opt.label.toLowerCase().includes(search)
    );

    if (match) {
      e.preventDefault();
      onMatch(match.value);
    }
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
      className="bg-teal-50/30 hover:bg-teal-50/50 transition-colors duration-150 border-b border-slate-200"
    >
      {/* Empty checkbox cell to match the checkbox column */}
      <td className="px-2 py-2 border-r border-slate-200"></td>
      <td className="px-4 py-2 border-r border-slate-200">
        <Input
          ref={dateRef}
          data-cy="tx-date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-9"
        />
      </td>

      <td className="px-4 py-2 border-r border-slate-200 relative overflow-visible">
        <div className="relative">
          <Input
            ref={payeeInputRef}
            data-cy="tx-payee-select"
            type="text"
            placeholder="Select or type payee..."
            className="h-9"
            value={payeeInput}
            onChange={(e) => {
              setPayeeInput(e.target.value);
              setIsTypingPayee(true);
              if (payeeInputRef.current) {
                const rect = payeeInputRef.current.getBoundingClientRect();
                setPayeeDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
              }
              setPayeeDropdownOpen(true);
            }}
            onFocus={() => {
              if (payeeInputRef.current) {
                const rect = payeeInputRef.current.getBoundingClientRect();
                setPayeeDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
              }
              setPayeeDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (payeeSuggestions.length > 0) {
                  const match = payeeSuggestions[0];
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
                    setSelectedGroup("");
                    setSelectedItem("");
                    setCategoryInput("");
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
                // Could add keyboard navigation here
              }
            }}
            onBlur={(e) => {
              // Delay to allow click on dropdown item
              setTimeout(() => {
                setPayeeDropdownOpen(false);
              }, 200);
            }}
          />
          {payeeDropdownOpen && (
            <div
              className="fixed z-[9999] bg-white border border-slate-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
              data-cy="payee-dropdown"
              style={{
                top: `${payeeDropdownPos.top}px`,
                left: `${payeeDropdownPos.left}px`,
                width: `${payeeDropdownPos.width}px`,
                marginTop: '4px'
              }}
            >
              {payeeSuggestions.length === 0 ? (
                <div
                  className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm text-slate-700"
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
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                      Payments & Transfers
                    </div>
                  )}
                  {payeeSuggestions
                    .filter((s) => s.type === "account")
                    .map((suggestion) => (
                      <div
                        key={suggestion.accountName}
                        className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm text-slate-700"
                        onClick={() => {
                          setIsTypingPayee(false);
                          setTransferPayee(suggestion.accountName!);
                          setSelectedPayeeAccountName(suggestion.accountName!);
                          const acc = accounts.find((a) => a.name === suggestion.accountName);
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
                        {suggestion.label}
                      </div>
                    ))}
                  {payeeSuggestions.some((s) => s.type === "payee") && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                      Saved Payees
                    </div>
                  )}
                  {payeeSuggestions
                    .filter((s) => s.type === "payee")
                    .map((suggestion) => (
                      <div
                        key={suggestion.label}
                        className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm text-slate-700"
                        onClick={() => {
                          setIsTypingPayee(false);
                          setTransferPayee(suggestion.label);
                          setSelectedPayeeAccountName(null);
                          setSelectedGroup("");
                          setSelectedItem("");
                          setCategoryInput("");
                          setPayeeInput(suggestion.label);
                          setPayeeDropdownOpen(false);
                        }}
                      >
                        {suggestion.label}
                      </div>
                    ))}
                  {payeeInput && (
                    <div
                      className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm border-t border-slate-200 text-teal-600 font-medium"
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

      <td className="px-4 py-2 border-r border-slate-200 relative overflow-visible">
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
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
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
              className="self-start text-xs text-slate-500 hover:text-teal-600 transition-colors"
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
              className="h-9"
              value={categoryInput}
              onChange={(e) => {
                setCategoryInput(e.target.value);
                setIsTypingCategory(true);
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
                  setCategoryDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
                }
                setCategoryDropdownOpen(true);
              }}
              onFocus={() => {
                if (categoryInputRef.current) {
                  const rect = categoryInputRef.current.getBoundingClientRect();
                  setCategoryDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
                }
                setCategoryDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (categorySuggestions.length > 0) {
                    const match = categorySuggestions[0];
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
                className="fixed z-[9999] bg-white border border-slate-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                data-cy="category-dropdown"
                style={{
                  top: `${categoryDropdownPos.top}px`,
                  left: `${categoryDropdownPos.left}px`,
                  width: `${categoryDropdownPos.width}px`,
                  marginTop: '4px'
                }}
              >
                {categorySuggestions.length === 0 && !categoryInput.toLowerCase().includes("ready to assign") ? (
                  <div
                    className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm text-teal-600 font-medium"
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
                        className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm font-semibold text-slate-700"
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
                      return (
                        <div key={`${suggestion.groupName}::${suggestion.itemName}`}>
                          {showHeader && (
                            <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                              {suggestion.groupName}
                            </div>
                          )}
                          <div
                            className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm pl-6 text-slate-700"
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
                            {suggestion.itemName}
                          </div>
                        </div>
                      );
                    })}
                    {categoryInput && (
                      <div
                        className="px-3 py-2 hover:bg-teal-50 cursor-pointer text-sm border-t border-slate-200 text-teal-600 font-medium"
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
      </td>


      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            data-cy="tx-sign-toggle"
            data-state={isNegative ? "negative" : "positive"}
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`h-9 w-9 ${isNegative
              ? "text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              : "text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
              }`}
            aria-pressed={isNegative}
            aria-label={isNegative ? "Outflow" : "Inflow"}
          >
            {isNegative ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span className="sr-only">{isNegative ? "Outflow" : "Inflow"}</span>
          </Button>
          <Input
            ref={amountInputRef}
            data-cy="tx-amount-input"
            type="number"
            className="h-9 text-right font-mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
          />
          <Button
            data-cy="tx-submit"
            onClick={() => void handleSubmit()}
            size="sm"
            className="h-9"
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}
