"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TellerConnect, { TellerEnrollmentData } from "@/components/TellerConnect";
import { useAuth } from "@/app/context/AuthContext";
import { Lock } from "lucide-react";

interface AddAccountModalProps {
  onAddAccount: (account: Record<string, unknown>) => void;
  onClose: () => void;
  isOpen?: boolean;
}

type AccountSubtype = "checking" | "savings" | "credit";
type Mode = "choose" | "manual" | "linked" | "select";

interface TellerAccountOption {
  id: string;
  name: string;
  institution: string;
  subtype: string;
  type: "depository" | "credit";
  last_four: string;
  ledger_balance: number | null;
}

const SUBTYPES: { value: AccountSubtype; label: string; type: "debit" | "credit" }[] = [
  { value: "checking", label: "Checking", type: "debit" },
  { value: "savings", label: "Savings", type: "debit" },
  { value: "credit", label: "Credit Card", type: "credit" },
];

const AddAccountModal = ({ onAddAccount, onClose, isOpen = true }: AddAccountModalProps) => {
  const { plan } = useAuth()!;
  const isPaid = plan === "paid";
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState<AccountSubtype>("checking");
  const [balance, setBalance] = useState("");

  // Linked account selection state
  const [enrollment, setEnrollment] = useState<TellerEnrollmentData | null>(null);
  const [tellerAccounts, setTellerAccounts] = useState<TellerAccountOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name) return;

    const parsedBalance = balance === "" ? 0 : parseFloat(balance);
    if (isNaN(parsedBalance)) return;

    const selected = SUBTYPES.find((s) => s.value === subtype)!;
    const newAccount = {
      name,
      type: selected.type,
      balance: selected.type === "credit" ? -1 * Math.abs(parsedBalance) : parsedBalance,
    };

    onAddAccount(newAccount);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleBack = () => {
    setMode("choose");
    setName("");
    setBalance("");
    setSubtype("checking");
    setEnrollment(null);
    setTellerAccounts([]);
    setSelectedIds(new Set());
    setLinkError(null);
  };

  const handleEnrollmentReady = async (data: TellerEnrollmentData) => {
    console.log("[AddAccountModal] handleEnrollmentReady called", data);
    setEnrollment(data);
    setLoadingAccounts(true);
    setLinkError(null);

    try {
      const res = await fetch("/api/teller/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.accessToken }),
      });

      console.log("[AddAccountModal] /api/teller/accounts status", res.status);
      const body = await res.json() as { accounts?: TellerAccountOption[]; error?: string };
      console.log("[AddAccountModal] /api/teller/accounts body", body);

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load accounts");
      }

      setTellerAccounts(body.accounts ?? []);
      // Pre-select all accounts
      setSelectedIds(new Set(body.accounts.map((a) => a.id)));
      setMode("select");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!enrollment || selectedIds.size === 0) return;
    setImporting(true);
    setLinkError(null);

    try {
      const res = await fetch("/api/teller/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: enrollment.accessToken,
          enrollmentId: enrollment.enrollmentId,
          selectedAccountIds: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Enrollment failed");
      }

      onClose();
      window.location.reload();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setImporting(false);
    }
  };

  const formatBalance = (account: TellerAccountOption) => {
    if (account.ledger_balance === null) return null;
    const amount = Math.abs(account.ledger_balance);
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
    return account.type === "credit" ? `-${formatted}` : formatted;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={mode !== "linked"}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Add New Account</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            {mode === "choose" && "Choose how you'd like to add an account."}
            {mode === "manual" && "Manually enter your account details."}
            {mode === "linked" && "Connect your bank to automatically sync transactions."}
            {mode === "select" && "Choose which accounts to import."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        {mode === "choose" && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700/60"
            >
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Manual Account
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Enter transactions yourself
              </span>
            </button>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => isPaid && setMode("linked")}
                    disabled={!isPaid}
                    className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                      isPaid
                        ? "border-teal-200 bg-teal-50/50 hover:border-teal-300 hover:bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30 dark:hover:border-teal-700"
                        : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/50"
                    }`}
                  >
                    {!isPaid && (
                      <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    )}
                    <span className={`text-sm font-semibold ${isPaid ? "text-teal-800 dark:text-teal-300" : "text-slate-500 dark:text-slate-400"}`}>
                      Linked Account
                    </span>
                    <span className={`text-xs ${isPaid ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500"}`}>
                      Sync from your bank automatically
                    </span>
                  </button>
                </TooltipTrigger>
                {!isPaid && (
                  <TooltipContent side="bottom">
                    Upgrade to Pro to connect your bank automatically
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Manual form */}
        {mode === "manual" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="account-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Account Name
              </label>
              <Input
                id="account-name"
                type="text"
                placeholder="e.g., Checking, Savings, Amex"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Account Type</p>
              <div className="grid grid-cols-3 gap-2">
                {SUBTYPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSubtype(s.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      subtype === s.value
                        ? "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="initial-balance" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Initial Balance
              </label>
              <Input
                id="initial-balance"
                type="number"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                step="0.01"
                className="w-full"
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="ghost" onClick={handleBack} className="text-slate-500">
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                  Add Account
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Linked account via Teller */}
        {mode === "linked" && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Click below to securely connect your bank. Your login credentials are never stored —
              the connection is handled by Teller.
            </p>
            {loadingAccounts ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading accounts…</p>
            ) : (
              <TellerConnect onEnrollmentReady={handleEnrollmentReady} />
            )}
            {linkError && (
              <p className="text-xs text-red-600 dark:text-red-400">{linkError}</p>
            )}
            <div className="flex justify-start pt-2">
              <Button type="button" variant="ghost" onClick={handleBack} className="text-slate-500">
                ← Back
              </Button>
            </div>
          </div>
        )}

        {/* Account selection */}
        {mode === "select" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tellerAccounts.map((account) => {
                const checked = selectedIds.has(account.id);
                const balance = formatBalance(account);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      checked
                        ? "border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        checked ? "border-teal-500 bg-teal-500" : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {checked && (
                          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {account.institution} {account.subtype.replace(/_/g, " ")}
                          {account.last_four && (
                            <span className="ml-1 text-xs font-normal text-slate-400">···{account.last_four}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                          {account.type === "credit" ? "Credit" : "Checking / Savings"}
                        </p>
                      </div>
                    </div>
                    {balance !== null && (
                      <span className={`text-sm font-semibold tabular-nums ${
                        account.type === "credit" ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"
                      }`}>
                        {balance}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {linkError && (
              <p className="text-xs text-red-600 dark:text-red-400">{linkError}</p>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="ghost" onClick={handleBack} className="text-slate-500">
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || selectedIds.size === 0}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {importing ? "Importing…" : `Import ${selectedIds.size} Account${selectedIds.size !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountModal;
