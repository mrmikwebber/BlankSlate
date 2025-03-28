import Sidebar from "./navigation/sidebar";
import AllAccountsTile from "./mainpage/allAccountsTile";
import BudgetTile from "./mainpage/budgetTile";
import TotalSpendingTile from "./mainpage/totalSpendingTile";

export default function Home() {
  return (
    <div className="relative isolate">
      <div className="flex z-1">
        <Sidebar />
        <div className="m-4 grid grid-cols-[auto_1fr] gap-3 w-screen">
          <div className="bg-zinc-100 p-4 rounded-md drop-shadow-md">
            <AllAccountsTile />
          </div>
          <div className="bg-zinc-100 p-4 row-span-2 w-full rounded-md drop-shadow-md overflow-scroll">
            <BudgetTile />
          </div>
          <div className="bg-zinc-100 p-4 rounded-md drop-shadow-md">
            <TotalSpendingTile />
          </div>
        </div>
      </div>
    </div>
  );
}
