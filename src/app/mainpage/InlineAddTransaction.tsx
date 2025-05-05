'use client';
import { useState } from 'react';
import { useBudgetContext } from '@/app/context/BudgetContext';
import { useAccountContext } from '@/app/context/AccountContext';
import { format } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';

export default function InlineAddTransaction({ accountId }: { accountId: number }) {
  const { budgetData, currentMonth, setBudgetData } = useBudgetContext();
  const { addTransaction } = useAccountContext();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [isNegative, setIsNegative] = useState(true);

  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newItemMode, setNewItemMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newItemName, setNewItemName] = useState('');

  const categoryGroups = budgetData[currentMonth].categories.map((cat) => cat.name);
  const getItemsForGroup = (groupName: string) =>
    budgetData[currentMonth].categories.find((cat) => cat.name === groupName)?.categoryItems.map((item) => item.name) || [];

  const handleSubmit = async () => {
    if (!payee || !amount || (!selectedItem && !newItemName)) return;

    const groupName = newGroupMode ? newGroupName.trim() : selectedGroup;
    const itemName = newItemMode ? newItemName.trim() : selectedItem;

    if (!groupName || !itemName) return;

    let updatedCategories = [...budgetData[currentMonth].categories];
    let groupIndex = updatedCategories.findIndex((g) => g.name === groupName);

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

    await addTransaction(accountId, {
      date,
      payee,
      category: itemName,
      balance: (isNegative ? -1 : 1) * Number(amount),
    });

    setDate(today);
    setPayee('');
    setAmount('');
    setIsNegative(true);
    setSelectedGroup('');
    setSelectedItem('');
    setNewGroupMode(false);
    setNewItemMode(false);
    setNewGroupName('');
    setNewItemName('');
  };

  return (
    <tr className="bg-gray-50 transition-opacity duration-300 opacity-100">
      <td className="border p-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-1 border rounded text-sm"
        />
      </td>
      <td className="border p-2">
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className="w-full p-1 border rounded text-sm"
          placeholder="Payee"
        />
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
                <option key={group} value={group}>
                  {group}
                </option>
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
                <option key={item} value={item}>
                  {item}
                </option>
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
            className={`rounded px-2 py-1 font-bold ${
              isNegative ? 'text-red-600' : 'text-green-600'
            }`}
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
      <td className="border p-2 text-center text-gray-400 text-sm">New</td>
    </tr>
  );
}
