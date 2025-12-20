"use client";
import { createContext, useContext, useState, useCallback } from "react";

export type UndoRedoAction = {
  id: string;
  description: string;
  timestamp: string;
  execute: () => Promise<void>;
  undo: () => Promise<void>;
};

type UndoRedoContextType = {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  registerAction: (action: Omit<UndoRedoAction, "id" | "timestamp">) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearHistory: () => void;
};

const UndoRedoContext = createContext<UndoRedoContextType | null>(null);

export const UndoRedoProvider = ({ children }: { children: React.ReactNode }) => {
  const [undoStack, setUndoStack] = useState<UndoRedoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoAction[]>([]);

  const registerAction = useCallback((action: Omit<UndoRedoAction, "id" | "timestamp">) => {
    // Auto-generate id and timestamp
    const fullAction: UndoRedoAction = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      ...action,
    };

    console.log("📝 REGISTER ACTION:", fullAction.description);
    
    // When a new action is registered, clear the redo stack
    setRedoStack([]);
    setUndoStack((prev) => {
      const newStack = [...prev, fullAction];
      console.log("📚 Undo stack now has", newStack.length, "actions");
      return newStack;
    });
  }, []);

  const undo = useCallback(async () => {
    console.log("⏪ UNDO called, stack size:", undoStack.length);
    const action = undoStack[undoStack.length - 1];
    if (!action) {
      console.log("❌ No action to undo");
      return;
    }

    console.log("⏪ Undoing:", action.description);

    // Remove from undo stack and add to redo stack FIRST
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, action]);

    // THEN execute the undo (outside of setState)
    try {
      await action.undo();
      console.log("✅ Undo completed");
    } catch (err) {
      console.error("Undo failed:", err);
    }
  }, [undoStack]);

  const redo = useCallback(async () => {
    console.log("🔄 REDO called, stack size:", redoStack.length);
    const action = redoStack[redoStack.length - 1];
    if (!action) {
      console.log("❌ No action to redo");
      return;
    }

    console.log("🔄 Redoing:", action.description);

    // Remove from redo stack and add to undo stack FIRST
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);

    // THEN execute the redo (outside of setState)
    try {
      await action.execute();
      console.log("✅ Redo completed");
    } catch (err) {
      console.error("Redo failed:", err);
    }
  }, [redoStack]);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const undoDescription = undoStack[undoStack.length - 1]?.description || null;
  const redoDescription = redoStack[redoStack.length - 1]?.description || null;

  return (
    <UndoRedoContext.Provider
      value={{
        canUndo,
        canRedo,
        undoDescription,
        redoDescription,
        registerAction,
        undo,
        redo,
        clearHistory,
      }}
    >
      {children}
    </UndoRedoContext.Provider>
  );
};

export const useUndoRedo = () => {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error("useUndoRedo must be used within UndoRedoProvider");
  }
  return context;
};
