"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "../context/BudgetContext";
import { AlertCircle } from "lucide-react";

interface YnabImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function YnabImportDialog({ open, onOpenChange }: YnabImportDialogProps) {
  const { importYnabData } = useBudgetContext();
  const { toast } = useToast();
  const [registerFile, setRegisterFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setError(null);
    if (!registerFile || !planFile) {
      setError("Please choose both Register and Plan CSV files.");
      return;
    }

    try {
      setImporting(true);
      const summary = await importYnabData(registerFile, planFile);
      toast({
        title: "YNAB import complete",
        description: `Imported ${summary.accounts} accounts, ${summary.transactions} transactions, and ${summary.months} budget months.`,
      });
      onOpenChange(false);
      setRegisterFile(null);
      setPlanFile(null);
    } catch (err: any) {
      const message = err?.message || "Import failed";
      setError(message);
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from YNAB</DialogTitle>
          <DialogDescription>
            Drop your YNAB Register CSV (transactions) and Plan CSV (budget) to create accounts, transactions, and monthly budgets here. Existing months with the same key will be overwritten.
          </DialogDescription>
        </DialogHeader>

        {/* Beta Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Beta Feature</p>
            <p>This import feature is still in beta. Please verify your imported data carefully before relying on it. Consider backing up your data first.</p>
          </div>
        </div>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="register-file">Register CSV</Label>
            <Input
              id="register-file"
              data-cy="ynab-register-input"
              type="file"
              accept=".csv"
              onChange={(e) => setRegisterFile(e.target.files?.[0] ?? null)}
            />
            {registerFile && (
              <p className="text-xs text-slate-500">Selected: {registerFile.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-file">Plan CSV</Label>
            <Input
              id="plan-file"
              data-cy="ynab-plan-input"
              type="file"
              accept=".csv"
              onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
            />
            {planFile && (
              <p className="text-xs text-slate-500">Selected: {planFile.name}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing} data-cy="ynab-import-submit">
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
