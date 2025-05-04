import { useEffect } from 'react';
import { useAuth } from "../context/AuthContext"; 
import { useRouter } from 'next/navigation';
import Sidebar from '../navigation/sidebar';
import AllAccountsTile from '../mainpage/allAccountsTile';
import TotalSpendingTile from '../mainpage/totalSpendingTile';
import BudgetTile from '../mainpage/budgetTile';

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.push('/auth');
    }
  }, [loading, session]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <p className="text-teal-600 text-lg">Loading your dashboard...</p>
      </div>
    );
  }

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
