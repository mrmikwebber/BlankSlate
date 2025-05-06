import AccountDetails from "@/app/mainpage/AccountDetails";
import ActivitySidebar from "@/app/mainpage/ActivitySidebar";
import { Activity } from "lucide-react";

export default function AccountPage() {
  return (
    <div className="flex h-screen">
      <ActivitySidebar page="account"/>
      <div className="m-4 gap-3 w-screen">
        <AccountDetails />
      </div>
    </div>
  );
}
