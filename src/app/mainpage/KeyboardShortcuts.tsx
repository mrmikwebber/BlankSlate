"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Shortcut {
  key: string;
  description: string;
}

interface KeyboardShortcutsProps {
  shortcuts: Shortcut[];
  page: "accounts" | "budget";
}

export default function KeyboardShortcuts({
  shortcuts,
  page,
}: KeyboardShortcutsProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="View keyboard shortcuts"
          className="gap-2"
          data-cy={`shortcuts-button-${page}`}
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Shortcuts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {shortcuts.map((shortcut, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 pb-2 border-b border-slate-200 dark:border-slate-700 last:border-b-0"
            >
              <kbd className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 py-1 rounded text-sm font-semibold whitespace-nowrap">
                {shortcut.key}
              </kbd>
              <span className="text-sm text-slate-600 dark:text-slate-300">{shortcut.description}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
