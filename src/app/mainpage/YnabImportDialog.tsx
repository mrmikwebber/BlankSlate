"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "../context/BudgetContext";
import { AlertCircle } from "lucide-react";
import TellerConnect, { TellerEnrollmentData } from "@/components/TellerConnect";

interface YnabImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportedAccount {
  id: string;
  name: string;
  type: string;
}

// A Teller account option enriched with the credentials needed to create an enrollment
interface TellerAccountSource {
  id: string;          // teller account id
  label: string;       // display label
  subtype: string;
  accountType: "depository" | "credit";
  accessToken: string;
  enrollmentId: string;
  institutionName: string;
}

interface ExistingEnrollment {
  teller_account_id: string;
  access_token: string;
  enrollment_id: string;
  institution_name: string;
  teller_account_type: string;
}

interface TellerAccountOption {
  id: string;
  name: string;
  institution: string;
  subtype: string;
  type: "depository" | "credit";
  last_four: string;
  ledger_balance: number | null;
}

export function YnabImportDialog({ open, onOpenChange }: YnabImportDialogProps) {
  const { importYnabData } = useBudgetContext();
  const { toast } = useToast();

  // Step 1 state
  const [registerFile, setRegisterFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state
  const [step, setStep] = useState<"upload" | "link">("upload");
  const [importedAccounts, setImportedAccounts] = useState<ImportedAccount[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadingTeller, setLoadingTeller] = useState(false);
  // All Teller accounts available to link (from existing enrollments + newly connected)
  const [tellerSources, setTellerSources] = useState<TellerAccountSource[]>([]);
  // Map: blankslate account id → teller account id
  const [linkMap, setLinkMap] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState(false);

  // Fetch existing enrollments when we enter the link step
  useEffect(() => {
    if (step !== "link") return;
    setLoadingExisting(true);
    fetch("/api/teller/existing-enrollments")
      .then((r) => r.json())
      .then((data: { enrollments?: ExistingEnrollment[] }) => {
        const sources: TellerAccountSource[] = (data.enrollments ?? []).map((e) => ({
          id: e.teller_account_id,
          label: `${e.institution_name ?? "Unknown"} ${(e.teller_account_type ?? "").replace(/_/g, " ")}`,
          subtype: e.teller_account_type ?? "",
          accountType: (e.teller_account_type === "credit_card" || e.teller_account_type === "credit") ? "credit" : "depository",
          accessToken: e.access_token,
          enrollmentId: e.enrollment_id,
          institutionName: e.institution_name ?? "",
        }));
        setTellerSources((prev) => mergeSources(prev, sources));
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setLoadingExisting(false));
  }, [step]);

  function mergeSources(existing: TellerAccountSource[], incoming: TellerAccountSource[]): TellerAccountSource[] {
    const ids = new Set(existing.map((s) => s.id));
    return [...existing, ...incoming.filter((s) => !ids.has(s.id))];
  }

  const handleImport = async () => {
    setError(null);
    if (!registerFile || !planFile) {
      setError("Please choose both Register and Plan CSV files.");
      return;
    }
    try {
      setImporting(true);
      const summary = await importYnabData(registerFile, planFile);
      setImportedAccounts(summary.createdAccounts ?? []);
      setStep("link");
      toast({
        title: "YNAB import complete",
        description: `Imported ${summary.accounts} accounts, ${summary.transactions} transactions, and ${summary.months} budget months.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
      toast({ title: "Import failed", description: message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleEnrollmentReady = async (data: TellerEnrollmentData) => {
    setLoadingTeller(true);
    setError(null);
    try {
      const res = await fetch("/api/teller/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.accessToken }),
      });
      const body = await res.json() as { accounts?: TellerAccountOption[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load Teller accounts");

      const newSources: TellerAccountSource[] = (body.accounts ?? []).map((a) => ({
        id: a.id,
        label: `${a.institution} ${a.subtype.replace(/_/g, " ")}${a.last_four ? ` ···${a.last_four}` : ""}`,
        subtype: a.subtype,
        accountType: a.type,
        accessToken: data.accessToken,
        enrollmentId: data.enrollmentId,
        institutionName: a.institution,
      }));

      setTellerSources((prev) => mergeSources(prev, newSources));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Teller accounts");
    } finally {
      setLoadingTeller(false);
    }
  };

  const handleLink = async () => {
    const pairs = Object.entries(linkMap).filter(([, tId]) => !!tId);
    if (pairs.length === 0) { handleClose(); return; }

    setLinking(true);
    setError(null);
    try {
      for (const [accountId, tellerAccountId] of pairs) {
        const source = tellerSources.find((s) => s.id === tellerAccountId);
        if (!source) continue;
        const res = await fetch("/api/teller/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            accessToken: source.accessToken,
            enrollmentId: source.enrollmentId,
            tellerAccountId,
            institutionName: source.institutionName,
            tellerAccountType: source.subtype,
          }),
        });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? "Link failed");
        }
      }
      toast({ title: "Accounts linked", description: `${pairs.length} account${pairs.length !== 1 ? "s" : ""} linked to Teller.` });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLinking(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setRegisterFile(null);
    setPlanFile(null);
    setError(null);
    setImportedAccounts([]);
    setTellerSources([]);
    setLinkMap({});
    onOpenChange(false);
  };

  const linkedCount = Object.values(linkMap).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }} modal={step !== "link" || loadingTeller}>
      <DialogContent className="w-[96vw] max-w-lg top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] max-h-[90dvh] overflow-y-auto">
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>Import CSV Files</DialogTitle>
              <DialogDescription>
                Import your Register (transactions) and Plan (budget) CSV files.
                <span className="block text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Only supports YNAB CSV exports (Register.csv and Plan.csv).
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900 dark:text-red-100">
                <p className="font-bold mb-1">⚠️ This Will Replace Your Previous Budget</p>
                <p className="text-xs opacity-90">
                  Importing will completely replace your existing accounts, categories, and budget data.
                  <span className="block mt-1 italic text-red-700 dark:text-red-300">(Merge functionality coming soon)</span>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <p className="font-semibold mb-2">Beta Feature</p>
                <ul className="space-y-1 text-xs opacity-90">
                  <li>• Please review your imported data carefully</li>
                  <li>• Back up your data before importing</li>
                  <li>• You can undo the import if needed</li>
                  <li>• Category mappings may need adjustment</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="register-file">Register CSV</Label>
                <Input id="register-file" data-cy="ynab-register-input" type="file" accept=".csv"
                  onChange={(e) => setRegisterFile(e.target.files?.[0] ?? null)} />
                {registerFile && <p className="text-xs text-slate-500">Selected: {registerFile.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-file">Plan CSV</Label>
                <Input id="plan-file" data-cy="ynab-plan-input" type="file" accept=".csv"
                  onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)} />
                {planFile && <p className="text-xs text-slate-500">Selected: {planFile.name}</p>}
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={importing}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing} data-cy="ynab-import-submit">
                {importing ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "link" && (
          <>
            <DialogHeader>
              <DialogTitle>Link Bank Accounts</DialogTitle>
              <DialogDescription>
                Match your imported accounts to live bank feeds. New transactions will sync automatically — your existing history stays as-is.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {/* Existing + newly connected accounts dropdown table */}
              {loadingExisting ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading existing connections…</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden pr-1">
                  {importedAccounts.map((acc) => {
                    const relevant = tellerSources.filter((s) =>
                      acc.type === "credit" ? s.accountType === "credit" : s.accountType === "depository"
                    );
                    return (
                      <div key={acc.id} className="w-full min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] items-stretch sm:items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {acc.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                          </p>
                          <p className="text-[11px] text-slate-500 capitalize">{acc.type === "credit" ? "Credit" : "Checking / Savings"}</p>
                        </div>
                        <Select
                          value={linkMap[acc.id] || "__none__"}
                          onValueChange={(value) => setLinkMap((prev) => ({ ...prev, [acc.id]: value === "__none__" ? "" : value }))}
                        >
                          <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden text-xs">
                            <SelectValue placeholder="None" className="truncate" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {relevant.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Connect additional bank */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {tellerSources.length > 0
                    ? "Connect another bank to add more options:"
                    : "Connect your bank to populate the dropdowns:"}
                </p>
                {loadingTeller ? (
                  <p className="text-xs text-slate-500">Loading accounts…</p>
                ) : (
                  <TellerConnect onEnrollmentReady={handleEnrollmentReady} />
                )}
              </div>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={linking} className="text-slate-500">
                Skip
              </Button>
              <Button
                onClick={handleLink}
                disabled={linking || linkedCount === 0}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {linking ? "Linking…" : linkedCount > 0 ? `Link ${linkedCount} Account${linkedCount !== 1 ? "s" : ""}` : "Link Accounts"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
