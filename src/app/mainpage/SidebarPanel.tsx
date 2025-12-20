import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";
import { isSameMonth, parseISO } from "date-fns";
import { createPortal } from "react-dom";

import { formatToUSD } from "@/app/utils/formatToUSD";
import { useAccountContext } from "@/app/context/AccountContext";
import { useBudgetContext } from "../context/BudgetContext";

import AccountCardCompact from "./AccountCardCompact";
import ItemsToAddress from "./ItemsToAddress";
import AddAccountModal from "./AddAccountModal";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { Plus } from "lucide-react";

export default function SidebarPanel() {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    accountId: string;
  } | null>(null);

  const { accounts, addAccount, deleteAccount } = useAccountContext();
  const { currentMonth, budgetData } = useBudgetContext();

  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#A728F5",
    "#FF2D55",
  ];

  const totalInflow = useMemo(() => {
    return accounts
      .flatMap((account) => account.transactions)
      .filter((tx) => {
        return (
          tx.category === "Ready to Assign" &&
          tx.date &&
          isSameMonth(
            typeof tx.date === "string" ? parseISO(tx.date) : tx.date,
            parseISO(currentMonth)
          )
        );
      })
      .reduce((sum, tx) => sum + tx.balance, 0);
  }, [accounts, currentMonth]);

  const spendingData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    const accountNames = new Set(accounts.map((a) => a.name));

    accounts.forEach((account) => {
      account.transactions.forEach((tx) => {
        if (tx.category === "Ready to Assign" || accountNames.has(tx.category))
          return;
        if (
          tx.balance < 0 &&
          tx.date &&
          isSameMonth(
            typeof tx.date === "string" ? parseISO(tx.date) : tx.date,
            parseISO(currentMonth)
          )
        ) {
          if (!categoryTotals[tx.category]) {
            categoryTotals[tx.category] = 0;
          }
          categoryTotals[tx.category] += Math.abs(tx.balance);
        }
      });
    });

    return Object.entries(categoryTotals).map(([category, amount], index) => ({
      name: category,
      value: amount,
      percentage: totalInflow
        ? (((amount as number) / totalInflow) * 100).toFixed(1)
        : 0,
      color: COLORS[index % COLORS.length],
    }));
  }, [accounts, currentMonth, totalInflow]);

  const creditCardsThatNeedPayment = (
    budgetData[currentMonth]?.categories.find(
      (group) => group.name === "Credit Card Payments"
    )?.categoryItems || []
  )
    .filter((item) => item.available > 0 || item.activity < 0)
    .map((item) => item.name);

  const totalOutflow = spendingData.reduce(
    (sum, category) => sum + (category.value as number),
    0
  );

  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  const handleDeleteAccount = (accountId: string) => {
    deleteAccount(accountId);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <aside className="space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto w-full text-sm" style={
      {
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgb(148, 163, 184) rgb(15, 23, 42)'
      }
    }>
      {/* Accounts card */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Accounts</CardTitle>
            <CardDescription className="text-xs">
              Cash and credit balances at a glance.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="gap-1 bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-center">
              No accounts added yet.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">
                  Cash
                </p>
                <div className="flex flex-wrap gap-2">
                  {accounts
                    .filter((a) => a.type === "debit").map(acc => (
                      <AccountCardCompact
                        key={acc.id}
                        account={acc}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            accountId: String(acc.id),
                          });
                        }}
                      />
                    ))}
                </div>
              </div>

              <Separator className="my-1" />

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">
                  Credit
                </p>
                <div className="flex flex-wrap gap-2">
                  {accounts
                    .filter((a) => a.type === "credit").map(acc => (
                      <AccountCardCompact
                        key={acc.id}
                        account={acc}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            accountId: String(acc.id),
                          });
                        }}
                      />
                    ))}
                </div>
              </div>
            </>
          )}

          {showModal && (
            <AddAccountModal
              onAddAccount={handleAddAccount}
              onClose={() => setShowModal(false)}
            />
          )}
        </CardContent>
      </Card>

      {/* Spending card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Spending This Month
          </CardTitle>
          <CardDescription className="text-xs">
            Income {formatToUSD(totalInflow)} · Spending{" "}
            {formatToUSD(totalOutflow)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center mb-3">
            <PieChart width={200} height={200}>
              <Pie
                data={spendingData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                labelLine={false}
              >
                {spendingData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(value) => formatToUSD(value as number)} />
            </PieChart>
          </div>

          <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto pr-1">
            {spendingData.map((cat, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="flex items-center min-w-0">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate text-xs text-slate-700">
                    {cat.name}
                  </span>
                </span>
                <span className="text-xs text-slate-700">
                  {formatToUSD(cat.value)}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    ({cat.percentage}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Items to address card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Items to Address
          </CardTitle>
          <CardDescription className="text-xs">
            Categories and credit cards that may need attention.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ItemsToAddress
            categories={budgetData[currentMonth]?.categories || []}
            unassignedAmount={budgetData[currentMonth]?.ready_to_assign || 0}
            creditCardsNeedingPayment={creditCardsThatNeedPayment}
          />
        </CardContent>
      </Card>

      {/* Right-click context menu for delete account (kept, but visually softened) */}
      {contextMenu &&
        createPortal(
          <div
            className="absolute bg-white border border-slate-200 rounded-md shadow-md z-50 text-xs"
            style={{
              top: contextMenu.y - document.documentElement.scrollTop,
              left: contextMenu.x,
            }}
            onClick={() => {
              handleDeleteAccount(contextMenu.accountId);
              setContextMenu(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button className="px-3 py-2 w-full text-left hover:bg-red-50 text-red-600">
              Delete account
            </button>
          </div>,
          document.body
        )}
    </aside>
  );
}
