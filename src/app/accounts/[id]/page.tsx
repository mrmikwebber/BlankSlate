"use client";

import AccountDetails from "@/app/mainpage/AccountDetails";
import { useUndoRedoShortcuts } from "@/app/hooks/useUndoRedoShortcuts";

export default function AccountPage() {
  useUndoRedoShortcuts();
  
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-auto">
        <AccountDetails />
      </div>
    </div>
  );
}
