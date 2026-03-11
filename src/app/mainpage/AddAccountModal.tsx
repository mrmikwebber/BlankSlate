"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TellerConnect from "@/components/TellerConnect";

interface AddAccountModalProps {
  onAddAccount: (account: Record<string, unknown>) => void;
  onClose: () => void;
  isOpen?: boolean;
}

type AccountSubtype = "checking" | "savings" | "credit";
type Mode = "choose" | "manual" | "linked";

const SUBTYPES: { value: AccountSubtype; label: string; type: "debit" | "credit" }[] = [
  { value: "checking", label: "Checking", type: "debit" },
  { value: "savings", label: "Savings", type: "debit" },
  { value: "credit", label: "Credit Card", type: "credit" },
];

const AddAccountModal = ({ onAddAccount, onClose, isOpen = true }: AddAccountModalProps) => {
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState<AccountSubtype>("checking");
  const [balance, setBalance] = useState("");

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
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Add New Account</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            {mode === "choose" && "Choose how you'd like to add an account."}
            {mode === "manual" && "Manually enter your account details."}
            {mode === "linked" && "Connect your bank to automatically sync transactions."}
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

            <button
              type="button"
              onClick={() => setMode("linked")}
              className="flex flex-col items-start gap-1 rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-left transition-colors hover:border-teal-300 hover:bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30 dark:hover:border-teal-700"
            >
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                Linked Account
              </span>
              <span className="text-xs text-teal-600 dark:text-teal-400">
                Sync from your bank automatically
              </span>
            </button>
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
            <TellerConnect onConnected={onClose} />
            <div className="flex justify-start pt-2">
              <Button type="button" variant="ghost" onClick={handleBack} className="text-slate-500">
                ← Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountModal;
