"use client";

import { useMemo, useRef, useState } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "@/app/context/BudgetContext";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatToUSD } from "@/app/utils/formatToUSD";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  accountId: number;
  onBack: () => void;
}

type CategoryOptionGroup = {
  name?: string;
  categoryItems?: Array<{ name?: string | null }>;
};

type SavedPayeeLike = { name?: string | null };

export default function MobileTransactionsTab({ accountId, onBack }: Props) {
  const {
    accounts,
    addTransaction,
    upsertPayee,
    savedPayees,
    deleteTransactionWithMirror,
    editTransaction,
    addTransactionWithMirror,
  } = useAccountContext();
  const { budgetData, currentMonth } = useBudgetContext();

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId]
  );

  const balance = useMemo(
    () => account?.transactions?.reduce((s, tx) => s + tx.balance, 0) ?? 0,
    [account]
  );

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Add / edit transaction sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);

  // Form fields
  const [formPayee, setFormPayee] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCategoryGroup, setFormCategoryGroup] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formDate, setFormDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [payeeSuggestionsOpen, setPayeeSuggestionsOpen] = useState(false);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  // Name of the account selected as payee (for transfers/payments)
  const [selectedPayeeAccount, setSelectedPayeeAccount] = useState<string | null>(null);

  // Swipe to reveal actions
  const [swipedTxId, setSwipedTxId] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const swipeOffsets = useRef<Record<number, number>>({});
  const [, forceUpdate] = useState(0);

  const openAdd = () => {
    setEditingTxId(null);
    setFormPayee("");
    setFormCategory("");
    setFormCategoryGroup("");
    setFormAmount("");
    setFormType("expense");
    setFormDate(new Date().toISOString().slice(0, 10));
    setSelectedPayeeAccount(null);
    setSheetOpen(true);
  };

  const openEdit = (tx: {
    id: number;
    payee?: string;
    category?: string | null;
    category_group?: string | null;
    balance?: number;
    date?: string;
  }) => {
    setEditingTxId(tx.id);
    // Extract actual payee name for transfers (strip "Payment to/from X" → "X")
    const payeeMatch = (tx.payee ?? "").match(/(?:Transfer|Payment) (?:to|from) (.+)/);
    setFormPayee(payeeMatch ? payeeMatch[1] : (tx.payee ?? ""));
    setFormCategory(tx.category ?? "");
    setFormCategoryGroup(tx.category_group ?? "");
    setFormAmount(String(Math.abs(tx.balance ?? 0)));
    setFormType((tx.balance ?? 0) < 0 ? "expense" : "income");
    setFormDate(tx.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setSelectedPayeeAccount(payeeMatch ? payeeMatch[1] : null);
    setSheetOpen(true);
    setSwipedTxId(null);
  };

  const resetForm = () => {
    setSheetOpen(false);
    setEditingTxId(null);
    setSelectedPayeeAccount(null);
  };

  // Compute proper payee label for transfers/payments (mirrors InlineTransactionRow logic)
  const getPayeeLabel = (otherAccountName: string, balance: number): string => {
    const thisAcc = account;
    const other = accounts.find((a) => a.name === otherAccountName);
    if (!thisAcc || !other) return otherAccountName;
    const isThisCredit = thisAcc.type === "credit";
    const isOtherCredit = other.type === "credit";
    if (balance < 0) {
      if (isThisCredit) return `Transfer to ${otherAccountName}`;
      return isOtherCredit ? `Payment to ${otherAccountName}` : `Transfer to ${otherAccountName}`;
    } else {
      if (isThisCredit) return isOtherCredit ? `Transfer from ${otherAccountName}` : `Payment from ${otherAccountName}`;
      return `Transfer from ${otherAccountName}`;
    }
  };

  const getMirrorPayeeLabel = (otherAccountName: string, balance: number): string => {
    const thisAcc = account;
    const other = accounts.find((a) => a.name === otherAccountName);
    if (!thisAcc || !other) return thisAcc?.name ?? "";
    const isThisCredit = thisAcc.type === "credit";
    const isOtherCredit = other.type === "credit";
    // Mirror is from other account's perspective
    if (balance < 0) {
      // This sent money out → other received money → mirror is "Transfer/Payment from this"
      if (isOtherCredit) return isThisCredit ? `Transfer from ${thisAcc.name}` : `Payment from ${thisAcc.name}`;
      return `Transfer from ${thisAcc.name}`;
    } else {
      // This received money → other sent money out → mirror is "Transfer/Payment to this"
      if (isOtherCredit) return `Transfer to ${thisAcc.name}`;
      return isThisCredit ? `Payment to ${thisAcc.name}` : `Transfer to ${thisAcc.name}`;
    }
  };

  const handleSubmit = async () => {
    if (!formPayee.trim() || !formAmount) return;
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt === 0) return;

    const balance = formType === "expense" ? -Math.abs(amt) : Math.abs(amt);

    const otherAccount = selectedPayeeAccount
      ? accounts.find((a) => a.name === selectedPayeeAccount && a.id !== accountId)
      : null;
    const isTransfer = Boolean(otherAccount);
    const isThisCredit = account?.type === "credit";
    const isOtherCredit = otherAccount?.type === "credit";
    const isCreditPayment = isTransfer && !isThisCredit && isOtherCredit;

    // Compute payee label
    const payeeLabel = isTransfer
      ? getPayeeLabel(otherAccount!.name, balance)
      : formPayee.trim();

    // Compute category
    const effectiveCategory = isCreditPayment
      ? otherAccount!.name
      : isTransfer
        ? null
        : formCategory.trim() || null;
    const effectiveGroup = isCreditPayment
      ? "Credit Card Payments"
      : isTransfer
        ? null
        : formCategoryGroup || null;

    const txPayload = {
      date: formDate,
      payee: payeeLabel,
      category: effectiveCategory,
      category_group: effectiveGroup,
      balance,
    };

    if (editingTxId) {
      await editTransaction(accountId, editingTxId, txPayload);
    } else if (isTransfer && otherAccount) {
      const mirrorPayee = getMirrorPayeeLabel(otherAccount.name, balance);
      const mirrorCategory = isOtherCredit ? otherAccount.name : null;
      const mirrorGroup = isOtherCredit ? "Credit Card Payments" : null;
      await addTransactionWithMirror(accountId, txPayload, Number(otherAccount.id), {
        date: formDate,
        payee: mirrorPayee,
        category: mirrorCategory,
        category_group: mirrorGroup,
        balance: -balance,
      });
    } else {
      await addTransaction(accountId, txPayload);
      if (upsertPayee) await upsertPayee(formPayee.trim());
    }
    resetForm();
  };

  // ── Category & payee suggestions ───────────────────────────────────────────
  // Category options: { label, itemName, groupName }
  const categoryOptions = useMemo(() => {
    const opts: { label: string; itemName: string; groupName: string }[] = [
      { label: "Ready to Assign", itemName: "Ready to Assign", groupName: "Ready to Assign" },
    ];
    budgetData?.[currentMonth]?.categories?.forEach(
      (group: CategoryOptionGroup) => {
        group?.categoryItems?.forEach((item) => {
          if (typeof item?.name === "string" && item.name.trim())
            opts.push({
              label: `${group.name} › ${item.name}`,
              itemName: item.name,
              groupName: group.name ?? "",
            });
        });
      }
    );
    return opts;
  }, [budgetData, currentMonth]);

  // Payee options with proper transfer/payment labels
  const payeeOptions = useMemo(() => {
    const thisAcc = account;
    const isThisCredit = thisAcc?.type === "credit";
    return [
      ...accounts
        .filter((a) => a.id !== accountId)
        .map((a) => {
          const isOtherCredit = a.type === "credit";
          // Default label uses expense direction ("out")
          let label: string;
          if (isThisCredit) {
            label = `Transfer to ${a.name}`;
          } else {
            label = isOtherCredit ? `Payment to ${a.name}` : `Transfer to ${a.name}`;
          }
          return { label, isAccount: true, name: a.name };
        }),
      ...savedPayees
        .filter((p: SavedPayeeLike) => typeof p?.name === "string")
        .map((p: SavedPayeeLike) => ({
          label: p.name as string,
          isAccount: false,
          name: p.name as string,
        })),
    ];
  }, [accounts, accountId, savedPayees, account]);

  // ── Sorted + grouped transactions ─────────────────────────────────────────
  const sortedTxns = useMemo(() => {
    const txns = (account?.transactions ?? [])
      .filter((tx) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          tx.payee?.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
      );

    // Group by date
    const groups: { date: string; label: string; items: typeof txns }[] = [];
    txns.forEach((tx) => {
      const d = tx.date?.slice(0, 10) ?? "unknown";
      const last = groups[groups.length - 1];
      if (last?.date === d) {
        last.items.push(tx);
      } else {
        const parsed = tx.date ? parseISO(tx.date) : null;
        const today = new Date();
        const label = parsed
          ? format(parsed, "MMM d, yyyy") === format(today, "MMM d, yyyy")
            ? "Today"
            : format(parsed, "MMM d, yyyy")
          : "Unknown";
        groups.push({ date: d, label, items: [tx] });
      }
    });
    return groups;
  }, [account, searchQuery]);

  if (!account) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        Account not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">
              {account.name}
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {account.type === "credit" ? "Credit card" : "Cash account"}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p
              className={cn(
                "font-mono text-[15px] font-semibold",
                balance < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-teal-600 dark:text-teal-400"
              )}
            >
              {formatToUSD(balance)}
            </p>
          </div>
        </div>

        {/* Search bar (expandable) */}
        {showSearch && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border-none outline-none"
              />
            </div>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Transaction list ── */}
      <div className="flex-1 overflow-y-auto pb-20">
        {sortedTxns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="text-4xl mb-3 opacity-20">💸</div>
            <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">
              {searchQuery ? "No matching transactions" : "No transactions yet"}
            </p>
          </div>
        ) : (
          sortedTxns.map((group) => (
            <div key={group.date}>
              {/* Date header */}
              <div className="px-4 pt-4 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {group.label}
                </span>
              </div>

              {/* Transactions */}
              {group.items.map((tx) => {
                const isIncome = tx.balance > 0;
                const offset = swipeOffsets.current[tx.id] ?? 0;
                const isRevealed = swipedTxId === tx.id && offset < -60;

                return (
                  <div
                    key={tx.id}
                    className="relative overflow-hidden bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800"
                  >
                    {/* Swipe actions background */}
                    <div className="absolute inset-0 flex items-center justify-end">
                      <button
                        onClick={() => {
                          openEdit(tx);
                        }}
                        className="h-full w-20 bg-teal-500 flex flex-col items-center justify-center text-white text-[11px] font-semibold gap-0.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          deleteTransactionWithMirror(accountId, tx.id);
                          setSwipedTxId(null);
                        }}
                        className="h-full w-20 bg-red-500 flex flex-col items-center justify-center text-white text-[11px] font-semibold gap-0.5"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Row (swipeable) */}
                    <div
                      className="relative flex items-center gap-3 px-4 py-3 min-h-[58px] bg-white dark:bg-slate-900 cursor-pointer"
                      style={{
                        transform: `translateX(${offset}px)`,
                        transition:
                          touchStartX.current === null
                            ? "transform 0.25s ease-out"
                            : "none",
                      }}
                      onTouchStart={(e) => {
                        touchStartX.current = e.touches[0].clientX;
                      }}
                      onTouchMove={(e) => {
                        if (touchStartX.current === null) return;
                        const delta =
                          e.touches[0].clientX - touchStartX.current;
                        const clamped = Math.max(-140, Math.min(0, delta));
                        swipeOffsets.current[tx.id] = clamped;
                        forceUpdate((n) => n + 1);
                      }}
                      onTouchEnd={() => {
                        touchStartX.current = null;
                        const offset = swipeOffsets.current[tx.id] ?? 0;
                        if (offset < -60) {
                          swipeOffsets.current[tx.id] = -140;
                          setSwipedTxId(tx.id);
                        } else {
                          swipeOffsets.current[tx.id] = 0;
                          setSwipedTxId(null);
                        }
                        forceUpdate((n) => n + 1);
                      }}
                      onClick={() => {
                        if (isRevealed) {
                          swipeOffsets.current[tx.id] = 0;
                          setSwipedTxId(null);
                          forceUpdate((n) => n + 1);
                        }
                      }}
                    >
                      {/* Payee icon */}
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[14px] flex-shrink-0">
                        {isIncome ? "💰" : "💸"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
                          {tx.payee}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {tx.category ?? "Uncategorized"}
                        </p>
                      </div>

                      {/* Amount */}
                      <p
                        className={cn(
                          "font-mono text-[14px] font-semibold flex-shrink-0",
                          isIncome
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-slate-800 dark:text-slate-200"
                        )}
                      >
                        {isIncome ? "+" : "−"}
                        {formatToUSD(Math.abs(tx.balance))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* ── FAB row ── */}
      <div className="absolute bottom-20 right-4 flex flex-col items-end gap-2">
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-center text-slate-500 dark:text-slate-400"
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          onClick={openAdd}
          className="w-14 h-14 rounded-full bg-teal-500 dark:bg-teal-600 shadow-lg flex items-center justify-center text-white"
          style={{ boxShadow: "0 4px 16px rgba(20,184,166,0.4)" }}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* ── Add / Edit sheet ── */}
      <Dialog open={sheetOpen} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent className="p-0 overflow-hidden max-w-none w-[96vw] sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-0 shadow-2xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-[15px] text-slate-900 dark:text-slate-100">
                {editingTxId ? "Edit Transaction" : "Add Transaction"}
              </DialogTitle>
            </DialogHeader>
            <button
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3 overflow-y-auto max-h-[70vh]">
            {/* Amount + type */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                  Amount
                </label>
                <Input
                  inputMode="decimal"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 font-mono text-[16px]"
                  autoFocus={!editingTxId}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                  Type
                </label>
                <div className="flex h-11 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {(["expense", "income"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFormType(t)}
                      className={cn(
                        "px-3 text-[11px] font-semibold transition-colors capitalize",
                        formType === t
                          ? t === "expense"
                            ? "bg-red-500 text-white"
                            : "bg-teal-500 text-white"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      {t === "expense" ? "Out" : "In"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Payee */}
            <div className="relative">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                Payee
              </label>
              <Input
                value={formPayee}
                onChange={(e) => {
                  setFormPayee(e.target.value);
                  setPayeeSuggestionsOpen(true);
                  setSelectedPayeeAccount(null);
                }}
                onFocus={() => setPayeeSuggestionsOpen(true)}
                onBlur={() =>
                  setTimeout(() => setPayeeSuggestionsOpen(false), 100)
                }
                placeholder="Who paid / who received"
                className="h-11"
              />
              {payeeSuggestionsOpen && payeeOptions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {payeeOptions
                    .filter((p) =>
                      formPayee
                        ? p.label
                            .toLowerCase()
                            .includes(formPayee.toLowerCase())
                        : true
                    )
                    .slice(0, 8)
                    .map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0 flex items-center gap-2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFormPayee(p.name);
                          if (p.isAccount) {
                            setSelectedPayeeAccount(p.name);
                            // Auto-set category for credit card payments
                            const other = accounts.find((a) => a.name === p.name);
                            const isThisCredit = account?.type === "credit";
                            if (other?.type === "credit" && !isThisCredit) {
                              setFormCategory(p.name);
                              setFormCategoryGroup("Credit Card Payments");
                            } else {
                              // Transfers between same-type: no category
                              setFormCategory("");
                              setFormCategoryGroup("");
                            }
                          } else {
                            setSelectedPayeeAccount(null);
                          }
                          setPayeeSuggestionsOpen(false);
                        }}
                      >
                        {p.isAccount && (
                          <span className="text-[9px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-500 px-1.5 py-0.5 rounded">
                            ACCT
                          </span>
                        )}
                        {p.label}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div className="relative">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                Category
              </label>
              <Input
                value={formCategory}
                onChange={(e) => {
                  setFormCategory(e.target.value);
                  setFormCategoryGroup("");
                  setCategorySuggestionsOpen(true);
                }}
                onFocus={() => setCategorySuggestionsOpen(true)}
                onBlur={() =>
                  setTimeout(() => setCategorySuggestionsOpen(false), 150)
                }
                placeholder="Optional"
                className="h-11"
                readOnly={Boolean(selectedPayeeAccount && accounts.find(a => a.name === selectedPayeeAccount)?.type === "credit" && account?.type !== "credit")}
              />
              {categorySuggestionsOpen && !selectedPayeeAccount && (
                <div className="absolute z-30 top-full mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                  {categoryOptions
                    .filter((c) =>
                      formCategory
                        ? c.label.toLowerCase().includes(formCategory.toLowerCase()) ||
                          c.itemName.toLowerCase().includes(formCategory.toLowerCase())
                        : true
                    )
                    .slice(0, 12)
                    .map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (c.groupName === "Ready to Assign") {
                            setFormCategory("Ready to Assign");
                            setFormCategoryGroup("");
                          } else {
                            setFormCategory(c.itemName);
                            setFormCategoryGroup(c.groupName);
                          }
                          setCategorySuggestionsOpen(false);
                        }}
                      >
                        {c.groupName !== "Ready to Assign" && (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px] block">{c.groupName}</span>
                        )}
                        <span className="font-medium text-[13px]">{c.itemName}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                Date
              </label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11 dark:[color-scheme:dark]"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11 dark:border-slate-700"
                onClick={resetForm}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600 text-white font-semibold"
                onClick={handleSubmit}
                disabled={!formPayee.trim() || !formAmount}
              >
                {editingTxId ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
