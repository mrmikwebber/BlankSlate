import { useEffect } from "react";

interface UseGlobalKeyboardShortcutsProps {
  onAddTransaction?: () => void;
  onMoveMoney?: () => void;
  onToggleFilter?: () => void;
  onNextMonth?: () => void;
  onPrevMonth?: () => void;
  onShowHelp?: () => void;
  enabled?: boolean;
}

export const useGlobalKeyboardShortcuts = ({
  onAddTransaction,
  onMoveMoney,
  onToggleFilter,
  onNextMonth,
  onPrevMonth,
  onShowHelp,
  enabled = true,
}: UseGlobalKeyboardShortcutsProps) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isTypingField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (isTypingField) return;

      // Check for modal/dialog open
      const hasOpenDialog = document.querySelector('[role="dialog"]');
      if (hasOpenDialog) return;

      // Alt+N - Add transaction
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        onAddTransaction?.();
        return;
      }

      // Ctrl+M / Cmd+M - Move money
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        onMoveMoney?.();
        return;
      }

      // Ctrl+F / Cmd+F - Toggle filter (prevent default browser search)
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        onToggleFilter?.();
        return;
      }

      // ? - Show help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onShowHelp?.();
        return;
      }

      // Arrow keys for month navigation (only if no modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onNextMonth?.();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onPrevMonth?.();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onAddTransaction,
    onMoveMoney,
    onToggleFilter,
    onNextMonth,
    onPrevMonth,
    onShowHelp,
    enabled,
  ]);
};
