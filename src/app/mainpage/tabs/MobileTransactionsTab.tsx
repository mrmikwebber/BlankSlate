"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  selectedAccountId?: number | null;
  onSelectAccount?: (accountId: number | null) => void;
}

export default function MobileTransactionsTab({
  selectedAccountId,
  onSelectAccount,
}: Props) {
  const { accounts, addTransaction, upsertPayee, savedPayees, deleteTransactionWithMirror, editTransaction } = useAccountContext();
  const { budgetData, currentMonth, addItemToCategory } = useBudgetContext();

  const [showForm, setShowForm] = useState(false);
  const [formAccountId, setFormAccountId] = useState<number | null>(null);
  const [payeeInput, setPayeeInput] = useState("");
  const [payeeDropdownOpen, setPayeeDropdownOpen] = useState(false);
  const [selectedPayeeAccountName, setSelectedPayeeAccountName] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGroupIsNew, setNewCategoryGroupIsNew] = useState(false);
  const [newCategoryGroupName, setNewCategoryGroupName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [swipedTxId, setSwipedTxId] = useState<number | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isTypingPayee, setIsTypingPayee] = useState(false);
  const [isTypingCategory, setIsTypingCategory] = useState(false);

  // Keep form account in sync with selection
  useEffect(() => {
    if (selectedAccountId != null) {
      setFormAccountId(selectedAccountId);
    } else if (accounts[0]) {
      setFormAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const thisAccount = useMemo(
    () => accounts.find((a) => a.id === formAccountId) || null,
    [accounts, formAccountId]
  );

  // Disable category when transferring between two checking (debit) accounts
  const isCheckingTransfer = useMemo(() => {
    if (!thisAccount || !selectedPayeeAccountName) return false;
    const other = accounts.find((a) => a.name === selectedPayeeAccountName);
    return thisAccount.type === "debit" && other?.type === "debit";
  }, [accounts, thisAccount, selectedPayeeAccountName]);

  useEffect(() => {
    if (isCheckingTransfer) {
      setCategoryDropdownOpen(false);
      setNewCategoryMode(false);
    }
  }, [isCheckingTransfer]);

  // Auto-fill category for cross-type transfer (debit → credit card)
  useEffect(() => {
    if (!thisAccount || !selectedPayeeAccountName) return;
    const otherAccount = accounts.find((a) => a.name === selectedPayeeAccountName);
    if (!otherAccount) return;

    const isCrossType = thisAccount.type !== otherAccount.type;
    const isCreditPayment = isCrossType && otherAccount.type === "credit";

    if (isCreditPayment) {
      setCategoryInput(`Credit Card Payments ▸ ${otherAccount.name}`);
    }
  }, [thisAccount, selectedPayeeAccountName, accounts]);

  const getPreviewLabel = (targetName: string) => {
    if (!thisAccount) return targetName;
    const other = accounts.find((a) => a.name === targetName);
    if (!other) return targetName;

    const isExpense = formType === "expense";
    const amountNum = Math.abs(Number(formAmount) || 0);
    if (!amountNum) return `To/From: ${targetName}`;

    const isThisCredit = thisAccount.type === "credit";
    const isOtherCredit = other.type === "credit";

    if (isExpense) {
      if (isThisCredit) return `Transfer to ${targetName}`;
      return isOtherCredit ? `Payment to ${targetName}` : `Transfer to ${targetName}`;
    }

    if (isThisCredit)
      return isOtherCredit ? `Transfer from ${targetName}` : `Payment from ${targetName}`;
    return `Transfer from ${targetName}`;
  };

  const payeeSuggestions = useMemo(
    () => [
      ...accounts
        .filter((a) => a.id !== formAccountId)
        .map((acc) => ({ type: "account" as const, accountName: acc.name, label: getPreviewLabel(acc.name) })),
      ...savedPayees
        .filter((p: any) => typeof p?.name === "string" && p.name.trim() !== "")
        .map((p: any) => ({ type: "payee" as const, accountName: null, label: p.name })),
    ],
    [accounts, formAccountId, getPreviewLabel, savedPayees]
  );

  const categoryOptions = useMemo(() => {
    const options: Array<{ label: string; value: string; isAccount?: boolean; accountName?: string }> = [];
    options.push({ label: "Ready to Assign", value: "Ready to Assign" });

    const month = budgetData?.[currentMonth];
    month?.categories?.forEach((group: any) => {
      if (group?.name === "Credit Card Payments") {
        group?.categoryItems?.forEach((item: any) => {
          const name = item?.name;
          if (typeof name === "string" && name.trim() !== "") {
            const acc = accounts.find((a) => a.name === name && a.type === "credit");
            options.push({
              label: name,
              value: name,
              isAccount: !!acc,
              accountName: acc?.name,
            });
          }
        });
      } else {
        group?.categoryItems?.forEach((item: any) => {
          const name = item?.name;
          if (typeof name === "string" && name.trim() !== "") {
            options.push({ label: name, value: name });
          }
        });
      }
    });
    return options;
  }, [budgetData, currentMonth, accounts]);

  const categoryGroupNames = useMemo(() => {
    const month = budgetData?.[currentMonth];
    return month?.categories?.map((g: any) => g.name) ?? [];
  }, [budgetData, currentMonth]);

  const displayedTransactions = useMemo(() => {
    const transactions: any[] = [];

    const sourceAccounts = selectedAccount
      ? [selectedAccount]
      : accounts;

    sourceAccounts.forEach((account) => {
      account.transactions?.forEach((tx) => {
        transactions.push({
          ...tx,
          accountId: account.id,
          accountName: account.name,
        });
      });
    });

    return transactions.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateB - dateA;
    });
  }, [accounts, selectedAccount]);

  const resetForm = () => {
    setShowForm(false);
    setEditingTxId(null);
    setPayeeInput("");
    setSelectedPayeeAccountName(null);
    setCategoryInput("");
    setNewCategoryMode(false);
    setNewCategoryName("");
    setNewCategoryGroupIsNew(false);
    setNewCategoryGroupName("");
    setFormAmount("");
    setFormType("expense");
    setFormDate(new Date().toISOString().slice(0, 10));
  };

  const beginEdit = (tx: any) => {
    setEditingTxId(tx.id);
    setFormAccountId(tx.accountId ?? null);
    setPayeeInput(tx.payee ?? "");
    setSelectedPayeeAccountName(null);
    setCategoryInput(tx.category ?? "");
    setFormAmount(Math.abs(tx.balance ?? 0).toString());
    setFormType((tx.balance ?? 0) < 0 ? "expense" : "income");
    setFormDate(tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setShowForm(true);
  };

  const handleAddTransaction = async () => {
    const payeeName = selectedPayeeAccountName || payeeInput.trim();
    if (!formAccountId || !payeeName || !formAmount) return;

    const amountNum = Number(formAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) return;

    const balance = formType === "expense" ? -Math.abs(amountNum) : Math.abs(amountNum);

    const otherAccount = accounts.find((a) => a.name === payeeName);
    const isTransfer = Boolean(otherAccount);

    const payeeLabel = (() => {
      if (!thisAccount || !otherAccount) return payeeName;

      const isThisCredit = thisAccount.type === "credit";
      const isOtherCredit = otherAccount.type === "credit";

      if (balance < 0) {
        if (isThisCredit) return `Transfer to ${otherAccount.name}`;
        return isOtherCredit ? `Payment to ${otherAccount.name}` : `Transfer to ${otherAccount.name}`;
      }

      if (isThisCredit)
        return isOtherCredit ? `Transfer from ${otherAccount.name}` : `Payment from ${otherAccount.name}`;
      return `Transfer from ${otherAccount.name}`;
    })();

    let categoryName = categoryInput.trim();
    let groupName = "";

    if (newCategoryMode) {
      const catName = newCategoryName.trim();
      const grpName = newCategoryGroupName.trim();
      if (!catName || !grpName) return;
      categoryName = catName;
      groupName = grpName;
      if (addItemToCategory) {
        addItemToCategory(groupName, {
          name: categoryName,
          assigned: 0,
          activity: 0,
          available: 0,
        });
      }
    }

    // If transfer to a credit card, force category to card payment
    const isCreditPayment = isTransfer && otherAccount?.type === "credit";
    if (!newCategoryMode && isCreditPayment) {
      groupName = "Credit Card Payments";
      categoryName = otherAccount!.name;
    }

    const isReadyToAssign = categoryName.toLowerCase() === "ready to assign";

    const txPayload = {
      date: formDate,
      payee: payeeLabel,
      category: isTransfer && !isCreditPayment ? null : isReadyToAssign ? "Ready to Assign" : categoryName || null,
      category_group: isTransfer && !isCreditPayment ? null : isReadyToAssign ? null : groupName || null,
      balance,
    };

    if (editingTxId) {
      // ✏️ Editing existing transaction
      await editTransaction(formAccountId, editingTxId, txPayload);
    } else {
      // ➕ Creating new transaction
      await addTransaction(formAccountId, txPayload);

      if (!isTransfer && upsertPayee) {
        await upsertPayee(payeeName);
      }

      if (isTransfer && thisAccount && otherAccount) {
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
          }

          if (isOtherCredit) {
            return `Transfer to ${thisAccount.name}`;
          }
          return isThisCredit
            ? `Payment to ${thisAccount.name}`
            : `Transfer to ${thisAccount.name}`;
        })();

        await addTransaction(otherAccount.id, {
          date: formDate,
          payee: mirrorPayee,
          category: isOtherCredit ? otherAccount.name : null,
          category_group: isOtherCredit ? "Credit Card Payments" : null,
          balance: -balance,
        });
      }
    }

    resetForm();
  };


  const showingLabel = selectedAccount
    ? `Showing: ${selectedAccount.name}`
    : "Showing: All accounts";

  if (!displayedTransactions || displayedTransactions.length === 0) {
    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>{showingLabel}</span>
            {selectedAccount && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => onSelectAccount?.(null)}
              >
                Clear
              </Button>
            )}
          </div>
          <Button size="sm" onClick={() => setShowForm(true)}>
            Add transaction
          </Button>
        </div>

        {showForm && (
          <Card className="border-slate-200 shadow-none">
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-600">Account</label>
                <select
                  className="text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                  value={formAccountId != null ? String(formAccountId) : ""}
                  onChange={(e) => setFormAccountId(Number(e.target.value))}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-600">Payee</label>
                <div className="relative">
                  <Input
                    value={payeeInput}
                    onChange={(e) => {
                      setPayeeInput(e.target.value);
                      setPayeeDropdownOpen(true);
                      setIsTypingPayee(true);
                    }}
                    onFocus={() => setPayeeDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setPayeeDropdownOpen(false), 120)}
                    placeholder="Type or select payee"
                  />
                  {payeeDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                      {payeeSuggestions
                        .filter((s) => isTypingPayee && payeeInput ? (s?.label || "").toLowerCase().includes(payeeInput.toLowerCase()) : true)
                        .map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setIsTypingPayee(false);
                              if (s.type === "account") {
                                setSelectedPayeeAccountName(s.accountName);
                                const acc = accounts.find((a) => a.name === s.accountName);
                                const label = getPreviewLabel(s.accountName);
                                setPayeeInput(label);
                                if (acc?.type === "credit") {
                                  setCategoryInput(acc.name);
                                  setIsTypingCategory(false);
                                } else {
                                  setCategoryInput("");
                                }
                              } else {
                                setSelectedPayeeAccountName(null);
                                setPayeeInput(s.label);
                                setCategoryInput("");
                              }
                              setPayeeDropdownOpen(false);
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      {payeeInput &&
                        !payeeSuggestions.some(
                          (s) => (s?.label || "").toLowerCase() === payeeInput.toLowerCase()
                        ) && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-teal-700 font-medium border-t border-slate-200 hover:bg-teal-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedPayeeAccountName(null);
                              setPayeeInput(payeeInput);
                              setPayeeDropdownOpen(false);
                            }}
                          >
                            ➕ Create "{payeeInput}"
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-600">Category</label>
                <div className="relative">
                  <Input
                    value={categoryInput}
                    onChange={(e) => {
                      setCategoryInput(e.target.value);
                      setCategoryDropdownOpen(true);
                      setIsTypingCategory(true);
                      // Only clear payee if it was a credit card payment and category changed
                      if (isTypingCategory && selectedPayeeAccountName) {
                        const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                        if (acc?.type === "credit") {
                          setPayeeInput("");
                          setSelectedPayeeAccountName(null);
                        }
                      }
                    }}
                    onFocus={() => setCategoryDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 120)}
                    placeholder="Type or select category"
                    disabled={isCheckingTransfer}
                  />
                  {categoryDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                      {categoryOptions
                        .filter((opt) => isTypingCategory && categoryInput ? (opt?.label || "").toLowerCase().includes(categoryInput.toLowerCase()) : true)
                        .map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setIsTypingCategory(false);
                            setCategoryInput(opt.label);
                            if (opt.isAccount && opt.accountName && thisAccount) {
                              const label = getPreviewLabel(opt.accountName);
                              setPayeeInput(label);
                              setSelectedPayeeAccountName(opt.accountName);
                              setIsTypingPayee(false);
                            } else if (selectedPayeeAccountName) {
                              // Check if current payee is a credit card - if so, clear it since category doesn't match
                              const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                              if (acc?.type === "credit") {
                                setPayeeInput("");
                                setSelectedPayeeAccountName(null);
                              }
                            }
                            setCategoryDropdownOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {categoryInput && !categoryOptions.some((opt) => (opt?.label || "").toLowerCase() === categoryInput.toLowerCase()) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-teal-700 font-medium border-t border-slate-200 hover:bg-teal-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setNewCategoryMode(true);
                            setNewCategoryName(categoryInput);
                            setCategoryDropdownOpen(false);
                          }}
                        >
                          ➕ Create New Category
                        </button>
                      )}
                    </div>
                  )}
                  {newCategoryMode && (
                    <div className="mt-2 rounded-md border border-dashed border-teal-300 bg-teal-50/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-teal-800">
                          New category details
                        </span>
                        <button
                          type="button"
                          className="text-xs text-teal-700 underline"
                          onClick={() => {
                            setNewCategoryMode(false);
                            setNewCategoryName("");
                            setNewCategoryGroupIsNew(false);
                            setNewCategoryGroupName("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-600">Category name</label>
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-600">Category group</label>
                        <select
                          className="text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                          value={
                            newCategoryGroupIsNew
                              ? "__new__"
                              : newCategoryGroupName || ""
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "__new__") {
                              setNewCategoryGroupIsNew(true);
                              setNewCategoryGroupName("");
                            } else {
                              setNewCategoryGroupIsNew(false);
                              setNewCategoryGroupName(value);
                            }
                          }}
                        >
                          <option value="" disabled>
                            Select group
                          </option>
                          {categoryGroupNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__new__">➕ New group…</option>
                        </select>
                      </div>

                      {newCategoryGroupIsNew && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-600">New group name</label>
                          <Input
                            value={newCategoryGroupName}
                            onChange={(e) => setNewCategoryGroupName(e.target.value)}
                            placeholder="e.g. Utilities"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-600">Amount</label>
                  <Input
                    type="number"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-600">Date</label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-600">Type</label>
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setFormType("expense")}
                    className={`px-3 py-1 rounded border ${formType === "expense"
                      ? "border-teal-500 text-teal-700 bg-teal-50"
                      : "border-slate-300 text-slate-600"
                      }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType("income")}
                    className={`px-3 py-1 rounded border ${formType === "income"
                      ? "border-teal-500 text-teal-700 bg-teal-50"
                      : "border-slate-300 text-slate-600"
                      }`}
                  >
                    Income
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddTransaction}>
                  {editingTxId ? "Update" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center py-12 text-slate-400">
          <p>No transactions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>{showingLabel}</span>
          {selectedAccount && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onSelectAccount?.(null)}
            >
              Clear
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          Add transaction
        </Button>
      </div>

      {showForm && (
        <Card className="border-slate-200 shadow-none">
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-600">Account</label>
              <select
                className="text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                value={formAccountId != null ? String(formAccountId) : ""}
                onChange={(e) => setFormAccountId(Number(e.target.value))}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-600">Payee</label>
              <div className="relative">
                <Input
                  value={payeeInput}
                  onChange={(e) => {
                    setPayeeInput(e.target.value);
                    setPayeeDropdownOpen(true);
                    setIsTypingPayee(true);
                  }}
                  onFocus={() => setPayeeDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setPayeeDropdownOpen(false), 120)}
                  placeholder="Type or select payee"
                />
                  {payeeDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                    {payeeSuggestions
                      .filter((s) => isTypingPayee && payeeInput ? (s?.label || "").toLowerCase().includes(payeeInput.toLowerCase()) : true)
                      .map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setIsTypingPayee(false);
                            if (s.type === "account") {
                              setSelectedPayeeAccountName(s.accountName);
                              const acc = accounts.find((a) => a.name === s.accountName);
                              const label = getPreviewLabel(s.accountName);
                              setPayeeInput(label);
                              if (acc?.type === "credit") {
                                setCategoryInput(acc.name);
                                setIsTypingCategory(false);
                              } else {
                                setCategoryInput("");
                              }
                            } else {
                              setSelectedPayeeAccountName(null);
                              setPayeeInput(s.label);
                              setCategoryInput("");
                            }
                            setPayeeDropdownOpen(false);
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    {payeeInput &&
                      !payeeSuggestions.some(
                        (s) => (s?.label || "").toLowerCase() === payeeInput.toLowerCase()
                      ) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-teal-700 font-medium border-t border-slate-200 hover:bg-teal-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedPayeeAccountName(null);
                            setPayeeInput(payeeInput);
                            setPayeeDropdownOpen(false);
                          }}
                        >
                          ➕ Create "{payeeInput}"
                        </button>
                      )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-600">Category</label>
              <div className="relative">
                <Input
                  value={categoryInput}
                  onChange={(e) => {
                    setCategoryInput(e.target.value);
                    setCategoryDropdownOpen(true);
                    setIsTypingCategory(true);
                    // Only clear payee if it was a credit card payment and category changed
                    if (isTypingCategory && selectedPayeeAccountName) {
                      const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                      if (acc?.type === "credit") {
                        setPayeeInput("");
                        setSelectedPayeeAccountName(null);
                      }
                    }
                  }}
                  onFocus={() => setCategoryDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 120)}
                  placeholder="Type or select category"
                  disabled={isCheckingTransfer}
                />
                {categoryDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                    {categoryOptions
                      .filter((opt) => isTypingCategory && categoryInput ? (opt?.label || "").toLowerCase().includes(categoryInput.toLowerCase()) : true)
                      .map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setIsTypingCategory(false);
                          setCategoryInput(opt.label);
                          if (opt.isAccount && opt.accountName && thisAccount) {
                            const label = getPreviewLabel(opt.accountName);
                            setPayeeInput(label);
                            setSelectedPayeeAccountName(opt.accountName);
                            setIsTypingPayee(false);
                          } else if (selectedPayeeAccountName) {
                            // Check if current payee is a credit card - if so, clear it since category doesn't match
                            const acc = accounts.find((a) => a.name === selectedPayeeAccountName);
                            if (acc?.type === "credit") {
                              setPayeeInput("");
                              setSelectedPayeeAccountName(null);
                            }
                          }
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {categoryInput && !categoryOptions.some((opt) => (opt?.label || "").toLowerCase() === categoryInput.toLowerCase()) && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-teal-700 font-medium border-t border-slate-200 hover:bg-teal-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewCategoryMode(true);
                          setNewCategoryName(categoryInput);
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        ➕ Create New Category
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-600">Amount</label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={(e) => {
                    setFormAmount(e.target.value);
                    // Update payee label when amount changes (for transfer preview)
                    if (selectedPayeeAccountName && thisAccount) {
                      const label = getPreviewLabel(selectedPayeeAccountName);
                      setPayeeInput(label);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-600">Date</label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600">Type</label>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setFormType("expense")}
                  className={`px-3 py-1 rounded border ${formType === "expense"
                    ? "border-teal-500 text-teal-700 bg-teal-50"
                    : "border-slate-300 text-slate-600"
                    }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("income")}
                  className={`px-3 py-1 rounded border ${formType === "income"
                    ? "border-teal-500 text-teal-700 bg-teal-50"
                    : "border-slate-300 text-slate-600"
                    }`}
                >
                  Income
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddTransaction}>
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {displayedTransactions.map((tx, idx) => {
        const account = accounts.find((a) => a.transactions?.some((t) => t.id === tx.id));
        const isSwiped = swipedTxId === tx.id;
        const translateX = isSwiped ? swipeX : 0;

        return (
          <div key={idx} className="relative overflow-hidden">
            <div
              className="absolute inset-0 flex items-center justify-between px-4"
              style={{ zIndex: 0 }}
            >
              <button
                className="h-full flex-1 bg-red-500 text-white font-semibold flex items-center justify-start pl-4"
                onClick={() => {
                  if (account) {
                    deleteTransactionWithMirror(tx.accountId, tx.id);
                  }
                  setSwipedTxId(null);
                  setSwipeX(0);
                }}
              >
                Delete
              </button>
              <button
                className="h-full flex-1 bg-teal-500 text-white font-semibold flex items-center justify-end pr-4"
                onClick={() => {
                  beginEdit(tx);
                  setSwipedTxId(null);
                  setSwipeX(0);
                }}
              >
                Edit
              </button>
            </div>
            <Card
              className="shadow-none border-slate-200 relative"
              style={{
                transform: `translateX(${translateX}px)`,
                transition: isSwiped && swipeX === 0 ? 'transform 0.3s ease-out' : 'none',
                zIndex: 1,
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                setSwipedTxId(tx.id);
                setSwipeX(0);
                (e.currentTarget as any)._startX = touch.clientX;
              }}
              onTouchMove={(e) => {
                if (swipedTxId !== tx.id) return;
                const touch = e.touches[0];
                const startX = (e.currentTarget as any)._startX || touch.clientX;
                const deltaX = touch.clientX - startX;
                setSwipeX(Math.max(-150, Math.min(150, deltaX)));
              }}
              onTouchEnd={() => {
                if (Math.abs(swipeX) < 50) {
                  setSwipeX(0);
                  setSwipedTxId(null);
                }
              }}
            >
              <CardContent className="pt-4" onClick={() => beginEdit(tx)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {tx.payee}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full font-medium">
                        {tx.category || "Ready to Assign"}
                      </span>
                      <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                        {tx.accountName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p
                      className={`text-base font-bold ${tx.balance < 0 ? "text-red-600" : "text-green-600"
                        }`}
                    >
                      {tx.balance < 0 ? "-" : "+"}${Math.abs(tx.balance).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {tx.date ? format(parseISO(tx.date), "MMM d, yyyy") : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
