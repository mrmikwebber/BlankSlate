import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { useAccountContext, Transaction } from "@/app/context/AccountContext";
import { format } from "date-fns";
import { supabase } from "@/utils/supabaseClient";

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

  const { addTransaction, editTransaction, accounts, deleteTransaction } =
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



  const formRef = useRef<HTMLTableRowElement>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const payeeSelectRef =
    useRef<HTMLSelectElement | HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryInputRef = useRef<HTMLInputElement | null>(null);
  const newCategoryGroupInputRef = useRef<HTMLInputElement | null>(null);



  const thisAccount = accounts.find((a) => a.id === accountId);
  const otherAccount = accounts.find((a) => a.name === transferPayee);

  const sameTypeTransfer =
    thisAccount && otherAccount && thisAccount.type === otherAccount.type;
  const crossTypeTransfer =
    thisAccount && otherAccount && thisAccount.type !== otherAccount.type;

  const categoryGroups = budgetData[currentMonth].categories;

  // Initialize transferPayee to first target if not editing and not set
  useEffect(() => {
    const transferTargets = accounts.filter((a) => a.id !== accountId);
    if (!isEdit && !transferPayee && transferTargets.length > 0) {
      setTransferPayee(transferTargets[0].name);
    }
  }, [isEdit, transferPayee, accounts, accountId]);

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


  const allPayees = Array.from(
    new Set(
      accounts
        .flatMap((acc) => acc.transactions.map((t) => t.payee))
        .filter(Boolean)
    )
  );

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
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };

  const handleSubmit = async () => {
    const payeeName = newPayeeMode ? newPayeeName.trim() : transferPayee;

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

    const isReadyToAssign = groupName === "Ready to Assign";

    const transactionData = {
      date,
      payee: payeeLabel,
      category: isTransfer ? null : isReadyToAssign ? groupName : itemName || null,
      // for anything that's not "Ready to Assign", store the group
      category_group: isTransfer ? null : isReadyToAssign ? null : groupName || null,
      balance,
    };

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
          category: itemName || null,
          balance: -balance,
        });
      }
    } else {
      await addTransaction(accountId, transactionData);

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
          category: itemName || null,
          balance: -balance,
        });
      }
    }

    onSave?.();
    setTransferPayee("");
    setSelectedGroup("");
    setSelectedItem("");
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

  return (
    <tr
      ref={formRef}
      data-cy={
        isEdit ? "transaction-form-row-edit" : "transaction-form-row-add"
      }
      data-mode={isEdit ? "edit" : "add"}
      className="bg-teal-50 transition-colors duration-150"
    >
      <td className="border p-2">
        <input
          ref={dateRef}
          data-cy="tx-date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full p-1 border rounded text-sm"
        />
      </td>

      <td className="border p-2">
        {newPayeeMode ? (
          <input
            ref={payeeSelectRef as React.RefObject<HTMLInputElement>}
            data-cy="tx-new-payee-input"
            type="text"
            placeholder="New Payee Name"
            className="w-full p-1 border rounded text-sm"
            value={newPayeeName}
            onChange={(e) => setNewPayeeName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <select
            ref={payeeSelectRef as React.RefObject<HTMLSelectElement>}
            data-cy="tx-payee-select"
            value={transferPayee}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setNewPayeeMode(true);
                setTransferPayee("");
              } else {
                setTransferPayee(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            className="w-full p-1 border rounded text-sm"
          >
            <optgroup label="Payments & Transfers">
              {transferTargets.map((acc) => (
                <option key={acc.id} value={acc.name}>
                  {getPreviewLabel(acc.name)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Saved Payees">
              <option value="__new__">➕ New Payee...</option>
              {allPayees.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </td>

      <td className="border p-2">
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
            <input
              data-cy="tx-new-category-input"
              ref={newCategoryInputRef}
              type="text"
              className="w-full p-1 border rounded text-sm"
              placeholder="New Category Name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sameTypeTransfer}
            />

            {/* Choose existing group or 'Add New Category Group...' */}
            <select
              data-cy="tx-category-group-select"
              className="w-full p-1 border rounded text-sm"
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
              <input
                data-cy="tx-new-category-group-input"
                ref={newCategoryGroupInputRef}
                type="text"
                className="w-full p-1 border rounded text-sm"
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
              className="self-start text-xs text-gray-500 hover:underline"
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
          <select
            data-cy="tx-item-select"
            className="w-full p-1 border rounded text-sm"
            value={categorySelectValue}
            onChange={(e) => {
              const value = e.target.value;

              if (value === "__new_category__") {
                // switch to "add new category" form
                setNewCategoryMode(true);
                setNewCategoryName("");
                setNewCategoryGroupIsNew(false);
                setNewCategoryGroupName("");
                setSelectedGroup("");
                setSelectedItem("");
                return;
              }

              if (value === "RTA::RTA") {
                setSelectedGroup("Ready to Assign");
                setSelectedItem("");
              } else {
                const [group, item] = value.split("::");
                setSelectedGroup(group);
                setSelectedItem(item);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={sameTypeTransfer}
          >
            <option value="">Select Category</option>
            {categoryOptions.map((opt) =>
              opt.kind === "header" ? (
                <option
                  key={opt.key}
                  value={opt.key}
                  disabled
                  className="font-bold bg-gray-50"
                >
                  {opt.label}
                </option>
              ) : (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              )
            )}
          </select>
        )}
      </td>


      <td className="border p-2">
        <div className="flex items-center gap-2">
          <button
            data-cy="tx-sign-toggle"
            type="button"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`rounded px-2 py-1 font-bold border ${isNegative
              ? "text-red-600 border-red-200"
              : "text-green-600 border-green-200"
              }`}
          >
            {isNegative ? "−" : "+"}
          </button>
          <input
            ref={amountInputRef}
            data-cy="tx-amount-input"
            type="number"
            className="w-full p-1 border rounded text-sm text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
          />
          <button
            data-cy="tx-submit"
            onClick={() => void handleSubmit()}
            className="bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded text-sm font-semibold"
          >
            Submit
          </button>
        </div>
      </td>
    </tr>
  );
}
