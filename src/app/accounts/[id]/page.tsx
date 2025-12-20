"use client";

import AccountDetails from "@/app/mainpage/AccountDetails";
import ActivitySidebar from "@/app/mainpage/ActivitySidebar";
import { useUndoRedoShortcuts } from "@/app/hooks/useUndoRedoShortcuts";

export default function AccountPage() {
  useUndoRedoShortcuts();
  
  return (
    <div className="flex h-screen">
      <ActivitySidebar page="account"/>
      <div className="m-4 gap-3 w-screen">
        <AccountDetails />
      </div>
    </div>
  );
}
