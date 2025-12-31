"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "./textarea";
import { format, parseISO } from "date-fns";

interface NoteEntry {
  text: string;
  updated_at: string;
}

interface NotesPopoverProps {
  currentNote?: string;
  history?: NoteEntry[];
  onSave: (noteText: string) => void;
  showHistory?: boolean;
  triggerSize?: "sm" | "lg" | "icon";
  className?: string;
}

export function NotesPopover({
  currentNote = "",
  history = [],
  onSave,
  showHistory = true,
  triggerSize = "icon",
  className = "",
}: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [editText, setEditText] = useState(currentNote);
  const [showHistoryView, setShowHistoryView] = useState(false);

  const handleSave = () => {
    onSave(editText);
    setOpen(false);
    setShowHistoryView(false);
  };

  const hasNote = Boolean(currentNote?.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize}
          className={`h-6 w-6 p-0 ${hasNote ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-600"} hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className}`}
          title={hasNote ? currentNote : "Add note"}
          onClick={(e) => e.stopPropagation()}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4 dark:bg-slate-900 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
        {showHistoryView && history.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Note History
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryView(false)}
                className="h-6 text-xs"
              >
                Back
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <p className="text-slate-700 dark:text-slate-300 mb-1">
                    {entry.text}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {format(parseISO(entry.updated_at), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Note
              </h3>
              {showHistory && history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistoryView(true)}
                  className="h-6 gap-1 text-xs text-slate-600 dark:text-slate-400"
                >
                  <span>History</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Add a note..."
              className="mb-3 h-20 resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                Save
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
