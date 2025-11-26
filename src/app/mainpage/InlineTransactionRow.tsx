import { useEffect, useRef, useState } from "react";
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
}: {
  accountId: number;
  mode?: "add" | "edit";
  initialData?: Transaction;
  onCancel?: () => void;
  onSave?: () => void;
}) {
  const isEdit = mode === "edit";
  const {
    budgetData,
    currentMonth,
    setBudgetData,
    refreshAccounts,
  } = useBudgetContext();
  const { addTransaction, editTransaction, accounts, deleteTransaction } =
    useAccountContext();

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(
    isEdit && initialData ? initialData.date : today
  );
  const [payee, setPayee] = useState(
    isEdit && initialData ? initialData.payee : ""
  );
  const [amount, setAmount] = useState(
    isEdit && initialData ? Math.abs(initialData.balance).toString() : ""
  );
  const [isNegative, setIsNegative] = useState(
    isEdit && initialData ? initialData.balance < 0 : true
  );
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newItemMode, setNewItemMode] = useState(false);
  const [newPayeeMode, setNewPayeeMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newPayeeName, setNewPayeeName] = useState("");
  const [transferPayee, setTransferPayee] = useState("");

  const formRef = useRef<HTMLTableRowElement>(null);

  const thisAccount = accounts.find((a) => a.id === accountId);
  const otherAccount = accounts.find((a) => a.name === transferPayee);
  const sameTypeTransfer =
    thisAccount && otherAccount && thisAccount.type === otherAccount.type;
  const crossTypeTransfer =
    thisAccount && otherAccount && thisAccount.type !== otherAccount.type;

  const categoryGroups = budgetData[currentMonth].categories.map(
    (cat) => cat.name
  );
  const getItemsForGroup = (groupName: string) =>
    budgetData[currentMonth].categories
      .find((cat) => cat.name === groupName)
      ?.categoryItems.map((item) => item.name) || [];

  useEffect(() => {
    if (crossTypeTransfer) {
      const creditAccount =
        thisAccount?.type === "credit" ? thisAccount : otherAccount;
      setSelectedGroup("Credit Card Payments");
      setSelectedItem(creditAccount?.name || "");
      setNewGroupMode(false);
      setNewItemMode(false);
    }
  }, [transferPayee, isNegative, amount]);

  const handleSubmit = async () => {
    const groupName = newGroupMode ? newGroupName.trim() : selectedGroup;
    const itemName = newItemMode ? newItemName.trim() : selectedItem;
    const payeeName = newPayeeMode ? newPayeeName.trim() : transferPayee;

    const thisAccount = accounts.find((a) => a.id === accountId);
    const otherAccount = accounts.find((a) => a.name === payeeName);
    const isSameType =
      thisAccount && otherAccount && thisAccount.type === otherAccount.type;

    if (
      !amount ||
      !payeeName ||
      (!isSameType &&
        groupName !== "Ready to Assign" &&
        (!itemName || !groupName))
    )
      return;

    const updatedCategories = [...budgetData[currentMonth].categories];
    const groupIndex = updatedCategories.findIndex((g) => g.name === groupName);

    if (groupName !== "Ready to Assign") {
      if (groupName && itemName && groupIndex === -1) {
        updatedCategories.push({
          name: groupName,
          categoryItems: [
            { name: itemName, assigned: 0, activity: 0, available: 0 },
          ],
        });
      } else if (groupName && itemName && groupIndex >= 0) {
        const itemExists = updatedCategories[groupIndex].categoryItems.some(
          (i) => i.name === itemName
        );
        if (!itemExists) {
          updatedCategories[groupIndex].categoryItems.push({
            name: itemName,
            assigned: 0,
            activity: 0,
            available: 0,
          });
        }
      }
    }

    const existingRow = await supabase
      .from("budget_data")
      .select("id")
      .eq("month", currentMonth)
      .single();

    if (existingRow.data?.id) {
      await supabase
        .from("budget_data")
        .update({
          data: { ...budgetData[currentMonth], categories: updatedCategories },
        })
        .eq("id", existingRow.data.id);
    }

    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: {
        ...prev[currentMonth],
        categories: updatedCategories,
      },
    }));

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

    const transactionData = {
      date,
      payee: payeeLabel,
      category: groupName === "Ready to Assign" ? groupName : itemName || null,
      category_group: groupName === "Credit Card Payments" ? groupName : null,
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
        const mirrorPayee =
          balance < 0
            ? `Transfer from ${thisAccount.name}`
            : `Transfer to ${thisAccount.name}`;

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
        const mirrorPayee =
          balance < 0
            ? `Transfer from ${thisAccount.name}`
            : `Transfer to ${thisAccount.name}`;

        await addTransaction(otherAccount.id, {
          date,
          payee: mirrorPayee,
          category: itemName || null,
          balance: -balance,
        });
      }
    }
    await refreshAccounts();

    onSave?.();
    setTransferPayee("");
    setSelectedGroup("");
    setSelectedItem("");
    setAmount("");
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        onCancel?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  useEffect(() => {
    if (mode === "edit" && initialData?.category) {
      const group = budgetData[currentMonth].categories.find((catGroup) =>
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
  }, [mode, initialData, budgetData, currentMonth]);

  const allPayees = Array.from(
    new Set(
      accounts
        .flatMap((acc) => acc.transactions.map((t) => t.payee))
        .filter(Boolean)
    )
  );

  const transferTargets = accounts.filter((a) => a.id !== accountId);

  const getPreviewLabel = (targetName: string) => {
    const thisAccount = accounts.find((a) => a.id === accountId);
    const otherAccount = accounts.find((a) => a.name === targetName);
    if (!thisAccount || !otherAccount) return targetName;

    const isThisCredit = thisAccount.type === "credit";
    const isOtherCredit = otherAccount.type === "credit";
    const amt = parseFloat(amount || "0");
    const isNeg = isNegative;

    if (amt === 0 || isNaN(amt)) return `To/From: ${targetName}`;

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

  return (
    <tr
      ref={formRef}
      data-cy={isEdit ? "transaction-form-row-edit" : "transaction-form-row-add"}
      data-mode={isEdit ? "edit" : "add"}
      className="bg-gray-50 transition-opacity duration-300 opacity-100"
    >
      <td className="border p-2">
        <input
          data-cy="tx-date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-1 border rounded text-sm"
        />
      </td>
      <td className="border p-2">
        {newPayeeMode ? (
          <input
            data-cy="tx-new-payee-input"
            type="text"
            placeholder="New Payee Name"
            className="w-full p-1 border rounded text-sm"
            value={newPayeeName}
            onChange={(e) => setNewPayeeName(e.target.value)}
          />
        ) : (
          <select
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
        <div className="flex flex-col gap-1">
          {newGroupMode ? (
            <input
              data-cy="tx-new-group-input"
              type="text"
              placeholder="New Group Name"
              className="w-full p-1 border rounded text-sm"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              disabled={sameTypeTransfer}
            />
          ) : (
            <select
              data-cy="tx-group-select"
              className="w-full p-1 border rounded text-sm"
              value={selectedGroup}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setNewGroupMode(true);
                  setSelectedGroup("");
                } else {
                  setSelectedGroup(e.target.value);
                }
              }}
              disabled={sameTypeTransfer}
            >
              <option value="Ready to Assign">Ready to Assign</option>
              <option value="">Select Group</option>
              {categoryGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
              <option value="__new__">➕ New Group...</option>
            </select>
          )}

          {newItemMode ? (
            <input
              data-cy="tx-new-item-input"
              type="text"
              placeholder="New Category Name"
              className="w-full p-1 border rounded text-sm"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              disabled={sameTypeTransfer}
            />
          ) : (
            <select
              data-cy="tx-item-select"
              className="w-full p-1 border rounded text-sm"
              value={selectedItem}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setNewItemMode(true);
                  setSelectedItem("");
                } else {
                  setSelectedItem(e.target.value);
                }
              }}
              disabled={sameTypeTransfer || selectedGroup === "Ready to Assign"}
            >
              <option value="">Select Category</option>
              {(selectedGroup ? getItemsForGroup(selectedGroup) : []).map(
                (item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                )
              )}
              <option value="__new__">➕ New Category...</option>
            </select>
          )}
        </div>
      </td>
      <td className="border p-2">
        <div className="flex items-center gap-2">
          <button
            data-cy="tx-sign-toggle"
            type="button"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`rounded px-2 py-1 font-bold ${
              isNegative ? "text-red-600" : "text-green-600"
            }`}
          >
            {isNegative ? "−" : "+"}
          </button>
          <input
            data-cy="tx-amount-input"
            type="number"
            className="w-full p-1 border rounded text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <button
            data-cy="tx-submit"
            onClick={handleSubmit}
            className="bg-teal-600 text-white px-2 py-1 rounded text-sm"
          >
            ✓
          </button>
        </div>
      </td>
    </tr>
  );
}
