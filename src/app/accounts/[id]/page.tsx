"use client";

import AccountDetails from "@/app/mainpage/AccountDetails";
import { useUndoRedoShortcuts } from "@/app/hooks/useUndoRedoShortcuts";

export default function AccountPage() {
  useUndoRedoShortcuts();
  
  return (
    <div className="flex flex-col h-screen">
      <div className="m-4 gap-3 w-screen">
        <AccountDetails />
      </div>
    </div>
  );
}
