import AccountDetails from "@/app/mainpage/AccountDetails";
import Sidebar from "@/app/navigation/sidebar";

export default function AccountPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="m-4 gap-3 w-screen">
        <AccountDetails />
      </div>
    </div>
  );
}
