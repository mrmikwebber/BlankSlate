"use client"
import Sidebar from "../navigation/sidebar";
import AllAccountsTile from "../mainpage/allAccountsTile";
import BudgetTile from "../mainpage/budgetTile";
import TotalSpendingTile from "../mainpage/totalSpendingTile";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import { useState, useEffect } from "react";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth');
      } else {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  if (loading) {
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
