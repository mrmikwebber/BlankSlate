"use client";

import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  dialogSheetOnMobile,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatToUSD } from "../utils/formatToUSD";
import type { SubscriptionCandidate } from "@/lib/detectSubscriptions";
import type { SubscriptionDismissal } from "../context/AccountContext";
import { useState } from "react";

interface SubscriptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: SubscriptionCandidate[];
  dismissedSubscriptions: SubscriptionDismissal[];
  onDismiss: (key: string, label: string) => Promise<void>;
  onRestore: (key: string) => Promise<void>;
}

const CADENCE_LABEL: Record<SubscriptionCandidate["cadence"], string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const formatDate = (iso: string) => format(parseISO(iso), "MMM d, yyyy");

const SubscriptionsModal = ({
  isOpen,
  onClose,
  candidates,
  dismissedSubscriptions,
  onDismiss,
  onRestore,
}: SubscriptionsModalProps) => {
  const [dismissedOpen, setDismissedOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(dialogSheetOnMobile, "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Possible Subscriptions</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Detected from recurring charges in your transaction history. Dismiss anything that
            isn&apos;t actually a subscription.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {candidates.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              Nothing detected yet.
            </p>
          )}

          {candidates.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {c.label}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="brand">{CADENCE_LABEL[c.cadence]}</Badge>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      {formatToUSD(c.typicalAmount)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Last charged {formatDate(c.lastDate)} · next expected ~{formatDate(c.nextEstimatedDate)}
                  </p>
                </div>
                <button
                  onClick={() => onDismiss(c.key, c.label)}
                  className="flex-shrink-0 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                >
                  Not a subscription
                </button>
              </div>
            </div>
          ))}
        </div>

        {dismissedSubscriptions.length > 0 && (
          <Collapsible open={dismissedOpen} onOpenChange={setDismissedOpen}>
            <CollapsibleTrigger className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">
              {dismissedOpen ? "Hide" : "Show"} dismissed ({dismissedSubscriptions.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 mt-2">
              {dismissedSubscriptions.map((d) => (
                <div
                  key={d.payee_key}
                  className="flex items-center justify-between text-xs px-1"
                >
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    {d.payee_label}
                  </span>
                  <button
                    onClick={() => onRestore(d.payee_key)}
                    className="flex-shrink-0 font-medium text-ledger-600 dark:text-ledger-400 hover:underline"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionsModal;
