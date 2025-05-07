import { useEffect, useRef, useState } from "react";
import { useBudgetContext } from '@/app/context/BudgetContext';
import { useAccountContext, Transaction } from '@/app/context/AccountContext';
import { format } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';

export default function InlineTransactionRow({
  accountId,
  mode = 'add',
  initialData,
  onCancel,
  onSave,
}: {
  accountId: number;
  mode?: 'add' | 'edit';
  initialData?: Transaction;
  onCancel?: () => void;
  onSave?: () => void;
}) {
  const isEdit = mode === 'edit';
  const { budgetData, currentMonth, setBudgetData } = useBudgetContext();
  const { addTransaction, editTransaction, accounts } = useAccountContext();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(isEdit && initialData ? initialData.date : today);
  const [payee, setPayee] = useState(isEdit && initialData ? initialData.payee : '');
  const [amount, setAmount] = useState(isEdit && initialData ? Math.abs(initialData.balance).toString() : '');
  const [isNegative, setIsNegative] = useState(
    isEdit && initialData ? initialData.balance < 0 : true
  );
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newItemMode, setNewItemMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [transferPayee, setTransferPayee] = useState('');

  const formRef = useRef<HTMLTableRowElement>(null);

  const categoryGroups = budgetData[currentMonth].categories.map((cat) => cat.name);
  const getItemsForGroup = (groupName: string) =>
    budgetData[currentMonth].categories.find((cat) => cat.name === groupName)?.categoryItems.map((item) => item.name) || [];

  const handleSubmit = async () => {
    const groupName = newGroupMode ? newGroupName.trim() : selectedGroup;
    const itemName = newItemMode ? newItemName.trim() : selectedItem;
    if (!amount || !itemName || !groupName || !transferPayee) return;

    const updatedCategories = [...budgetData[currentMonth].categories];
    const groupIndex = updatedCategories.findIndex((g) => g.name === groupName);

    if (groupIndex === -1) {
      updatedCategories.push({
        name: groupName,
        categoryItems: [{ name: itemName, assigned: 0, activity: 0, available: 0 }],
      });
    } else {
      const itemExists = updatedCategories[groupIndex].categoryItems.some((i) => i.name === itemName);
      if (!itemExists) {
        updatedCategories[groupIndex].categoryItems.push({
          name: itemName,
          assigned: 0,
          activity: 0,
          available: 0,
        });
      }
    }

    const existingRow = await supabase
      .from('budget_data')
      .select('id')
      .eq('month', currentMonth)
      .single();

    if (existingRow.data?.id) {
      await supabase
        .from('budget_data')
        .update({ data: { ...budgetData[currentMonth], categories: updatedCategories } })
        .eq('id', existingRow.data.id);
    }

    setBudgetData((prev) => ({
      ...prev,
      [currentMonth]: {
        ...prev[currentMonth],
        categories: updatedCategories,
      },
    }));

    const balance = (isNegative ? -1 : 1) * Number(amount);
    const thisAccount = accounts.find((a) => a.id === accountId);
    const otherAccount = accounts.find((a) => a.name === transferPayee);

    const payeeLabel = (() => {
      if (!thisAccount || !otherAccount) return '';

      const isThisCredit = thisAccount.type === 'credit';
      const isOtherCredit = otherAccount.type === 'credit';

      if (balance < 0) {
        if (isThisCredit) return `Transfer to ${otherAccount.name}`;
        return isOtherCredit ? `Payment to ${otherAccount.name}` : `Transfer to ${otherAccount.name}`;
      } else {
        if (isThisCredit) return isOtherCredit ? `Transfer from ${otherAccount.name}` : `Payment from ${otherAccount.name}`;
        return `Transfer from ${otherAccount.name}`;
      }
    })();

    const transactionData = {
      date,
      payee: payeeLabel,
      category: itemName,
      balance,
    };

    if (isEdit && initialData) {
      await editTransaction(accountId, initialData.id, transactionData);
    } else {
      await addTransaction(accountId, transactionData);

      if (otherAccount) {
        const mirrorPayee = balance < 0
          ? (thisAccount.type === 'credit' ? `Transfer from ${thisAccount.name}` : `Transfer from ${thisAccount.name}`)
          : (thisAccount.type === 'credit' ? `Transfer to ${thisAccount.name}` : `Transfer to ${thisAccount.name}`);

        await addTransaction(otherAccount.id, {
          date,
          payee: mirrorPayee,
          category: itemName,
          balance: -balance,
        });
      }
    }

    onSave?.();
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
    if (mode === 'edit' && initialData?.category) {
      const group = budgetData[currentMonth].categories.find((catGroup) =>
        catGroup.categoryItems.some((item) => item.name === initialData.category)
      );

      if (group) {
        setSelectedGroup(group.name);
        setSelectedItem(initialData.category);
      } else {
        setSelectedGroup('');
        setSelectedItem('');
      }
    }
  }, [mode, initialData, budgetData, currentMonth]);

  const allPayees = Array.from(new Set(accounts.flatMap((acc) => acc.transactions.map((t) => t.payee)).filter(Boolean)));

  const transferTargets = accounts.filter((a) => a.id !== accountId);

  const getPreviewLabel = (targetName: string) => {
    const thisAccount = accounts.find((a) => a.id === accountId);
    const otherAccount = accounts.find((a) => a.name === targetName);
    if (!thisAccount || !otherAccount) return targetName;

    const isThisCredit = thisAccount.type === 'credit';
    const isOtherCredit = otherAccount.type === 'credit';
    const amt = parseFloat(amount || '0');
    const isNeg = isNegative;

    if (amt === 0 || isNaN(amt)) return `To/From: ${targetName}`;

    if (isNeg) {
      if (isThisCredit) return `Transfer to ${targetName}`;
      return isOtherCredit ? `Payment to ${targetName}` : `Transfer to ${targetName}`;
    } else {
      if (isThisCredit) return isOtherCredit ? `Transfer from ${targetName}` : `Payment from ${targetName}`;
      return `Transfer from ${targetName}`;
    }
  };

  return (
    <tr ref={formRef} className="bg-gray-50 transition-opacity duration-300 opacity-100">
      <td className="border p-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-1 border rounded text-sm"
        />
      </td>
      <td className="border p-2">
        <select
          value={transferPayee}
          onChange={(e) => setTransferPayee(e.target.value)}
          className="w-full p-1 border rounded text-sm"
        >
          <optgroup label="Payments & Transfers">
            {transferTargets.map((acc) => (
              <option key={acc.id} value={acc.name}>{getPreviewLabel(acc.name)}</option>
            ))}
          </optgroup>
          <optgroup label="Saved Payees">
            {allPayees.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </optgroup>
        </select>
      </td>
      <td className="border p-2">
        <div className="flex flex-col gap-1">
          {newGroupMode ? (
            <input
              type="text"
              placeholder="New Group Name"
              className="w-full p-1 border rounded text-sm"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          ) : (
            <select
              className="w-full p-1 border rounded text-sm"
              value={selectedGroup}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setNewGroupMode(true);
                  setSelectedGroup('');
                } else {
                  setSelectedGroup(e.target.value);
                }
              }}
            >
              <option value="">Select Group</option>
              {categoryGroups.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
              <option value="__new__">➕ New Group...</option>
            </select>
          )}

          {newItemMode ? (
            <input
              type="text"
              placeholder="New Category Name"
              className="w-full p-1 border rounded text-sm"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
            />
          ) : (
            <select
              className="w-full p-1 border rounded text-sm"
              value={selectedItem}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setNewItemMode(true);
                  setSelectedItem('');
                } else {
                  setSelectedItem(e.target.value);
                }
              }}
            >
              <option value="">Select Category</option>
              {(selectedGroup ? getItemsForGroup(selectedGroup) : []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
              <option value="__new__">➕ New Category...</option>
            </select>
          )}
        </div>
      </td>
      <td className="border p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`rounded px-2 py-1 font-bold ${isNegative ? 'text-red-600' : 'text-green-600'}`}
          >
            {isNegative ? '−' : '+'}
          </button>
          <input
            type="number"
            className="w-full p-1 border rounded text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <button
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