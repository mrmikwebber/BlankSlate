"use client";
import { RotateCcw, RotateCw } from "lucide-react";
import { useUndoRedo } from "../context/UndoRedoContext";

export default function UndoRedoBar() {
  const { undo, redo, canUndo, canRedo, undoDescription, redoDescription } = useUndoRedo();

  return (
    <div className="flex items-center gap-2 px-4 pt-3">
      <button
        onClick={undo}
        disabled={!canUndo}
        title={canUndo ? `Undo: ${undoDescription}` : "Nothing to undo"}
        className="flex items-center gap-1 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-700 dark:text-slate-300 transition"
      >
        <RotateCcw className="h-4 w-4" />
        Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title={canRedo ? `Redo: ${redoDescription}` : "Nothing to redo"}
        className="flex items-center gap-1 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-700 dark:text-slate-300 transition"
      >
        <RotateCw className="h-4 w-4" />
        Redo
      </button>
    </div>
  );
}