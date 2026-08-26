import { useEffect, useMemo, useState } from "react";
import { useBudgetContext } from "../context/BudgetContext";
import { useAccountContext } from "../context/AccountContext";
import { formatToUSD } from "../utils/formatToUSD";
import { differenceInCalendarMonths, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRow, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface InlineTargetEditorProps {
  itemName: string;
  onClose: () => void;
}

export default function InlineTargetEditor({
  itemName,
  onClose,
}: InlineTargetEditorProps) {
  const { currentMonth, budgetData, setCategoryTarget } = useBudgetContext();
  const { accounts } = useAccountContext();
  const { toast } = useToast();
  const [targetAmount, setTargetAmount] = useState("");
  const [targetType, setTargetType] = useState("monthly");
  const [customTargetDate, setCustomTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  const categoryItem = useMemo(() => {
    const month = budgetData[currentMonth];
    if (!month) return null;
    for (const cat of month.categories) {
      const found = cat.categoryItems.find((item) => item.name === itemName);
      if (found) return { ...found, categoryName: cat.name };
    }
    return null;
  }, [budgetData, currentMonth, itemName]);

  useEffect(() => {
    if (!categoryItem) return;
    const existing = categoryItem.target || null;

    setTargetAmount(
      existing?.amount !== undefined && existing?.amount !== null
        ? String(existing.amount)
        : ""
    );

    setTargetType(
      categoryItem.categoryName === "Credit Card Payments"
        ? existing?.type || "Full Payoff"
        : existing?.type?.toLowerCase() || "monthly"
    );

    setCustomTargetDate(existing?.targetDate || "");
  }, [itemName, categoryItem]);

  // Full Payoff's amount input is hidden (see the JSX below) — its target
  // is always "pay off the card's real current balance," so it must be
  // derived from the linked account, not typed in. Re-derives on every
  // switch into this target type (and on mount, since the effect above may
  // already have set targetType to "Full Payoff" for a Credit Card
  // Payments item before this one first runs) so it always reflects the
  // account's live balance rather than a stale saved figure.
  useEffect(() => {
    if (targetType !== "Full Payoff") return;
    const account = accounts.find((a) => a.name === itemName);
    if (account) {
      setTargetAmount((-1 * account.balance).toString());
    }
  }, [targetType, accounts, itemName]);

  const calculateNeededAmount = () => {
    const amount = parseFloat(targetAmount || "0");
    if (!amount && targetType !== "Full Payoff") return 0;

    if (targetType === "Weekly") return amount * 4;
    if (targetType === "monthly") return amount;

    if (
      (targetType === "Custom" || targetType === "Full Payoff") &&
      customTargetDate
    ) {
      let monthsUntil = differenceInCalendarMonths(
        parseISO(customTargetDate),
        parseISO(currentMonth)
      );
      if (monthsUntil <= 0) monthsUntil = 1;

      let totalAssigned = 0;
      Object.keys(budgetData).forEach((month) => {
        const items =
          budgetData[month]?.categories?.flatMap((cat) =>
            cat.categoryItems.filter((i) => i.name === itemName)
          ) || [];
        totalAssigned += items.reduce((sum, i) => sum + (i.assigned || 0), 0);
      });

      // For full payoff, targetAmount is the *total* you want to reach.
      return (amount - totalAssigned) / monthsUntil;
    }

    return 0;
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await setCategoryTarget(categoryItem.id, null);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove target";
      toast({ title: "Couldn't remove target", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const needed = calculateNeededAmount();
    const newTarget = {
      type: targetType,
      amount:
        targetType === "Full Payoff"
          ? parseFloat(targetAmount || "0") || 0
          : parseFloat(targetAmount || "0") || 0,
      targetDate:
        targetType === "Custom" || targetType === "Full Payoff"
          ? customTargetDate
          : null,
      amountNeeded: needed,
    };
    setSaving(true);
    try {
      await setCategoryTarget(categoryItem.id, newTarget);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save target";
      toast({ title: "Couldn't save target", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!categoryItem) return null;

  return (
    <TableRow
      data-cy="inline-target-editor"
      className="bg-slate-100 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-700"
    >
      <TableCell colSpan={4} className="px-4 py-3">
        <div className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 shadow-sm dark:shadow-md space-y-3 text-xs sm:text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Target type
              </label>
              <select
                data-cy="target-type-select"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs sm:text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="monthly">Monthly</option>
                <option value="Weekly">Weekly</option>
                <option value="Custom">Custom by date</option>
                <option value="Full Payoff">Pay full balance by date</option>
              </select>
            </div>

            {(targetType === "Custom" || targetType === "Full Payoff") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Target date
                </label>
                <input
                  data-cy="target-date-input"
                  type="date"
                  value={customTargetDate}
                  onChange={(e) => setCustomTargetDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs sm:text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>

          {targetType !== "Full Payoff" && (
            <div className="sm:max-w-xs">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Target amount
              </label>
              <Input
                data-cy="target-amount-input"
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span
              data-cy="target-amount-needed"
              className="text-xs sm:text-sm text-muted-foreground dark:text-slate-400"
            >
              Amount needed: {formatToUSD(calculateNeededAmount())}
            </span>
            <div className="flex gap-2">
              {categoryItem.target && (
                <Button
                  data-cy="target-remove"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  onClick={handleRemove}
                  disabled={saving}
                >
                  Remove Target
                </Button>
              )}
              <Button
                data-cy="target-cancel"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                data-cy="target-save"
                size="sm"
                onClick={handleSave}
                disabled={
                  saving ||
                  (targetType !== "Full Payoff" &&
                    (targetAmount === "" || isNaN(parseFloat(targetAmount))))
                }
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
