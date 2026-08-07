"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogSheetOnMobile,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { useDiscretionaryPools, type DiscretionaryPool } from "@/app/hooks/useDiscretionaryPools";
import type { ComputedCategoryItem } from "@/types/budget";

type PoolsApi = ReturnType<typeof useDiscretionaryPools>;

function PoolCard({ pool }: { pool: DiscretionaryPool }) {
  const { allowance } = pool;
  const isNegative = allowance.remaining < 0;
  const totalPot = allowance.spent + allowance.remaining;
  const pctSpent = totalPot > 0 ? Math.min((allowance.spent / totalPot) * 100, 100) : 0;

  return (
    <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{pool.name}</p>
          {allowance.isOverPace && (
            <span title={`At this rate you'll spend ${formatToUSD(allowance.projectedEnd)} this month — ${formatToUSD(allowance.projectedEnd - totalPot)} more than the ${formatToUSD(totalPot)} you've assigned`}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
            </span>
          )}
        </div>

        <p
          className={cn(
            "text-2xl sm:text-xl font-bold font-mono tabular-nums leading-none",
            isNegative ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-400"
          )}
        >
          {formatToUSD(allowance.daily)}
          <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1">/day</span>
        </p>
        <p className="text-xs sm:text-[11px] text-slate-600 dark:text-slate-300">
          {formatToUSD(allowance.remaining)} left &middot; {allowance.daysLeft}d left
        </p>
        <p className="text-xs sm:text-[11px] text-slate-400 dark:text-slate-500">
          {formatToUSD(allowance.assignedWeeklyRate)}/wk assigned
        </p>

        <div className="h-[3px] w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", isNegative ? "bg-red-500" : "bg-ledger-500")}
            style={{ width: `${pctSpent}%` }}
          />
        </div>

        {pool.targetComparison && (
          <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-[11px] text-slate-600 dark:text-slate-300">
                {formatToUSD(pool.targetComparison.dailyRate)}/day &middot; {formatToUSD(pool.targetComparison.weeklyRate)}/wk target
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0",
                  pool.targetComparison.isBehindPace
                    ? "bg-ledger-50 dark:bg-ledger-900/30 text-ledger-700 dark:text-ledger-400"
                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                )}
              >
                {pool.targetComparison.isBehindPace ? "Behind pace" : "Ahead of pace"}
              </span>
            </div>
            <p className="text-xs sm:text-[11px] text-slate-600 dark:text-slate-300">
              {formatToUSD(pool.targetComparison.remaining)} left by target
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManagePoolsModal({
  api,
  onClose,
}: {
  api: PoolsApi;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn(dialogSheetOnMobile, "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>Manage Discretionary Pools</DialogTitle>
          <DialogDescription>
            Opt categories in as discretionary pools. Safe-to-spend tracks each one's real available
            balance — assign money to it the same way you would any other category, in the main budget table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {api.allCategoryItems.map((item: ComputedCategoryItem) => {
            const isPool = !!item.isDiscretionaryPool;
            return (
              <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.name}</span>
                  <Switch
                    checked={isPool}
                    onCheckedChange={(checked) => api.setCategoryDiscretionaryPool(item.id, checked)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShuffleForm({ pools, api }: { pools: DiscretionaryPool[]; api: PoolsApi }) {
  const [sourceId, setSourceId] = useState<string>("");
  const [destId, setDestId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [consequence, setConsequence] = useState<string | null>(null);

  const handleShuffle = async () => {
    const amt = parseFloat(amount);
    if (!sourceId || !destId || sourceId === destId || isNaN(amt) || amt <= 0) return;

    const source = pools.find((p) => p.id === sourceId);
    await api.shuffleMoney(sourceId, destId, amt);

    if (source) {
      const newRemaining = source.available - amt;
      const newSourceDaily = newRemaining / source.allowance.daysLeft;
      setConsequence(`${source.name} → ${formatToUSD(newSourceDaily)}/day for ${source.allowance.daysLeft} days`);
    }
    setAmount("");
  };

  if (pools.length < 2) return null;

  return (
    <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <CardContent className="pt-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5" /> Move money between pools
        </p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="flex gap-2">
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="h-10 sm:h-8 text-xs flex-1 sm:w-32"><SelectValue placeholder="From" /></SelectTrigger>
              <SelectContent>
                {pools.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={destId} onValueChange={setDestId}>
              <SelectTrigger className="h-10 sm:h-8 text-xs flex-1 sm:w-32"><SelectValue placeholder="To" /></SelectTrigger>
              <SelectContent>
                {pools.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="$"
              className="h-10 sm:h-8 text-xs flex-1 sm:w-20"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button size="sm" className="h-10 sm:h-8 text-xs" onClick={handleShuffle}>Move</Button>
          </div>
        </div>
        {consequence && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{consequence}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DiscretionaryTab() {
  const api = useDiscretionaryPools();
  const { pools, totalDaily, totalRemaining, totalAssignedWeekly, isInitialLoading } = api;
  const [showManage, setShowManage] = useState(false);

  const totalIsNegative = totalRemaining < 0;

  const poolsWithTarget = pools.filter((p) => p.targetComparison);
  const totalTargetDailyRate = poolsWithTarget.reduce(
    (sum, p) => sum + p.targetComparison!.dailyRate,
    0
  );
  const totalTargetWeeklyRate = poolsWithTarget.reduce(
    (sum, p) => sum + p.targetComparison!.weeklyRate,
    0
  );
  const totalTargetRemaining = poolsWithTarget.reduce(
    (sum, p) => sum + p.targetComparison!.remaining,
    0
  );
  const totalPaceDelta = poolsWithTarget.reduce(
    (sum, p) => sum + p.targetComparison!.paceDelta,
    0
  );
  const overallBehindPace = totalPaceDelta >= 0;

  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Safe to Spend</h2>
      <Button size="sm" variant="ghost" onClick={() => setShowManage(true)} className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );

  if (isInitialLoading) {
    return (
      <div className="space-y-4 pb-24 text-slate-900 dark:text-slate-200">
        {header}
        <p className="text-xs text-slate-400 dark:text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 text-slate-900 dark:text-slate-200">
      {header}

      {pools.length === 0 ? (
        <Card className="shadow-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No discretionary pools yet. Tap the gear icon to opt a few categories in (3–5 works best) —
              their real available balance drives the safe-to-spend pace here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-none border border-ledger-200 dark:border-ledger-800/40 bg-ledger-50 dark:bg-ledger-900/30">
            <CardContent className="pt-4">
              <p className="text-xs text-ledger-700 dark:text-ledger-300 font-medium mb-1">Total safe to spend</p>
              <p className={cn(
                "text-2xl font-bold font-mono tabular-nums",
                totalIsNegative ? "text-red-600 dark:text-red-400" : "text-ledger-600 dark:text-ledger-300"
              )}>
                {formatToUSD(totalDaily)}<span className="text-sm font-normal ml-1">/day</span>
              </p>
              <p className="text-xs text-ledger-800 dark:text-ledger-200 mt-0.5">
                {formatToUSD(totalRemaining)} remaining this period
              </p>
              <p className="text-xs text-ledger-700/80 dark:text-ledger-300/80">
                {formatToUSD(totalAssignedWeekly)}/wk assigned
              </p>

              {poolsWithTarget.length > 0 && (
                <div className="pt-2 mt-2 border-t border-ledger-200/60 dark:border-ledger-800/40 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ledger-800 dark:text-ledger-200">
                      {formatToUSD(totalTargetDailyRate)}/day &middot; {formatToUSD(totalTargetWeeklyRate)}/wk target
                    </p>
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0",
                        overallBehindPace
                          ? "bg-ledger-100 dark:bg-ledger-900/50 text-ledger-700 dark:text-ledger-300"
                          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {overallBehindPace ? "Behind pace" : "Ahead of pace"}
                    </span>
                  </div>
                  <p className="text-xs text-ledger-800 dark:text-ledger-200">
                    {formatToUSD(totalTargetRemaining)} left by target
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pools.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
          </div>

          <ShuffleForm pools={pools} api={api} />
        </>
      )}

      {showManage && <ManagePoolsModal api={api} onClose={() => setShowManage(false)} />}
    </div>
  );
}
